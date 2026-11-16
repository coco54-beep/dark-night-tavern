"use strict";
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const dns = require("dns");
const net = require("net");

const ROOT = __dirname;
const DATA = process.env.TAVERN_DATA_DIR || path.join(ROOT, "data");
const PORT = Number(process.env.TAVERN_PORT || 5012);
const config = readJSON(path.join(DATA, "llm.local.json"), {});

function readJSON(file, fallback) {
  try {
    const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(text);
  }
  catch (err) { if (err.code === "ENOENT") return fallback; throw err; }
}

// ===== 持久登录令牌（服务重启后仍然有效） =====
const SESSION_SECRET_FILE = path.join(DATA, "session.secret");
let SESSION_SECRET = "";
try { SESSION_SECRET = fs.readFileSync(SESSION_SECRET_FILE, "utf8").trim(); } catch {}
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString("hex");
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(SESSION_SECRET_FILE, SESSION_SECRET, "utf8"); } catch {}
}
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天免登录
const revokedTokens = new Set();
function signSession(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}
function verifySession(token) {
  if (!token || revokedTokens.has(token)) return null;
  try {
    const [payload, sig] = String(token).split(".");
    if (!payload || !sig) return null;
    const expect = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!obj || typeof obj.u !== "string" || !(Number(obj.exp) > Date.now())) return null;
    return obj.u;
  } catch { return null; }
}

function isPrivateHost(base) {
  try {
    const host = new URL(base).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" ||
      /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".local");
  } catch { return false; }
}

function normalizeProviders(raw) {
  const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v))));
  let list = [];
  if (Array.isArray(raw.providers) && raw.providers.length) {
    // 保留全部条目（含未填 base/model 的模板），是否可用由 enabled 决定
    list = raw.providers.filter(p => p && typeof p === "object").map((p, i) => ({
      id: String(p.id || ("p" + i)),
      name: String(p.name || p.model || p.id || ("provider-" + i)),
      base: String(p.base || ""),
      key: String(p.key || ""),
      model: String(p.model || ""),
      timeout: Number.isFinite(Number(p.timeout)) ? clampInt(p.timeout, 5000, 300000) : 60000,
      maxTokens: Number.isFinite(Number(p.maxTokens)) ? clampInt(p.maxTokens, 256, 8192) : 3200,
      allowNoKey: Boolean(p.allowNoKey),
      forceEnabled: p.enabled === true,
      forceDisabled: p.enabled === false
    }));
  } else if (raw.base && raw.model) {
    list = [{ id: "default", name: raw.model, base: raw.base, key: raw.key || "", model: raw.model, timeout: 90000, maxTokens: 3200, allowNoKey: true }];
  }
  // 环境变量覆盖：若提供，替换/新增一个 id 为 env 的服务
  if (process.env.TAVERN_LLM_BASE && process.env.TAVERN_LLM_MODEL) {
    list = [{
      id: "env", name: "环境变量服务", base: process.env.TAVERN_LLM_BASE,
      key: process.env.TAVERN_LLM_KEY || "", model: process.env.TAVERN_LLM_MODEL,
      timeout: 90000, maxTokens: 3200, allowNoKey: true
    }, ...list];
  }
  // 可用条件：必须填了 base 和 model；未显式关闭，且有 key / 私有地址 / 允许无 key
  return list.map(p => {
    const local = isPrivateHost(p.base);
    const ready = Boolean(p.base && p.model);
    let enabled = ready && Boolean(p.key || p.allowNoKey || local);
    if (p.forceDisabled) enabled = false;
    if (p.forceEnabled && ready) enabled = true;
    return { ...p, local, enabled };
  });
}

