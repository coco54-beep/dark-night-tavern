"use strict";
/* ==================== 引擎 ==================== */
function goNode(id){
  S.node = id;
  if(id==="start" && !S.career){
    showCareerPicker();
    return;
  }
  if(id==="__end_good" || id==="__end_bad"){
    saveProgress();
    showEnding(id==="__end_good");
    return;
  }
  const node = NODES[id];
  if(!node) return goNode("start");
  NPC_VIEW[id] = node.view;
  node.lines.forEach(addLog);
  S.log = S.log.slice(-120);
  renderLog();
  refreshStats();
  refreshSide();
  renderChoices(node);
  saveProgress();
}

function renderChoices(node){
  $("custom-action").hidden = true;
  const box = $("choices");
  box.innerHTML = "";
  box.scrollTop = 0;
  const valid = node.choices.filter(c=> !c.cond || c.cond());
  if(valid.length===0){
    // 兜底
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = "继续";
    btn.onclick = ()=>goNode("start");
    box.appendChild(btn);
    syncChoiceList(1);
    return;
  }
  valid.forEach(c=>{
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = escapeHtml(c.text) + (c.tag?`<span class="tag">${escapeHtml(c.tag)}</span>`:"");
    if(c.cost>S.coin){
      btn.disabled = true;
      btn.title = "余额不足";
      btn.innerHTML += '<span class="tag">余额不足</span>';
    }
    btn.onclick = ()=>{
      if(btn.disabled) return;
      c.do?.();
      refreshStats();
      if(c.go){ goNode(c.go); }
      else { S.log = S.log.slice(-120); renderLog(); refreshSide(); saveProgress(); }
    };
    box.appendChild(btn);
  });
  syncChoiceList(valid.length);
}

/* ==================== 结局 ==================== */
function showEnding(good){
  $("custom-action").hidden = true;
  $("choices").replaceChildren();
  const ov = $("overlay");
  const card = $("card");
  ov.classList.remove("hidden");
  const title = good ? "灯火不熄" : "雨夜未了";
  const cls = good ? "good" : "bad";
  const text = good
    ? `你走出了那个雨夜。<br><br>磨坊底下的哭声停了，卡尔回到了酒馆，布兰重新举起了杯。<br><br>莉拉说，暗夜酒馆永远有你的位置。<br><br>而你终于明白：酒馆里真正的故事，从来不是酒，而是愿意为别人举杯的人。<br><br><b>声望 +${S.rep} · 金币 ${S.coin}</b>`
    : `你没能救下磨坊里的人。<br><br>哭声还在雨夜里回响，像一件永远没能完成的事。<br><br>莉拉没有再提起那桩委托，只是在你每次推门进来时，多看你一眼。<br><br>有些答案，你终究没带回来。<br><br><b>声望 ${S.rep} · 金币 ${S.coin}</b>`;
  card.innerHTML = `
    <h1 class="end-title ${cls}">${title}</h1>
    <div class="sub">— 结局 —</div>
    <div class="end-text">${text}</div>
    <div class="card-btns">
      <button class="big-btn" id="btn-restart">再来一次</button>
      <button class="big-btn ghost" id="btn-title">返回标题</button>
    </div>`;
  $("btn-restart").onclick = ()=>startClassic();
  $("btn-title").onclick = showTitle;
}

/* ==================== 标题/开始 ==================== */
function readClassic(){
  try{ return JSON.parse(localStorage.getItem(CLASSIC_KEY)); }
  catch(e){ return null; }
}

function menuNote(text){
  const note = $("menu-note");
  if(note) note.textContent = text;
}

function renameWorld(id, currentName){
  const input = prompt("新的名称", currentName || "");
  if(input === null) return;
  const name = input.trim().slice(0,255);
  if(!name || name === currentName) return;
  menuNote("正在重命名……");
  api("/api/worlds/rename",{method:"POST",body:{id,name},token:AUTH.token}).then(async ()=>{
    if(S && S.worldId === id) S.worldName = name;
    await showTitle();
    menuNote("已重命名为「"+name+"」。");
  }).catch(e=>menuNote("重命名失败："+e.message));
}

function bookNamesKey(){
  return "tavern_book_names_v1" + (AUTH && AUTH.username ? ":" + AUTH.username : "");
}
function bookNameOverrides(){
  try{
    const value = JSON.parse(localStorage.getItem(bookNamesKey()) || "{}");
    return value && typeof value==="object" && !Array.isArray(value) ? value : {};
  }catch(e){ return {}; }
}
function saveBookNameOverrides(map){
  try{ localStorage.setItem(bookNamesKey(), JSON.stringify(map)); }catch(e){}
}
function bookDisplayTitle(id, fallback){
  const name = bookNameOverrides()[id];
  return name || fallback || "未命名";
}
function renameBuiltinBook(id, currentName){
  const input = prompt("新的书名（留空恢复原名）", currentName || "");
  if(input === null) return;
  const name = input.trim().slice(0,120);
  const map = bookNameOverrides();
  if(name) map[id] = name;
  else delete map[id];
  saveBookNameOverrides(map);
  if(S && S.builtinId === id && name) S.worldName = name;
  showTitle();
  menuNote(name ? "已重命名为「"+name+"」。" : "已恢复原书名。");
}
function hiddenBookKey(){
  return "tavern_hidden_books_v1" + (AUTH && AUTH.username ? ":" + AUTH.username : "");
}
function hiddenBookIds(){
  try{ return new Set(JSON.parse(localStorage.getItem(hiddenBookKey()) || "[]")); }
  catch(e){ return new Set(); }
}
function hideBook(id){
  if(!id) return;
  const set = hiddenBookIds();
  set.add(id);
  try{ localStorage.setItem(hiddenBookKey(), JSON.stringify([...set])); }catch(e){}
}
function restoreHiddenBooks(){
  try{ localStorage.removeItem(hiddenBookKey()); }catch(e){}
}

