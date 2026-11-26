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
  const def = {enabled:false,
    address:"http://127.0.0.1:8189/qwen",
    model:QwenWorkflow.defaults.unet, user:"", pass:"",
    steps:20, lora:false, llmPrompt:false,
    style:"photorealistic, cinematic soft light, natural skin texture, high detail, dark background"};
  try{
    const stored = JSON.parse(localStorage.getItem(IMAGE_CFG_KEY)||"{}") || {};
    if(typeof stored.base==="string" && stored.base && !Object.hasOwn(stored,"address")) def.address = stored.base;
    for(const key of Object.keys(def)){
      if(typeof stored[key]===typeof def[key]) def[key] = stored[key];
    }
  }catch(e){ return def; }
  return def;
}
function saveImageCfg(cfg){ try{ localStorage.setItem(IMAGE_CFG_KEY, JSON.stringify(cfg)); }catch(e){} }
function qwenEndpoint(cfg){
  let url;
  try{ url = new URL(cfg.address.trim()); }catch(e){}
  if(!url || !/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash){
    throw new Error("请输入有效的 ComfyUI 地址");
  }
  if(url.port==="8189" && url.pathname==="/" &&
    ["127.0.0.1","localhost"].includes(url.hostname)){
    url.pathname = "/qwen";
  }
  return url.href.replace(/\/+$/,"");
}
function qwenHeaders(cfg){
  if(!cfg.user) return {};
  const bytes = new TextEncoder().encode(cfg.user+":"+cfg.pass);
  return {Authorization:"Basic "+btoa(String.fromCharCode(...bytes))};
}
async function qwenFetch(url, options = {}){
  // /prompt 和 /object_info 应快速返回；/history 与 /view 在 ComfyUI 采样期间可能被拖慢，需要更长等待。
  const isPoll = /\/history\//.test(url) || /\/view\?/.test(url);
  const timeout = AbortSignal.timeout(isPoll ? 90000 : 20000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try{ return await fetch(url,{...options,signal,redirect:"error"}); }
  catch(error){
    if(error instanceof TypeError) throw new Error("无法连接 ComfyUI，请检查地址和网络");
    if(error?.name==="TimeoutError" && isPoll) throw new Error("ComfyUI 响应超时，任务可能仍在生成");
    throw error;
  }
}
async function qwenResponse(response){
  if(!response.ok){
    if(response.status===401 || response.status===403) throw new Error("ComfyUI 拒绝访问，请检查账号和密码");
    const body = await response.json().catch(()=>null);
    const nodeError = Object.values(body?.node_errors || {})[0]?.errors?.[0];
    throw new Error(nodeError?.details || body?.error?.message || "ComfyUI 请求失败（"+response.status+"）");
  }
  return response;
}
async function qwenGenerate(cfg,prompt,negative,kind,seed,signal,onSubmitted){
  const base = qwenEndpoint(cfg);
  const headers = qwenHeaders(cfg);
  const models = {...QwenWorkflow.defaults,unet:cfg.model,steps:Number(cfg.steps)||QwenWorkflow.defaults.steps,useLora:cfg.lora===true};
  const submitted = await qwenResponse(await qwenFetch(base+"/prompt",{
    method:"POST", headers:{...headers,"Content-Type":"application/json"},
    body:JSON.stringify({prompt:QwenWorkflow.create(prompt,negative,kind,seed,models)}),signal
  }));
  const {prompt_id:id} = await submitted.json();
  if(typeof id!=="string" || !id) throw new Error("ComfyUI 没有返回任务编号");
  if(typeof onSubmitted==="function"){ try{ onSubmitted(id); }catch(e){} }
  const deadline = Date.now() + 10 * 60 * 1000;
  let pollFailures = 0;
  while(Date.now() < deadline){
    await new Promise(resolve=>setTimeout(resolve,2000));
    let response;
    try{
      response = await qwenResponse(await qwenFetch(base+"/history/"+encodeURIComponent(id),{headers,signal}));
    }catch(error){
      if(signal?.aborted) throw error;
      const message = String(error?.message||"");
      if(/拒绝访问|未生成图片|生成失败/.test(message)) throw error;
      if(++pollFailures >= 5) throw new Error("ComfyUI 仍在生成，请稍后重试");
      continue;
    }
    pollFailures = 0;
    const entry = (await response.json())[id];
    if(!entry) continue;
    const image = entry.outputs?.["8"]?.images?.[0];
    if(!image){
      const failure = entry.status?.messages?.find(note=>note[0]==="execution_error")?.[1];
      const reason = String(failure?.exception_message || "").trim().split(/\r?\n/,1)[0].slice(0,180);
      throw new Error(reason || "ComfyUI 未生成图片");
    }
    const query = new URLSearchParams({filename:image.filename,subfolder:image.subfolder||"",type:image.type||"output"});
    const result = await qwenResponse(await qwenFetch(base+"/view?"+query,{headers,signal}));
    if(!result.headers.get("Content-Type")?.startsWith("image/")) throw new Error("ComfyUI 未返回图片");
    return blobToDataURL(await result.blob());
  }
  throw new Error("等待 Qwen 生成超时");
}
let imageDbPromise = null;
function imageDb(){
  if(imageDbPromise) return imageDbPromise;
  imageDbPromise = new Promise((res,rej)=>{
    const req = indexedDB.open("tavern_images",1);
    req.onupgradeneeded = ()=>{ const db=req.result; if(!db.objectStoreNames.contains("images")) db.createObjectStore("images"); };
    req.onsuccess = ()=>res(req.result);
    req.onerror = ()=>rej(req.error);
  });
  imageDbPromise.catch(()=>{ imageDbPromise = null; });
  return imageDbPromise;
}
async function imagePut(key,val){
  const db = await imageDb();
  return tavernDbStore(db,"images","readwrite",store=>{ store.put(val,key); });
}
async function imageGet(key){
  const legacy = S?.imageData?.[key] || "";
  try{
    const db = await imageDb();
    const data = await tavernDbStore(db,"images","readonly",store=>new Promise((resolve,reject)=>{
      const req = store.get(key);
      req.onsuccess = ()=>resolve(req.result);
      req.onerror = ()=>reject(req.error);
    }));
    return data || legacy;
  }catch(error){
    if(legacy) return legacy;
    throw error;
  }
}
async function migrateLegacyImages(state){
  const images = state.imageData;
  if(!images) return;
  try{
    const db = await imageDb();
    await tavernDbStore(db,"images","readwrite",store=>{
      for(const [key,value] of Object.entries(images)){
        const req = store.getKey(key);
        req.onsuccess = ()=>{ if(req.result===undefined) store.put(value,key); };
      }
    });
    if(state.imageData===images) delete state.imageData;
  }catch(error){ /* Keep embedded copies until the migration has committed. */ }
}
function blobToDataURL(blob){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(blob); });
}
function seedOf(s){
  let h=0; const str=String(s||"");
  for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))|0;
  return Math.abs(h)%1000000;
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
  const lastAction = [...(S.log||[])].reverse()
    .find(entry=>entry && (entry.t==="action" || entry.t==="speech"));
  const present = (S.present||[]).slice(0,5).map(name=>{
    const c = (S.cast||[]).find(x=>x && x.name===name);
    return c ? [c.name,c.species,c.gender,c.age,c.height ? c.height+"cm" : "",c.weight ? c.weight+"kg" : "",c.origin,c.identity,c.job,c.appearance,c.outfit].filter(Boolean).join("，") : name;
  });
  const bonds = (S.present||[]).slice(0,5).map(name=>{
    const c = (S.cast||[]).find(x=>x && x.name===name);
    if(!c) return null;
    const aff = Number(S.aff?.[c.name]);
    const intimacy = Number(S.intimacy?.[c.name]);
    const desire = Number(c.desire);
    return {
      name:c.name,
      role:[c.identity,c.job].filter(Boolean).join(" "),
      attitude:c.attitude||"",
      tie:c.tie||"",
      affinity:Number.isFinite(aff) ? Math.round(aff) : undefined,
      intimacy:Number.isFinite(intimacy) ? Math.round(intimacy) : undefined,
      desire:Number.isFinite(desire) ? Math.round(desire) : undefined
    };
  }).filter(Boolean);
  return {
    scene:S.scene||"",
    moment:recent,
    action:String(lastAction?.text||"").replace(/^你选择了：/,"").trim(),
    player:playerImageSpec(),
    plot:{goal:S.plot?.goal||"",conflict:S.plot?.conflict||"",next:S.plot?.next||""},
    place:e.place||"", time:formatClock(S), weather:e.weather||"",
    era:e.era||"", conditions:e.conditions||"", present, bonds
  };
}
function playerImageSubject(){
  const gender = /女/.test(S.gender||"") ? "woman" : /男/.test(S.gender||"") ? "man" : "person";
  const age = Number.isFinite(Number(S.age)) ? Number(S.age)+" years old" : "";
  const identity = S.playerIdentity?.identity || S.career || "";
  const appearance = S.appearance || "";
  const outfit = S.outfit || "";
  return [age, gender, "protagonist", identity, appearance, outfit].filter(Boolean).join(", ");
}
function sceneImagePrompt(){
  const m = sceneMoment();
  return ("cinematic narrative scene, exactly this story beat: "
    +[m.scene,m.plot.conflict,m.moment,m.place,m.weather,m.time,m.present.join("、")].filter(Boolean).join(", ")).replace(/\s+/g," ").trim();
}
function sceneCulture(){
  const text = [S.genre,S.worldName,S.worldStart,S.environment?.era,S.environment?.background].filter(Boolean).join(" ");
  if(/武侠|江湖|中原|江南|古代|王朝|镖局|门派|官府|架空/.test(text)) return "ancient Chinese";
  if(/欧洲|中世纪|骑士|城堡|王国/.test(text)) return "medieval European";
  if(/科幻|未来|星舰|赛博|太空/.test(text)) return "science fiction";
  if(/现代|都市|当代|日常/.test(text)) return "contemporary";
  return "period-appropriate";
}
function sceneTimeOfDay(){
  const minute = Number.isFinite(S.environment?.minute) ? ((S.environment.minute % 1440)+1440)%1440 : 12*60;
  if(minute < 5*60) return "pre-dawn night";
  if(minute < 11*60) return "morning";
  if(minute < 17*60) return "afternoon";
  if(minute < 19*60) return "dusk";
  return "night, warm lantern light";
}
function sceneWeatherEn(){
  const w = String(S.environment?.weather||"");
  if(/暴雨|大雨/.test(w)) return "heavy rain, wet streets";
  if(/雨/.test(w)) return "light rain, wet stone street";
  if(/雪/.test(w)) return "snow";
  if(/雾/.test(w)) return "fog";
  if(/风/.test(w)) return "windy";
  return w ? "weather: "+w : "";
}
function scenePeopleClause(){
  const positions = ["left foreground","right foreground","center foreground","background left","background right"];
  const people = (S.present||[]).slice(0,5).map((name,index)=>{
    const c = (S.cast||[]).find(x=>x && x.name===name);
    if(!c) return (positions[index]||"foreground")+": "+name;
    const gender = /女/.test(c.gender||"") ? "woman" : /男/.test(c.gender||"") ? "man" : "person";
    const role = /掌柜|老板|店主/.test([c.job,c.identity].filter(Boolean).join(" ")) ? "shop owner"
      : /脚夫|搬|苦力/.test([c.job,c.identity].filter(Boolean).join(" ")) ? "porter"
      : /伙计|小二|跑堂/.test([c.job,c.identity].filter(Boolean).join(" ")) ? "shop assistant"
      : /守卫|兵|捕快|差役/.test([c.job,c.identity].filter(Boolean).join(" ")) ? "guard"
      : /医|郎中/.test([c.job,c.identity].filter(Boolean).join(" ")) ? "doctor"
      : "local resident";
    const ageWord = Number(c.age)>=40 ? "middle-aged" : Number(c.age)<=24 ? "young adult" : "";
    const who = [c.age?c.age+" years old":"", ageWord, sceneCulture()==="ancient Chinese"?"Chinese":"", gender, role,
      c.appearance, c.outfit].filter(Boolean).join(", ");
    return (positions[index]||"foreground")+": "+who;
  }).filter(Boolean);
  if(!people.length) return "no people visible, only the environment";
  if(people.length===1) return "single subject, exactly 1 person visible: "+people[0]+"; full body and face visible";
  return "TWO-SHOT GROUP COMPOSITION. exactly "+people.length+" people in the same frame, all clearly visible and interacting: "+people.join(" | ")+"; do not omit any character; no crowd";
}
function finalizeScenePrompt(prompt){
  const m = sceneMoment();
  const cfg = imageCfg();
  const style = String(cfg.style||"").replace(/\bdark background\b/ig,"").replace(/\bnatural skin texture\b/ig,"natural textures").trim();
  const clean = String(prompt||"")
    .replace(/\b(japanese|kimono|shrine|torii|tatami|anime|manga|ukiyo-e)\b/ig,"")
    .replace(/\s+/g," ").trim();
  const count = (S.present||[]).length;
  const lead = count>1 ? ("TWO MEN IN FRAME, " + count + " PEOPLE TOGETHER. ") : "";
  const anchors = [
    "cinematic photorealistic narrative scene, film still",
    m.scene ? "story moment: "+m.scene : "",
    "setting: "+(m.place||"period-appropriate location")+(m.era?(", "+m.era):""),
    "culture: "+sceneCulture()+", period-accurate architecture and clothing",
    "time of day: "+sceneTimeOfDay(),
    sceneWeatherEn(),
    scenePeopleClause(),
    m.moment ? "visible action: "+m.moment.slice(-420) : "",
    style,
    "35mm lens, eye level, medium-wide composition, natural light, high detail",
    "no text, no signage, no calligraphy, no banners, no watermark"
  ].filter(Boolean).join(". ");
  return (lead+anchors+". "+(clean||"")).replace(/\s+/g," ").slice(0,1600);
}
function sceneActionEn(text){
  const t = String(text||"");
  if(!t) return "";
  const rules = [
    [/拔刀|拔剑|出刀|亮刀|横刀|架刀/, "drawing a blade and facing an opponent"],
    [/劈|砍|刺|攻击|动手|交手|格斗|打斗/, "attacking in a tense fight"],
    [/推开|推门|开门|进门|闯入/, "pushing open a door and entering"],
    [/坐下|坐着|落座|坐/, "sitting down and talking"],
    [/站|拦|挡|守/, "standing in the way, alert"],
    [/抱住|搂住|拥抱|靠在/, "holding someone close"],
    [/亲吻|吻|贴近|耳语/, "leaning in close and speaking softly"],
    [/递|交给|拿出|掏出|举起/, "handing something over"],
    [/检查|查看|观察|打量|翻看|搜查/, "examining the scene closely"],
    [/跑|追|赶|逃/, "moving quickly through the scene"],
    [/喝酒|端起|举杯|喝茶|吃饭/, "holding a cup or bowl at the table"],
    [/跪下|跪|低头|鞠躬/, "kneeling or bowing"],
    [/哭|落泪|流泪/, "showing visible emotion"],
    [/笑|微笑|冷笑/, "with a visible expression on the face"],
    [/走|离开|出门/, "walking through the scene"],
    [/说|问|答|坦白|告诉/, "talking face to face"],
    [/约|见面|等/, "meeting someone face to face"]
  ];
  const hit = rules.find(([re])=>re.test(t));
  return hit ? hit[1] : "performing a decisive action";
}
function shortScenePrompt(){
  const m = sceneMoment();
  const culture = sceneCulture();
  const player = playerImageSubject();
  const actionText = sceneActionEn(m.action);
  const action = actionText ? "protagonist is actively doing this: "+actionText : "";
  const recentActions = (S.log||[]).slice(-16)
    .filter(e=>e && (e.t==="npc-action" || e.t==="narr"))
    .map(e=>{
      const text = String(e.text||"").replace(/[“”"「」『』][^“”"「」『』]{0,240}[“”"「」『』]/g,"").replace(/\s+/g," ").trim();
      return text ? ((e.who ? e.who+"：" : "")+text) : "";
    })
    .filter(Boolean)
    .join("；")
    .slice(-700);
  const actionsClause = recentActions ? "visible character actions and interactions: "+recentActions : "";
  const people = (S.present||[]).slice(0,5).map(name=>{
    const c = (S.cast||[]).find(x=>x && x.name===name);
    if(!c) return name;
    const gender = /女/.test(c.gender||"") ? "woman" : /男/.test(c.gender||"") ? "man" : "person";
    const roleText = [c.job,c.identity].filter(Boolean).join(" ");
    const isOwner = /掌柜|老板|店主/.test(roleText);
    const isPorter = /脚夫|搬|苦力/.test(roleText);
    const role = isOwner ? "shop owner" : isPorter ? "porter"
      : /伙计|小二|跑堂/.test(roleText) ? "shop assistant" : /守卫|兵|捕快|差役/.test(roleText) ? "guard" : "local resident";
    const outfit = c.outfit || (isPorter ? "short hemp tunic and straw sandals"
      : isOwner ? "dark blue cotton long robe"
      : "period Chinese clothing");
    const appearance = c.appearance || "";
    const pose = isOwner ? "behind the wooden counter" : isPorter ? "standing near the doorway" : "standing nearby";
    const age = Number(c.age)>=40 ? "middle-aged" : Number(c.age)<=24 ? "young" : "";
    return [age, culture==="ancient Chinese"?"Chinese":"", gender, role, appearance, "wearing", outfit, pose].filter(Boolean).join(" ");
  });
  const count = people.length + 1;
  const time = sceneTimeOfDay();
  const weather = sceneWeatherEn();
  const rawPlace = String(m.place||"");
  const isShop = /茶馆|茶楼|客栈|酒馆|酒楼|店|铺|摊|码头|渡口/.test(rawPlace);
  let place = rawPlace;
  if(culture==="ancient Chinese"){
    if(/茶馆|茶楼/.test(rawPlace)) place = "an ancient Chinese teahouse with a wooden counter, red lanterns and wet stone street";
    else if(/客栈|酒馆|酒楼/.test(rawPlace)) place = "an ancient Chinese inn with wooden beams, red lanterns and wet stone street";
    else if(/码头|渡口|河|江/.test(rawPlace)) place = "an ancient Chinese riverside dock with wooden piers, wet stone street and lantern light";
    else if(/仓|货栈/.test(rawPlace)) place = "an ancient Chinese warehouse with wooden crates and dim lantern light";
    else if(/街|巷/.test(rawPlace)) place = "an old Chinese street with wooden shopfronts and wet stone pavement";
    else if(/山|林/.test(rawPlace)) place = "an ancient Chinese mountain forest, period-accurate environment";
    else if(/船|舟/.test(rawPlace)) place = "a wooden Chinese river boat on dark water";
    else if(/官府|衙门|牢/.test(rawPlace)) place = "an ancient Chinese government office with dark wooden beams";
    else if(/院|房|屋/.test(rawPlace)) place = "an ancient Chinese courtyard house with wooden lattice windows";
    else place = "an ancient Chinese period setting";
  }
  if(!place) place = "the scene";
  const atmosphere = isShop ? "red lanterns, warm lantern light, wet stone street" : "period-accurate environment, natural light";
  const subject = count===1
    ? "single subject, exactly 1 person visible: "+player+", face and full body visible"+(action?", "+action:"")
    : (count===2 ? "two-shot of exactly 2 people, both fully visible: " : "group shot of exactly "+count+" people, all fully visible: ")
      + "center foreground: "+player+(action?", "+action:"")
      + (people.length ? "; beside the protagonist: "+people.join(" and ") : "")
      + ", facing each other, faces visible in three-quarter view, no missing person";
  return ["cinematic photorealistic wide shot", subject, actionsClause, "in", place, "at", time, weather,
    culture+" architecture and clothing, "+atmosphere, "no text, no watermark"].filter(Boolean).join(", ").slice(0,1800);
}
function sceneNegative(){
  let base = IMG_NEG + ", text, signage, calligraphy, banners, labels, watermark, logo, missing character, duplicate face, empty establishing shot, empty room, landscape only, close-up portrait";
  if((S.present||[]).length + 1 > 1) base += ", solo, single person, one person only, back to camera, facing away, rear view";
  if(sceneCulture()==="ancient Chinese"){
    base += ", japanese architecture, kimono, shrine, torii, tatami, japanese lanterns, japanese characters, samurai, ukiyo-e, modern buildings, power lines, electric wires, concrete city, cars, neon signs";
    base += ", extra swordsman, off-screen attacker as a person";
  }
  return base;
}
function npcNegative(c){
  const raw = String(c && c.species || "");
  const base = IMG_NEG + ", multiple people, extra person, duplicate face, inconsistent facial features, wrong hair color, wrong eye color, wrong clothing";
  if(/狗|犬|猫|狐|狼|鸦|蛇|马|虎/.test(raw)) return base + ", human, human face, human skin, person";
  if(/外星|机械|机器人|灵体|魔|龙/.test(raw)) return base + ", human skin, person";
  return base;
}
async function visualPrompt(c, kind){
  const cfg = imageCfg();
  if(cfg.llmPrompt){
    try{
      const sys = "You write one concise English prompt for photorealistic image generation. Output only the prompt, no quotes, no markdown. Preserve exact identity: species, gender, age, hair, eyes, skin/fur/metal, body type, scars, prosthetics and clothing. Non-human characters must look clearly non-human. Never substitute a generic face or outfit. Depict the current relationship between the protagonist and each present NPC through body language, distance, gaze and natural touch. No text, watermark, logo, or UI.";
      let user;
      if(kind === "npc"){
        const p = {name:c.name,species:c.species,gender:c.gender,age:c.age,height:c.height,weight:c.weight,origin:c.origin,identity:c.identity,appearance:c.appearance,outfit:c.outfit,job:c.job,personality:c.personality,tie:c.tie,attitude:c.attitude,background:String(c.background||"").slice(0,240)};
        const setting = {world:S.worldName||S.genre||"",era:S.environment&&S.environment.era||"",place:S.environment&&S.environment.place||""};
        user = "Character reference: " + JSON.stringify(p) + ". Setting: " + JSON.stringify(setting) + ". Write a photorealistic " + (/human|人类|人/i.test(c.species||"") ? "headshot" : "creature portrait") + " prompt. You must repeat every explicit origin, appearance and outfit detail; use origin/regional heritage to guide facial features and styling without caricature or stereotype. Do not change hair color, eye color, age, species, body type or clothing. One person only, centered, dark background, 85mm, natural skin/fur/metal texture.";
      }else{
        const m = sceneMoment();
        user = "Story moment: " + JSON.stringify(m)
          + ". Write one concise English image prompt for this exact beat. Start with the protagonist's visible action and pose, then place the protagonist and every present NPC in the location with clear left/right/spatial relationships. Use the present/bonds fields to show each NPC's real relationship to the protagonist: lovers or close friends stand near, face each other and touch naturally; hostile or wary characters keep physical distance, guarded posture and cold gaze; superiors keep a formal distance. The protagonist must be in frame, doing the listed action, with the listed appearance and outfit. Only render the protagonist and the listed present characters; never turn an off-screen attacker mentioned in the action into a full extra person—at most show a blade or shadow at the frame edge. The NPCs must keep their listed role and posture, not become extra swordsmen. Depict expressions and interaction; keep location, time, weather and era. Do not make a generic empty establishing shot, do not omit the protagonist, do not replace characters with generic faces, and do not invent a different event. No text, watermark, logo or UI.";
      }
      const sig = (typeof AbortSignal!=="undefined" && AbortSignal.timeout) ? AbortSignal.timeout(30000) : null;
      const txt = await callLLM([{role:"system",content:sys},{role:"user",content:user}], sig, null, {temperature:0.35,maxTokens:450});
      const clean = String(txt||"").trim().replace(/^```[\s\S]*?```$/g,"").replace(/^[\"'`]+|[\"'`]+$/g,"").slice(0,800);
      if(clean) return [clean,cfg.style].filter(Boolean).join(", ");
    }catch(e){}
  }
  if(kind !== "npc"){
    return [shortScenePrompt(), "absolutely no text, no letters, no Chinese characters, no calligraphy, no signs, no banners, no watermark, no UI", cfg.style].filter(Boolean).join(", ");
  }
  return npcImagePrompt(c);
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
  const scope = {worldId:S.worldId,timelineId:S.timelineId};
  const key = "avatar:"+(S.worldId||"local")+":"+(S.timelineId||"main")+":__player__";
  const prompt = await visualPrompt(spec,"npc");
  const data = await qwenGenerate(cfg,prompt,npcNegative(spec),"avatar",seedOf(spec.name+"__player__"));
  await imagePut(key,data);
  while(activeTurn?.committing) await activeTurn.commitPromise;
  if(!currentImageStory(scope)) throw new Error("已切换旅途或时间线");
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
  const scope = {worldId:S.worldId,timelineId:S.timelineId};
  const key = "avatar:"+(S.worldId||"local")+":"+(S.timelineId||"main")+":"+name;
  const prompt = await visualPrompt(c,"npc");
  const data = await qwenGenerate(cfg,prompt,npcNegative(c),"avatar",seedOf(name));
  await imagePut(key,data);
  while(activeTurn?.committing) await activeTurn.commitPromise;
  if(!currentImageStory(scope)) throw new Error("已切换旅途或时间线");
  const character = (S.cast||[]).find(x=>x.name===name || x.profileAliases?.includes(name));
  if(!character) throw new Error("当前旅途中找不到这个角色");
  character.avatarKey = key;
  await saveProgress(true);
  refreshSide();
  return key;
}
const PENDING_IMAGE_KEY = "tavern_pending_image_v1";
let sceneImageBusy = false;
function pendingImageKey(scope){
  return PENDING_IMAGE_KEY+":"+encodeURIComponent(scope.worldId||"local")+":"+encodeURIComponent(scope.timelineId||"main");
}
function currentImageStory(meta){
  return pendingImageKey(S)===pendingImageKey(meta);
}
function clearPendingImage(meta){
  try{
    for(const key of [pendingImageKey(meta),PENDING_IMAGE_KEY]){
      const pending = JSON.parse(localStorage.getItem(key)||"null");
      if(pending?.key===meta.key) localStorage.removeItem(key);
    }
  }catch(error){}
}
async function attachSceneImage(meta,data){
  if(data) await imagePut(meta.key,data);
  while(activeTurn?.committing) await activeTurn.commitPromise;
  if(!currentImageStory(meta)) return false;
  if(!(S.log||[]).some(e=>e?.t==="image" && e.key===meta.key)){
    S.sceneImageKey = meta.key;
    const entry = {t:"image",key:meta.key,alt:"第 "+(meta.startTurn+1)+" 幕配图 · "+meta.sceneLabel};
    S.log = [...(S.log||[]),entry].slice(-120);
    const log = $("log");
    const wasAtBottom = typeof logAtBottom==="function" ? logAtBottom() : true;
    logToDOM(entry);
    if(log && wasAtBottom) log.scrollTop = log.scrollHeight;
  }
  await saveProgress(true,{allowOpening:true,reportError:true});
  clearPendingImage(meta);
  return true;
}
async function generateSceneImage({signal=null}={}){
  const cfg = imageCfg();
  if(!cfg.enabled) throw new Error("请先在「图像设置」里启用图像生成");
  const aborted = ()=>{ const e=new Error("已取消生成"); e.name="AbortError"; return e; };
  const storyId = S.worldId || "local";
  const timelineId = S.timelineId || "main";
  const startTurn = S.turn || 0;
  const startSceneLabel = S.scene || (S.environment && S.environment.place) || "当前场景";
  if(signal && signal.aborted) throw aborted();
  const moment = sceneMoment();
  const sig = seedOf(JSON.stringify({turn:startTurn,scene:S.scene,plot:S.plot,moment:moment.moment.slice(-700),place:moment.place}));
  const variation = Date.now().toString(36).slice(-5)+Math.random().toString(36).slice(2,5);
  const key = "scene:"+storyId+":"+timelineId+":"+startTurn+":"+sig+":"+variation;
  const totalPeople = (S.present||[]).length + 1;
  const countLead = totalPeople>1
    ? "EXACTLY "+totalPeople+" PEOPLE IN FRAME: the protagonist and "+(totalPeople-1)+" other character(s), all fully visible, full body, no missing person. "
    : "ONE PERSON IN FRAME: the protagonist, full body. ";
  if(cfg.llmPrompt) imageToast("正在让 LLM 写视觉提示词……",0);
  const prompt = countLead + await visualPrompt(S,"scene");
  if(cfg.llmPrompt) imageToast("视觉提示词已生成，正在生成图片……",0);
  if(signal && signal.aborted) throw aborted();
  const pendingMeta = {worldId:storyId,timelineId,key,startTurn,sceneLabel:startSceneLabel,createdAt:Date.now()};
  if(!currentImageStory(pendingMeta)) throw aborted();
  const data = await qwenGenerate(cfg,prompt,sceneNegative(),"scene",seedOf(key),signal,promptId=>{
    try{ localStorage.setItem(pendingImageKey(pendingMeta),JSON.stringify({...pendingMeta,promptId})); }catch(error){}
  });
  if(signal?.aborted || !await attachSceneImage(pendingMeta,data)) throw aborted();
  return key;
}
async function resumePendingImage(){
  if(sceneImageBusy) return false;
  let pending;
  try{
    pending = JSON.parse(localStorage.getItem(pendingImageKey(S))||localStorage.getItem(PENDING_IMAGE_KEY)||"null");
  }catch(error){ return false; }
  if(!pending?.promptId) return false;
  if(Date.now()-Number(pending.createdAt||0)>30*60*1000){ clearPendingImage(pending); return false; }
  if(!currentImageStory(pending)) return false;
  const cfg = imageCfg();
  if(!cfg.enabled) return false;
  sceneImageBusy = true;
  try{
    if((S.log||[]).some(e=>e?.t==="image" && e.key===pending.key)){
      await attachSceneImage(pending);
      return true;
    }
    const base = qwenEndpoint(cfg), headers = qwenHeaders(cfg);
    const response = await qwenResponse(await qwenFetch(base+"/history/"+encodeURIComponent(pending.promptId),{headers}));
    const entry = (await response.json())[pending.promptId];
    if(!entry){ setTimeout(resumePendingImage,8000); return true; }
    const image = entry.outputs?.["8"]?.images?.[0];
    if(!image){
      clearPendingImage(pending);
      imageToast("后台生图失败，请重新生成",5000);
      return true;
    }
    const query = new URLSearchParams({filename:image.filename,subfolder:image.subfolder||"",type:image.type||"output"});
    const view = await qwenResponse(await qwenFetch(base+"/view?"+query,{headers}));
    const data = await blobToDataURL(await view.blob());
    if(await attachSceneImage(pending,data)) imageToast("后台生成的配图已补回",4000);
    return true;
  }catch(error){
    setTimeout(resumePendingImage,10000);
    return true;
  }finally{ sceneImageBusy = false; }
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

function showImageSettings(back = showTitle, backLabel = back===showTitle ? "返回首页" : "返回设置"){
  const cfg = imageCfg();
  const card = $("card");
  $("overlay").classList.remove("hidden");
  card.innerHTML = `
    <h1>图像设置</h1>
    <div class="sub">直连 ComfyUI 生成 Qwen Image 2.1 头像和场景配图。剧情里点 🖼，图片会出现在聊天记录中。</div>
    <form class="auth-form" id="image-form" autocomplete="off">
      <label class="check-line"><input type="checkbox" id="image-enabled" ${cfg.enabled?"checked":""}> 启用图像生成</label>
      <label class="check-line"><input type="checkbox" id="image-llm-prompt" ${cfg.llmPrompt?"checked":""}> 让 LLM 写视觉提示词（动作/关系最准，单张多等几秒）</label>
      <div class="form-note">关闭时用本地模板，速度快；开启后先让 LLM 根据当前剧情写生图提示词，动作和人物关系更准，但每张图会多等几秒。</div>
      <label for="image-base">ComfyUI 地址</label>
      <input id="image-base" type="url" maxlength="512" value="${escapeHtml(cfg.address)}" placeholder="http://电脑地址:8189/qwen">
      <label for="image-model">模型名</label>
      <input id="image-model" type="text" maxlength="250" value="${escapeHtml(cfg.model)}">
      <label for="image-mode">生成模式</label>
      <select id="image-mode">
        <option value="20" ${cfg.lora?"":"selected"}>不使用 LoRA · 20 步（画质稳，较慢）</option>
        <option value="4" ${cfg.lora?"selected":""}>使用 Lightning LoRA · 4 步（最快）</option>
      </select>
      <label for="image-user">用户名</label>
      <input id="image-user" type="text" maxlength="120" value="${escapeHtml(cfg.user)}" autocomplete="username">
      <label for="image-pass">密码</label>
      <input id="image-pass" type="password" maxlength="512" autocomplete="current-password" placeholder="${cfg.pass?"留空保留原密码":""}">
      <label for="image-style">头像风格</label>
      <input id="image-style" type="text" maxlength="300" value="${escapeHtml(cfg.style||"")}">
      <div class="form-note" id="image-status" role="status"></div>
      <div class="form-actions">
        <button type="submit" class="big-btn">保存</button>
        <button type="button" class="big-btn ghost" id="image-test">测试连接</button>
        <button type="button" class="big-btn ghost" id="image-back">${backLabel}</button>
      </div>
    </form>`;
  const status = $("image-status");
  const readSettings = ()=>{
    const useLora = $("image-mode").value === "4";
    const next = {...cfg,
      enabled: $("image-enabled").checked,
      llmPrompt: $("image-llm-prompt").checked,
      address: $("image-base").value.trim(),
      model: $("image-model").value.trim(),
      steps: useLora ? 4 : 20,
      lora: useLora,
      user: $("image-user").value.trim(),
      pass: $("image-pass").value,
      style: $("image-style").value.trim()
    };
    if(next.user && !next.pass && next.user===cfg.user && qwenEndpoint(next)===qwenEndpoint(cfg)) next.pass = cfg.pass;
    if(!next.user) next.pass = "";
    return next;
  };
  $("image-back").onclick = back;
  $("image-test").onclick = async ()=>{
    status.textContent = "测试中……";
    try{
      const next = readSettings();
      const base = qwenEndpoint(next);
      const headers = qwenHeaders(next);
      if(!next.model) throw new Error("请填写模型名");
      const missing = await QwenWorkflow.missingModels(async node=>{
        const response = await qwenFetch(base+"/object_info/"+node,{headers});
        if(response.status===404) return null;
        return (await (await qwenResponse(response)).json())[node];
      },{...QwenWorkflow.defaults,unet:next.model,useLora:next.lora});
      if(missing.length) throw new Error("ComfyUI 缺少 "+missing.join("、"));
      status.textContent = "连接成功，Qwen 模型和节点已就绪。";
    }catch(e){ status.textContent = "连接失败："+e.message; }
  };
  $("image-form").onsubmit = (e)=>{
    e.preventDefault();
    let next;
    try{
      next = readSettings();
      if(next.enabled){
        next.address = qwenEndpoint(next);
        if(!next.model) throw new Error("请填写模型名");
      }
    }catch(error){ status.textContent = error.message; return; }
    saveImageCfg(next);
    status.textContent = "已保存。";
    setTimeout(back, 400);
  };
}

async function requestSceneImage(){
  const btn = $("btn-scene-img");
  if(btn.disabled || sceneImageBusy) return;
  if(!imageCfg().enabled){
    showImageSettings(()=>$("overlay").classList.add("hidden"),"返回故事");
    return;
  }
  if(!S || (!S.scene && !S.environment?.place)){
    imageToast("先进入有当前场景的故事，再点 🖼 生成配图。");
    return;
  }
  btn.disabled = true;
  btn.textContent = "…";
  let waited = 0;
  imageToast("正在生成当前场景图，请稍等……",0);
  const progressTimer = setInterval(()=>{
    waited += 10;
    imageToast("正在生成当前场景图，请稍等……已等待 "+waited+" 秒",0);
  },10000);
  try{
    if(await resumePendingImage()) return;
    if(sceneImageBusy) return;
    sceneImageBusy = true;
    await generateSceneImage();
    imageToast("场景图已生成，已插入聊天记录。",3000);
  }catch(e){
    imageToast("生成失败："+e.message,7000);
  }finally{
    clearInterval(progressTimer);
    sceneImageBusy = false;
    btn.disabled = false;
    btn.textContent = "🖼";
  }
}

function showSettings(){
  const card = $("card");
  const activeTheme = currentTheme();
  const themeButtons = THEMES.map(t=>`
    <button type="button" class="theme-btn${t.id===activeTheme?" active":""}" id="theme-${t.id}" data-theme="${t.id}" aria-pressed="${t.id===activeTheme?"true":"false"}">
      <span class="theme-swatches">${t.colors.map(c=>`<i style="background:${c}"></i>`).join("")}</span>
      <span class="theme-name">${escapeHtml(t.name)}</span>
      <span class="theme-desc">${escapeHtml(t.desc)}</span>
    </button>`).join("");
  card.innerHTML = `
    <div class="home">
      <header class="home-header"><h1>设置</h1></header>
      <div class="settings-list">
        <button class="big-btn ghost" id="settings-ai">我的 AI 设置<small>API 地址、模型与密钥</small></button>
        <button class="big-btn ghost" id="settings-image">图像设置<small>Qwen 配图与 ComfyUI 连接</small></button>
      </div>
      <div class="settings-themes">
        <div class="settings-label">界面主题</div>
        <div class="theme-grid" id="theme-grid">${themeButtons}</div>
        <p class="form-note">主题会立即生效，并记住在这台设备上。</p>
      </div>
      <label class="check-line"><input type="checkbox" id="settings-idle-auto" ${idleAutoEnabled()?"checked":""}> 90 秒无操作自动推进剧情（关闭后不会超时结束）</label>
      <label class="check-line"><input type="checkbox" id="settings-story-full" ${storyDetailFull()?"checked":""}> 每幕使用完整叙事规则（更细，切换后下一幕生效）</label>
      <label class="check-line"><input type="checkbox" id="settings-semantic" ${semanticMemoryEnabled()?"checked":""}> 本地语义记忆（首次开启需加载模型，会稍慢）</label>
      <label class="check-line"><input type="checkbox" id="settings-memory-first" ${(typeof memoryFirstForState==="function"?memoryFirstForState(S):memoryFirstEnabled())?"checked":""}> 记忆优先模式（缩短历史上下文，主要依赖数据库召回；长篇自动开启）</label>
      <p class="form-note" id="settings-note" role="status"></p>
      <div class="card-btns">
        <button class="big-btn" id="settings-back">返回酒馆</button>
      </div>
    </div>`;
  $("settings-ai").onclick = ()=>showPersonalAI(showSettings);
  $("settings-image").onclick = ()=>showImageSettings(showSettings);
  for(const t of THEMES){
    const btn = $("theme-"+t.id);
    if(btn) btn.onclick = ()=>{
      applyTheme(t.id);
      const note = $("settings-note");
      if(note) note.textContent = "已切换主题："+t.name+"。";
    };
  }
  $("settings-idle-auto").onchange = e=>{
    setIdleAutoEnabled(e.target.checked);
    if(!e.target.checked) clearIdleTimer();
    $("settings-note").textContent = e.target.checked
      ? "已开启：90 秒无操作会自动推进剧情。"
      : "已关闭：不再自动推进，也不会因沉默超时结束。";
  };
  $("settings-story-full").onchange = e=>{
    setStoryDetailFull(e.target.checked);
    $("settings-note").textContent = e.target.checked
      ? "已开启完整叙事规则：人物、判定与细节更完整，生成会稍慢、消耗更多 token。"
      : "已使用精简规则：更快、更省 token；关键判定、交易和期限仍会自动切回完整规则。";
  };
  $("settings-semantic").onchange = async e=>{
    setSemanticMemory(e.target.checked);
    if(!e.target.checked){
      $("settings-note").textContent = "已关闭本地语义记忆：仍使用人物、关键词和重要性检索。";
      return;
    }
    $("settings-note").textContent = "正在加载本地语义模型，首次可能需要几秒……";
    const ok = await warmSemanticMemory();
    if(!ok){
      $("settings-note").textContent = "本地语义模型加载失败，已保留关键词检索。";
      return;
    }
    $("settings-note").textContent = "语义模型已就绪，正在为旧事件补向量……";
    if(typeof S!=="undefined" && S && typeof tavernWorldId==="function"){
      const n = await backfillEmbeddings(tavernWorldId(S));
      $("settings-note").textContent = n
        ? "语义记忆已开启，已补充 "+n+" 条旧事件。"
        : "语义记忆已开启；新发生的剧情会自动建立语义索引。";
    }else{
      $("settings-note").textContent = "语义记忆已开启。";
    }
  };
  $("settings-memory-first").onchange = e=>{
    setMemoryFirst(e.target.checked);
    $("settings-note").textContent = e.target.checked
      ? "已开启记忆优先：历史对话更短，更多依赖数据库检索，生成通常更快，但细节依赖记忆质量。"
      : "已关闭记忆优先：保留更长的最近对话，上下文更完整。";
  };
  $("settings-back").onclick = showTitle;
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
  const isBookRecord = w=>!!w && (w.isBook === true || (!w.restoredBackup && w.source === "upload" && !w.bookId && !w.turn && !w.finished));
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
  const userBookCells = userBooks.map(w=>`
    <div class="builtin-cell">
      <button class="user-book" data-id="${escapeHtml(w.id)}" data-collection="我的导入">
        <span class="b-name">${escapeHtml(w.name)}</span>
        <span class="b-author">${w.source==="paste"?"我粘贴的":"我导入的"} · 选起点进入剧本</span>
      </button>
      <button class="builtin-ren" data-id="${escapeHtml(w.id)}" data-name="${escapeHtml(w.name)}" aria-label="重命名 ${escapeHtml(w.name)}">✎</button>
      <button class="builtin-del book-del" data-id="${escapeHtml(w.id)}" data-title="${escapeHtml(w.name)}" aria-label="删除 ${escapeHtml(w.name)}">✕</button>
    </div>`).join("");
  const library = isLoggedIn() && (builtins.length || userBooks.length) ? `
    <details class="library">
      <summary>小说剧本 <span>${builtins.length + userBooks.length} 部作品${hiddenCount ? " · 已隐藏 "+hiddenCount+" 本" : ""}</span></summary>
      ${(builtins.length || userBooks.length) ? `
      <label for="builtin-search" class="sr-only">搜索小说或作者</label>
      <input class="library-search" type="search" id="builtin-search" placeholder="搜索书名或作者">
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
  const shelf = isLoggedIn() ? `
    <details class="library" id="journey-shelf" ${journeys.length ? "" : "open"}>
      <summary>我的旅途 <span>${journeys.length} 份记录</span></summary>
      <div class="journey-tools">
        <button class="big-btn ghost" id="journey-restore" type="button">导入旅途备份</button>
        <input type="file" id="restore-journey-file" accept=".json,application/json" hidden>
      </div>
      <div class="world-list">
        ${journeys.length ? journeys.map(w=>{
          const meta = [w.genre,w.finished ? "已完结" : w.turn ? "第 "+w.turn+" 幕" : "尚未开始",w.scene?.slice(0,28)].filter(Boolean);
          return `<div class="world-row">
            <button class="world-open" data-id="${escapeHtml(w.id)}">
              <span class="w-name">${escapeHtml(w.name)}</span>
              <span class="w-meta">${escapeHtml(meta.join(" · "))}</span>
            </button>
            <button class="world-ren" data-id="${escapeHtml(w.id)}" data-name="${escapeHtml(w.name)}" aria-label="重命名 ${escapeHtml(w.name)}">✎</button>
            <button class="world-ren world-backup" data-id="${escapeHtml(w.id)}" type="button" aria-label="备份 ${escapeHtml(w.name)}" title="导出旅途备份"><span class="world-backup-icon" aria-hidden="true"></span></button>
            <button class="world-del" data-id="${escapeHtml(w.id)}" aria-label="删除 ${escapeHtml(w.name)}">✕</button>
          </div>`;
        }).join("") : '<p class="empty">还没有旅途。</p>'}
      </div>
    </details>` : "";
  card.innerHTML = `
    <div class="home">
      <header class="home-header">
        <h1>暗夜酒馆</h1>
        ${isLoggedIn()
          ? '<div class="home-tools home-tools-top"><button class="logout-btn" id="btn-settings">设置</button></div>'
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
  $("btn-scene-img").onclick = requestSceneImage;
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
  $("btn-settings").onclick = showSettings;
  card.querySelectorAll(".world-backup").forEach(btn=>{
    btn.onclick = ()=>menuAction(async()=>{
      const {saved,missingImages} = await exportJourneyBackup(btn.dataset.id);
      if(stillHere()) menuNote(saved
        ? (missingImages ? "已导出旅途备份。原存档已有 "+missingImages+" 张图片缺失。" : "已导出旅途备份。")
        : "已取消导出。");
    },"正在整理旅途备份……");
  });
  if($("btn-return")) $("btn-return").onclick = ()=>enterStory();
  if($("btn-continue")) $("btn-continue").onclick = ()=>menuAction(()=>loadWorld(latest.id,stillHere));
  $("btn-ai").onclick = ()=>showGenreSelect();
  $("btn-import").onclick = ()=>$("file-input").click();
  $("journey-restore").onclick = ()=>$("restore-journey-file").click();
  $("restore-journey-file").onchange = event=>{
    const file = event.target.files?.[0];
    event.target.value = "";
    if(!file) return;
    menuAction(async()=>{
      if(file.size>TAVERN_BACKUP_MAX_BYTES) throw new Error("请选择 48 MB 以内的备份文件");
      const backup = parseJourneyBackup(await file.text());
      const world = await restoreJourneyBackup(backup);
      if(!stillHere()) return;
      await showTitle();
      const shelf = $("journey-shelf");
      if(shelf) shelf.open = true;
      menuNote("已恢复「"+world.name+"」。"+(backup.legacy ? "旧备份只包含当时的旅途进度。":""));
    },"正在恢复旅途……");
  };
  $("file-input").onchange = e=>{
    const file = e.target.files?.[0];
    e.target.value = "";
    if(!file) return;
    menuAction(async ()=>{
      if(file.size>20*1024*1024) throw new Error("文件过大，请选择 20 MB 以内的 TXT 或 Markdown 文件。");
      let text = (await readFileText(file, pct=>imageToast("正在读取文件 "+pct+"%",0))).trim();
      if(!text) throw new Error("文件为空，请选择有内容的文档。");
      if(text.length>3000000) throw new Error("设定超过 300 万字符，请先截取需要的章节。");
      await autoImportToShelf(file.name, text);
    },"正在读取文件……");
  };
  card.querySelectorAll(".world-open").forEach(btn=>{
    btn.onclick = ()=>menuAction(()=>loadWorld(btn.dataset.id,stillHere));
  });
  card.querySelectorAll(".world-ren:not(.world-backup)").forEach(btn=>{
    btn.onclick = ()=>renameWorld(btn.dataset.id,btn.dataset.name);
  });
  card.querySelectorAll(".world-del").forEach(btn=>{
    btn.onclick = ()=>{
      if(!confirm("删除这份旅途及其存档？\n小说剧本里的原文不会被删除。")) return;
      menuAction(async ()=>{
        await saveQueue;
        await api("/api/worlds/delete",{method:"POST",body:{id:btn.dataset.id},token:owner});
        if(typeof dbDeleteWorld==="function") dbDeleteWorld(btn.dataset.id).catch(()=>{});
        if(typeof deleteTimelineSnapshots==="function") deleteTimelineSnapshots(btn.dataset.id);
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
      if(btn.classList.contains("book-del")){
        if(!confirm("彻底删除小说剧本《"+title+"》？\n与它关联的旅途和存档也会删除，原文无法恢复。")) return;
        menuAction(async ()=>{
          await api("/api/worlds/delete-book",{method:"POST",body:{id:btn.dataset.id},token:owner});
          if(!stillHere()) return;
          if(S.bookId===btn.dataset.id) S = DEFAULT_STATE();
          showTitle();
        },"正在删除书目……");
        return;
      }
      if(!confirm("从书库移除《"+title+"》？\n已创建的旅途存档不会删除。")) return;
      hideBook(btn.dataset.id);
      showTitle();
    };
  });
  const restore = $("restore-books");
  if(restore) restore.onclick = ()=>{ restoreHiddenBooks(); showTitle(); };
  const search = $("builtin-search");
  if(search){
    const items = [...card.querySelectorAll(".builtin-item,.user-book")];
    const filterBooks = ()=>{
      const query = search.value.trim().toLowerCase();
      let count = 0;
      items.forEach(btn=>{
        const cell = btn.closest(".builtin-cell");
        const hide = !btn.textContent.toLowerCase().includes(query);
        if(cell) cell.hidden = hide; else btn.hidden = hide;
        if(!hide) count++;
      });
      $("search-empty").hidden = count!==0;
    };
    search.oninput = filterBooks;
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
  "日常": { label:"日常", beat:"关系里的真实变化、生活细节、人物心情、习惯与小选择", avoid:"可以琐碎，但优先关系和日常质感；不要用送货车、搬东西、邻居求助、工作、账单或催婚连续制造事件，两幕内最多一个轻钩子。" },
  "随机": { label:"随机", beat:"当前世界已建立的核心规则、人物利益与叙事骨架", avoid:"先按已出现的人物、地点和类型判断冲突来源，不要用与故事无关的日常琐事填时间。" }
};
function genreConflictProfile(state){
  if(state.genre==="日常") return GENRE_CONFLICT_PROFILES["日常"];
  if(isRomanceMode(state)) return { label:"恋爱", beat:"心动、试探、坦白、承诺、失约、旧伤、共同经历、和解或离别", avoid:"不要用房租、账单、算账、买菜、邻居闲话、世俗眼光、流言蜚语、催婚逼婚当反复出现的主要事件。" };
  if(state.genre && GENRE_CONFLICT_PROFILES[state.genre]) return GENRE_CONFLICT_PROFILES[state.genre];
  return { label:"本故事", beat:"已建立的目标、人物利益、世界规则与眼前阻力", avoid:"不要用与当前类型和人物无关的日常琐事填时间。" };
}
function genreConflictLine(state){
  const p = genreConflictProfile(state);
  return "【类型冲突】本故事按「"+p.label+"」设置冲突：事件应来自"+p.beat+"。"+p.avoid+"冲突要接在已发生的人物、地点和选择上，并改变玩家眼前的目标或关系。";
}
function genrePlaybookLine(state){
  const rules = {
    "恐怖": "避免把恐怖写成固定套路：不要反复用「黑影+指甲刮擦+突然跳脸/怪物扑出」。优先用环境异常（温度、气味、光线、物件位置、时间错位）、规则禁忌（不能回头、不能应声、必须留灯、不能说出名字）、缺席感（人不见了但生活痕迹继续）和声音方向错误。威胁每 2~3 幕只升级一类，留下可追踪的迹象和可推断的规则；让玩家通过观察与选择理解规则，不靠血腥或 jump scare 堆砌。",
    "悬疑": "每幕最多新增 1~2 条真正被玩家发现或验证的线索，不要连续两幕各塞 3~5 条。每条线索写清来源、可核查方式和可信度；证词可能撒谎、记录可能缺失、物证可能被摆弄，未验证的只是说法，不能当事实。优先让玩家验证、比对、对质，再给新线索；不要用旁白直接揭晓答案。",
    "日常": "本类型以关系、生活细节和人物心情为主。不要用送货车、搬东西、邻居求助、工作、账单或催婚等外部钩子连续推动剧情；两幕内最多一个轻钩子，其余交给相处、习惯、空间、饮食、天气和小选择。冲突可以从关系或生活细节里自然长出，但不要两幕就堆事件。",
    "武侠": "交锋结果必须由双方武力、相关技能、属性、准备和伤势决定，不能只写气氛；每次交锋至少让一项属性或技能实际影响成败或代价。体力损失按结果、招式和防御结算，不要固定扣 6 点。"
  };
  const text = rules[genreConflictProfile(state).label];
  return text ? "【类型执行规则】"+text : "";
}
const GENRE_OPENING_LINES = {
  "悬疑": "先给一个具体、可调查的异常：谁发现了什么、哪里对不上；给玩家至少一个能查看、核对或对质的具体对象，不要先揭答案。",
  "奇幻": "让玩家直接碰到一条具体的魔法/契约/遗迹规则，并显出它的代价或禁忌；不要用现代日常纠纷开场。",
  "武侠": "开场落在江湖立场或规矩上：谁在逼谁、欠谁人情、哪条道被封；给玩家一个要当场表态或动手的处境。",
  "科幻": "用一个具体的系统/协议/资源故障影响玩家，给出可操作的技术或制度选择；不要用古代家务开场。",
  "恐怖": "用一个可追踪的具体异常迹象建立压迫（声音、痕迹、失踪、灯灭）；不要一次性揭示怪物或原因。",
  "恋爱": "开场必须先建立关系张力：一个让玩家在意或心动的人、一次试探/重逢/暧昧/疏远。chapter.goal 必须写成关系目标（例如「弄清她为什么突然疏远」「在今晚的相处里让彼此把话说明白」），不得出现查案、旧案、旧怨、真相、凶手、委托、差事、守夜、送货、工作等词；给玩家靠近、试探、退开或表明态度的选择。",
  "末日": "开场立刻让资源、防线或污染的具体缺口影响玩家，给出争夺、节省或冒险的选择；不要用稳定日常开场。",
  "日常": "开场必须是一个具体、可参与的生活场景：地点、时间、人在做什么、眼前的小选择。chapter.goal 必须写成生活/关系目标（例如「把空房收拾出来，和邻居吃顿饭」「弄清掌柜今天为什么心不在焉」），不得把送货、接活、买卖、差事、营生作为主目标，也不要用死亡、失踪、凶案、怪物或恐怖事件开场；最多一个轻钩子。",
  "随机": "先按已建立的世界与人物给一个具体目标和阻力，停在玩家能马上行动的地方；不要用与设定无关的琐事开场。"
};
function genreOpeningLine(state){
  if(!state || state.world || state.turn || !state.genre) return "";
  const line = GENRE_OPENING_LINES[state.genre];
  return line ? "【类型开场】"+line : "";
}
const DAILY_HEAVY_RE = /死者|尸体|凶案|命案|谋杀|血案|惨死|分尸|鬼|怪物|恐怖|绑架|丧尸/;
const DAILY_CUE_RE = /茶|饭|酒馆|店里|街|雨|窗|桌|灯|邻居|掌柜|伙计|客人|收拾|做饭|闲聊|作息|睡|醒|灶|汤|碗/;
const DAILY_WORK_RE = /送货|接活|差事|买卖|雇佣|搬货|委托|任务|报酬|上工|看船|守夜|营生|活计|浆洗|旧账|还债|还钱|工钱|做活|零工|找活/;
const ROMANCE_CUE_RE = /心动|喜欢|暧昧|想念|重逢|旧情|亲近|表白|约会|情意|脸红|心跳|拥抱|牵手|目光|靠近|试探|疏远|在意|回来|离开|留下|见面/;
const ROMANCE_GOAL_BAD_RE = /守夜|看船|差事|活儿|工作|接活|送货|买卖|委托|任务|报酬|上工|调查|追查|查清|查明|真相|案|凶手|旧怨|仇|底细/;
function openingGenreIssue(scene,state){
  if(!scene || scene.prose || scene.ending || !state || state.turn || !state.ai || state.world || !state.genre) return "";
  const text = [scene.narration,scene.summary,scene.advance,
    scene.plot?.goal,scene.plot?.conflict,scene.plot?.next,
    scene.chapter?.goal,scene.chapter?.stakes,
    ...(scene.lines||[]).map(l=>l && l.text),
    ...(scene.choices||[]).map(c=>c && c.text)
  ].filter(Boolean).join(" ");
  const goalText = [scene.chapter?.goal,scene.plot?.goal,scene.plot?.conflict].filter(Boolean).join(" ");
  if(state.genre==="日常"){
    if(DAILY_HEAVY_RE.test(text)){
      return "日常开场不能以死亡、凶案、失踪、怪物或恐怖事件开场。请改成一个具体、可参与的生活场景（地点、时间、人在做什么），最多埋一个轻钩子（邻里传闻、旧物、小误会），再给 2~3 个生活化的选择。";
    }
    if(DAILY_WORK_RE.test(goalText)){
      return "日常开场不要把送货、接活、买卖、差事或营生作为主目标。请先写人物相处和生活场景，钩子最多是邻里传闻、旧物或小误会；营生只放在背景里。";
    }
    if(!DAILY_CUE_RE.test(text)){
      return "日常开场需要落到具体的生活场景与人物相处（茶饭、酒馆、街坊、收拾、天气、作息等），不要先抛悬疑或外部事件。";
    }
  }
  if(state.genre==="恋爱"){
    if(ROMANCE_GOAL_BAD_RE.test(goalText) || !ROMANCE_CUE_RE.test(goalText)){
      return "恋爱开场必须先建立关系张力：一个让玩家在意或心动的人、一次试探/重逢/暧昧/疏远；主目标必须是关系本身，不能是守夜、送货、接活、差事、委托或查案。请重写开场。";
    }
  }
  return "";
}
function genreMoralityLine(state){
  if(isRomanceMode(state)){
    if(relationshipModeOf(state)==="open"){
      return "【道德基线】人是复杂的，不要把所有 NPC 写成道德圣人。恋爱类型里的道德更多体现在诚实、边界、知情同意与承担，而不是身体忠诚或排他；开放关系不是道德缺陷。角色可以有自私、旧错、犹豫或灰色过去，也可以坦率地只想要身体关系。";
    }
    return "【道德基线】人是复杂的，不要把所有 NPC 写成道德圣人。恋爱类型里的道德更多体现在忠诚、边界、诚实与承担，而不是一律善良；角色可以有自私、占有欲、旧错或灰色过去。";
  }
  const genre = state.genre || "";
  const profiles = {
    "武侠": "江湖不是现代法治社会。侠客守的是自己的义，不是官府律法；镖师、捕快、杀手、山贼、帮派各有底线，杀人、灭口、寻仇在这个类型里可以是真实选项。NPC 是否动手取决于关系、命令、利益、威胁和后果，不会仅因「杀人不对」就集体拒绝。moral 0 只是中性，不要默认 60 以上；侠客可有 10~50，冷血杀手/山贼可为负值。",
    "末日": "生存压力会压低道德门槛。抢物资、弃伤者、先开枪都可能发生；不要把幸存者写成互相礼让的圣人。moral 可普遍偏低，只有少数人仍坚持底线。",
    "恐怖": "恐惧会让人自私、撒谎、推别人出去挡刀。NPC 不一定高尚，也不一定勇敢；moral 高低只影响他们在危机中先救谁。",
    "悬疑": "嫌疑人、证人、警察和罪犯都有各自的道德底线。不要默认所有 NPC 都配合调查或拒绝暴力；有人会撒谎、灭口、收钱闭嘴。",
    "奇幻": "不同种族、教会、佣兵团和宫廷有自己的道德秩序。善神信徒也可能排外，傭兵可以为钱杀人；不要用统一现代道德衡量所有人。",
    "科幻": "公司、殖民地、AI 和佣兵有自己的规则。违约、回收、清除证人可能是职业行为；道德高低不等于是否守法或是否服从命令。",
    "日常": "可以温和，但人物仍有私心、偏见和难处；不要把所有冲突都写成礼貌退让。"
  };
  const text = profiles[genre] || "这个世界有自己的法律、阶层和生存规则，人物有不同道德底线。不要默认所有 NPC 都道德高尚，也不要用现代道德观强行阻止符合时代与身份的暴力、欺骗或灰色行为；moral 0 是中性，不是坏人值。";
  return "【道德基线】"+text+" moral 只影响角色对伤害、欺骗和杀戮的心理门槛，不等于「好人值」；低道德角色会主动作恶，高道德角色也可能因立场、命令或恐惧而动手。";
}

function genreCombatLine(state){
  const p = typeof combatProfileFor==="function" ? combatProfileFor(state) : null;
  if(!p) return "";
  return "【武力与绝技系统】本故事有明确的武力体系："+p.power+"、"+p.energy+"与"+p.technique+"。玩家首次开场用 playerCombat:{power,energy,energyMax,techniques:[{name,desc,cost,power}]} 初始化；主要人物首次登场用 characters[].combat 给出各自不同的武力和至少一项拿手招式。绝技不是人人都会，消耗"+p.energy+"且有代价/冷却；普通人可以不会武功，但高手、镖师、杀手、门派弟子应该有明显武力。切磋、追杀、护人、偷袭等用 check:{attr:\"武力\"} 或具体技能裁定，按双方武力、伤势、准备和环境计算，不要让所有 NPC 都拒绝使用武力；effects 可用 qi 扣内力、combatPower 调整武力。武力差距必须体现在结果里：差 20 以上要有明显优劣，差 40 以上低手正面硬拼应近乎必败；绝技可以越级但必须有内力消耗、伤势或后患，绝不能让普通人和高手五五开。";
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
  return "无限模式：当前不在剧情节拍上。让时间自然流动，写关系余温、环境细节、人物的闲谈或玩家自己的打算；不要把日常写成打工、采购、算账清单；"
    +"不要为了热闹硬塞新麻烦、工作、跑腿、房租、账单、流言、催婚、陌生人求助或鸡毛蒜皮的意外。只有玩家主动行动、主动寻找冲突，或时间到达下一个 4~6 小时节拍时，才引入新的实质事件。";
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
      <div class="enter-preview" id="enter-preview"></div>
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
  const range = $("enter-range"), label = $("enter-pct-label"), preview = $("enter-preview");
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
  function renderPreview(){
    if(!preview) return;
    const cut = Math.max(0, Math.min(text.length, position()));
    if(!text){
      preview.textContent = "原文为空，无法预览。";
      return;
    }
    const start = Math.max(0, cut-55);
    const end = Math.min(text.length, cut+130);
    const before = text.slice(start, cut).replace(/\s+/g," ").trim();
    const after = text.slice(cut, end).replace(/\s+/g," ").trim();
    preview.textContent = (before ? "……"+before+" " : "") + "【从这里开始】" + after + (end<text.length ? "……" : "");
  }
  function updatePreview(){
    if(useChapter()){
      const c = chapters[Number(chapterSel.value)] || chapters[0];
      if(label) label.textContent = c ? c.title : "按章回";
      renderPreview();
      return;
    }
    const pct = Number(range.value);
    if(label) label.textContent = pct===0 ? "从头开始" : "选段的 "+pct+"%";
    renderPreview();
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

async function enrichRoleCards(full, roles, context, signal){
  const missing = roles.some(r=>!Number.isFinite(Number(r.age)) || !String(r.appearance||"").trim());
  if(!missing) return roles;
  const sys = `你是人物设定助手。根据给出的角色姓名、身份、性格和原文片段，补全缺失的年龄、外貌、衣着、身高、体重。只输出 JSON：{"roles":[{"name":"原名","age":30,"appearance":"发型发色、眼睛、肤色、体型、疤痕或非人特征","outfit":"衣着与装备","height":170,"weight":65}]}。不得改名、改性别或改身份；原文没有明确时按时代、职业、处境合理推断，不要所有角色同岁或同一副外貌。`;
  try{
    const content = await callLLM([
      {role:"system",content:sys},
      {role:"user",content:JSON.stringify({roles,excerpt:String(context||"").slice(-6000)})}
    ], signal, null, {temperature:0.35});
    const parsed = extractJSON(content);
    const map = new Map((Array.isArray(parsed?.roles)?parsed.roles:[]).filter(r=>r&&r.name).map(r=>[r.name,r]));
    return roles.map(r=>{
      const e = map.get(r.name) || {};
      return {
        ...r,
        age:Number.isFinite(Number(r.age))&&Number(r.age)>0 ? r.age : (Number.isFinite(Number(e.age))&&Number(e.age)>0 ? Math.round(Number(e.age)) : r.age),
        appearance:String(r.appearance||"").trim() || String(e.appearance||"").slice(0,300),
        outfit:String(r.outfit||"").trim() || String(e.outfit||"").slice(0,200),
        height:r.height || (Number.isFinite(Number(e.height)) ? Math.round(Number(e.height)) : undefined),
        weight:r.weight || (Number.isFinite(Number(e.weight)) ? Math.round(Number(e.weight)) : undefined)
      };
    });
  }catch(e){ return roles; }
}

/* 根据前文让 AI 生成可扮演的角色卡 */
async function showRoleCards(full, beforeText, stillHere, statusEl, opts = {}){
  const card = $("card");
  const token = AUTH.token;
  const before = beforeText.trim();
  const context = before ? before.slice(-18000) : (full.text||"").slice(0,18000);
  const entryContext = opts.entryTitle
    ? "\n选择的起点："+opts.entryTitle+"。只按起点附近的正文选角，不提前引入后文人物。\n"
      +full.text.slice(Number(opts.windowStart)||0,(Number(opts.windowStart)||0)+1200)
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
{"roles":[{"name":"角色姓名（原著真实人物）","gender":"男/女（按原著判断）","species":"人类/动物/外星人/妖怪/机械等","age":年龄整数,"height":身高cm整数,"weight":体重kg整数,"appearance":"发型发色、眼睛、肤色、体型、疤痕/义肢/非人特征","outfit":"当前衣着与随身装备","identity":"身份与处境（一句话）","personality":"性格与语气特点（一句话）","hook":"以该角色进入时的开场切入点（一句话，紧接前文结尾）","attrs":{"iq":50,"physique":50,"charm":50,"willpower":50,"agility":50},"income":每日收入（整数，按原著时代与身份）,"coin":初始资金（整数，按原著时代与身份）}]}
要求：
- 给出 3 到 6 个可以扮演的角色，优先选原著中在前文里已登场、有分量、能推动故事的人物。
- 姓名必须来自原著，不得编造原著没有的核心人物，不得改名。
- gender 必须按原著判断（男/女），不得弄错。
- income（每日收入）与 coin（初始资金）要按原著的时代、身份与家境给合理数值，不同角色差别明显。
- age、height、weight、appearance、outfit 要按原著人物与时代判断；原文没明说时合理推断，但不要默认 28 岁，也不要把所有角色写成同一副外貌和身材；年龄未知就省略，不要写 0 岁。
- attrs 是五项初始属性（0~100 绝对值）：iq 智商、physique 体质、charm 魅力、willpower 意志、agility 敏捷。按原著人物的身体、头脑、性情给不同数值，禁止所有人都写 50；文弱书生体质可 25~40，武将/武人 65~85，狡黠人物敏捷可 65~85，意志坚强者 65~85。属性要能体现人物差异，但不要人人都全能。
- 身份、性格、语气必须忠于原著。
- hook 要承接前文结尾的处境，让玩家以该角色自然进入。
----- 前文开始 -----
${context}
----- 前文结束 -----${entryContext}`;
  let roles = [];
  const roleKey = (full.id||full.title||"book")+"::"+(Number(opts.windowStart)||0);
  const roleStoreKey = "tavern_role_cards_v1:"+roleKey;
  if(!roleCardCache.has(roleKey)){
    try{ const saved=JSON.parse(localStorage.getItem(roleStoreKey)||"null"); if(Array.isArray(saved)) roleCardCache.set(roleKey,saved); }catch(e){}
  }
  if(roleCardCache.has(roleKey)) roles = roleCardCache.get(roleKey);
  // 有原文「故事圣经」时，直接用原著真实人物做角色卡，不再让 AI 现编
  const nearbyStart = Math.max(0,(Number(opts.windowStart)||0)-2000);
  const nearbyText = opts.entryTitle ? full.text.slice(nearbyStart,nearbyStart+1800) : full.text.slice(0,18000);
  if(!roles.length && full.bible && Array.isArray(full.bible.characters) && full.bible.characters.length){
    const nearbyRoles = full.bible.characters.filter(c=>c && c.name && nearbyText.includes(c.name));
    const source = nearbyRoles.length ? nearbyRoles : (opts.entryTitle ? [] : full.bible.characters);
    roles = source.slice(0,6).map(c=>({
      name:c.name, gender:c.gender||"", species:c.species||"", age:c.age,
      height:c.height, weight:c.weight, appearance:c.appearance||"", outfit:c.outfit||"", origin:c.origin||"",
      identity:c.identity||"", personality:c.personality||"", attrs:normalizeStartAttrs(c.attrs)||undefined,
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
      ], signal.signal, null, {temperature:0.3});
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
  if(roles.length){
    status.textContent = "正在补全人物外貌与年龄……";
    roles = await enrichRoleCards(full,roles,full.text||"",signal.signal);
    roleCardCache.set(roleKey, roles);
    try{ localStorage.setItem(roleStoreKey, JSON.stringify(roles)); }catch(e){}
  }
  if(!roles.length){
    status.textContent = "没有解析出角色，请返回重试。";
    return;
  }
  status.textContent = "选择你要扮演的角色：";
  const wrap = $("role-cards");
  const saveRoles = ()=>{
    roleCardCache.set(roleKey, roles);
    try{ localStorage.setItem(roleStoreKey, JSON.stringify(roles)); }catch(e){}
  };
  function showRoleEditor(index){
    const r = roles[index];
    if(!r) return;
    const at = r.attrs || {iq:50,physique:50,charm:50,willpower:50,agility:50};
    status.textContent = "修订「"+(r.name||"角色")+"」的设定：";
    wrap.innerHTML = `
      <div class="role-editor">
        <label>姓名<input id="re-name" maxlength="60" value="${escapeHtml(String(r.name||""))}"></label>
        <div class="role-edit-row"><label>性别<input id="re-gender" maxlength="10" value="${escapeHtml(String(r.gender||""))}"></label><label>年龄<input id="re-age" type="number" min="1" max="200" value="${Number.isFinite(Number(r.age))?Number(r.age):""}"></label></div>
        <div class="role-edit-row"><label>身高 cm<input id="re-height" type="number" min="30" max="300" value="${Number.isFinite(Number(r.height))?Number(r.height):""}"></label><label>体重 kg<input id="re-weight" type="number" min="2" max="500" value="${Number.isFinite(Number(r.weight))?Number(r.weight):""}"></label></div>
        <label>身份<input id="re-identity" maxlength="200" value="${escapeHtml(String(r.identity||""))}"></label>
        <label>性格<input id="re-personality" maxlength="200" value="${escapeHtml(String(r.personality||""))}"></label>
        <label>外貌<input id="re-appearance" maxlength="300" value="${escapeHtml(String(r.appearance||""))}"></label>
        <label>衣着<input id="re-outfit" maxlength="200" value="${escapeHtml(String(r.outfit||""))}"></label>
        <label>出身<input id="re-origin" maxlength="120" value="${escapeHtml(String(r.origin||""))}"></label>
        <div class="role-edit-attrs">
          <label>智商<input id="re-iq" type="number" min="0" max="100" value="${at.iq??50}"></label>
          <label>体质<input id="re-physique" type="number" min="0" max="100" value="${at.physique??50}"></label>
          <label>魅力<input id="re-charm" type="number" min="0" max="100" value="${at.charm??50}"></label>
          <label>意志<input id="re-willpower" type="number" min="0" max="100" value="${at.willpower??50}"></label>
          <label>敏捷<input id="re-agility" type="number" min="0" max="100" value="${at.agility??50}"></label>
        </div>
        <div class="card-btns"><button class="big-btn" id="re-save">保存修订</button><button class="big-btn ghost" id="re-cancel">取消</button></div>
      </div>`;
    $("re-cancel").onclick = renderRoleList;
    $("re-save").onclick = ()=>{
      const name = $("re-name").value.trim();
      if(!name){ status.textContent = "姓名不能为空。"; return; }
      const num = (id,min,max)=>{ const n = Number($(id).value); return Number.isFinite(n) ? Math.max(min,Math.min(max,Math.round(n))) : undefined; };
      roles[index] = {...r, name,
        gender:$("re-gender").value.trim(), age:num("re-age",1,200),
        height:num("re-height",30,300), weight:num("re-weight",2,500),
        identity:$("re-identity").value.trim(), personality:$("re-personality").value.trim(),
        appearance:$("re-appearance").value.trim(), outfit:$("re-outfit").value.trim(),
        origin:$("re-origin").value.trim(),
        attrs:{iq:num("re-iq",0,100)??50,physique:num("re-physique",0,100)??50,charm:num("re-charm",0,100)??50,willpower:num("re-willpower",0,100)??50,agility:num("re-agility",0,100)??50}
      };
      saveRoles();
      renderRoleList();
    };
  }
  function renderRoleList(){
    status.textContent = "选择你要扮演的角色：";
    wrap.innerHTML = "";
    roles.slice(0,6).forEach((r,index)=>{
      const btn = document.createElement("button");
      btn.className = "role-card";
      btn.innerHTML = '<span class="rc-edit">修订</span><div class="rc-head"><span class="rc-name">'+escapeHtml(String(r.name))+'</span>'
        + '<span class="rc-role">'+escapeHtml([r.identity,Number.isFinite(Number(r.age))?Number(r.age)+"岁":""].filter(Boolean).join(" · "))+'</span></div>'
        + '<div class="rc-desc">'+escapeHtml(String(r.personality||""))+'</div>'
        + (r.hook ? '<div class="rc-open">入场：'+escapeHtml(String(r.hook))+'</div>' : "");
      btn.onclick = async (e)=>{
        if(e.target.closest(".rc-edit")){ showRoleEditor(index); return; }
        wrap.querySelectorAll(".role-card").forEach(b=>b.disabled=true);
        $("btn-back").disabled = true;
        status.textContent = "正在进入故事……";
        const role = {name:String(r.name), gender:String(r.gender||""), species:String(r.species||""), origin:String(r.origin||""), age:Number.isFinite(Number(r.age))&&Number(r.age)>0?Math.round(Number(r.age)):undefined, height:Number.isFinite(Number(r.height))?Math.max(30,Math.round(Number(r.height))):undefined, weight:Number.isFinite(Number(r.weight))?Math.max(2,Math.round(Number(r.weight))):undefined, appearance:String(r.appearance||""), outfit:String(r.outfit||""), identity:String(r.identity||""), personality:String(r.personality||""), hook:String(r.hook||""), attrs:normalizeStartAttrs(r.attrs)||undefined, income:Number.isFinite(Number(r.income))?Math.max(0,Math.round(Number(r.income))):undefined, coin:Number.isFinite(Number(r.coin))?Math.max(0,Math.round(Number(r.coin))):undefined};
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
  renderRoleList();
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
{"summary":"本段剧情梗概（200~400字）","characters":[{"name":"人物姓名（原文真实姓名）","gender":"男/女","species":"人类/动物/妖怪/机械等","age":30,"height":170,"weight":65,"identity":"身份与处境","job":"职业或谋生方式","appearance":"发型发色、眼睛、肤色、体型、疤痕等可观察特征","outfit":"当前衣着与随身装备","origin":"地域/族裔/时代","personality":"性格","voice":"说话习惯/称呼","goal":"动机","status":"感情/婚姻状态","attitude":"对主要人物的态度","knows":"此人目前知道的关键事实","wealth":"财产状况","coin":0,"rep":0,"moral":0,"wanted":0,"attrs":{"iq":0,"physique":0,"charm":0,"willpower":0,"agility":0}}],"relationships":[{"a":"人物A","b":"人物B","relation":"亲属/朋友/恋人/夫妻/仇敌/主仆等","aff":0,"desire":0}],"foreshadowing":["伏笔或未解线索"],"timeline":["关键事件"]}
要求：姓名必须来自原文；没有的字段可省略，年龄未知就省略或写 null，绝不能写 0 岁；aff/desire 是 0~100 的估计；attrs 是五项属性 0~100 的绝对值，按人物身体、头脑、性情给不同数值，不要全部写 50；不要编造原文没有的核心人物。`;
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
  if(onProgress) onProgress("正在分析 "+totalChunks+" 段（3 路并行）……",0,totalChunks);
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
      if(onProgress) onProgress("已完成 "+doneChunks+"/"+totalChunks+" 段……",doneChunks,totalChunks);
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
  if(onProgress) onProgress("正在整理全书概要……",totalChunks,totalChunks);
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

function readFileText(file,onProgress){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onprogress = event=>{ if(event.lengthComputable) onProgress?.(Math.round(event.loaded/event.total*100)); };
    reader.onload = ()=>resolve(String(reader.result||""));
    reader.onerror = ()=>reject(reader.error||new Error("文件读取失败"));
    reader.readAsText(file);
  });
}
function importTitleFromFile(fileName){
  const base = String(fileName||"").replace(/^.*[\\/]/,"").replace(/\.[^.]+$/,"").trim();
  return (base || "我的小说").slice(0,120);
}
async function autoImportToShelf(fileName,text,explicitTitle=""){
  const title = String(explicitTitle||"").trim().slice(0,120) || importTitleFromFile(fileName);
  const token = AUTH.token;
  try{ imageToast("",1); }catch(e){}
  const card = $("card");
  $("overlay").classList.remove("hidden");
  card.innerHTML = `
    <div class="home">
      <header class="home-header"><h1>正在导入</h1></header>
      <p class="sub">已读取《${escapeHtml(title)}》${Math.round(text.length/1000)}k 字。系统会自动分析并加入「小说剧本」；可以先返回酒馆，任务会在后台继续。</p>
      <div class="import-progress" style="height:9px;background:rgba(255,255,255,.14);border-radius:999px;overflow:hidden;margin:10px 0 6px"><div class="import-progress-fill" id="auto-import-bar" style="height:100%;width:2%;background:linear-gradient(90deg,#c9a227,#f4d35e);transition:width .25s"></div></div>
      <p class="form-note" id="auto-import-status" role="status">正在准备……</p>
      <div class="card-btns"><button class="big-btn ghost" id="auto-import-back" type="button">返回酒馆（后台继续）</button></div>
    </div>`;
  const status = $("auto-import-status");
  const bar = $("auto-import-bar");
  let progress = 0;
  const toast = document.createElement("div");
  toast.id = "import-toast";
  toast.className = "import-toast";
  toast.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:26px;width:min(92vw,430px);z-index:9999;padding:12px 14px;border-radius:14px;background:rgba(20,18,24,.95);color:#f5e9c8;box-shadow:0 8px 30px rgba(0,0,0,.45);font-size:13px;line-height:1.4;";
  toast.innerHTML = '<div class="import-toast-label" style="margin-bottom:8px">正在导入……</div><div class="import-progress" style="height:9px;background:rgba(255,255,255,.14);border-radius:999px;overflow:hidden"><div class="import-progress-fill" id="import-toast-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#c9a227,#f4d35e);transition:width .25s"></div></div>';
  document.body.appendChild(toast);
  const toastLabel = toast.querySelector(".import-toast-label");
  const toastBar = $("#import-toast-bar");
  let detached = false;
  const setProgress = (pct,message)=>{
    progress = Math.max(progress, Math.min(100, Math.round(Number(pct)||0)));
    if(bar) bar.style.width = progress+"%";
    if(toastBar) toastBar.style.width = progress+"%";
    if(status) status.textContent = message || "正在导入……";
    if(toastLabel) toastLabel.textContent = (detached ? "后台导入：" : "正在导入：") + (message || "正在导入……") + "（" + progress + "%）";
  };
  const finishProgress = (message,failed)=>{
    setProgress(failed ? progress : 100, message);
    setTimeout(()=>{ try{ toast.remove(); }catch(e){} }, failed ? 6000 : 3500);
  };
  const here = ()=>AUTH.token===token && $("auto-import-status")===status;
  const back = $("auto-import-back");
  if(back) back.onclick = ()=>{ detached = true; showTitle(); };
  let bible = null, summary = "";
  try{
    setProgress(3, "正在生成故事圣经……");
    bible = await generateWorldBible(text, (msg,done,total)=>{
      const pct = total ? 5 + Math.round((done/total)*78) : 8;
      setProgress(pct, msg || "正在生成故事圣经……");
    });
    summary = (bible && bible.summary) || "";
  }catch(e){
    try{
      setProgress(83, "故事圣经生成失败，正在生成全书概要……");
      summary = await generateWorldSummary(text, msg=>{
        setProgress(88, msg || "正在生成全书概要……");
      });
    }catch(e2){
      setProgress(90, "自动分析失败，将直接保存原文……");
    }
  }
  if(AUTH.token !== token){ try{ toast.remove(); }catch(e){} return; }
  setProgress(94, "正在写入书架……");
  try{
    setProgress(95, "正在写入书架……");
    const {world} = await api("/api/worlds",{method:"POST",body:{
      name:title,text,genre:guessImportGenre(text),source:"upload",createNew:false,
      summary,title,windowStart:0,infiniteMode:false,bible,isBook:true
    }});
    if(!world) throw new Error("书架没有返回这本书");
    setProgress(97, "正在整理书架……");
    await api("/api/worlds",{method:"POST",body:{
      name:title,text:"",genre:guessImportGenre(text),source:"upload",createNew:false,
      summary,title,windowStart:0,infiniteMode:false,bible,bookId:world.id
    }});
    setProgress(99, "正在整理书架……");
    const note = "《"+title+"》已加入「小说剧本」，并出现在「我的旅途」中。";
    finishProgress("导入完成");
    if(!detached || $("menu-note")){
      await showTitle();
      menuNote(note);
      const mine = [...document.querySelectorAll("details.library")].find(d=>
        /小说剧本/.test((d.querySelector("summary")||{}).textContent||""));
      if(mine) mine.open = true;
    }else{
      imageToast(note,5000);
    }
  }catch(e){
    finishProgress("导入失败："+e.message, true);
    if(!detached && !$("menu-note")){ imageToast("导入失败："+e.message,7000); return; }
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
function showPasteWorld({name = "",text = ""} = {}){
  const card = $("card");
  card.innerHTML = `
    <h1>粘贴文字导入</h1>
    <div class="sub">粘贴正文或设定，系统会自动分析并加入「小说剧本」，不需要选择其他选项。</div>
    <form class="auth-form paste-world" id="paste-world">
      <button class="big-btn ghost" id="paste-back" type="button" style="margin-bottom:8px">← 返回酒馆</button>
      <label for="paste-name">旅途名称 / 书名（可选）</label>
      <input id="paste-name" maxlength="80" placeholder="例如：雨夜列车">
      <label for="paste-text">小说正文或世界设定</label>
      <textarea id="paste-text" rows="6" maxlength="3000000" required placeholder="把正文或设定粘贴在这里，最多 300 万字符"></textarea>
      <div class="form-note" id="paste-status" role="status"></div>
      <button class="big-btn" type="submit">导入到书架</button>
    </form>`;
  const form = $("paste-world"), field = $("paste-text"), title = $("paste-name"), status = $("paste-status");
  const back = $("paste-back");
  if(back) back.onclick = showTitle;
  title.value = name;
  field.value = text;
  let busy = false;
  const token = AUTH.token;
  const stillHere = ()=>AUTH.token===token && $("paste-world")===form;
  form.onsubmit = async (e)=>{
    e.preventDefault();
    if(busy) return;
    const full = field.value.trim();
    if(!full || full.length>3000000){
      field.setCustomValidity("请粘贴 1 至 300 万字符的小说片段或设定。");
      field.reportValidity();
      return;
    }
    if(!isLoggedIn()){
      showLogin("登录后会把这段文字加入书库。",{
        onSuccess:()=>showPasteWorld({name:title.value,text:field.value}),
        onBack:()=>showPasteWorld({name:title.value,text:field.value})
      });
      return;
    }
    busy = true;
    field.setCustomValidity("");
    try{
      await autoImportToShelf("",full,title.value.trim());
    }catch(err){
      if(stillHere()) status.textContent = err.message || "导入失败";
      busy = false;
    }
  };
  field.oninput = ()=>field.setCustomValidity("");
  field.focus({preventScroll:true});
}

function journeyRole(value){
  if(!value || typeof value.name!=="string" || !value.name.trim()) return null;
  const role = {};
  for(const key of ["name","gender","identity","personality","hook","species","origin","appearance","outfit"]){
    role[key] = typeof value[key]==="string" ? value[key].slice(0,300) : "";
  }
  for(const key of ["coin","income"]){
    if(Number.isFinite(value[key])) role[key]=Math.max(0,Math.round(value[key]));
  }
  for(const key of ["age","height","weight"]){
    if(Number.isFinite(Number(value[key])) && Number(value[key])>0) role[key]=Math.round(Number(value[key]));
  }
  const attrs = normalizeStartAttrs(value.attrs);
  if(attrs) role.attrs = attrs;
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
  journeyOwner = AUTH.username;
  // 导入/粘贴的长文本只做保守判定（明显恋爱线才标恋爱）。不要用关键词猜悬疑/恐怖，
  // 否则一部普通都市小说只要出现一次「案件/失踪」就会被整篇当成悬疑反复审细节。
  const inferredGenre = world.genre || (world.text ? guessImportGenre(world.text) : "");
  S = {...DEFAULT_STATE(),ai:true,infiniteMode:Boolean(world.infiniteMode),species:world.species||(world.role&&world.role.species)||"",world:world.text||"",worldSource:world.source||"",worldName:world.name||world.title||"",worldStart:world.worldStart||"",worldRole:world.role||null,worldSummary:world.summary||"",worldWindow:world.windowStart||0,worldId:world.id,bookId:world.bookId||"",builtinId:world.builtinId||"",genre:inferredGenre};
  activeBuiltinBible = S.builtinId && world.bible ? world.bible : null;
  if(typeof ensureTimelineState==="function") ensureTimelineState(S);
  S.romanceMode = computeRomanceMode(S);
  if(!world.role){
    const attrs = rollStartingAttrs();
    for(const key of START_ATTR_KEYS) S[key] = attrs[key];
    S.hpMax = clamp(Math.round(80 + (S.physique||50)*0.4), 40, 140);
    S.hp = S.hpMax;
  }
  if(!S.gender && world.role && world.role.gender) S.gender = String(world.role.gender).slice(0,10);
  if(world.role){
    if(Number.isFinite(world.role.income)) S.incomePerDay = world.role.income;
    if(Number.isFinite(world.role.coin)) S.coin = world.role.coin;
    if(Number.isFinite(world.role.age) && world.role.age>0) S.age = world.role.age;
    if(Number.isFinite(world.role.height)) S.height = world.role.height;
    if(Number.isFinite(world.role.weight)) S.weight = world.role.weight;
    if(world.role.appearance) S.appearance = world.role.appearance;
    if(world.role.outfit) S.outfit = world.role.outfit;
    if(world.role.origin) S.origin = world.role.origin;
    const attrs = inferRoleAttrs(world.role);
    for(const key of START_ATTR_KEYS) S[key] = attrs[key];
    S.hpMax = clamp(Math.round(80 + (S.physique||50)*0.4), 40, 140);
    S.hp = S.hpMax;
    S.playerIdentity = { name:String(world.role.name||""), identity:String(world.role.identity||""), desc:String(world.role.personality||"") };
  }
  // 若有原著「故事圣经」，用真实人物、关系、锚点初始化，提升还原度
  if(world.bible && typeof world.bible==="object"){
    const b = world.bible;
    if(!S.worldSummary && b.summary) S.worldSummary = b.summary;
    if(Array.isArray(b.anchors) && b.anchors.length) S.anchors = [...b.anchors].slice(-24);
    if(Array.isArray(b.characters) && b.characters.length && !S.cast.length){
      S.cast = b.characters.filter(c=>c && c.name).slice(0,20).map(c=>({
        name:c.name, background:c.identity||c.background||"", personality:c.personality||"", hobby:"", voice:c.voice||"",
        goal:c.goal||"", attitude:c.attitude||"", knows:c.knows||"", changes:[],
        identity:c.identity||c.job||"", job:c.job||c.identity||"", status:c.status||"",
        age:Number.isFinite(Number(c.age))&&Number(c.age)>0?Math.round(Number(c.age)):undefined, gender:c.gender||"",
        species:c.species||"", height:Number.isFinite(Number(c.height))?Math.round(Number(c.height)):undefined,
        weight:Number.isFinite(Number(c.weight))?Math.round(Number(c.weight)):undefined,
        appearance:c.appearance||"", outfit:c.outfit||"", origin:c.origin||"",
        wealth:c.wealth||"", coin:Number.isFinite(Number(c.coin))?Math.round(Number(c.coin)):undefined,
        rep:Number.isFinite(Number(c.rep))?Math.round(Number(c.rep)):undefined,
        moral:Number.isFinite(Number(c.moral))?Math.round(Number(c.moral)):undefined,
        wanted:Number.isFinite(Number(c.wanted))?Math.round(Number(c.wanted)):undefined,
        hp:Number.isFinite(Number(c.hp))?Math.round(Number(c.hp)):undefined,
        attrs:normalizeStartAttrs(c.attrs)||undefined, combat:c.combat||null,
        adult:Number.isFinite(Number(c.age))?Number(c.age)>=18:undefined,
        desire:0, links:[]
      })).map(c=>ensureNpcDefaults(c,S));
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
  const selfName = String(S.playerIdentity?.name || S.worldRole?.name || "").trim();
  if(selfName){
    S.cast = (S.cast||[]).filter(c=>c && c.name!==selfName);
    S.present = (S.present||[]).filter(n=>n!==selfName);
  }
  if(typeof ensureNpcDefaults==="function") S.cast = dedupeCast((S.cast||[]).map(c=>ensureNpcDefaults(c,S)));
  if(typeof dbBackfillWorld==="function") dbBackfillWorld(S).catch(()=>{});
  if(typeof warmSemanticMemory==="function"){
    const dbState = S;
    warmSemanticMemory().then(ok=>{
      if(ok && dbState===S && typeof backfillEmbeddings==="function"){
        backfillEmbeddings(tavernWorldId(dbState)).catch(()=>{});
      }
    }).catch(()=>{});
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
  migrateLegacyImages(S);
  npcDetailName = "";
  npcEditName = "";
  playerEditMode = false;
  $("overlay").classList.add("hidden");
  closeDrawer();
  const title = $("story-title");
  title.textContent = S.ai ? (S.worldName || "暗夜酒馆") : "雨夜的委托";
  title.parentElement.title = title.textContent;
  resetChoiceExpansion();
  $("save-status").textContent = S.turn ? "" : "进度会自动保存";
  // 按 data-tab 定位，别用索引：索引会随模板增删标签而错位，把「任务」改成「物品」。
  const tabBy = t=>document.querySelector('.side-tab[data-tab="'+t+'"]');
  const charTab = tabBy("char");
  if(charTab) charTab.textContent = "人物";
  const storyTab = tabBy("story");
  if(storyTab){
    storyTab.textContent = S.ai ? "剧情" : "账本";
    storyTab.style.display = "";
  }
  // 「剧情」标签已合并原来的「任务」面板，委托与未了事项都在这里显示。
  // 物品标签的文案由 refreshSide() 追加数量，这里只保证它可见。
  const itemsTab = tabBy("items");
  if(itemsTab) itemsTab.style.display = S.ai ? "" : "none";
  renderLog();
  setTimeout(resumePendingImage,600);
  setTimeout(retryPendingTurn,800);
  if(S.ai){ showCurrentScene(""); return; }
  syncStoryPace();
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

function saveTextBytes(value){
  try{
    const json = typeof value==="string" ? value : JSON.stringify(value);
    if(typeof TextEncoder!=="undefined") return new TextEncoder().encode(json).length;
    return json.length*2;
  }catch(e){ return 0; }
}

function formatSaveSize(bytes){
  const n = Number(bytes)||0;
  if(n<=0) return "";
  if(n>=1024*1024) return (n/1048576).toFixed(1)+" MB";
  return Math.max(1,Math.round(n/1024))+" KB";
}

// 保存前去掉重复场景文本：日志里同一段旁白只留一次，旧回复只保留叙述/台词/推进，
// 场景历史里与上一条相同的原文不再重复存。只做去重，不改动剧情内容。
function slimSaveText(save){
  if(!save || typeof save!=="object") return save;
  if(Array.isArray(save.log)){
    const seenNarr = new Set();
    save.log = save.log.filter(entry=>{
      const text = String(entry && entry.text || "").trim();
      if(!text) return true;
      if(entry.t==="narr"){
        const key = text.slice(0,120);
        if(seenNarr.has(key)) return false;
        seenNarr.add(key);
      }
      return true;
    });
  }
  if(Array.isArray(save.history) && typeof readScene==="function"){
    let lastAssistant = -1;
    save.history.forEach((message,index)=>{ if(message && message.role==="assistant") lastAssistant = index; });
    save.history = save.history.map((message,index)=>{
      if(!message || message.role!=="assistant" || index===lastAssistant) return message;
      try{
        const scene = readScene(message.content);
        const narration = scene.lines.filter(line=>line.t==="narr").map(line=>line.text).join("\n");
        const beats = scene.lines.filter(line=>line.who).map(line=>({
          kind:line.t==="npc-action" ? "action" : "say",
          who:line.who,text:line.text,...(line.to ? {to:line.to} : {})
        }));
        return {...message,content:JSON.stringify({narration,beats,scene:scene.scene,advance:scene.advance})};
      }catch(e){ return message; }
    });
  }
  if(Array.isArray(save.sceneHistory)){
    let prevScene = "", prevSummary = "";
    save.sceneHistory = save.sceneHistory.map(entry=>{
      if(!entry) return entry;
      const next = {...entry};
      if(next.scene && next.scene===prevScene) next.scene = "";
      else prevScene = next.scene || prevScene;
      if(next.summary && next.summary===prevSummary) next.summary = "";
      else prevSummary = next.summary || prevSummary;
      return next;
    });
  }
  return save;
}

function pruneStateForSave(state){
  const save = {...state};
  save.history = (state.history||[]).slice(-10);
  save.log = (state.log||[]).slice(-80);
  save.memory = (state.memory||[]).slice(-20);
  save.longTerm = String(state.longTerm||"").slice(-4000);
  save.lifeReactions = (state.lifeReactions||[]).slice(-80);
  save.consequences = (state.consequences||[]).slice(-40);
  save.anchors = (state.anchors||[]).slice(-24);
  save.sceneHistory = (state.sceneHistory||[]).slice(-8);
  save.llmMetrics = (state.llmMetrics||[]).slice(-12);
  save.turnStats = (state.turnStats||[]).slice(-30);
  delete save.npcEnrichPending;
  delete save.filteredSpeakers;
  delete save._effectIssues;
  delete save.holdTimeTurn;
  return slimSaveText(save);
}

async function saveProgress(manual = false, {allowOpening=false, reportError=false, state=S} = {}){
  const status = (message)=>{
    if(S!==state) return;
    $("save-status").textContent = message;
    if($("ending-status")) $("ending-status").textContent = message;
  };
  if(state.ai && !state.turn && !allowOpening){
    if(manual) status("完成第一幕后可以保存");
    return;
  }
  const token = AUTH.token;
  status("正在保存……");
  const operation = saveQueue.then(async()=>{
    await migrateLegacyImages(state);
    if(!state.ai){
      const json = JSON.stringify(pruneStateForSave(state));
      lastSaveBytes = saveTextBytes(json);
      localStorage.setItem(CLASSIC_KEY,json);
      return;
    }
    const {world, ...rawSave} = state;
    const pruned = pruneStateForSave(rawSave);
    lastSaveBytes = saveTextBytes(pruned);
    await api("/api/save",{method:"PUT",body:{id:state.worldId,save:pruned},token});
  });
  saveQueue = operation.catch(()=>{});
  try{ await operation; status(state.ai ? ("进度已保存 · "+formatSaveSize(lastSaveBytes)) : ("已保存在此浏览器 · "+formatSaveSize(lastSaveBytes))); }
  catch(e){ status("保存失败："+e.message); if(reportError) throw e; }
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
    if(!world.restoredBackup || !world.text) world.text = (await readBuiltinBook(world.builtinId)).text;
    if(!world.bible){
      world.bible = await readBuiltinBook(world.builtinId,{bible:true,optional:true});
    }
    if(!stillHere()) return;
  }
  if(!save && world.bookId){
    showEnterSelect({...world,id:world.bookId,name:world.name||world.title||"我的小说",title:world.title||world.name||"我的小说"},stillHere);
    return;
  }
  if(!save){ startJourney(world); return; }
  journeyOwner = AUTH.username;
  S = {...DEFAULT_STATE(),...save,ai:true,infiniteMode:save.infiniteMode ?? Boolean(world.infiniteMode),species:save.species||(world.role&&world.role.species)||"",world:save.world||world.text||"",worldSource:world.source||"",worldName:world.name,worldId:id,builtinId:world.builtinId||""};
  S.genre = save.genre || world.genre || "";
  undoStack = [];
  activeBuiltinBible = S.builtinId && world.bible ? world.bible : null;
  if(typeof ensureTimelineState==="function") ensureTimelineState(S);
  const selfName = String(S.playerIdentity?.name || S.worldRole?.name || "").trim();
  if(selfName){
    S.cast = (S.cast||[]).filter(c=>c && c.name!==selfName);
    S.present = (S.present||[]).filter(n=>n!==selfName);
  }
  if(typeof ensureNpcDefaults==="function") S.cast = dedupeCast((S.cast||[]).map(c=>ensureNpcDefaults(c,S)));
  if(typeof dbBackfillWorld==="function") dbBackfillWorld(S).catch(()=>{});
  if(typeof warmSemanticMemory==="function"){
    const dbState = S;
    warmSemanticMemory().then(ok=>{
      if(ok && dbState===S && typeof backfillEmbeddings==="function"){
        backfillEmbeddings(tavernWorldId(dbState)).catch(()=>{});
      }
    }).catch(()=>{});
  }
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
  if(!S.log.length && Array.isArray(S.history)){
    const last = S.history.findLast(h=>h && h.role==="assistant");
    if(last){
      try{
        const scene = readScene(last.content);
        if(scene.lines.length) S.log = scene.lines;
      }catch(e){}
    }
  }
  if(S.turn>0 && !S.choices.length && !S.ending){
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
    if(S.age===undefined && !S.playerProfileEdits?.age) S.age = 30;
  }
  ensureEconomy(S);
    ensureAvatars(S);
  enterStory();
}

document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"){ resumePendingImage(); retryPendingTurn(); } });
window.addEventListener("online",()=>{ resumePendingImage(); retryPendingTurn(); });
setTimeout(resumePendingImage,1500);
setTimeout(retryPendingTurn,1800);