const ALL_PROVIDERS = normalizeProviders(config);
const LLM_PROVIDERS = ALL_PROVIDERS.filter(p => p.enabled);
const DEFAULT_PROVIDER_ID = (() => {
  const wanted = config.default || config.provider;
  return (wanted && LLM_PROVIDERS.find(p => p.id === wanted)?.id) || LLM_PROVIDERS[0]?.id || "";
})();
function providerList(requested) {
  const out = [];
  const push = p => { if (p && !out.includes(p)) out.push(p); };
  push(LLM_PROVIDERS.find(p => p.id === requested));
  push(LLM_PROVIDERS.find(p => p.id === DEFAULT_PROVIDER_ID));
  for (const p of LLM_PROVIDERS) push(p);
  return out;
}

const PERSONAL_PROVIDER = "personal-api";
const blockedIPv4 = new net.BlockList();
for (const [address, bits] of [
  ["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],
  ["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.88.99.0",24],["192.168.0.0",16],
  ["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",3]
]) blockedIPv4.addSubnet(address,bits,"ipv4");
const globalIPv6 = new net.BlockList();
globalIPv6.addSubnet("2000::",3,"ipv6");
const blockedIPv6 = new net.BlockList();
for (const [address,bits] of [["2001::",23],["2001:db8::",32],["2002::",16],["3fff::",20]]) {
  blockedIPv6.addSubnet(address,bits,"ipv6");
}
function publicLookup(host, options, callback) {
  dns.lookup(host,{all:true,family:options.family || 0},(error,addresses)=>{
    if (error) return callback(error);
    const allowed = addresses.filter(({address,family})=>family===4
      ? !blockedIPv4.check(address,"ipv4")
      : family===6 && globalIPv6.check(address,"ipv6") && !blockedIPv6.check(address,"ipv6"));
    if (!allowed.length || allowed.length!==addresses.length) {
      return callback(new Error("个人 API 只允许访问公网地址"));
    }
    if (options.all) return callback(null,allowed);
    callback(null,allowed[0].address,allowed[0].family);
  });
}

function personalFile(user) {
  const id = crypto.createHash("sha256").update(user).digest("hex");
  return path.join(DATA,"personal-ai",id+".json");
}

function personalView(provider) {
  return provider ? {base:provider.base,model:provider.model,hasKey:Boolean(provider.key)} : null;
}

function personalSettings(req,res,user) {
  const file = personalFile(user);
  if (req.method==="GET") return sendJSON(res,200,{personal:personalView(readJSON(file,null))});
  if (req.method==="DELETE") {
    fs.rmSync(file,{force:true});
    return sendJSON(res,200,{personal:null});
  }
  if (req.method!=="PUT") return sendJSON(res,405,{error:"不支持此操作"});
  return readBody(req,res,p=>{
    const base = typeof p.base==="string" ? p.base.trim() : "";
    const model = typeof p.model==="string" ? p.model.trim() : "";
    let url;
    try { url = new URL(base); } catch {}
    const host = url?.hostname.replace(/^\[|\]$/g,"");
    if (!url || base.length>512 || url.protocol!=="https:" || url.username || url.password
      || url.search || url.hash || !host.includes(".") || net.isIP(host)) {
      return sendJSON(res,400,{error:"请填写公网 HTTPS API 地址，例如 https://api.example.com/v1"});
    }
    if (!model || model.length>150 || /[\x00-\x1f\x7f]/.test(model)) {
      return sendJSON(res,400,{error:"请输入有效的模型名"});
    }
    const endpoint = url.href.replace(/\/+$/,"").replace(/\/chat\/completions$/,"");
    const old = readJSON(file,null);
    const typedKey = typeof p.key==="string" ? p.key.trim() : "";
    if (typedKey.length>4096 || /[^\x21-\x7e]/.test(typedKey)) {
      return sendJSON(res,400,{error:"API 密钥格式无效"});
    }
    if (!typedKey && old && old.base!==endpoint) {
      return sendJSON(res,400,{error:"更换 API 地址时，请重新输入对应的密钥"});
    }
    const key = typedKey || old?.key;
    if (!key) return sendJSON(res,400,{error:"请填写 API 密钥"});
    const saved = {base:endpoint,model,key};
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    writeJSON(file,saved);
    sendJSON(res,200,{personal:personalView(saved)});
  },8192);
}

function writeJSON(file, value) {
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value), {encoding:"utf8",mode:0o600});
  fs.renameSync(temp, file);
}