const IMAGE_CFG_KEY = "tavern_image_v1";
const IMG_NEG = "cartoon, anime, illustration, painting, 3d render, cgi, plastic skin, airbrushed, deformed, bad anatomy, extra fingers, text, watermark, logo, low quality, blurry";
const SPECIES_EN = {"狗":"dog","犬":"dog","猫":"cat","狐狸":"fox","狐":"fox","狼":"wolf","乌鸦":"crow","蛇":"snake","马":"horse","虎":"tiger","外星人":"alien","机械":"robot","机器人":"robot","灵体":"spirit","兽人":"beastman","龙":"dragon","魔":"demon","人类":"person","人":"person"};
function imageCfg(){
  const native = typeof Capacitor!=="undefined" && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  const def = {enabled:false, base: native ? "http://onlyforcoco.myqnapcloud.com:8189" : "http://127.0.0.1:8189",
    user:"", pass:"", checkpoint:"RealVisXL_V5.0_Lightning_fp16.safetensors",
    style:"photorealistic, cinematic soft light, natural skin texture, high detail, dark background",
    localPrompt:true, autoAvatars:false, autoScenes:false};
  try{ return {...def, ...JSON.parse(localStorage.getItem(IMAGE_CFG_KEY)||"{}")}; }catch(e){ return def; }
}
function saveImageCfg(cfg){ try{ localStorage.setItem(IMAGE_CFG_KEY, JSON.stringify(cfg)); }catch(e){} }
function imageAuth(cfg){ return cfg.user ? "Basic " + btoa(cfg.user+":"+cfg.pass) : ""; }
function imageBase(cfg){ return String(cfg.base||"").replace(/\/+$/,""); }
let imageDbPromise = null;
function imageDb(){
  if(imageDbPromise) return imageDbPromise;
  imageDbPromise = new Promise((res,rej)=>{
    const req = indexedDB.open("tavern_images",1);
    req.onupgradeneeded = ()=>{ const db=req.result; if(!db.objectStoreNames.contains("images")) db.createObjectStore("images"); };
    req.onsuccess = ()=>res(req.result);
    req.onerror = ()=>rej(req.error);
  });
  return imageDbPromise;
}
async function imagePut(key,val){
  const db = await imageDb();
  return new Promise((res,rej)=>{ const tx=db.transaction("images","readwrite"); tx.objectStore("images").put(val,key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); });
}
async function imageGet(key){
  const db = await imageDb();
  return new Promise((res,rej)=>{ const tx=db.transaction("images","readonly"); const rq=tx.objectStore("images").get(key); rq.onsuccess=()=>res(rq.result||""); rq.onerror=()=>rej(rq.error); });
}
async function imageListKeys(){
  const db = await imageDb();
  return new Promise((res,rej)=>{ const tx=db.transaction("images","readonly"); const rq=tx.objectStore("images").getAllKeys(); rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error); });
}
async function imageDel(key){
  const db = await imageDb();
  return new Promise((res,rej)=>{ const tx=db.transaction("images","readwrite"); tx.objectStore("images").delete(key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); });
}
async function pruneSceneImages(max=12){
  if(!S || !S.log) return;
  const prefix = "scene:" + (S.worldId||"local") + ":";
  const entries = S.log.filter(e=>e && e.t==="image" && typeof e.key==="string" && e.key.startsWith(prefix));
  const keep = new Set(entries.slice(-max).map(e=>e.key));
  S.log = S.log.filter(e=>!(e && e.t==="image" && typeof e.key==="string" && e.key.startsWith(prefix)) || keep.has(e.key));
  try{
    const keys = await imageListKeys();
    await Promise.all(keys.filter(k=>typeof k==="string" && k.startsWith(prefix) && !keep.has(k)).map(imageDel));
  }catch(e){}
}
function blobToDataURL(blob){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(blob); });
}
function seedOf(s){
  let h=0; const str=String(s||"");
  for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))|0;
  return Math.abs(h)%1000000;
}
function comfyWorkflow(cfg,positive,negative,w,h,seed){
  return {
    "1": {"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":cfg.checkpoint}},
    "2": {"class_type":"CLIPTextEncode","inputs":{"text":positive,"clip":["1",1]}},
    "3": {"class_type":"CLIPTextEncode","inputs":{"text":negative,"clip":["1",1]}},
    "4": {"class_type":"EmptyLatentImage","inputs":{"width":w,"height":h,"batch_size":1}},
    "5": {"class_type":"KSampler","inputs":{"seed":seed,"steps":6,"cfg":2.0,"sampler_name":"dpmpp_sde","scheduler":"karras","denoise":1.0,"model":["1",0],"positive":["2",0],"negative":["3",0],"latent_image":["4",0]}},
    "6": {"class_type":"VAEDecode","inputs":{"samples":["5",0],"vae":["1",2]}},
    "7": {"class_type":"SaveImage","inputs":{"filename_prefix":"avatar","images":["6",0]}}
  };
}
async function comfyGenerate(prompt,{w=832,h=1216,negative=IMG_NEG,seed=1,signal=null}={}){
  const cfg = imageCfg();
  if(!cfg.enabled) throw new Error("图像生成未启用，请先在「图像设置」里开启");
  const base = imageBase(cfg);
  if(!base) throw new Error("没有填写 ComfyUI 地址");
  const aborted = ()=>{ const e=new Error("已取消生成"); e.name="AbortError"; return e; };
  if(signal && signal.aborted) throw aborted();
  const headers = {"Content-Type":"application/json"};
  const auth = imageAuth(cfg); if(auth) headers.Authorization = auth;
  const cid = (typeof crypto!=="undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())+Math.random();
  const r = await fetch(base+"/prompt",{method:"POST",headers,body:JSON.stringify({prompt:comfyWorkflow(cfg,prompt,negative,w,h,seed),client_id:cid}),signal});
  if(r.status===401 || r.status===403) throw new Error("ComfyUI 需要登录，请在「图像设置」填写正确的用户名和密码");
  if(!r.ok) throw new Error("ComfyUI 提交失败（"+r.status+"）");
  const {prompt_id} = await r.json();
  let img = null;
  const t0 = Date.now();
  while(Date.now()-t0 < 150000){
    await new Promise(res=>setTimeout(res,1500));
    if(signal && signal.aborted) throw aborted();
    const hr = await fetch(base+"/history/"+prompt_id,{headers,signal});
    if(!hr.ok) continue;
    const hist = await hr.json();
    const entry = hist[prompt_id];
    if(entry && entry.outputs){
      for(const node of Object.values(entry.outputs)){
        if(node && Array.isArray(node.images) && node.images.length){ img = node.images[0]; break; }
      }
    }
    if(img) break;
  }
  if(!img) throw new Error("ComfyUI 生成超时");
  const q = new URLSearchParams({filename:img.filename,subfolder:img.subfolder||"",type:img.type||"output"});
  const ir = await fetch(base+"/view?"+q.toString(),{headers,signal});
  if(!ir.ok) throw new Error("读取生成图失败（"+ir.status+"）");
  return await blobToDataURL(await ir.blob());
}
function characterLook(c){
  return ([
    c.height ? ("height "+c.height+"cm") : "",
    c.weight ? ("weight "+c.weight+"kg") : "",
    c.appearance,c.origin,c.outfit,c.identity,c.job
  ].filter(Boolean).join("; ") || String(c.background||"").slice(0,240));
}
function npcImagePrompt(c){
  const cfg = imageCfg();
  const raw = String(c.species||"人类");
  const nonhuman = !/人类|人|human|humanoid/i.test(raw);
  const sp = SPECIES_EN[raw] || (nonhuman ? "non-human creature" : "person");
  const g = /女/.test(c.gender||"") ? "female" : /男/.test(c.gender||"") ? "male" : "";
  const age = Number.isFinite(Number(c.age)) ? (Number(c.age)+"-year-old") : "";
  const who = [age,g,sp].filter(Boolean).join(" ");
  const looks = characterLook(c);
  return ("photorealistic "+(nonhuman?"creature":"headshot")+" portrait of a "+who
    +", exact identity: "+looks
    +", "+(c.personality||"")+", centered, consistent facial identity, dark background, "
    +cfg.style+", no extra people, no text").replace(/\s+/g," ").trim();
}
function sceneMoment(){
  const e = S.environment || {};
  const recent = (S.log||[]).slice(-18)
    .filter(entry=>entry && ["narr","say","speech","action","npc-action"].includes(entry.t))
    .map(entry=>entry.who ? (entry.who+"："+entry.text) : String(entry.text||""))
    .join(" / ").slice(-1200);
  const present = (S.present||[]).slice(0,5).map(name=>{
    const c = (S.cast||[]).find(x=>x && x.name===name);
    return c ? [c.name,c.species,c.gender,c.age,c.height ? c.height+"cm" : "",c.weight ? c.weight+"kg" : "",c.origin,c.identity,c.job,c.appearance,c.outfit].filter(Boolean).join("，") : name;
  });
  return {
    scene:S.scene||"",
    moment:recent,
    plot:{goal:S.plot?.goal||"",conflict:S.plot?.conflict||"",next:S.plot?.next||""},
    place:e.place||"", time:formatClock(S), weather:e.weather||"",
    era:e.era||"", conditions:e.conditions||"", present
  };
}
function sceneImagePrompt(){
  const cfg = imageCfg();
  const m = sceneMoment();
  return ("cinematic narrative scene, exactly this story beat: "
    +[m.scene,m.plot.conflict,m.moment,m.place,m.weather,m.time,m.present.join("，")].filter(Boolean).join(", ")
    +", "+cfg.style).replace(/\s+/g," ").trim();
}
function npcNegative(c){
  const raw = String(c && c.species || "");
  const base = IMG_NEG + ", multiple people, extra person, duplicate face, inconsistent facial features, wrong hair color, wrong eye color, wrong clothing";
  if(/狗|犬|猫|狐|狼|鸦|蛇|马|虎/.test(raw)) return base + ", human, human face, human skin, person";
  if(/外星|机械|机器人|灵体|魔|龙/.test(raw)) return base + ", human skin, person";
  return base;
}
async function visualPrompt(c, kind){
  try{
    const sys = "You write one concise English prompt for a photorealistic SDXL image generator. Output only the prompt, no quotes, no markdown. Preserve exact identity: species, gender, age, hair, eyes, skin/fur/metal, body type, scars, prosthetics and clothing. Non-human characters must look clearly non-human. Never substitute a generic face or outfit. No text, watermark, logo, or UI.";
    let user;
    if(kind === "npc"){
      const p = {name:c.name,species:c.species,gender:c.gender,age:c.age,height:c.height,weight:c.weight,origin:c.origin,identity:c.identity,appearance:c.appearance,outfit:c.outfit,job:c.job,personality:c.personality,tie:c.tie,attitude:c.attitude,background:String(c.background||"").slice(0,240)};
      const setting = {world:S.worldName||S.genre||"",era:S.environment&&S.environment.era||"",place:S.environment&&S.environment.place||""};
      user = "Character reference: " + JSON.stringify(p) + ". Setting: " + JSON.stringify(setting) + ". Write a photorealistic " + (/human|人类|人/i.test(c.species||"") ? "headshot" : "creature portrait") + " prompt. You must repeat every explicit origin, appearance and outfit detail; use origin/regional heritage to guide facial features and styling without caricature or stereotype. Do not change hair color, eye color, age, species, body type or clothing. One person only, centered, dark background, 85mm, natural skin/fur/metal texture.";
    }else{
      const m = sceneMoment();
      user = "Story moment: " + JSON.stringify(m)
        + ". Illustrate this exact narrative beat as a cinematic wide shot. Depict what is happening now, including the visible characters, their action, expressions and spatial relationship; keep the location, time, weather and era. Every present character must match the listed species, age, hair, eyes, body and outfit exactly. Do not make a generic empty establishing shot, do not replace characters with generic faces, and do not invent a different event. No text, watermark, logo or UI.";
    }
    const sig = (typeof AbortSignal!=="undefined" && AbortSignal.timeout) ? AbortSignal.timeout(30000) : null;
    const txt = await callLLM([{role:"system",content:sys},{role:"user",content:user}], sig, null, {temperature:0.35});
    const clean = String(txt||"").trim().replace(/^```[\s\S]*?```$/g,"").replace(/^[\"'`]+|[\"'`]+$/g,"").slice(0,800);
    if(clean) return clean;
  }catch(e){}
  return kind==="npc" ? npcImagePrompt(c) : sceneImagePrompt();
}
function playerImageSpec(){
  const pi = S.playerIdentity || {};
  const role = S.worldRole || {};
  const career = CAREERS[S.career];
  return {
    name: pi.name || role.name || "你",
    species: S.species || pi.species || role.species || "人类",
    gender: S.gender || role.gender || "",
    age: S.age ?? role.age,
    identity: pi.identity || role.identity || (career && career.identity) || "",
    appearance: S.appearance || pi.appearance || role.appearance || "",
    origin: S.origin || pi.origin || role.origin || "",
    outfit: S.outfit || pi.outfit || role.outfit || "",
    height: S.height || role.height || "",
    weight: S.weight || role.weight || "",
    job: pi.job || role.job || (career && career.name) || "",
    personality: pi.desc || role.personality || "",
    tie: "玩家本人"
  };
}
async function generatePlayerAvatar(){
  const cfg = imageCfg();
  if(!cfg.enabled) throw new Error("请先在「图像设置」里启用图像生成");
  const spec = playerImageSpec();
  const key = "avatar:"+(S.worldId||"local")+":__player__";
  const prompt = await visualPrompt(spec,"npc");
  const data = await comfyGenerate(prompt,{w:832,h:1216,negative:npcNegative(spec),seed:seedOf(spec.name+"__player__")});
  await imagePut(key,data);
  S.avatarKey = key;
  await saveProgress(true);
  refreshSide();
  return key;
}
async function generateNpcAvatar(name){
  const cfg = imageCfg();
  if(!cfg.enabled) throw new Error("请先在「图像设置」里启用图像生成");
  const c = (S.cast||[]).find(x=>x.name===name);
  if(!c) throw new Error("找不到这个角色");
  const key = "avatar:"+(S.worldId||"local")+":"+name;
  const prompt = await visualPrompt(c,"npc");
  const data = await comfyGenerate(prompt,{w:832,h:1216,negative:npcNegative(c),seed:seedOf(name)});
  await imagePut(key,data);
  c.avatarKey = key;
  await saveProgress(true);
  refreshSide();
  return key;
}
async function generateSceneImage({signal=null}={}){
  const cfg = imageCfg();
  if(!cfg.enabled) throw new Error("请先在「图像设置」里启用图像生成");
  const aborted = ()=>{ const e=new Error("已取消生成"); e.name="AbortError"; return e; };
  if(signal && signal.aborted) throw aborted();
  const moment = sceneMoment();
  const sig = seedOf(JSON.stringify({turn:S.turn,scene:S.scene,plot:S.plot,moment:moment.moment.slice(-700),place:moment.place}));
  const key = "scene:"+(S.worldId||"local")+":"+(S.turn||0)+":"+sig;
  const prompt = cfg.localPrompt !== false ? sceneImagePrompt() : await visualPrompt(null,"scene");
  if(signal && signal.aborted) throw aborted();
  const data = await comfyGenerate(prompt,{w:1216,h:832,seed:seedOf(key),signal});
  if(signal && signal.aborted) throw aborted();
  await imagePut(key,data);
  if(signal && signal.aborted) throw aborted();
  S.sceneImageKey = key;
  const entry = {t:"image",key,alt:"场景图 · "+(S.scene||(S.environment&&S.environment.place)||"当前场景")};
  S.log = [...(S.log||[]),entry].slice(-120);
  logToDOM(entry);
  const logEl = $("log"); if(logEl) logEl.scrollTop = logEl.scrollHeight;
  await pruneSceneImages(12);
  await saveProgress(true);
  return key;
}
function syncSceneImageButton(){
  const btn = $("btn-scene-img");
  if(!btn) return;
  const on = !!(S.sceneImageAuto && imageCfg().enabled);
  btn.classList.toggle("active",on);
  btn.setAttribute("aria-pressed",on ? "true" : "false");
  btn.title = on ? "自动配图已开启：每个剧情点生成一张（点击关闭）" : "点一下开启自动配图：每个剧情点生成一张";
}
async function autoSceneImage(){
  if(!S || !S.ai || !S.sceneImageAuto || !imageCfg().enabled) return;
  if(!S.scene && !(S.environment && S.environment.place)) return;
  if(Number(S.turn) === Number(S.lastAutoSceneTurn)) return;
  if(autoImageAbort) autoImageAbort.abort();
  const controller = new AbortController();
  autoImageAbort = controller;
  S.lastAutoSceneTurn = S.turn;
  try{
    await generateSceneImage({signal:controller.signal});
    if(controller.signal.aborted || !S.sceneImageAuto) return;
    S.autoImageTimeouts = 0;
    imageToast("已自动生成当前剧情配图。",2500);
  }catch(e){
    if(e.name === "AbortError" || controller.signal.aborted || !S.sceneImageAuto) return;
    const timedOut = e.name === "TimeoutError" || /超时|timeout|timed out/i.test(e.message || "");
    if(timedOut) S.autoImageTimeouts = (S.autoImageTimeouts || 0) + 1;
    else S.autoImageTimeouts = 0;
    if(S.autoImageTimeouts >= 2){
      S.sceneImageAuto = false;
      S.autoImageTimeouts = 0;
      syncSceneImageButton();
      imageToast("连续两次配图超时，已自动关闭自动配图。",7000);
      saveProgress();
      return;
    }
    imageToast(timedOut ? ("自动配图超时 "+S.autoImageTimeouts+"/2："+e.message) : ("自动配图失败："+e.message),6000);
  }finally{
    if(autoImageAbort === controller) autoImageAbort = null;
  }
}
let imageToastTimer = null;
function imageToast(message,ms=3500){
  let el = document.getElementById("img-toast");
  if(!el){ el=document.createElement("div"); el.id="img-toast"; el.className="img-toast"; document.body.appendChild(el); }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(imageToastTimer);
  if(ms>0) imageToastTimer = setTimeout(()=>{ el.hidden = true; },ms);
}

function showImageSettings(){
  const cfg = imageCfg();
  const card = $("card");
  card.innerHTML = `
    <h1>图像设置</h1>
    <div class="sub">用本地 ComfyUI 生成 NPC 头像和场景配图。启用后，故事中点一下右上角 🖼 开启自动配图，每个剧情点会生成一张并插入聊天记录；再点一下关闭。手机 APK 请把地址改成电脑的局域网 IP 或公网地址，并填写代理账号密码。</div>
    <form class="auth-form" id="image-form" autocomplete="off">
      <label class="check-line"><input type="checkbox" id="image-enabled" ${cfg.enabled?"checked":""}> 启用图像生成</label>
      <label class="check-line"><input type="checkbox" id="image-local-prompt" ${cfg.localPrompt!==false?"checked":""}> 本地快速提示词（自动配图不调用 LLM，速度更快）</label>
      <label for="image-base">ComfyUI 地址</label>
      <input id="image-base" type="url" maxlength="512" value="${escapeHtml(cfg.base||"")}" placeholder="http://127.0.0.1:8189" required>
      <label for="image-user">用户名</label>
      <input id="image-user" type="text" maxlength="120" value="${escapeHtml(cfg.user||"")}">
      <label for="image-pass">密码</label>
      <input id="image-pass" type="password" maxlength="512" placeholder="留空保留原密码">
      <label for="image-checkpoint">模型文件</label>
      <input id="image-checkpoint" type="text" maxlength="200" value="${escapeHtml(cfg.checkpoint||"")}">
      <label for="image-style">风格前缀</label>
      <input id="image-style" type="text" maxlength="300" value="${escapeHtml(cfg.style||"")}">
      <div class="form-note" id="image-status" role="status"></div>
      <button type="submit" class="big-btn">保存</button>
      <button type="button" class="big-btn ghost" id="image-test">测试连接</button>
      <button type="button" class="logout-btn" id="image-back">返回首页</button>
    </form>`;
  const status = $("image-status");
  const baseEl = $("image-base"), userEl = $("image-user"), passEl = $("image-pass");
  $("image-back").onclick = showTitle;
  $("image-test").onclick = async ()=>{
    status.textContent = "测试中……";
    const base = baseEl.value.trim().replace(/\/+$/,"");
    const user = userEl.value.trim();
    const pass = passEl.value || cfg.pass;
    const headers = {};
    if(user) headers.Authorization = "Basic " + btoa(user+":"+pass);
    try{
      const r = await fetch(base+"/system_stats",{headers});
      status.textContent = r.ok ? "连接成功，ComfyUI 可用。" : "连接失败："+r.status;
    }catch(e){ status.textContent = "连接失败："+e.message; }
  };
  $("image-form").onsubmit = (e)=>{
    e.preventDefault();
    const next = {...cfg,
      enabled: $("image-enabled").checked,
      localPrompt: !!($("image-local-prompt") && $("image-local-prompt").checked),
      base: baseEl.value.trim(),
      user: userEl.value.trim(),
      pass: passEl.value || cfg.pass,
      checkpoint: $("image-checkpoint").value.trim(),
      style: $("image-style").value.trim()
    };
    saveImageCfg(next);
    status.textContent = "已保存。";
    setTimeout(showTitle, 400);
  };
}

async function showTitle(){
  cancelTurn();
  clearIdleTimer();
  closeDrawer();
  const ov = $("overlay"), card = $("card");
  ov.classList.remove("hidden");
  card.innerHTML = '<h1>暗夜酒馆</h1><p class="sub">正在点亮炉火……</p>';
  const loading = card.firstElementChild;
  let worlds = [], error = "";
  if(isLoggedIn()){
    loadProviders();
    try{
      ({worlds} = await api("/api/worlds"));
    }catch(e){
      if(e.status===401){ clearAuth(); error = "登录已失效，请重新登录以继续旅途。"; }
      else error = e.message;
    }
  }
  if(card.firstElementChild!==loading) return;
  worlds.sort((a,b)=>b.savedAt-a.savedAt);
  const isBookRecord = w=>!!w && (w.isBook === true || (w.source === "upload" && !w.bookId && !w.turn && !w.finished));
  const journeys = worlds.filter(w=>!isBookRecord(w));
  const latest = journeys.find(w=>w.turn>0);
  const canReturn = S.ai && S.worldId && isLoggedIn() && journeyOwner===AUTH.username;
  const allBuiltins = typeof BUILTIN_WORLDS!=="undefined" ? BUILTIN_WORLDS : [];
  const hidden = hiddenBookIds();
  const builtins = allBuiltins.filter(b=>b && !hidden.has(b.id));
  const hiddenCount = allBuiltins.length - builtins.length;
  const userBooksAll = worlds.filter(isBookRecord);
  const seenBooks = new Set();
  const userBooks = userBooksAll.filter(w=>{
    const key = w.name || w.id;
    if(seenBooks.has(key)) return false;
    seenBooks.add(key);
    return true;
  });
  const collections = [...new Set([...builtins.map(b=>b.collection || "其他书目"), ...(userBooks.length ? ["我的导入"] : [])])];
  const userBookCells = userBooks.map(w=>`
    <div class="builtin-cell">
      <button class="user-book" data-id="${escapeHtml(w.id)}" data-collection="我的导入">
        <span class="b-name">${escapeHtml(w.name)}</span>
        <span class="b-author">${w.source==="paste"?"我粘贴的":"我导入的"} · 选起点进入剧本</span>
      </button>
      <button class="builtin-ren" data-id="${escapeHtml(w.id)}" data-name="${escapeHtml(w.name)}" aria-label="重命名 ${escapeHtml(w.name)}">✎</button>
    </div>`).join("");
  const library = isLoggedIn() && (builtins.length || userBooks.length) ? `
    <details class="library">
      <summary>小说剧本 <span>${builtins.length + userBooks.length} 部作品${hiddenCount ? " · 已隐藏 "+hiddenCount+" 本" : ""}</span></summary>
      ${(builtins.length || userBooks.length) ? `
      <label for="builtin-search" class="sr-only">搜索小说或作者</label>
      <input class="library-search" type="search" id="builtin-search" placeholder="搜索书名或作者">
      <label class="sr-only" for="builtin-collection">选择书目分类</label>
      <select class="library-search" id="builtin-collection">
        <option value="">全部书目</option>
        ${collections.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
      </select>
      <div class="builtin-grid" id="builtin-grid">
        ${builtins.map(b=>{
          const name = bookDisplayTitle(b.id,b.title);
          return `
          <div class="builtin-cell">
            <button class="builtin-item" data-id="${escapeHtml(b.id)}" data-collection="${escapeHtml(b.collection||"其他书目")}">
              <span class="b-name">${escapeHtml(name)}</span>
              <span class="b-author">${escapeHtml(b.author||"佚名")} · ${b.illustrated ? "改编剧本" : "选起点进入剧本"}</span>
            </button>
            <button class="builtin-ren" data-id="${escapeHtml(b.id)}" data-name="${escapeHtml(name)}" data-builtin="1" aria-label="重命名 ${escapeHtml(name)}">✎</button>
            <button class="builtin-del" data-id="${escapeHtml(b.id)}" data-title="${escapeHtml(name)}" aria-label="从书库移除 ${escapeHtml(name)}">✕</button>
          </div>`;
        }).join("")}
        ${userBookCells}
      </div>
      <p class="form-note" id="search-empty" hidden>没有找到匹配的作品。</p>
      ` : `<p class="form-note">书库已空。可以恢复已隐藏的书，或导入自己的 TXT。</p>`}
      ${hiddenCount ? `<button class="big-btn ghost restore-books" id="restore-books">恢复已隐藏的 ${hiddenCount} 本书</button>` : ""}
    </details>` : "";
  const shelf = journeys.length ? `
    <details class="library">
      <summary>我的旅途 <span>${journeys.length} 份记录</span></summary>
      <div class="world-list">
        ${journeys.map(w=>{
          const meta = [w.genre,w.finished ? "已完结" : w.turn ? "第 "+w.turn+" 幕" : "尚未开始",w.scene?.slice(0,28)].filter(Boolean);
          return `<div class="world-row">
            <button class="world-open" data-id="${escapeHtml(w.id)}">
              <span class="w-name">${escapeHtml(w.name)}</span>
              <span class="w-meta">${escapeHtml(meta.join(" · "))}</span>
            </button>
            <button class="world-ren" data-id="${escapeHtml(w.id)}" data-name="${escapeHtml(w.name)}" aria-label="重命名 ${escapeHtml(w.name)}">✎</button>
            <button class="world-del" data-id="${escapeHtml(w.id)}" aria-label="删除 ${escapeHtml(w.name)}">✕</button>
          </div>`;
        }).join("")}
      </div>
    </details>` : "";
  card.innerHTML = `
    <div class="home">
      <header class="home-header">
        <h1>暗夜酒馆</h1>
        ${isLoggedIn()
          ? '<div class="home-tools home-tools-top"><button class="logout-btn" id="btn-personal-ai">我的 AI 设置</button><button class="logout-btn" id="btn-image-settings">图像设置</button>'+(isSingleMode()?'':'<button class="logout-btn" id="btn-logout">退出登录</button>')+'</div>'
          : '<div class="home-account"><button class="logout-btn" id="btn-login">登录酒馆</button></div>'}
      </header>
      <p class="form-note menu-note" id="menu-note" role="status"></p>
      <div class="home-layout">
        <div class="home-column">
          ${canReturn ? '<button class="big-btn" id="btn-return">返回当前故事'+(S.worldName ? '<small>'+escapeHtml(S.worldName)+'</small>' : '')+'</button>' :
            latest ? '<button class="big-btn" id="btn-continue">继续旅途 <small>'+escapeHtml(latest.name)+'</small></button>' : ''}
          <section class="home-section" aria-labelledby="home-start-title">
            <h2 id="home-start-title">开始故事</h2>
            ${isLoggedIn() ? '<button class="big-btn '+(canReturn||latest?'ghost':'')+'" id="btn-ai">开启新的 AI 剧本</button>' : ''}
            <button class="big-btn ghost" id="btn-paste">粘贴文字开始故事</button>
            ${isLoggedIn() ? '<button class="big-btn ghost" id="btn-import">导入文件到书架</button><input type="file" id="file-input" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden>' : ''}
          </section>
          ${shelf}
        </div>
        <div class="home-column">
          ${library}
        </div>
      </div>
    </div>`;
  ov.scrollTop = 0;
  menuNote(error);
  $("btn-paste").onclick = ()=>showPasteWorld();
  if($("btn-login")) $("btn-login").onclick = showLogin;
  if(!isLoggedIn()) return;

  const owner = AUTH.token;
  const titleView = $("menu-note");
  const stillHere = ()=>AUTH.token===owner && $("menu-note")===titleView;
  let busy = false;
  async function menuAction(work, message = "正在载入旅途……"){
    if(busy) return;
    busy = true;
    menuNote(message);
    try{ await work(); }
    catch(e){
      if(stillHere()){
        if(e.status===401){ clearAuth(); showLogin(e.message); }
        else menuNote(e.message);
      }
    }finally{ busy = false; }
  }
  if($("btn-logout")) $("btn-logout").onclick = async ()=>{
    clearAuth(); S = DEFAULT_STATE();
    showTitle();
    try{ await saveQueue; await api("/api/logout",{method:"POST",token:owner}); }catch(e){}
  };
  if($("btn-return")) $("btn-return").onclick = ()=>enterStory();
  if($("btn-continue")) $("btn-continue").onclick = ()=>menuAction(()=>loadWorld(latest.id,stillHere));
  $("btn-ai").onclick = ()=>showGenreSelect();
  $("btn-personal-ai").onclick = showPersonalAI;
$("btn-image-settings").onclick = showImageSettings;
$("btn-scene-img").onclick = async ()=>{
  const btn = $("btn-scene-img");
  const cfg = imageCfg();
  if(!cfg.enabled){
    showImageSettings();
    imageToast("先在这里启用图像生成、填写 ComfyUI 地址和账号，保存后回到故事点 🖼。开启后每个剧情点会自动生成配图。",7000);
    return;
  }
  if(!S || (!S.scene && !S.environment?.place)){
    imageToast("先进入故事；🖼 开启后会自动为每个剧情点生成配图并插入聊天记录。");
    return;
  }
  S.sceneImageAuto = !S.sceneImageAuto;
  if(S.sceneImageAuto){
    S.autoImageTimeouts = 0;
    S.lastAutoSceneTurn = -1;
  }else if(autoImageAbort){ autoImageAbort.abort(); autoImageAbort = null; }
  syncSceneImageButton();
  if(S.sceneImageAuto){
    imageToast("已开启自动配图：之后每个剧情点都会自动生成。",4500);
    autoSceneImage();
  }else{
    imageToast("已关闭自动配图。",2500);
  }
  saveProgress();
};
  $("btn-import").onclick = ()=>$("file-input").click();
  $("file-input").onchange = e=>{
    const file = e.target.files?.[0];
    e.target.value = "";
    if(!file) return;
    menuAction(async ()=>{
      if(file.size>5*1024*1024) throw new Error("文件过大，请选择 5 MB 以内的 TXT 或 Markdown 文件。");
      let text = (await file.text()).trim();
      if(!text) throw new Error("文件为空，请选择有内容的文档。");
      if(text.length>500000) throw new Error("设定超过 50 万字符，请先截取需要的章节。");
      await autoImportToShelf(file.name, text);
    },"正在读取文件……");
  };
  card.querySelectorAll(".world-open").forEach(btn=>{
    btn.onclick = ()=>menuAction(()=>loadWorld(btn.dataset.id,stillHere));
  });
  card.querySelectorAll(".world-ren").forEach(btn=>{
    btn.onclick = ()=>renameWorld(btn.dataset.id,btn.dataset.name);
  });
  card.querySelectorAll(".world-del").forEach(btn=>{
    btn.onclick = ()=>{
      if(!confirm("删除这份旅途及其存档？\n小说剧本里的原文不会被删除。")) return;
      menuAction(async ()=>{
        await saveQueue;
        await api("/api/worlds/delete",{method:"POST",body:{id:btn.dataset.id},token:owner});
        if(!stillHere()) return;
        if(S.worldId===btn.dataset.id) S = DEFAULT_STATE();
        showTitle();
      },"正在删除旅途……");
    };
  });
  card.querySelectorAll(".user-book").forEach(btn=>{
    btn.onclick = ()=>menuAction(async ()=>{
      const {world} = await api("/api/worlds?id="+encodeURIComponent(btn.dataset.id),{token:owner});
      if(!stillHere()) return;
      if(!world || typeof world.text!=="string" || !world.text) throw new Error("这本书的原文已不存在");
      showEnterSelect({...world,name:world.name||world.title||"我的小说",title:world.title||world.name||"我的小说"},stillHere);
    },"正在翻开小说……");
  });
  card.querySelectorAll(".builtin-ren").forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      if(btn.dataset.builtin) renameBuiltinBook(btn.dataset.id,btn.dataset.name);
      else renameWorld(btn.dataset.id,btn.dataset.name);
    };
  });
  card.querySelectorAll(".builtin-del").forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      const title = btn.dataset.title || "这本书";
      if(!confirm("从书库移除《"+title+"》？\n已创建的旅途存档不会删除。")) return;
      hideBook(btn.dataset.id);
      showTitle();
    };
  });
  const restore = $("restore-books");
  if(restore) restore.onclick = ()=>{ restoreHiddenBooks(); showTitle(); };
  const search = $("builtin-search");
  if(search){
    const collection = $("builtin-collection");
    const items = [...card.querySelectorAll(".builtin-item,.user-book")];
    const filterBooks = ()=>{
      const query = search.value.trim().toLowerCase();
      let count = 0;
      items.forEach(btn=>{
        const cell = btn.closest(".builtin-cell");
        const hide = !btn.textContent.toLowerCase().includes(query)
          || Boolean(collection.value && btn.dataset.collection!==collection.value);
        if(cell) cell.hidden = hide; else btn.hidden = hide;
        if(!hide) count++;
      });
      $("search-empty").hidden = count!==0;
    };
    search.oninput = filterBooks;
    collection.onchange = filterBooks;
    card.querySelectorAll(".builtin-item").forEach(btn=>{
      btn.onclick = ()=>menuAction(async ()=>{
        const full = await readBuiltinBook(btn.dataset.id);
        if(Array.isArray(full.images) && full.images.length){
          if(stillHere()) await showIllustratedScenario(full,stillHere);
          return;
        }
        full.bible = await readBuiltinBook(btn.dataset.id,{bible:true,optional:true});
        if(stillHere()) await showEnterSelect(full,stillHere);
      },"正在翻开小说……");
    });
  }
}

