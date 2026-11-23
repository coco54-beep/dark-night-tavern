"use strict";

const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { dimensions, missingModels, create } = require("./js/qwen-workflow");

const JOB_TTL = 15 * 60 * 1000;
const NATIVE_ORIGINS = new Set(["http://localhost", "https://localhost"]);

function createQwenImages({ secret, sendJSON, readBody }) {
  const comfy = "http://127.0.0.1:8190";
  const pairingKey = crypto.createHmac("sha256", secret).update("tavern-qwen-images").digest("hex");
  const jobs = new Map();
  let submitting = false;

  function upstream(path, options) {
    return fetch(comfy + path, { ...options, redirect: "error", signal: AbortSignal.timeout(12000) });
  }
  async function history(id) {
    const response = await upstream("/history/" + id);
    if (!response.ok) throw new Error("ComfyUI history unavailable");
    const result = await response.json();
    return result[id];
  }

  return async function qwenImages(req, res, route) {
    const origin = req.headers.origin;
    const native = NATIVE_ORIGINS.has(origin);
    const local = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || "")
      && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host || "")
      && !req.headers.forwarded && !req.headers["x-forwarded-for"] && !req.headers["x-forwarded-host"];
    const sameOrigin = !origin || origin === "http://" + req.headers.host || origin === "https://" + req.headers.host;
    if (origin && !sameOrigin && !native) return sendJSON(res, 403, { error: "不支持从此网页访问生图服务" });
    if (native) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers": "Content-Type, X-Tavern-Image-Key",
          "Access-Control-Allow-Private-Network": "true"
        });
        return res.end();
      }
    }
    if (route === "/pairing" && req.method === "GET") {
      if (!local || !sameOrigin || req.headers["sec-fetch-site"] === "cross-site") {
        return sendJSON(res, 403, { error: "请在运行酒馆服务的电脑上查看配对码" });
      }
      return sendJSON(res, 200, { key: pairingKey });
    }
    const supplied = req.headers["x-tavern-image-key"];
    const paired = typeof supplied === "string" && /^[a-f0-9]{64}$/.test(supplied)
      && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(pairingKey));
    if (!paired && (!local || (!sameOrigin && !native) || req.headers["sec-fetch-site"] === "cross-site" && !native)) {
      return sendJSON(res, 401, { error: "请输入电脑酒馆图像设置中的配对码" });
    }
    try {
      if (route === "/status" && req.method === "GET") {
        const missing = await missingModels(async node => {
          const response = await upstream("/object_info/" + node);
          return response.ok ? (await response.json())[node] : null;
        });
        return missing.length === 0
          ? sendJSON(res, 200, { ready: true })
          : sendJSON(res, 503, { error: "ComfyUI 缺少 Qwen Image 2.1 模型或节点" });
      }
      if (route === "/jobs" && req.method === "POST") {
        return readBody(req, res, ({ kind, prompt, negative, seed }) => {
          if (typeof kind !== "string" || !Object.hasOwn(dimensions, kind) || typeof prompt !== "string" || !prompt.trim() || prompt.length > 2500
            || typeof negative !== "string" || negative.length > 2000 || !Number.isSafeInteger(seed) || seed < 0) {
            return sendJSON(res, 400, { error: "生图参数无效" });
          }
          if (submitting) return sendJSON(res, 409, { error: "正在提交另一张图，请稍后再试" });
          submitting = true;
          (async () => {
            const now = Date.now();
            for (const [id, job] of jobs) if (now - job.createdAt > JOB_TTL) jobs.delete(id);
            if ([...jobs.values()].filter(job => !job.finished).length >= 3) {
              const pending = [...jobs.entries()].filter(([, job]) => !job.finished);
              await Promise.all(pending.map(async ([id, job]) => { job.finished = Boolean(await history(id)); }));
              if (pending.every(([, job]) => !job.finished)) {
                return sendJSON(res, 429, { error: "已有三张图正在等待，请稍后再试" });
              }
            }
            const response = await upstream("/prompt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: create(prompt.trim(), negative, kind, seed) })
            });
            const result = await response.json();
            if (!response.ok || !/^[a-f0-9-]{36}$/.test(result.prompt_id || "")) {
              return sendJSON(res, 502, { error: "ComfyUI 未接受 Qwen 工作流，请检查模型和节点" });
            }
            jobs.set(result.prompt_id, { createdAt: now, finished: false });
            return sendJSON(res, 202, { id: result.prompt_id });
          })().catch(() => sendJSON(res, 503, { error: "无法连接 Qwen ComfyUI，请先在电脑上启动它" }))
            .finally(() => { submitting = false; });
        }, 24 * 1024);
      }
      const match = /^\/jobs\/([a-f0-9-]{36})$/.exec(route);
      if (match && req.method === "GET") {
        const id = match[1];
        const job = jobs.get(id);
        if (!job || Date.now() - job.createdAt > JOB_TTL) return sendJSON(res, 404, { error: "此生图任务已过期" });
        const entry = await history(id);
        if (!entry) return sendJSON(res, 202, { pending: true });
        job.finished = true;
        const image = entry.outputs?.["8"]?.images?.[0];
        if (!image) {
          const failure = entry.status?.messages?.find(message => message[0] === "execution_error")?.[1];
          const reason = typeof failure?.exception_message === "string" ? failure.exception_message.trim().split(/\r?\n/, 1)[0].slice(0, 180) : "";
          return sendJSON(res, 502, { error: "ComfyUI 生成失败" + (reason ? " · " + reason : "") });
        }
        const query = new URLSearchParams({ filename: image.filename, type: "output", subfolder: image.subfolder || "" });
        const response = await upstream("/view?" + query);
        if (!response.ok || !response.body) return sendJSON(res, 502, { error: "无法读取生成图" });
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        return await pipeline(Readable.fromWeb(response.body), res);
      }
      return sendJSON(res, 404, { error: "未找到生图接口" });
    } catch {
      if (res.headersSent) return res.destroy();
      return sendJSON(res, 503, { error: "无法连接 Qwen ComfyUI，请先在电脑上启动它" });
    }
  };
}

module.exports = { createQwenImages };