function userFile(name, file) {
  // Keep existing account directory names so old journeys remain accessible.
  const safe = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, "_");
  const dir = path.join(DATA, "users", safe);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, file);
}

function sendJSON(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function handleError(res, err) {
  console.error(err);
  if (!res.headersSent) sendJSON(res, 500, { error: "酒馆暂时无法处理请求" });
  else res.destroy();
}
function readBody(req, res, handle, limit = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  req.on("error", () => {});
  req.on("data", chunk => {
    if (size > limit) return;
    size += chunk.length;
    if (size <= limit) chunks.push(chunk);
    else {
      chunks.length = 0;
      sendJSON(res, 413, { error: "请求内容太大" });
    }
  });
  req.on("end", () => {
    if (size > limit) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendJSON(res, 400, { error: "参数错误" });
    }
    try { handle(body); } catch (err) { handleError(res, err); }
  });
}

const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;
const loginAttempts = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts) if (rec.reset <= now) loginAttempts.delete(ip);
}, 10 * 60 * 1000).unref();
const sessionToken = req => (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
function authUser(req) {
  const token = sessionToken(req);
  if (!token || revokedTokens.has(token)) return null;
  const session = sessions.get(token);
  if (session && session.exp > Date.now()) return session.user;
  // 服务重启后内存会话丢失，用签名令牌恢复登录
  return verifySession(token);
}
setInterval(() => {
  for (const [token, session] of sessions) if (session.exp <= Date.now()) sessions.delete(token);
  if (revokedTokens.size > 5000) revokedTokens.clear();
}, 60 * 60 * 1000).unref();

function login(req, res) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || rec.reset <= now) { rec = { count: 0, reset: now + 60 * 1000 }; loginAttempts.set(ip, rec); }
  if (rec.count >= 10) return sendJSON(res, 429, { error: "尝试过于频繁，请稍后再试" });
  readBody(req, res, p => {
    if (typeof p.username !== "string" || typeof p.password !== "string") {
      return sendJSON(res, 400, { error: "参数错误" });
    }
    const username = p.username.trim();
    const users = readJSON(path.join(DATA, "users.json"), {});
    const user = Object.hasOwn(users, username) && users[username];
    const hash = user && crypto.createHash("sha256").update(user.salt + "::" + p.password).digest("hex");
    if (!user || hash !== user.hash) {
      rec.count++;
      return sendJSON(res, 401, { error: "用户名或密码错误" });
    }
    loginAttempts.delete(ip);
    const token = signSession(username);
    sessions.set(token, { user: username, exp: Date.now() + SESSION_TTL_MS });
    sendJSON(res, 200, { token, username });
  }, 8192);
}

function proxyChat(req, res, user) {
  readBody(req, res, payload => {
    const messages = payload.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 28 ||
        !messages.every(m => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string")) {
      return sendJSON(res, 400, { error: "无效的剧情请求" });
    }
    const maxTokens = Number.isFinite(Number(payload.maxTokens))
      ? Math.max(256, Math.min(8192, Math.round(Number(payload.maxTokens)))) : null;
    const temperature = Number.isFinite(Number(payload.temperature))
      ? Math.max(0, Math.min(1.5, Number(payload.temperature))) : 0.95;
    const requested = typeof payload.provider === "string" ? payload.provider : "";
    const personal = !requested || requested===PERSONAL_PROVIDER ? readJSON(personalFile(user),null) : null;
    if (requested===PERSONAL_PROVIDER && !personal) return sendJSON(res,400,{error:"请先保存个人 AI 设置"});
    const order = personal ? [{...personal,id:PERSONAL_PROVIDER,personal:true,timeout:60000}] : providerList(requested);
    if (!order.length) return sendJSON(res, 503, { error: "请先配置个人 AI，或请管理员配置共享引擎" });
    attemptProvider(order, 0, messages, maxTokens, temperature, res);
  });
}