async function readBuiltinBook(id,{bible=false,optional=false} = {}){
  if(typeof id!=="string" || !/^novel_[a-z]+$/.test(id)) throw new Error("找不到这本书。");
  const file = id+(bible ? ".bible" : "")+".json";
  const capacitor = globalThis.Capacitor;
  const nativeBooks = capacitor?.isNativePlatform?.() && capacitor.Plugins?.TavernBooks;
  try{
    let raw;
    if(nativeBooks){
      ({text:raw} = await nativeBooks.read({file}));
    }else{
      const response = await fetch("worlds_data/"+file,{signal:AbortSignal.timeout(15000)});
      if(optional && response.status===404) return null;
      if(!response.ok) throw new Error("书架文件不存在");
      raw = await response.text();
    }
    const book = JSON.parse(raw.replace(/^\uFEFF/,""));
    if(!book || typeof book!=="object" || Array.isArray(book)
      || (!bible && typeof book.text!=="string" && !book.images?.length)){
      throw new Error("书架文件格式无效");
    }
    if(!bible && book.title) book.title = bookDisplayTitle(id, book.title);
    return book;
  }catch(error){
    if(optional && error?.code==="BOOK_NOT_FOUND") return null;
    if(globalThis.location?.protocol==="file:"){
      throw new Error("浏览器直接打开 HTML 时无法读取书架文件。请用安卓 APK，或通过本机酒馆地址打开。");
    }
    throw new Error(bible ? "这本书的故事圣经读取失败，请重试。"
      : "这本书的原文读取失败，请重试或更新安装包。");
  }
}