function attemptProvider(order, index, messages, maxTokens, temperature, res) {
  if (res.writableEnded || res.destroyed) return;
  if (index >= order.length) {
    if (!res.headersSent) sendJSON(res, 502, { error: "所有 AI 服务均不可用，请稍后重试" });
    else res.destroy();
    return;
  }
  const provider = order[index];
  let url;
  try { url = new URL(provider.base.replace(/\/$/, "") + "/chat/completions"); }
  catch { return attemptProvider(order, index + 1, messages, maxTokens, temperature, res); }
  const transport = url.protocol === "https:" ? https : http;
  const body = JSON.stringify({
    model: provider.model,
    messages,
    temperature: Number.isFinite(temperature) ? temperature : 0.95,
    max_tokens: maxTokens || provider.maxTokens || 3200,
    stream: true
  });

  let settled = false, committed = false;
  const nextProvider = reason => {
    if (settled) return;
    settled = true;
    try { upstream.destroy(); } catch {}
    if (provider.personal) {
      if (!res.headersSent && !res.destroyed) sendJSON(res,502,{error:"个人 API 连接失败："+reason});
      return;
    }
    if (reason) console.warn("[LLM] " + provider.id + " 失败：" + reason + "，尝试下一个服务");
    attemptProvider(order, index + 1, messages, maxTokens, temperature, res);
  };

  const upstream = transport.request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      Accept: "text/event-stream",
      ...(provider.key ? { Authorization: "Bearer " + provider.key } : {})
    },
    ...(provider.personal ? {lookup:publicLookup,agent:false} : {}),
    timeout: provider.timeout || 60000
  }, reply => {
    if (settled) { reply.resume(); return; }
    if (reply.statusCode < 200 || reply.statusCode >= 300) {
      if (provider.personal) {
        reply.resume();
        const status = reply.statusCode;
        const hint = status===401 || status===403 ? "，请检查密钥或模型权限"
          : status===404 ? "，请检查 API 地址和模型名" : status===429 ? "，请检查账户额度或稍后重试" : "";
        return nextProvider("HTTP "+status+hint);
      }
      let snippet = "";
      reply.setEncoding("utf8");
      reply.on("data", d => { if (snippet.length < 400) snippet += d; });
      reply.on("end", () => nextProvider("HTTP " + reply.statusCode + " " + snippet.replace(/\s+/g, " ").trim().slice(0, 200)));
      reply.on("error", () => nextProvider("响应错误"));
      return;
    }
    settled = true;
    committed = true;
    res.writeHead(200, {
      "Content-Type": reply.headers["content-type"] || "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Tavern-Provider": provider.id,
      "X-Tavern-Model": provider.personal ? encodeURIComponent(provider.model) : provider.model
    });
    reply.on("error", () => { if (!res.writableEnded) res.destroy(); });
    reply.pipe(res);
  });

  upstream.on("timeout", () => {
    if (!committed) nextProvider("超时（" + (provider.timeout || 60000) + "ms）");
    else { try { upstream.destroy(); } catch {} res.destroy(); }
  });
  upstream.on("error", err => {
    if (committed) { if (!res.writableEnded) res.destroy(); }
    else if (!settled) nextProvider(provider.personal
      ? (err.message==="个人 API 只允许访问公网地址" ? err.message : "无法访问，请检查 API 地址")
      : err.code || err.message || "连接失败");
  });
  res.on("close", () => { if (!res.writableFinished) { try { upstream.destroy(); } catch {} } });
  upstream.end(body);
}