/* ==================== 故事类型选择 ==================== */
const GENRES = [
  { id:"悬疑", emoji:"🕯️", desc:"谜团、线索与反转" },
  { id:"奇幻", emoji:"🐉", desc:"魔法、冒险与传说" },
  { id:"武侠", emoji:"⚔️", desc:"江湖、恩怨与侠义" },
  { id:"科幻", emoji:"🚀", desc:"未来、星海与科技" },
  { id:"恐怖", emoji:"👁️", desc:"未知、恐惧与生存" },
  { id:"恋爱", emoji:"💗", desc:"心动、羁绊与抉择" },
  { id:"末日", emoji:"☢️", desc:"废土、危机与挣扎" },
  { id:"日常", emoji:"🍵", desc:"温馨、治愈与琐碎" },
  { id:"随机", emoji:"🎲", desc:"交给命运决定" }
];
const GENRE_CONFLICT_PROFILES = {
  "悬疑": { label:"悬疑", beat:"线索互相矛盾、证词隐瞒、时间压力、嫌疑人反制、真相逼近", avoid:"不要用房租账单、路人闲聊、无故灵异或巧合当主线；每条线索都要能被调查、对质或验证。关键证物（钥匙、信件、照片、账本、样本、录音等）必须用 items 记录具体名称和用途，不能只写在旁白里，否则玩家无法查证。" },
  "奇幻": { label:"奇幻", beat:"魔法或契约的代价、种族与阵营利益、遗迹规则、力量失衡、古老誓言", avoid:"不要用现代日常纠纷或无关杂务填时间；事件要改变力量关系或揭示世界规则。" },
  "武侠": { label:"武侠", beat:"恩怨、门派立场、江湖规矩、追杀与护送、承诺与人情债", avoid:"不要用现代账单、邻里闲话或与江湖无关的琐事当冲突；事件要落到立场、面子和刀剑上。" },
  "科幻": { label:"科幻", beat:"系统故障、协议与权限、公司利益、舰船或殖民地资源、外星接触的规则", avoid:"不要用古代家务或纯闲聊推进；冲突要来自技术、制度、资源或未知文明的具体规则。" },
  "恐怖": { label:"恐怖", beat:"未知威胁的迹象、环境压迫、信任崩塌、生存资源减少、不可名状的代价", avoid:"不要用轻松日常、流言或路人求助稀释恐怖；恐怖要有可追踪的迹象并逐步升级。" },
  "末日": { label:"末日", beat:"物资短缺、感染或污染、据点防线、队伍分裂、天气与废墟中的威胁", avoid:"不要用无关家务或稳定日常当主线；每个事件都应消耗、改变或争夺生存资源。" },
  "日常": { label:"日常", beat:"工作、家庭、邻里、金钱压力或关系里的真实变化", avoid:"可以琐碎，但必须推动关系、选择或下一步；不要只写无意义的打断和重复寒暄。" },
  "随机": { label:"随机", beat:"当前世界已建立的核心规则、人物利益与叙事骨架", avoid:"先按已出现的人物、地点和类型判断冲突来源，不要用与故事无关的日常琐事填时间。" }
};
function genreConflictProfile(state){
  if(isRomanceMode(state)) return { label:"恋爱", beat:"心动、试探、坦白、承诺、失约、旧伤、共同经历、和解或离别", avoid:"不要用房租、账单、算账、买菜、邻居闲话、世俗眼光、流言蜚语、催婚逼婚当反复出现的主要事件。" };
  if(state.genre && GENRE_CONFLICT_PROFILES[state.genre]) return GENRE_CONFLICT_PROFILES[state.genre];
  const t = state.storyTemplate && state.storyTemplate.id;
  const byTemplate = {"追凶":"悬疑","寻物":"悬疑","身陷":"悬疑","守夜":"恐怖","逃亡":"末日","守护":"奇幻","交易":"科幻","复仇":"武侠","重逢":"恋爱","博弈":"武侠"};
  if(byTemplate[t]) return GENRE_CONFLICT_PROFILES[byTemplate[t]];
  return { label:"本故事", beat:"已建立的目标、人物利益、世界规则与眼前阻力", avoid:"不要用与当前类型和人物无关的日常琐事填时间。" };
}
function genreConflictLine(state){
  const p = genreConflictProfile(state);
  return "【类型冲突】本故事按「"+p.label+"」设置冲突：事件应来自"+p.beat+"。"+p.avoid+"冲突要接在已发生的人物、地点和选择上，并改变玩家眼前的目标或关系。";
}

/* 随机剧本的叙事骨架：让不同局的故事结构不同，降低「打听—线索—暗线」的重复感 */
const STORY_TEMPLATES = [
  { id:"追凶",   premise:"一桩命案或失踪，线索指向多方，真相层层反转" },
  { id:"守护",   premise:"保护某人或某物度过一场逼近的危机" },
  { id:"交易",   premise:"一桩危险的买卖，各方各怀算计，随时可能翻脸" },
  { id:"逃亡",   premise:"被追捕或卷入是非，边逃边求生、洗清或反击" },
  { id:"复仇",   premise:"旧怨找上门，在复仇与放下之间挣扎" },
  { id:"寻物",   premise:"寻找一件失散的旧物或一个失联的人，牵出旧事" },
  { id:"守夜",   premise:"长夜里的防线，暗处有东西步步紧逼" },
  { id:"身陷",   premise:"无意间盘根错节地卷入一桩不该知道的事，被迫周旋" },
  { id:"重逢",   premise:"与过去的人或事意外重逢，旧账新怨一起涌来" },
  { id:"博弈",   premise:"一场有规则的较量或谈判，筹码越押越大" }
];
function pickStoryTemplate(){
  return STORY_TEMPLATES[Math.floor(Math.random()*STORY_TEMPLATES.length)];
}

/* 各类型的任务风格：数量上限、性质、奖励尺度、是否催办 */
const TASK_PROFILES = {
  "悬疑": { max:3, style:"案件与线索：查证、追踪、揭穿、对质", reward:"约定的调查费或互换消息", nag:"线索相关的人可以施压，但不要每幕催同一件事" },
  "武侠": { max:2, style:"委托、护送、寻仇、还人情", reward:"事先约好的工钱、信物或人情", nag:"讲江湖规矩，被拒可另寻他人，不要死缠" },
  "科幻": { max:2, style:"合约任务、调查、回收、潜入", reward:"合同约定的报酬或设备", nag:"契约驱动，违约可以但会有代价" },
  "恐怖": { max:2, style:"求生、逃脱、查清异象、守住某处", reward:"按剧情交付的线索或补给", nag:"紧迫感来自环境，不必靠 NPC 反复催" },
  "末日": { max:2, style:"搜寻物资、护送、避开威胁、修好某样东西", reward:"承诺的物资或庇护", nag:"生存优先，别把 NPC 写成刷任务机" },
  "奇幻": { max:2, style:"冒险、寻宝、解咒、护送", reward:"雇主承诺的报酬或寻回的物品", nag:"可以拒绝，NPC 会自己另想办法" },
  "恋爱": { max:0, style:"不设外部任务，关系本身就是主线", reward:"—", nag:"不要催办任何委托" },
  "日常": { max:0, style:"不设外部任务，生活与关系为主", reward:"—", nag:"不要催办任何委托" }
};
function taskProfileFor(state){
  const g = isRomanceMode(state) ? "恋爱" : (state.genre || "");
  return TASK_PROFILES[g] || TASK_PROFILES["悬疑"];
}

/* 全方位欲望系统：金钱 / 权力 / 性 / 人 / 物品（0~100，各自独立累积与满足） */
const DRIVE_KEYS = ["money","power","sex","people","items"];
const DRIVE_META = {
  money: { label:"金钱" }, power: { label:"权力" }, sex: { label:"性" },
  people: { label:"人" }, items: { label:"物品" }
};
function ensureDrives(state){
  const d = (state.desires && typeof state.desires==="object") ? state.desires : {};
  const out = {};
  for(const k of DRIVE_KEYS){
    const base = Number.isFinite(d[k]) ? d[k] : (k==="sex" ? (state.desire||0) : 0);
    out[k] = clamp(base, 0, 100);
  }
  state.desires = out;
  return out;
}

/* 货币体系：不同世界的钱不一样，初始金额与物价也不同 */
const CURRENCY_PRESETS = {
  modern:   { name:"元",     symbol:"¥",  start:800, scale:"一顿饭 20~60 元，住店/旅馆 100~400 元，人情/贿赂 100~2000 元，普通人月收入数千元。" },
  ancient:  { name:"金币",   symbol:"🪙", start:50,  scale:"一顿饭 2~8 金币，住店一晚 15~45 金币，雇人办事 30~200 金币。" },
  sci:      { name:"信用点", symbol:"CR", start:600, scale:"一顿饭 10~40 信用点，装备 100~1200 信用点，通行/贿赂 200~3000 信用点。" },
  wasteland:{ name:"瓶盖",   symbol:"⚙", start:40,  scale:"一顿口粮 2~6 瓶盖，弹药 5~20 瓶盖，安全落脚点 50~200 瓶盖。" }
};
function currencyForGenre(genre){
  if(genre==="科幻") return CURRENCY_PRESETS.sci;
  if(genre==="末日") return CURRENCY_PRESETS.wasteland;
  if(genre==="悬疑" || genre==="恋爱" || genre==="日常" || genre==="恐怖") return CURRENCY_PRESETS.modern;
  return CURRENCY_PRESETS.ancient;
}
function guessCurrency(worldText, genre){
  if(genre) return currencyForGenre(genre);
  const t = String(worldText||"");
  const count = re => (t.match(re)||[]).length;
  const score = {
    modern: count(/手机|电脑|汽车|地铁|公司|上班|大学|咖啡|网络|超市|医院|警察|微信|电梯|公寓|元|块钱|人民币|工资|薪水|红包/g),
    ancient: count(/官府|江湖|侠|剑|门派|银两|客栈|衙门|皇帝|王爷|老爷|少爷|姑娘|茶楼|马匹|修仙|灵石|丹药|宗门|法术/g),
    sci: count(/星舰|飞船|光年|芯片|机器人|殖民地|轨道|太空|全息|终端|信用点/g),
    wasteland: count(/废土|辐射|丧尸|末日|避难所|荒原|幸存者|变异|瓶盖/g)
  };
  let best = "modern", bestN = 0;
  for(const k of Object.keys(score)) if(score[k] > bestN){ bestN = score[k]; best = k; }
  // 没有任何信号时默认现代（多数用户导入的是现代小说）
  return CURRENCY_PRESETS[bestN > 0 ? best : "modern"];
}
function guessGenre(worldText){
  const t = String(worldText||"");
  const count = re => (t.match(re)||[]).length;
  const score = {
    恋爱: count(/告白|表白|暗恋|心动|恋人|情侣|亲吻|暧昧|前任|约会|求婚|初恋|喜欢上|爱上/g),
    武侠: count(/江湖|侠客|门派|剑法|武功|内力|掌门|镖局|武林|刀光|客栈/g),
    科幻: count(/星舰|飞船|宇宙|机器人|芯片|殖民地|轨道|全息|终端|量子/g),
    恐怖: count(/鬼|恐怖|阴森|尸体|诡异|诅咒|尖叫|血泊|亡灵/g),
    末日: count(/丧尸|末日|废土|辐射|避难所|幸存者|变异|荒原/g),
    悬疑: count(/凶案|侦探|凶手|谋杀|案件|诡计|命案|失踪/g)
  };
  let best = "", bestN = 0;
  for(const k of Object.keys(score)) if(score[k] > bestN){ bestN = score[k]; best = k; }
  return bestN >= 1 ? best : "";
}
// 导入剧本只做保守判定：仅当情感线足够明显时才标为「恋爱」，避免把古典/恐怖小说误标
function guessImportGenre(worldText){
  const t = String(worldText||"");
  const romance = (t.match(/告白|表白|暗恋|心动|恋人|情侣|亲吻|暧昧|前任|约会|求婚|初恋|喜欢上|爱上|心悦|倾心|情愫|眷恋|缠绵|成亲|大婚|夫君|娘子|洞房|痴情|情深|爱意|拥吻|相爱/g)||[]).length;
  const others = (t.match(/官府|江湖|侠|门派|剑法|武功|星舰|飞船|丧尸|末日|凶案|侦探|凶手|尸体|鬼/g)||[]).length;
  return romance >= 4 && romance > others ? "恋爱" : "";
}
/* 恋爱模式：在 AI 剧本里由类型决定；导入/粘贴未选类型时，按原文+概要自动判断，
   让「弱化任务、以关系为主线」对所有来源都生效。 */
function computeRomanceMode(state){
  if(state.genre==="恋爱" || state.genre==="日常") return true;
  if(state.genre) return false;                 // 明确选了别的类型，尊重选择
  if(!state.world && !state.worldSummary) return false;
  const text = (state.worldSummary||"") + " " + String(state.world||"").slice(0,30000);
  const romance = (text.match(/告白|表白|暗恋|心动|恋人|情侣|亲吻|暧昧|前任|约会|求婚|初恋|喜欢上|爱上|心悦|倾心|情愫|眷恋|缠绵|成亲|大婚|夫君|娘子|洞房|痴情|情深|爱意|拥吻|相爱|男女之情|情意/g)||[]).length;
  const others = (text.match(/江湖|侠|门派|剑法|武功|官府|星舰|飞船|丧尸|末日|凶案|凶手|尸体|谋反|战争|朝堂/g)||[]).length;
  return romance >= 3 && (romance >= others*0.5 || romance >= 10);
}
function isRomanceMode(state){
  if(typeof state.romanceMode === "boolean") return state.romanceMode;
  const v = computeRomanceMode(state);
  try{ state.romanceMode = v; }catch(e){}
  return v;
}
function storyBeatReady(state){
  if(!state.infiniteMode) return false;
  const now = Number.isFinite(state.environment?.minute) ? state.environment.minute : 8*60;
  if(!Number.isFinite(state.nextBeatMinute)){
    state.nextBeatMinute = now + 240 + Math.floor(Math.random()*121);
    return (Number(state.timeSkipMinutes)||0)>=240;
  }
  return now >= state.nextBeatMinute || (Number(state.timeSkipMinutes)||0)>=240;
}
function storyBeatPrompt(state, stageMinutes){
  const p = genreConflictProfile(state);
  if(p.label==="恋爱"){
    return "无限模式·剧情节拍（约每 4~6 个故事小时一次）：本幕安排一件真正推动关系本身的实质事件——"+p.beat+"。"
      +p.avoid+"事件要从对方的经历、性格和你们当前的关系阶段自然长出来；玩家正在享受相处时不要硬打断，也不要把感情戏拽回查案跑腿。";
  }
  return "无限模式·剧情节拍（约每 4~6 个故事小时一次）：本幕安排一件与「"+p.label+"」核心冲突相符的实质事件——"+p.beat+"。"
    +p.avoid+"事件要接在已发生的人物、地点和选择上，能改变玩家眼前的目标或关系。";
}
function storyCalmPrompt(state){
  return "无限模式：当前不在剧情节拍上。让时间自然流动，写人物各自的日常、关系余温、环境细节或玩家自己的打算；"
    +"不要为了热闹硬塞新麻烦、房租、账单、流言、催婚、陌生人求助或鸡毛蒜皮的意外。只有玩家主动行动、主动寻找冲突，或时间到达下一个 4~6 小时节拍时，才引入新的实质事件。";
}
function ensureCurrency(state){
  if(state.currency && state.currency.name) return state.currency;
  // 导入/粘贴的世界：显式选了设定型类型（科幻/末日/武侠/奇幻）按类型；其余按原文时代判断
  // 随机剧本：按类型
  let preset;
  if(state.world){
    const g = state.genre;
    preset = (g==="科幻"||g==="末日"||g==="武侠"||g==="奇幻") ? currencyForGenre(g) : guessCurrency(state.world, "");
  } else {
    preset = currencyForGenre(state.genre||"");
  }
  state.currency = { name:preset.name, symbol:preset.symbol, scale:preset.scale };
  // 开局按世界类型给一笔像样的启动资金（仅在首幕且仍是默认值时）
  if(!state.turn && (state.coin===undefined || state.coin===15)) state.coin = preset.start;
  return state.currency;
}
function curName(state){
  return (state.currency && state.currency.name) || "金币";
}

function showGenreSelect(){
  const card = $("card");
  card.innerHTML = `
    <h1>选择故事类型</h1>
    <div class="sub">这一夜，会是怎样的故事？</div>
    <div class="genre-grid">
      ${GENRES.map(g=>`
        <button class="genre-item" data-genre="${escapeHtml(g.id)}">
          <span class="g-emoji">${g.emoji}</span>
          <span class="g-name">${escapeHtml(g.id)}</span>
          <span class="g-desc">${escapeHtml(g.desc)}</span>
        </button>`).join("")}
    </div>
    <p class="form-note" id="genre-status" role="status"></p>
    <div class="card-btns"><button class="big-btn ghost" id="btn-back">返回</button></div>`;
  const buttons = [...card.querySelectorAll(".genre-item")];
  const status = $("genre-status");
  buttons.forEach(btn=>{
    btn.onclick = async ()=>{
      const genre = btn.dataset.genre==="随机" ? GENRES[Math.floor(Math.random()*(GENRES.length-1))].id : btn.dataset.genre;
      buttons.forEach(b=>b.disabled=true);
      $("btn-back").disabled = true;
      status.textContent = "正在准备旅途……";
      try{
        await createJourney(genre+"剧本","",genre,()=>$("genre-status")===status);
      }catch(e){
        if(e.status===401){ clearAuth(); showLogin(e.message); return; }
        status.textContent = e.message;
        buttons.forEach(b=>b.disabled=false);
        $("btn-back").disabled = false;
      }
    };
  });
  $("btn-back").onclick = showTitle;
}

/* 内置小说：用百分比选择进入位置（不依赖章节识别） */
async function showIllustratedScenario(book,stillHere){
  const main = (typeof BUILTIN_WORLDS!=="undefined" ? BUILTIN_WORLDS : [])
    .find(entry=>entry.title==="盗墓笔记" && !entry.illustrated);
  if(!main) throw new Error("找不到绘本对应的《盗墓笔记》正文。");
  const [full,bible] = await Promise.all([
    readBuiltinBook(main.id),readBuiltinBook(main.id,{bible:true,optional:true})
  ]);
  if(stillHere()) showEnterSelect({...full,name:book.title+"改编",title:book.title+"改编",
    edition:"依据《盗墓笔记》正文改编",bible},stillHere);
}