const validId = id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
function worldRoutes(req, res, user, url, route) {
  const worldsFile = userFile(user, "worlds.json");
  if (route === "/api/worlds" && req.method === "GET") {
    const worlds = readJSON(worldsFile, []);
    const id = url.searchParams.get("id");
    if (id !== null) {
      const world = validId(id) && worlds.find(w => w.id === id);
      return world ? sendJSON(res, 200, { world }) : sendJSON(res, 404, { error: "这份旅途已不存在" });
    }
    return sendJSON(res, 200, { worlds: worlds.map(({ text, bible, ...meta }) => meta) });
  }
  if (route === "/api/worlds" && req.method === "POST") {
    return readBody(req, res, p => {
      const name = typeof p.name === "string" ? p.name.trim() : "";
      if (!name || name.length > 255 || typeof p.text !== "string" || p.text.length > 500000) {
        return sendJSON(res, 400, { error: "无效的旅途名称或设定" });
      }
      const worlds = readJSON(worldsFile, []);
      const isBook = p.isBook === true;
      let world = null;
      if (!p.createNew) {
        if (isBook) world = worlds.find(w => w.name === name && w.isBook === true);
        else if (typeof p.bookId === "string" && validId(p.bookId)) world = worlds.find(w => !w.isBook && w.bookId === p.bookId);
        else world = worlds.find(w => w.name === name && !w.isBook);
      }
      if (!world) {
        world = { id: "w" + crypto.randomUUID(), name, genre: typeof p.genre === "string" ? p.genre.slice(0, 24) : "" };
        worlds.push(world);
      }
      if (isBook) world.isBook = true;
      if (typeof p.bookId === "string" && validId(p.bookId)) world.bookId = p.bookId;
      if (p.source === "paste" || p.source === "upload") world.source = p.source;
      if (p.infiniteMode) world.infiniteMode = true;
      if (typeof p.builtinId==="string" && /^novel_[a-z]+$/.test(p.builtinId)) world.builtinId=p.builtinId;
      if (Number.isSafeInteger(p.windowStart) && p.windowStart>=0) world.windowStart=p.windowStart;
      if (typeof p.worldStart==="string" && p.worldStart) world.worldStart=p.worldStart.slice(0,600);
      if (p.role && typeof p.role.name==="string" && p.role.name.trim()){
        const role={};
        for(const key of ["name","gender","identity","personality","hook","species","origin","appearance","outfit"]){
          if(typeof p.role[key]==="string") role[key]=p.role[key].slice(0,300);
        }
        for(const key of ["coin","income","age","height","weight"]){
          if(Number.isFinite(p.role[key])) role[key]=Math.max(0,Math.round(p.role[key]));
        }
        if (p.role.attrs && typeof p.role.attrs==="object" && !Array.isArray(p.role.attrs)){
          const attrs={};
          for(const key of ["iq","physique","charm","willpower","agility"]){
            if(Number.isFinite(p.role.attrs[key])) attrs[key]=Math.max(10,Math.min(90,Math.round(p.role.attrs[key])));
          }
          if(Object.keys(attrs).length===5) role.attrs=attrs;
        }
        world.role=role;
      }
      Object.assign(world, { text: p.text, savedAt: Date.now() });
      if (typeof p.summary === "string" && p.summary.length > 0 && p.summary.length <= 4000) world.summary = p.summary;
      if (p.bible && typeof p.bible === "object" && !Array.isArray(p.bible)) {
        try {
          const s = JSON.stringify(p.bible);
          if (s.length <= 400000) world.bible = JSON.parse(s);
        } catch (e) {}
      }
      if (typeof p.title === "string" && p.title) world.title = p.title.slice(0, 120);
      if (typeof p.author === "string" && p.author) world.author = p.author.slice(0, 80);
      writeJSON(worldsFile, worlds);
      sendJSON(res, 200, { world });
    });
  }
  if (route === "/api/worlds/rename" && req.method === "POST") {
    return readBody(req, res, p => {
      const id = p.id;
      const name = typeof p.name === "string" ? p.name.trim() : "";
      if (!validId(id) || !name || name.length > 255) return sendJSON(res, 400, { error: "无效的名称" });
      const worlds = readJSON(worldsFile, []);
      const world = worlds.find(w => w.id === id);
      if (!world) return sendJSON(res, 404, { error: "这份记录已不存在" });
      world.name = name;
      if (world.isBook) world.title = name.slice(0,120);
      world.savedAt = Date.now();
      writeJSON(worldsFile, worlds);
      sendJSON(res, 200, { world });
    });
  }
  if (route === "/api/worlds/delete-book" && req.method === "POST") {
    return readBody(req, res, ({ id }) => {
      if (!validId(id)) return sendJSON(res, 400, { error: "无效的书目编号" });
      const worlds = readJSON(worldsFile, []);
      const target = worlds.find(w => w.id === id);
      if (!target || !target.isBook) return sendJSON(res, 400, { error: "这不是书库中的小说剧本" });
      const ids = new Set([id, ...worlds.filter(w => w.bookId === id).map(w => w.id)]);
      writeJSON(worldsFile, worlds.filter(w => !ids.has(w.id)));
      for (const wid of ids) {
        try { fs.unlinkSync(userFile(user, "save_" + wid + ".json")); }
        catch (err) { if (err.code !== "ENOENT") throw err; }
      }
      sendJSON(res, 200, { ok: true, deleted: [...ids] });
    });
  }
  if (route === "/api/worlds/delete" && req.method === "POST") {
    return readBody(req, res, ({ id }) => {
      if (!validId(id)) return sendJSON(res, 400, { error: "无效的旅途编号" });
      const worlds = readJSON(worldsFile, []);
      const target = worlds.find(w => w.id === id);
      if (target?.isBook) return sendJSON(res, 400, { error: "这是书库中的小说剧本，不能从旅途记录里删除。" });
      if (target?.source === "upload" && !target.bookId && typeof target.text === "string") {
        const copy = {...target, id: "w" + crypto.randomUUID(), name: String(target.name || "导入书").slice(0,240) + "（书库原文）",
          isBook: true, source: "upload", turn: 0, scene: "", finished: false, savedAt: Date.now()};
        delete copy.bookId;
        worlds.push(copy);
      }
      writeJSON(worldsFile, worlds.filter(w => w.id !== id));
      try { fs.unlinkSync(userFile(user, "save_" + id + ".json")); }
      catch (err) { if (err.code !== "ENOENT") throw err; }
      sendJSON(res, 200, { ok: true });
    });
  }
  if (route === "/api/save" && req.method === "GET") {
    const id = url.searchParams.get("id");
    if (!validId(id)) return sendJSON(res, 400, { error: "无效的旅途编号" });
    return sendJSON(res, 200, { save: readJSON(userFile(user, "save_" + id + ".json"), null) });
  }
  if (route === "/api/save" && req.method === "PUT") {
    return readBody(req, res, ({ id, save }) => {
      if (!validId(id) || !save || typeof save !== "object" || Array.isArray(save)) {
        return sendJSON(res, 400, { error: "无效的存档" });
      }
      const worlds = readJSON(worldsFile, []);
      const world = worlds.find(w => w.id === id);
      if (!world) return sendJSON(res, 404, { error: "这份旅途已不存在" });
      writeJSON(userFile(user, "save_" + id + ".json"), save);
      world.turn = Number.isSafeInteger(save.turn) ? save.turn : 0;
      world.scene = typeof save.scene === "string" ? save.scene.slice(0, 150) : "";
      world.finished = Boolean(save.ending);
      world.savedAt = Date.now();
      writeJSON(worldsFile, worlds);
      sendJSON(res, 200, { ok: true });
    });
  }
  sendJSON(res, 404, { error: "未找到接口" });
}