async function showEnterSelect(full, stillHere){
  const card = $("card");
  const text = full.text||"";
  const chapters = Array.isArray(full.chapters) ? full.chapters : [];
  const initialGenre = GENRES.some(g=>g.id===full.genre) ? full.genre : "";
  const token = AUTH.token;
  card.innerHTML = `
    <h1>${escapeHtml(full.title||full.name)}</h1>
    <div class="sub">选择起点和类型，再选择角色进入小说剧本</div>
    <div class="enter-pct">
      <label for="enter-range">进入位置 <span id="enter-pct-label">从头开始</span></label>
      <input type="range" id="enter-range" min="0" max="100" step="0.5" value="0">
      ${chapters.length ? `<label class="check-line" for="enter-by-chapter" style="margin-top:6px"><input type="checkbox" id="enter-by-chapter"> 按章回选择</label>
      <select id="enter-chapter" style="display:none;width:100%;min-height:44px;margin-top:6px;background:#1a130c;color:var(--text);border:1px solid var(--border);border-radius:8px;font:inherit">
        ${chapters.map((c,i)=>`<option value="${i}">${escapeHtml(c.title)}</option>`).join("")}
      </select>` : ""}
    </div>
    <label for="enter-genre" style="display:block;margin-top:8px;font-size:14px;color:var(--gold2)">故事类型</label>
    <select id="enter-genre" style="width:100%;min-height:44px;margin-top:6px;background:#1a130c;color:var(--text);border:1px solid var(--border);border-radius:8px;font:inherit">
      <option value="">自动判断</option>
      ${GENRES.filter(g=>g.id!=="随机").map(g=>`<option value="${g.id}" ${g.id===initialGenre?"selected":""}>${g.id} · ${g.desc}</option>`).join("")}
    </select>
    <label class="check-line" for="enter-infinite" style="margin-top:8px"><input type="checkbox" id="enter-infinite"> 无限模式：主线结束后继续写，不自动收束</label>
    <p class="form-note" id="enter-status" role="status"></p>
    <div class="card-btns">
      <button class="big-btn" id="btn-enter-next">选择角色并开始</button>
      <button class="big-btn ghost" id="btn-back">返回书架</button>
    </div>`;
  const range = $("enter-range"), label = $("enter-pct-label");
  const byChapter = $("enter-by-chapter"), chapterSel = $("enter-chapter");
  const status = $("enter-status");
  const genreSel = $("enter-genre");
  const selectedGenre = ()=> genreSel ? genreSel.value : "";
  const rangeEl = range;
  const here = ()=>AUTH.token===token && $("enter-range")===rangeEl;
  const useChapter = ()=> !!(byChapter && byChapter.checked && chapterSel);
  const position = ()=> useChapter()
    ? (chapters[Number(chapterSel.value)]?.offset || 0)
    : Math.floor(text.length * Number(range.value) / 100);
  function updatePreview(){
    if(useChapter()){
      const c = chapters[Number(chapterSel.value)] || chapters[0];
      if(label) label.textContent = c ? c.title : "按章回";
      return;
    }
    const pct = Number(range.value);
    if(label) label.textContent = pct===0 ? "从头开始" : "选段的 "+pct+"%";
  }
  function syncMode(){
    const on = useChapter();
    if(chapterSel) chapterSel.style.display = on ? "" : "none";
    range.style.display = on ? "none" : "";
    updatePreview();
  }
  range.oninput = updatePreview;
  if(byChapter) byChapter.onchange = syncMode;
  if(chapterSel) chapterSel.onchange = updatePreview;
  syncMode();
  const entryTitle = ()=> useChapter()
    ? (chapters[Number(chapterSel.value)]?.title || "所选章回")
    : (position() ? "所选原文位置" : "原文开头");
  $("btn-enter-next").onclick = ()=>{
    const cut = position();
    const before = text.slice(Math.max(0,cut-18000),cut);
    $("btn-enter-next").disabled = true;
    $("btn-back").disabled = true;
    const isBuiltinBook = /^novel_[a-z]+$/.test(String(full.id||""));
    showRoleCards(full, before, here, status, {
      builtinId:isBuiltinBook ? full.id : undefined,windowStart:cut,entryTitle:entryTitle(),
      worldText:isBuiltinBook ? undefined : text,
      bookId:isBuiltinBook ? undefined : full.id,
      genre:selectedGenre(),
      source:isBuiltinBook ? undefined : (full.source||"upload"),
      infiniteMode: !!($("enter-infinite") && $("enter-infinite").checked)
    });
  };
  $("btn-back").onclick = showTitle;
}

/* 根据前文让 AI 生成可扮演的角色卡 */
async function showRoleCards(full, beforeText, stillHere, statusEl, opts = {}){
  const card = $("card");
  const token = AUTH.token;
  const before = beforeText.trim();
  const context = before ? before.slice(-18000) : (full.text||"").slice(0,18000);
  const entryContext = opts.entryTitle
    ? "\n选择的起点："+opts.entryTitle+"。只按起点附近的正文选角，不提前引入后文人物。\n"
      +full.text.slice(Number(opts.windowStart)||0,(Number(opts.windowStart)||0)+6000)
    : "";
  card.innerHTML = `
    <h1>${escapeHtml(full.title||full.name)}</h1>
    <div class="sub">正在根据前文，为你准备可扮演的角色……</div>
    <div class="role-cards" id="role-cards"></div>
    <p class="form-note" id="role-status" role="status">正在生成角色卡……</p>
    <div class="card-btns"><button class="big-btn ghost" id="btn-back">返回</button></div>`;
  const status = $("role-status");
  const wrapEl = $("role-cards");
  const here = ()=>AUTH.token===token && $("role-cards")===wrapEl;
  const signal = new AbortController();
  $("btn-back").onclick = ()=>{ signal.abort(); showTitle(); };
  const sys = `你是文字冒险游戏的角色设计助手。玩家将根据下面这段原著前文，选择一个角色来扮演并进入故事。请只返回 JSON，不要任何多余文字，格式：
{"roles":[{"name":"角色姓名（原著真实人物）","gender":"男/女（按原著判断）","species":"人类/动物/外星人/妖怪/机械等","age":年龄整数,"height":身高cm整数,"weight":体重kg整数,"appearance":"发型发色、眼睛、肤色、体型、疤痕/义肢/非人特征","outfit":"当前衣着与随身装备","identity":"身份与处境（一句话）","personality":"性格与语气特点（一句话）","hook":"以该角色进入时的开场切入点（一句话，紧接前文结尾）","income":每日收入（整数，按原著时代与身份）,"coin":初始资金（整数，按原著时代与身份）}]}
要求：
- 给出 3 到 6 个可以扮演的角色，优先选原著中在前文里已登场、有分量、能推动故事的人物。
- 姓名必须来自原著，不得编造原著没有的核心人物，不得改名。
- gender 必须按原著判断（男/女），不得弄错。
- income（每日收入）与 coin（初始资金）要按原著的时代、身份与家境给合理数值，不同角色差别明显。
- age、height、weight、appearance、outfit 要按原著人物与时代判断；原文没明说时合理推断，但不要默认 28 岁，也不要把所有角色写成同一副外貌和身材。
- 身份、性格、语气必须忠于原著。
- hook 要承接前文结尾的处境，让玩家以该角色自然进入。
----- 前文开始 -----
${context}
----- 前文结束 -----${entryContext}`;
  let roles = [];
  // 有原文「故事圣经」时，直接用原著真实人物做角色卡，不再让 AI 现编
  const nearbyStart = Math.max(0,(Number(opts.windowStart)||0)-2000);
  const nearbyText = opts.entryTitle ? full.text.slice(nearbyStart,nearbyStart+12000) : full.text.slice(0,18000);
  if(full.bible && Array.isArray(full.bible.characters) && full.bible.characters.length){
    const nearbyRoles = full.bible.characters.filter(c=>c && c.name && nearbyText.includes(c.name));
    const source = nearbyRoles.length ? nearbyRoles : (opts.entryTitle ? [] : full.bible.characters);
    roles = source.slice(0,6).map(c=>({
      name:c.name, gender:c.gender||"", species:c.species||"", age:c.age,
      height:c.height, weight:c.weight, appearance:c.appearance||"", outfit:c.outfit||"",
      identity:c.identity||"", personality:c.personality||"",
      hook:opts.entryTitle ? "从「"+opts.entryTitle+"」开场，以「"+c.name+"」的身份行动"
        : "以「"+c.name+"」的身份，从前情结尾处自然进入"
    }));
  }
  if(!roles.length){
    let content = "";
    try{
      content = await callLLM([
        { role:"system", content:sys },
        { role:"user", content:"请根据这段前文生成可扮演的角色卡。" }
      ], signal.signal);
    }catch(e){
      if(!here()) return;
      status.textContent = "角色卡生成失败："+e.message;
      const retry = document.createElement("button");
      retry.className = "big-btn";
      retry.textContent = "重试";
      retry.onclick = ()=>{ retry.remove(); showRoleCards(full, beforeText, stillHere, statusEl, opts); };
      $("card").querySelector(".card-btns").prepend(retry);
      return;
    }
    if(!here()) return;
    try{
      const obj = extractJSON(content);
      roles = Array.isArray(obj?.roles) ? obj.roles.filter(r=>r && r.name) : [];
    }catch(e){ roles = []; }
  }
  if(!roles.length){
    status.textContent = "没有解析出角色，请返回重试。";
    return;
  }
  status.textContent = "选择你要扮演的角色：";
  const wrap = $("role-cards");
  wrap.innerHTML = "";
  roles.slice(0,6).forEach(r=>{
    const btn = document.createElement("button");
    btn.className = "role-card";
    btn.innerHTML = '<div class="rc-head"><span class="rc-name">'+escapeHtml(String(r.name))+'</span>'
      + '<span class="rc-role">'+escapeHtml(String(r.identity||""))+'</span></div>'
      + '<div class="rc-desc">'+escapeHtml(String(r.personality||""))+'</div>'
      + (r.hook ? '<div class="rc-open">入场：'+escapeHtml(String(r.hook))+'</div>' : "");
    btn.onclick = async ()=>{
      wrap.querySelectorAll(".role-card").forEach(b=>b.disabled=true);
      $("btn-back").disabled = true;
      status.textContent = "正在进入故事……";
      const role = {name:String(r.name), gender:String(r.gender||""), species:String(r.species||""), age:Number.isFinite(Number(r.age))?Math.max(0,Math.round(Number(r.age))):undefined, height:Number.isFinite(Number(r.height))?Math.max(30,Math.round(Number(r.height))):undefined, weight:Number.isFinite(Number(r.weight))?Math.max(2,Math.round(Number(r.weight))):undefined, appearance:String(r.appearance||""), outfit:String(r.outfit||""), identity:String(r.identity||""), personality:String(r.personality||""), hook:String(r.hook||""), income:Number.isFinite(Number(r.income))?Math.max(0,Math.round(Number(r.income))):undefined, coin:Number.isFinite(Number(r.coin))?Math.max(0,Math.round(Number(r.coin))):undefined};
      const worldStart = [opts.entryTitle,role.name+(role.hook ? "："+role.hook : "")].filter(Boolean).join(" · ");
      try{
        await createJourney(full.name, (opts.worldText || context), opts.genre||"", here, {
          worldStart, title:full.title, author:full.author, role, summary:full.summary||"",
          source:opts.source, windowStart:opts.windowStart, bible:full.bible,
          builtinId:opts.builtinId, builtinText:opts.builtinId ? full.text : undefined,
          bookId:opts.bookId,
          infiniteMode:Boolean(opts.infiniteMode)
        });
      }catch(err){
        if(!here()) return;
        status.textContent = err.message || "进入失败，请重试";
        wrap.querySelectorAll(".role-card").forEach(b=>b.disabled=false);
        $("btn-back").disabled = false;
      }
    };
    wrap.appendChild(btn);
  });
}

async function generateWorldSummary(text, onProgress){
  const source = text.length > 120000
    ? text.slice(0,80000)+"\n……（中间省略）……\n"+text.slice(-40000)
    : text;
  const sys = `你是文学编辑，负责为一部小说撰写"全书概要"，供文字冒险游戏的 AI 使用。
根据已给原文与你的了解，写出一份贯穿全书的概要，尽量覆盖已给原文之后的剧情走向与结局；若是片段或不确定的作品，只根据原文合理推演，宁可简略也不要编造。
要求：简洁中文叙述，先概括主线脉络，再点出关键转折与结局；400~900 字；不要出现"你""玩家"等游戏用语；只返回纯文本概要，不要 JSON、不要 markdown 标记。
----- 原文开始 -----
${source}
----- 原文结束 -----`;
  const content = (await callLLM([
    {role:"system",content:sys},
    {role:"user",content:"请写出这部作品的全书概要。"}
  ], null, onProgress)).trim();
  if(!content) throw new Error("概要生成失败");
  return content;
}

/* 为上传/粘贴的小说生成结构化「故事圣经」：概要、人物、关系、伏笔、锚点 */
async function generateWorldBible(text, onProgress){
  const CHUNK_SYS = `你是文学分析助手。阅读给定的小说原文片段，只输出一个 JSON 对象，不要任何多余文字。格式：
{"summary":"本段剧情梗概（200~400字）","characters":[{"name":"人物姓名（原文真实姓名）","gender":"男/女","age":0,"identity":"身份与处境","personality":"性格","voice":"说话习惯/称呼","goal":"动机","status":"感情/婚姻状态","attitude":"对主要人物的态度","knows":"此人目前知道的关键事实"}],"relationships":[{"a":"人物A","b":"人物B","relation":"亲属/朋友/恋人/夫妻/仇敌/主仆等","aff":0,"desire":0}],"foreshadowing":["伏笔或未解线索"],"timeline":["关键事件"]}
要求：姓名必须来自原文；没有的字段可省略；aff/desire 是 0~100 的估计；不要编造原文没有的核心人物。`;
  const FINAL_SYS = `你是文学编辑。根据给定的分段分析，整理成一部书的「故事圣经」，只输出一个 JSON 对象。格式：
{"summary":"全书概要（600~900字，覆盖主线、人物命运与结局；若原文未完，说明现有文本到哪为止）","ending":"现有文本的收束或未完成状态（200字内）","anchors":["必须始终成立、不可违背的核心事实（5~12条）"],"themes":["主题关键词"],"tone":"整体文风与基调"}
只依据给出的分析，不要编造重大情节。`;
  const size = 40000;
  const chunks = [];
  for(let i=0;i<text.length;i+=size) chunks.push(text.slice(i,i+size));
  if(!chunks.length) chunks.push(text);
  const analyses = new Array(chunks.length);
  let nextChunk = 0, doneChunks = 0;
  const totalChunks = chunks.length;
  if(onProgress) onProgress("正在分析 "+totalChunks+" 段（3 路并行）……");
  async function analyzeChunk(){
    while(true){
      const i = nextChunk++;
      if(i >= totalChunks) return;
      let raw = "", parsed = null;
      for(let attempt=0; attempt<2 && !parsed; attempt++){
        try{
          raw = await callLLM([
            {role:"system",content:CHUNK_SYS},
            {role:"user",content:"原文片段：\n"+chunks[i]}
          ]);
          parsed = extractJSON(raw);
        }catch(e){}
      }
      analyses[i] = parsed || {summary:String(raw||"").slice(0,300),characters:[],relationships:[],foreshadowing:[],timeline:[]};
      doneChunks++;
      if(onProgress) onProgress("已完成 "+doneChunks+"/"+totalChunks+" 段……");
    }
  }
  await Promise.all(Array.from({length:Math.min(3,totalChunks)}, analyzeChunk));
  const byName = new Map();
  for(const a of analyses) for(const c of (a.characters||[])){
    if(!c || !c.name) continue;
    const prev = byName.get(c.name) || {};
    byName.set(c.name, {...prev, ...Object.fromEntries(Object.entries(c).filter(([,v])=>v!=="" && v!==undefined && v!==null))});
  }
  const rels = new Map();
  for(const a of analyses) for(const r of (a.relationships||[])){
    if(!r || !r.a || !r.b) continue;
    const key = [r.a,r.b].sort().join("|");
    const prev = rels.get(key) || {a:r.a,b:r.b,relation:"",aff:0,desire:0};
    rels.set(key, {...prev, relation:r.relation||prev.relation, aff:Math.max(prev.aff||0, r.aff||0), desire:Math.max(prev.desire||0, r.desire||0)});
  }
  const foreshadowing = [...new Set(analyses.flatMap(a=>a.foreshadowing||[]))].slice(0,30);
  const timeline = [...new Set(analyses.flatMap(a=>a.timeline||[]))].slice(0,40);
  const chunkSummaries = analyses.map(a=>a.summary).filter(Boolean);
  if(onProgress) onProgress("正在整理全书概要……");
  let final = {};
  try{
    const finalRaw = await callLLM([
      {role:"system",content:FINAL_SYS},
      {role:"user",content:JSON.stringify({chunkSummaries, characters:[...byName.values()], relationships:[...rels.values()], foreshadowing, timeline}, null, 1)}
    ]);
    final = extractJSON(finalRaw);
  }catch(e){ final = {summary:chunkSummaries.join("\n"), anchors:[], ending:"", themes:[], tone:""}; }
  return {
    summary: final.summary || "",
    ending: final.ending || "",
    anchors: (final.anchors||[]).slice(0,16),
    themes: final.themes||[],
    tone: final.tone||"",
    characters: [...byName.values()].slice(0,24),
    relationships: [...rels.values()].slice(0,40),
    foreshadowing, timeline, chapterSummaries: chunkSummaries,
    generatedAt: Date.now()
  };
}

function importTitleFromFile(fileName){
  const base = String(fileName||"").replace(/^.*[\\/]/,"").replace(/\.[^.]+$/,"").trim();
  return (base || "我的小说").slice(0,120);
}
async function autoImportToShelf(fileName,text){
  const title = importTitleFromFile(fileName);
  const token = AUTH.token;
  const card = $("card");
  $("overlay").classList.remove("hidden");
  card.innerHTML = `
    <div class="home">
      <header class="home-header"><h1>正在导入</h1></header>
      <p class="sub">已读取《${escapeHtml(title)}》${Math.round(text.length/1000)}k 字。系统会自动分析并加入「小说剧本」，不需要选择任何选项。</p>
      <p class="form-note" id="auto-import-status" role="status">正在准备……</p>
    </div>`;
  const status = $("auto-import-status");
  const here = ()=>AUTH.token===token && $("auto-import-status")===status;
  let bible = null, summary = "";
  try{
    status.textContent = "正在生成故事圣经……";
    bible = await generateWorldBible(text, msg=>{ if(here()) status.textContent = msg || "正在生成故事圣经……"; });
    summary = (bible && bible.summary) || "";
  }catch(e){
    try{
      if(here()) status.textContent = "故事圣经生成失败，正在生成全书概要……";
      summary = await generateWorldSummary(text, msg=>{ if(here()) status.textContent = msg || "正在生成全书概要……"; });
    }catch(e2){
      if(here()) status.textContent = "自动分析失败，将直接保存原文……";
    }
  }
  if(!here()) return;
  status.textContent = "正在写入书架……";
  try{
    const {world} = await api("/api/worlds",{method:"POST",body:{
      name:title,text,genre:guessImportGenre(text),source:"upload",createNew:false,
      summary,title,windowStart:0,infiniteMode:false,bible,isBook:true
    }});
    if(!world) throw new Error("书架没有返回这本书");
    await api("/api/worlds",{method:"POST",body:{
      name:title,text:"",genre:guessImportGenre(text),source:"upload",createNew:false,
      summary,title,windowStart:0,infiniteMode:false,bible,bookId:world.id
    }});
    await showTitle();
    menuNote("《"+title+"》已加入「小说剧本」，并出现在「我的旅途」中。");
    const mine = [...document.querySelectorAll("details.library")].find(d=>
      /小说剧本/.test((d.querySelector("summary")||{}).textContent||""));
    if(mine) mine.open = true;
  }catch(e){
    await showTitle();
    menuNote("导入失败："+e.message);
  }
}
async function savePasteAsBook({name,text,genre="",summary="",bible=null}){
  const {world} = await api("/api/worlds",{method:"POST",body:{
    name,text,genre,source:"paste",createNew:false,summary,title:name,
    windowStart:0,infiniteMode:false,bible,isBook:true
  }});
  if(!world) throw new Error("写入小说剧本失败");
  return world;
}
function showPasteWorld({name = "",text = "",saveBook = true} = {}, start = false){
  const card = $("card");
  card.innerHTML = `
    <h1>粘贴文字开始故事</h1>
    <div class="sub">从小说片段的结尾续写，或用世界设定开启第一幕</div>
    <form class="auth-form paste-world" id="paste-world">
      <label for="paste-name">旅途名称 / 书名（直接用作书库名称）</label>
      <input id="paste-name" maxlength="80" placeholder="例如：雨夜列车">
      <label for="paste-text">小说片段或世界设定</label>
      <textarea id="paste-text" rows="6" maxlength="500000" required placeholder="把正文或设定粘贴在这里，最多 50 万字符"></textarea>
      <label for="paste-genre">故事类型（可选：选「恋爱/日常」会弱化任务、以关系为主线）</label>
      <select id="paste-genre">
        <option value="">自动判断</option>
        ${GENRES.filter(g=>g.id!=="随机").map(g=>`<option value="${g.id}">${g.id} · ${g.desc}</option>`).join("")}
      </select>
      <label class="check-line" for="paste-infinite"><input type="checkbox" id="paste-infinite"> 无限模式：主线结束后继续写，不自动收束</label>
      <label class="check-line" for="paste-save-book"><input type="checkbox" id="paste-save-book" ${saveBook ? "checked" : ""}> 同时放入小说剧本（之后可从书库重新进入）</label>
      <div class="form-note" id="paste-status" role="status"></div>
      <div class="enter-pct">
        <label for="paste-range">从这段文字的哪里继续 <span id="paste-pct-label">使用全部（从末尾续写）</span></label>
        <input type="range" id="paste-range" min="0.5" max="100" step="0.5" value="100">
        <div class="enter-preview" id="paste-preview"></div>
      </div>
      <label class="check-line" for="paste-summary"><input type="checkbox" id="paste-summary"> 开始前生成概要（更连贯，约十几秒）</label>
      <label class="check-line" for="paste-bible"><input type="checkbox" id="paste-bible"> 生成故事圣经（人物/关系/伏笔，较慢但更忠于原文）</label>
      <button class="big-btn" id="paste-roles" type="button">选择角色并开始</button>
      <button class="big-btn ghost" id="paste-back" type="button">返回酒馆</button>
    </form>`;
  const form = $("paste-world"), field = $("paste-text"), status = $("paste-status");
  const title = $("paste-name");
  const range = $("paste-range"), pctLabel = $("paste-pct-label"), preview = $("paste-preview"), summaryChk = $("paste-summary");
  const bibleChk = $("paste-bible");
  const genreSel = $("paste-genre");
  const infiniteChk = $("paste-infinite");
  const saveBookChk = $("paste-save-book");
  const saveToLibrary = ()=> !!(saveBookChk && saveBookChk.checked);
  const infiniteMode = ()=> !!(infiniteChk && infiniteChk.checked);
  title.value = name;
  field.value = text;
  card.scrollTop = 0;
  const back = $("paste-back");
  const rolesBtn = $("paste-roles");
  const token = AUTH.token;
  const stillHere = ()=>AUTH.token===token && $("paste-world")===form;
  const sliceText = ()=>{ const pct = Number(range.value); const v = field.value.trim(); return pct>=100 ? v : v.slice(0, Math.max(1, Math.floor(v.length*pct/100))); };
  const windowStartOf = (v)=>{ const pct = Number(range.value); return pct>=100 ? Math.max(0, v.length-20000) : Math.max(0, Math.floor(v.length*pct/100)); };
  function updatePreview(){
    const pct = Number(range.value);
    const sliced = sliceText();
    pctLabel.textContent = pct>=100 ? "从末尾续写（全部作为前情）" : "从第 "+pct+"% 处续写（前情约 "+Math.round(sliced.length/1000)+"k 字，之后的内容作为后续参考）";
    preview.textContent = sliced.slice(-260) || "（尚无内容）";
    preview.scrollTop = preview.scrollHeight;
  }
  range.oninput = updatePreview;
  updatePreview();
  back.onclick = showTitle;
  rolesBtn.onclick = async ()=>{
    const full = field.value.trim();
    if(!full || full.length>500000){
      field.setCustomValidity("请粘贴 1 至 50 万字符的小说片段或设定。");
      field.reportValidity();
      return;
    }
    if(!isLoggedIn()){
      showLogin("登录后才能生成角色卡。",{
        onSuccess:()=>showPasteWorld({name:title.value,text:field.value,saveBook:saveToLibrary()}),
        onBack:()=>showPasteWorld({name:title.value,text:field.value,saveBook:saveToLibrary()})
      });
      return;
    }
    const text = sliceText();
    if(!text){ status.textContent = "请粘贴至少一小段文字。"; return; }
    const name = title.value.trim() || "我的小说世界";
    rolesBtn.disabled = true; back.disabled = true;
    let summary = "", bible = null, bookId = "";
    try{
      if(bibleChk.checked){
        status.textContent = "正在分析原文，生成故事圣经……";
        bible = await generateWorldBible(full, msg=>{ if(stillHere()) status.textContent = msg; });
        summary = bible.summary || "";
      }else if(summaryChk.checked){
        status.textContent = "正在生成概要……";
        summary = await generateWorldSummary(full, p=>{ if(stillHere()) status.textContent = "正在生成概要……"+(p?"已接收 "+p.length+" 字":""); });
      }
      if(!stillHere()) return;
      if(saveToLibrary()){
        status.textContent = "正在写入小说剧本……";
        const book = await savePasteAsBook({name,text:full,genre:genreSel.value,summary,bible});
        bookId = book.id;
      }
    }catch(e){
      if(!stillHere()) return;
      status.textContent = "准备失败："+e.message;
      rolesBtn.disabled = back.disabled = false;
      return;
    }
    if(!stillHere()) return;
    status.textContent = "正在准备角色卡……";
    const cut = windowStartOf(full);
    const pct = Number(range.value);
    const entryTitle = cut===0 ? "原文开头" : (pct>=100 ? "原文末尾" : "原文 "+pct+"% 处");
    showRoleCards({name, title:name, text:full, author:"", summary, bible}, text, null, null, {source:"paste", genre:genreSel.value, windowStart:cut, entryTitle, worldText:full, bookId, infiniteMode:infiniteMode()});
  };
  field.oninput = ()=>{ field.setCustomValidity(""); updatePreview(); };
  form.onsubmit = e=>e.preventDefault();
  field.focus({preventScroll:true});
}