function serveStatic(req, res, route) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  const target = route === "/" ? "/index.html" : route;
  const type = target === "/index.html" ? "text/html" : target === "/worlds-index.js" ? "application/javascript" :
    target === "/styles.css" ? "text/css" :
    /^\/js\/[a-z0-9_-]+\.js$/i.test(target) ? "application/javascript" :
    /^\/vendor\/[a-z0-9._-]+\.js$/i.test(target) ? "application/javascript" :
    /^\/vendor\/[a-z0-9._-]+\.wasm$/i.test(target) ? "application/wasm" :
    /^\/models\/[a-z0-9._/-]+\.(?:json|txt)$/i.test(target) ? "application/json" :
    /^\/models\/[a-z0-9._/-]+\.onnx$/i.test(target) ? "application/octet-stream" :
    target === "/avatars/avatars.js" ? "application/javascript" :
    /^\/avatars\/[a-z0-9_]+\.(?:jpe?g|png|webp)$/i.test(target)
      ? "image/"+(/\.jpe?g$/i.test(target) ? "jpeg" : path.extname(target).slice(1)) :
    /^\/worlds_data\/novel_[a-z]+(?:\.bible)?\.json$/.test(target) ? "application/json" :
    /^\/worlds_data\/daomuhua-\d{3}\.(?:jpe?g|png|gif|webp)$/.test(target)
      ? "image/"+(target.endsWith(".jpg") ? "jpeg" : path.extname(target).slice(1)) : null;
  if (!type) { res.writeHead(404); return res.end("Not Found"); }
  fs.readFile(path.join(ROOT, target), (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not Found"); }
    const textual = !/\.(?:wasm|onnx)$/i.test(target);
    const headers = {
      "Content-Type": type + (textual ? "; charset=utf-8" : ""),
      "Cache-Control": "no-cache",
      "Vary": "Accept-Encoding",
      "X-Content-Type-Options": "nosniff"
    };
    const finish = (body, gzip) => {
      if (gzip) headers["Content-Encoding"] = "gzip";
      headers["Content-Length"] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (/\bgzip\b/.test(req.headers["accept-encoding"] || "") && data.length > 1024) {
      zlib.gzip(data, (error, compressed) => finish(error ? data : compressed, !error));
    } else finish(data, false);
  });
}