function journeyRole(value){
  if(!value || typeof value.name!=="string" || !value.name.trim()) return null;
  const role = {};
  for(const key of ["name","gender","identity","personality","hook","species"]){
    role[key] = typeof value[key]==="string" ? value[key].slice(0,300) : "";
  }
  for(const key of ["coin","income"]){
    if(Number.isFinite(value[key])) role[key]=Math.max(0,Math.round(value[key]));
  }
  for(const key of ["age","height","weight"]){
    if(Number.isFinite(Number(value[key])) && Number(value[key])>0) role[key]=Math.round(Number(value[key]));
  }
  return role;
}

async function createJourney(name,text,genre,stillHere,{source,openOnEntry = true,worldStart = "",title = "",author = "",role = null,summary = "",windowStart = 0, bible = null, builtinId, builtinText, infiniteMode = false, bookId = ""} = {}){
  const useBookRef = !!bookId && !builtinId;
  const storedText = builtinId || useBookRef ? "" : text;
  const {world} = await api("/api/worlds",{method:"POST",body:{name,text:storedText,genre,source,createNew:true,summary,title,author,bible:builtinId ? null : bible,builtinId,bookId:bookId || undefined,windowStart,worldStart,infiniteMode:Boolean(infiniteMode),role:journeyRole(role)}});
  if(stillHere()) startJourney({...world,text:builtinText ?? (useBookRef ? text : world.text),worldStart,title,author,role,summary,windowStart,bible,infiniteMode:Boolean(infiniteMode)},openOnEntry);
}

let activeBuiltinBible = null;

function bibleSectionEvidence(b,windowStart){
  const sections = Array.isArray(b.sections) ? b.sections : [];
  const current = Math.max(0,sections.findLastIndex(section=>section.offset<=windowStart));
  return sections.slice(Math.max(0,current-1),current+1);
}

function storyBibleForState(b,windowStart){
  return {summary:b.summary||"",ending:b.ending||"",tone:b.tone||"",themes:b.themes||[],
    foreshadowing:b.foreshadowing||[],sectionEvidence:bibleSectionEvidence(b,windowStart)};
}

function startJourney(world,openOnEntry = true){
  cancelTurn();
  undoStack = [];
  if(autoImageAbort){ autoImageAbort.abort(); autoImageAbort = null; }
  journeyOwner = AUTH.username;
  const inferredGenre = world.genre || (world.text ? guessImportGenre(world.text) : "");
  S = {...DEFAULT_STATE(),ai:true,infiniteMode:Boolean(world.infiniteMode),species:world.species||(world.role&&world.role.species)||"",world:world.text||"",worldSource:world.source||"",worldName:world.name||world.title||"",worldStart:world.worldStart||"",worldRole:world.role||null,worldSummary:world.summary||"",worldWindow:world.windowStart||0,worldId:world.id,bookId:world.bookId||"",builtinId:world.builtinId||"",genre:inferredGenre};
  activeBuiltinBible = S.builtinId && world.bible ? world.bible : null;
  S.romanceMode = computeRomanceMode(S);
  if(!S.gender && world.role && world.role.gender) S.gender = String(world.role.gender).slice(0,10);
  if(world.role){
    if(Number.isFinite(world.role.income)) S.incomePerDay = world.role.income;
    if(Number.isFinite(world.role.coin)) S.coin = world.role.coin;
    if(Number.isFinite(world.role.age)) S.age = world.role.age;
    if(Number.isFinite(world.role.height)) S.height = world.role.height;
    if(Number.isFinite(world.role.weight)) S.weight = world.role.weight;
    S.playerIdentity = { name:String(world.role.name||""), identity:String(world.role.identity||""), desc:String(world.role.personality||"") };
  }
  // 若有原著「故事圣经」，用真实人物、关系、锚点初始化，提升还原度
  if(world.bible && typeof world.bible==="object"){
    const b = world.bible;
    if(!S.worldSummary && b.summary) S.worldSummary = b.summary;
    if(Array.isArray(b.anchors) && b.anchors.length) S.anchors = [...b.anchors].slice(-24);
    if(Array.isArray(b.characters) && b.characters.length && !S.cast.length){
      S.cast = b.characters.filter(c=>c && c.name).slice(0,20).map(c=>({
        name:c.name, background:c.identity||"", personality:c.personality||"", hobby:"", voice:c.voice||"",
        goal:c.goal||"", attitude:c.attitude||"", knows:c.knows||"", changes:[],
        age:Number.isFinite(c.age)?c.age:undefined, gender:c.gender||"",
        adult:Number.isFinite(c.age)?c.age>=18:true, status:c.status||"",
        desire:0, links:[]
      }));
      const byName = new Map(S.cast.map(c=>[c.name,c]));
      for(const r of (b.relationships||[])){
        const A = byName.get(r.a), B = byName.get(r.b);
        if(!A || !B || A===B) continue;
        const link = { relation:r.relation||"", aff:Number.isFinite(r.aff)?r.aff:undefined, desire:Number.isFinite(r.desire)?r.desire:undefined };
        (A.links = A.links||[]).push({ name:B.name, ...link });
        (B.links = B.links||[]).push({ name:A.name, ...link });
      }
    }
    S.worldBible = storyBibleForState(b, S.worldWindow);
  }
  const trial = isTwoDayTrial(S);
  if(trial) seedTwoDayTrial(S);
  ensureEconomy(S);
    ensureAvatars(S);
  enterStory();
  if(trial) saveProgress();
  else if(openOnEntry) aiTurn();
  else $("action-text").focus();
}
function enterStory(){
  $("overlay").classList.add("hidden");
  closeDrawer();
  const title = $("story-title");
  title.textContent = S.ai ? (S.worldName || "暗夜酒馆") : "雨夜的委托";
  title.parentElement.title = title.textContent;
  resetChoiceExpansion();
  $("save-status").textContent = S.turn ? "" : "进度会自动保存";
  document.querySelectorAll(".side-tab")[0].textContent = "人物";
  const sideTabs = document.querySelectorAll(".side-tab");
  const secondTab = sideTabs[1];
  if(secondTab){
    secondTab.textContent = S.ai ? "剧情" : "账本";
    secondTab.style.display = "";
  }
  const thirdTab = sideTabs[2];
  if(thirdTab){
    thirdTab.style.display = S.ai ? "" : "none";
    thirdTab.textContent = "物品";
    if(!S.ai && thirdTab.classList.contains("active")){
      thirdTab.classList.remove("active");
      sideTabs[0].classList.add("active");
    }
  }
  renderLog();
  if(S.ai){ showCurrentScene(""); syncSceneImageButton(); if(S.sceneImageAuto) autoSceneImage(); return; }
  refreshStats();
  refreshSide();
  if(S.node==="__end_good" || S.node==="__end_bad") showEnding(S.node==="__end_good");
  else renderChoices(NODES[S.node]||NODES.start);
}

function startClassic(save){
  cancelTurn();
  S = {...DEFAULT_STATE(),...save,ai:false,worldId:""};
  if(!Number.isFinite(S.environment?.minute)){
    if(S.node==="rest_early") S.classicRestAlreadyApplied = true;
    S.environment = {...S.environment,minute:S.node==="rest_early" ? 22*60 : 20*60};
  }
  if(NODES[S.node]) NPC_VIEW[S.node] = NODES[S.node].view;
  enterStory();
  if(!save) goNode("start");
}

async function saveProgress(manual = false){
  const state = S;
  const status = (message)=>{
    if(S!==state) return;
    $("save-status").textContent = message;
    if($("ending-status")) $("ending-status").textContent = message;
  };
  if(!state.ai){
    try{ localStorage.setItem(CLASSIC_KEY,JSON.stringify(state)); status("已保存在此浏览器"); }
    catch(e){ status("此浏览器无法保存进度"); }
    return;
  }
  if(!state.turn){ if(manual) status("完成第一幕后可以保存"); return; }
  const {world, ...save} = state;
  const token = AUTH.token;
  status("正在保存……");
  const operation = saveQueue.then(()=>api("/api/save",{method:"PUT",body:{id:state.worldId,save},token}));
  saveQueue = operation.catch(()=>{});
  try{ await operation; status("进度已保存"); }
  catch(e){ status("保存失败："+e.message); }
}

async function loadWorld(id,stillHere){
  await saveQueue;
  const token = AUTH.token;
  const [{world},{save}] = await Promise.all([
    api("/api/worlds?id="+encodeURIComponent(id),{token}),
    api("/api/save?id="+encodeURIComponent(id),{token})
  ]);
  if(!stillHere()) return;
  if(!world.text && world.bookId){
    try{
      const {world:book} = await api("/api/worlds?id="+encodeURIComponent(world.bookId),{token});
      if(book && typeof book.text==="string"){
        world.text = book.text;
        if(!world.bible && book.bible) world.bible = book.bible;
        if(!world.summary && book.summary) world.summary = book.summary;
      }
    }catch(e){}
    if(!stillHere()) return;
  }
  if(typeof world.builtinId==="string" && /^novel_[a-z]+$/.test(world.builtinId)){
    world.text = (await readBuiltinBook(world.builtinId)).text;
    if(!world.bible){
      world.bible = await readBuiltinBook(world.builtinId,{bible:true,optional:true});
    }
    if(!stillHere()) return;
  }
  if(!save){ startJourney(world); return; }
  journeyOwner = AUTH.username;
  S = {...DEFAULT_STATE(),...save,ai:true,infiniteMode:save.infiniteMode ?? Boolean(world.infiniteMode),species:save.species||(world.role&&world.role.species)||"",world:save.world||world.text||"",worldSource:world.source||"",worldName:world.name,worldId:id,builtinId:world.builtinId||""};
  undoStack = [];
  if(autoImageAbort){ autoImageAbort.abort(); autoImageAbort = null; }
  activeBuiltinBible = S.builtinId && world.bible ? world.bible : null;
  const oldExhaustionEnding = S.hp<=0 && S.ending?.title==="力竭而倒"
    && S.ending.text?.endsWith("体力耗尽，这一夜就此终结。");
  if(oldExhaustionEnding) S.ending = null;
  restoreLifeEvents(S);
  if(!S.worldSummary && world.summary) S.worldSummary = world.summary;
  if(world.bible && typeof world.bible==="object"){
    if(!S.worldBible) S.worldBible = storyBibleForState(world.bible,S.worldWindow);
    if(!S.worldSummary && world.bible.summary) S.worldSummary = world.bible.summary;
    if((!S.anchors || !S.anchors.length) && Array.isArray(world.bible.anchors)) S.anchors = world.bible.anchors.slice(-24);
  }
  if(!S.worldWindow) S.worldWindow = 0;
  if(!S.choices.length && !S.ending){
    const last = S.history.findLast(h=>h.role==="assistant");
    try{
      const scene = readScene(last.content);
      S.choices = scene.choices;
      if(!oldExhaustionEnding) S.ending = scene.ending;
      if(!S.log.length) S.log = scene.lines;
    }catch(e){ S.choices = [{text:"继续当前旅途"}]; }
  }
  if(S.turn>0 && !S.career){
    const c = CAREERS.commoner;
    S.career = "commoner";
    const base = { iq:50, physique:50, charm:50, willpower:50, agility:50 };
    for(const k of Object.keys(base)) if(S[k]===undefined) S[k] = base[k];
    for(const [k,v] of Object.entries(c.bonus||{})) if(S[k]===base[k]) S[k] = clamp(base[k]+v, 0, 100);
    if(S.hpMax===undefined) S.hpMax = clamp(Math.round(80 + (S.physique||50)*0.4), 40, 140);
    if(S.hp===undefined) S.hp = S.hpMax;
    if(!S.skills || !Object.keys(S.skills).length) S.skills = {...(c.skills||{})};
    if(!Array.isArray(S.social)) S.social = [];
    if(S.health===undefined) S.health = 100;
    if(S.debt===undefined) S.debt = 0;
    if(S.age===undefined) S.age = 30;
  }
  ensureEconomy(S);
    ensureAvatars(S);
  enterStory();
}