function route(req, res) {
  let url, pathname;
  try {
    url = new URL(req.url, "http://localhost");
    pathname = decodeURIComponent(url.pathname);
  } catch { return sendJSON(res, 400, { error: "无效的请求路径" }); }
  if (pathname === "/api/register" && req.method === "POST") return sendJSON(res, 403, { error: "注册已关闭" });
  if (pathname === "/api/login" && req.method === "POST") return login(req, res);
  if (!pathname.startsWith("/api/")) return serveStatic(req, res, pathname);
  const user = authUser(req);
  if (!user) return sendJSON(res, 401, { error: "登录已失效，请重新登录" });
  if (pathname === "/api/chat" && req.method === "POST") return proxyChat(req, res, user);
  if (pathname === "/api/llm/personal") return personalSettings(req,res,user);
  if (pathname === "/api/llm/providers" && req.method === "GET") {
    const personal = readJSON(personalFile(user),null);
    const shared = ALL_PROVIDERS.filter(p=>p.id!==PERSONAL_PROVIDER).map(p=>
      ({id:p.id,name:p.name,model:p.model,local:Boolean(p.local),enabled:Boolean(p.enabled)}));
    return sendJSON(res, 200, {
      default: personal ? PERSONAL_PROVIDER : DEFAULT_PROVIDER_ID,
      providers: personal ? [{id:PERSONAL_PROVIDER,name:"我的 API",model:personal.model,enabled:true},...shared] : shared
    });
  }
  if (pathname === "/api/logout" && req.method === "POST") {
    const token = sessionToken(req);
    sessions.delete(token);
    if (token) revokedTokens.add(token);
    return sendJSON(res, 200, { ok: true });
  }
  return worldRoutes(req, res, user, url, pathname);
}

const server = http.createServer((req, res) => {
  try { route(req, res); } catch (err) { handleError(res, err); }
});
server.listen(PORT, () => {
  console.log("Tavern running at http://localhost:" + server.address().port);
  if (!LLM_PROVIDERS.length) console.log("[LLM] 未配置可用的 AI 服务，请在 data/llm.local.json 填写 providers");
  else console.log("[LLM] 默认：" + DEFAULT_PROVIDER_ID + "；可用：" + LLM_PROVIDERS.map(p => p.id + "(" + p.model + ")").join(", "));
});
