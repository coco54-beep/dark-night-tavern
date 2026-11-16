
"use strict";

/* ==================== 状态 ==================== */
// 旧旅途仍按原剧本加载。
const TWO_DAY_TRIAL = {
  place:"桥头客栈",
  text:`故事发生在河港小镇。连日下雨，桥头客栈靠渡客和码头工人维持生意。这里用铜钱，一碗热粥四文，普通客房十八文，卸一批货约挣十到十二文。
你是外乡人，带着十二文铜钱，没有固定收入。今晚二十点半抵达桥头客栈，发现失主正在寻找一册遗失的运货账簿。你可以打听、谈条件、自己找线索，也可以不接这桩事。
梁掌柜记账仔细，说话直接。她愿意讲价或用活计抵房钱，但约定一旦说定就会记在账上。客栈柜台从早上六点半营业到晚上九点半。关柜后，已经订房的人仍可入住。
老周是渡工，讲话慢，愿意替守信的人作保。他今晚在炉边避雨，明早六点半去东码头。码头工人会互相传消息，外地来的人并不知道本地传闻。
沈巡检重证据，明早七点到东码头接收账簿。错过交接后仍能到镇公所寻人，或改找别的线索。沈巡检对码头口碑的反应取决于是否有人当面作证。
第一晚可以议价住店、帮忙卸货、找一处能挡雨的地方，也可以用自由输入想别的办法。第二天让实际发生的付款、留宿条件、目击和承诺自然回到剧情里。不要提前定死账簿归谁，不要把没接委托当作失败。`
};
const TRIAL_MILESTONES = [
  [21*60+30,"梁掌柜的柜台到了关门时间，已订的客房仍可入住。"],
  [1440+6*60+30,"客栈重新开柜，老周按约去了东码头。"],
  [1440+7*60,"沈巡检到东码头等账簿。错过交接仍可去镇公所找他。"]
];

function isTwoDayTrial(state){
  return state.world===TWO_DAY_TRIAL.text;
}

function trialDeskOpen(minute){
  const time = minute%1440;
  return time>=390 && time<1290;
}

function seedTwoDayTrial(state){
  const {place} = TWO_DAY_TRIAL;
  const offers = [
    {id:"inn-room",seller:"梁掌柜",item:"普通客房一晚",price:18},
    {id:"inn-porridge",seller:"梁掌柜",item:"热粥一碗",price:4}
  ];
  Object.assign(state,{
    turn:1, career:"commoner", coin:12, hp:70,
    playerIdentity:{name:"外乡旅人",identity:"初到河港，没有固定营生"},
    currency:{name:"文",symbol:"",scale:"热粥四文，普通客房十八文，卸一批货约十到十二文。"},
    scene:"雨夜的桥头客栈",
    environment:{minute:1230,place,era:"旧时河港小镇",background:"货物靠渡船进出。码头人看重守约。",weather:"连日细雨",conditions:"东码头湿滑，客栈尚未关柜。"},
    reputationScope:"河港码头",
    plot:{goal:"找个落脚处，决定是否帮忙寻回账簿",conflict:"手头只有十二文，客房报价十八文",next:"沈巡检明早七点在东码头等账簿"},
    offers,marketPrices:offers.map(offer=>({...offer,place})),
    present:["梁掌柜","老周"],
    cast:[
      {name:"梁掌柜",job:"客栈掌柜",personality:"精明守约",voice:"直接，常提账目",routine:"06:30 开柜，21:30 关柜",changes:[]},
      {name:"老周",job:"渡工",personality:"谨慎但肯帮守信的人",voice:"说话慢",routine:"今夜在客栈避雨，明早 06:30 去东码头",changes:[]},
      {name:"沈巡检",job:"巡检",personality:"重证据",voice:"简短，问话具体",routine:"第二天 07:00 在东码头等账簿，之后可去镇公所找他",changes:[]}
    ],
    log:[
      {t:"narr",text:"雨落在桥头客栈的瓦檐上。你数了数手里的十二文铜钱，进门先烤了烤湿透的袖口。"},
      {t:"say",who:"梁掌柜",text:"粥四文，客房十八文。九点半我关柜。你若嫌贵，也可以谈谈。"},
      {t:"say",who:"老周",text:"东码头丢了一册运货账簿。沈巡检明早七点来等。我六点半就得过去，今夜还有一批货没人卸。"}
    ],
    choices:[
      {text:"问梁掌柜能不能便宜些，或用别的办法抵房钱"},
      {text:"问老周今晚的卸货活，先谈工钱"},
      {text:"问附近哪里可以免费避雨，再决定要不要找账簿"}
    ]
  });
}

const STORY_DETAIL_KEY = "tavern_story_detail_v1";
function storyDetailFull(){
  try{ return localStorage.getItem(STORY_DETAIL_KEY)==="full"; }
  catch(e){ return false; }
}
function setStoryDetailFull(on){
  try{ localStorage.setItem(STORY_DETAIL_KEY,on?"full":"compact"); }catch(e){}
}
const IDLE_AUTO_KEY = "tavern_idle_auto_v1";
function idleAutoEnabled(){
  try{ return localStorage.getItem(IDLE_AUTO_KEY)!=="0"; }
  catch(e){ return true; }
}
function setIdleAutoEnabled(on){
  try{ localStorage.setItem(IDLE_AUTO_KEY,on?"1":"0"); }catch(e){}
}
const DEFAULT_STATE = () => ({
  coin: 15,
  hp: 100,
  rep: 0,
  morality: 0,     // 道德值：-100（恶名昭彰）~ +100（德高望重）
  wanted: 0,       // 通缉度：0~100，越高越容易被追捕
  concealment: 0,  // 隐蔽度：0~100，越高越难被目击/追查（隐藏，AI 内部）
  reports: [],     // 针对玩家的报警/追查记录 [{who,reason,status,due}]（隐藏，AI 内部）
  aff: { lyra: 0, bran: 0, mira: 0 },
  intimacy: { lyra: 0, bran: 0, mira: 0 }, // 亲密度 0~100，与好感共同决定可解锁的亲密层级
  desire: 0,       // 玩家欲望 0~100：与好感/亲密度不同的系统，只能通过性行为释放
  desires: { money:0, power:0, sex:0, people:0, items:0 }, // 五维欲望（金钱/权力/性/人/物品）
  bonds: [],       // NPC 与 NPC 之间的关系 [{a,b,relation,aff,desire}]
  // ===== 玩家属性（可见，AI 据此裁定成败） =====
  career: "",      // 职业（身份）
  playerIdentity: null, // 自定义身份 {name,identity,desc}（按剧本类型生成，优先于通用职业）
  age: null,       // 年龄（首次开场由 AI 根据身份/原文给出，不默认 28）
  ageMonths: 0,    // 年龄的零头月数（0~11），长时间跳跃时累加
  birth: null,     // 玩家出生：{year,month,day,hour,minute,second}
  incomePlan: {type:"none",amount:0,payday:1,source:"",sharedWith:""}, // 收入方式
  expensePlans: [],
  lastTimeSettlement: null,
  savings: null,   // 存款（与手头现金分开；未知时为 null，由 AI 按身份/家境给出）
  economyMode: "",
  moneyBook: [],
  moneyTotals: {income:0, expense:0},
  contracts: [],
  assets: [],      // 资产：[{type,name,value,output:{coin,food},upkeep:{coin,food},location}]
  food: 0,         // 家中食物存量（可自种/购买）
  gender: "",      // 玩家性别（男/女/其他），NPC 的称呼与描写必须与此一致
  iq: 50,          // 智商 0~100：解谜、识破谎言、谈判、学习速度
  physique: 50,    // 体质 0~100：体力上限、抗打击、负重、耐力
  charm: 50,       // 魅力 0~100：好感、亲密、说服、骗术、外貌
  willpower: 50,   // 意志 0~100：抗恐吓、抗诱惑、抗酷刑、抗恐惧
  agility: 50,     // 敏捷 0~100：反应、闪避、潜行、逃跑
  combat: null,    // 武力系统：{mode,power,energy,energyMax,techniques}
  martialTraining: {},
  hpMax: 100,      // 体力上限（由体质决定）
  health: 100,     // 健康 0~100：伤病、中毒、后遗症，低于阈值会虚弱
  debt: 0,         // 债务：欠别人的钱
  offers: [],
  marketPrices: [],
  receipts: [],
  reputationScope: "",
  reputations: [],
  incomePerDay: 0, // 玩家每日营生收入（本世界货币）
  incomeClock: 0,  // 距上次发薪累计的分钟数（内部）
  skills: {},      // 技能熟练度 {技能名: 0~100}
  social: [],      // 社会关系网 [{name,relation,power,attitude}]，比单个好感更宏观
  flags: {},
  quests: [],      // {id,title,desc,done}
  items: [],       // 已获得的物品/线索 [{name,desc}]
  abilities: [],   // 已习得的能力 [{name,desc}]
  node: "start",
  log: [],
  ai: false,       // 是否启用 LLM 随机剧本
  infiniteMode: false, // 无限模式：不自动收束，主线结束后继续写
  species: "",     // 玩家物种/形态（人类/动物/外星人/妖怪/机械等）
  appearance: "",  // 玩家可观察外貌（发型、发色、眼睛、体型、特征）
  origin: "",      // 玩家出身地域/族裔/时代（不硬套现代国别）
  outfit: "",      // 玩家当前衣着/装备
  height: null,    // 身高 cm
  weight: null,    // 体重 kg
  history: [],     // LLM 对话历史 [{role,content}]
  scene: "",       // 当前场景摘要
  sceneImageKey: "",
  turn: 0,         // AI 回合计数
  memory: [],      // 长期记忆：关键事实清单
  summary: "",     // 滚动剧情摘要
  longTerm: "",    // 长局压缩摘要（每12幕整理一次）
  lastCompactTurn: 0,
  cast: [],        // 人物档案、所知、关系变化和最近行动
  present: null,   // 人物姓名列表。旧存档在下一幕补齐
  plot: {},        // {goal, conflict, next}
  timelineId: "main", // 当前时间线
  timelines: [],      // [{id,name,parentId,branchTurn,branchMinute,createdAt,color}]
  timelineSeq: 0,
  chapter: null,   // 当前篇章 {title,goal,stakes,next,phase,startedTurn,startedMinute,titleMinute}
  lastTitleNudgeMinute: null,
  sceneHistory: [], // 最近场景 [{turn,place,scene,advance,summary}]
  openLoops: [],   // 未了事项 [{id,text,kind,createdTurn,createdMinute,dueTurn,dueMinute,participants}]
  loopSeq: 0,
  lastLoopNudgeMinute: null,
  loopHistory: [], // 已收回的未了事项
  chapterHistory: [],
  locations: [],
  environment: {minute:null,startDate:null,era:"",background:"",place:"",weather:"",conditions:""},
  weatherState: null, // 本地天气：同一地点同一天保持一致
  consequences: [], // 玩家决定留下的事实，以及尚未发生的后续
  world: "",       // 导入的世界设定原文（txt/md）
  worldSource: "", // 粘贴的片段从原文的结尾接续
  worldName: "",   // 导入文档名
  worldStart: "",  // 长篇小说选择的进入节点（角色卡描述），空=从头
  worldRole: null, // 长篇小说选择的角色卡 {name,identity,personality,hook}
  worldSummary: "", // 长篇小说全书概要（覆盖导入原文之后的走向）
  worldWindow: 0,   // 原文窗口的起始位置（随进度推进）
  builtinId: "",
  worldId: "",     // 导入文档的记录ID（用于独立存档）
  choices: [],
  ending: null,
  genre: "",       // 故事类型（如 悬疑、奇幻、恋爱…）
  storyTemplate: "", // 随机剧本的叙事骨架（追凶/守护/交易/逃亡…），用于降低重复感
  hiddenQuest: null, // 隐藏主线当前阶段 {title,desc,stakes,status,reward,stage,final}，玩家不可见，AI 内部驱动
  hiddenArc: [],     // 已完成/失败的隐藏阶段历史 [{stage,title,desc,outcome}]
  hiddenStage: 0,    // 当前已推进到的隐藏阶段序号
  hiddenStageTurns: 0, // 当前隐藏阶段已持续的幕数（内部，用于防止无限延长）
  hiddenNextPending: false, // 上一阶段已完成，等待 AI 开启下一阶段
  arcSeeds: [],      // 无限模式当前篇章的伏笔 [{id,hint,conflict,basis,status,plantedTurn,dueTurn}]
  anchors: [],       // 核心设定锚点：必须始终成立的事实/人物特质，不随记忆窗口滑落
  ledger: [],        // 已支付/交易记录 [{turn,amount,detail,place}]
  keyFacts: [],      // 不可遗忘的重大事实：死亡/婚姻/破产/失踪等
  lifeEvents: [],
  lifeReactions: [],
  investigation: {clues:[],checks:[]},
  genreGame: null,
  idleTimeout: 90,   // 玩家沉默多久（秒）触发超时推进
  idleCount: 0,      // 已发生的超时次数（AI 内部，用于累积后果）
  noNagUntil: 0,     // 「拒绝冷却」：在此幕之前，AI 不得再提玩家拒绝过的请求
  afterglow: 0,      // 亲密余韵剩余幕数：期间不谈正事、不复盘任务
  intimateActive: false, // 亲密场景是否正在进行（上一幕未结束）
  lastInitTurn: 0,   // 上一次 NPC 主动找玩家的幕数
  initiator: "",     // 上一次主动的 NPC 姓名（用于避免同一人连续主动）
  talkTarget: ""     // 玩家当前指定的对话对象（在场 NPC 姓名，空=不限）
});

let S = DEFAULT_STATE();
const CLASSIC_KEY = "tavern_classic_v1";
let activeTurn = null;
let idleTimer = null;
let idleRaf = null;
let undoStack = [];
let roleCardCache = new Map();
let npcDetailName = "";
let npcEditName = "";
const UNDO_LIMIT = 2;
let saveQueue = Promise.resolve();
let journeyOwner = "";

/* ==================== 登录 / API ==================== */
const AUTH_KEY = "tavern_auth_v1";
let AUTH = { token:"", username:"" };
try{
  const raw = localStorage.getItem(AUTH_KEY);
  if(raw){ const a = JSON.parse(raw); if(a.token) AUTH = a; }
}catch(e){}

/* ===== 单机模式：无需登录，本地存档，直连 AI ===== */
const SINGLE_KEY = "tavern_single_v1";
const SINGLE_LLM_KEY = "tavern_single_llm_v1";
const SINGLE_WORLDS_KEY = "tavern_single_worlds_v1";
function isSingleMode(){
  // 登录系统已移除：始终单机、本地存档、直连 AI
  return true;
}
function singleLLMConfig(){
  try{ const c=JSON.parse(localStorage.getItem(SINGLE_LLM_KEY)||"null"); return (c && c.base && c.model) ? c : null; }catch(e){ return null; }
}
function saveSingleLLM(cfg){ try{ localStorage.setItem(SINGLE_LLM_KEY, JSON.stringify(cfg)); }catch(e){} }
function singleWorlds(){ try{ return JSON.parse(localStorage.getItem(SINGLE_WORLDS_KEY)||"[]"); }catch(e){ return []; } }
function saveSingleWorlds(list){ try{ localStorage.setItem(SINGLE_WORLDS_KEY, JSON.stringify(list)); }catch(e){ throw new Error("本地存储空间不足，无法保存这段旅途"); } }
function singleSaveKey(id){ return "tavern_single_save_"+id; }
// 通过 ?single=1 或 file:// 进入后记住单机模式，下次直接进
try{
  if(location.protocol==="file:" || (typeof URLSearchParams!=="undefined" && new URLSearchParams(location.search).get("single")==="1")) localStorage.setItem(SINGLE_KEY,"1");
}catch(e){}
if(isSingleMode()){ AUTH = {token:"single-local",username:"local"}; saveAuth(); }

function saveAuth(){ try{ localStorage.setItem(AUTH_KEY, JSON.stringify(AUTH)); }catch(e){} }
function clearAuth(){
  AUTH = {token:"",username:""};
  LLM_PROVIDERS = [];
  LLM_PROVIDER = "";
  renderProviderSelect();
  try{ localStorage.removeItem(AUTH_KEY); }catch(e){}
}
function isLoggedIn(){ return !!AUTH.token; }

/* ==================== AI 引擎选择 ==================== */
const LLM_PROVIDER_KEY = "tavern_llm_provider_v1";
const PERSONAL_PROVIDER = "personal-api";
let LLM_PROVIDERS = [];
let LLM_PROVIDER = "";

function providerPreference(id){
  const key = LLM_PROVIDER_KEY+":"+AUTH.username;
  try{
    if(id!==undefined) localStorage.setItem(key,id);
    return localStorage.getItem(key)||"";
  }catch(e){ return ""; }
}

async function loadProviders(){
  if(!isLoggedIn()) return;
  const token = AUTH.token;
  try{
    const d = await api("/api/llm/providers",{token});
    if(AUTH.token!==token) return;
    LLM_PROVIDERS = Array.isArray(d.providers) ? d.providers : [];
    LLM_PROVIDER = providerPreference();
    if(!LLM_PROVIDERS.some(p=>p.id===LLM_PROVIDER && p.enabled!==false)){
      LLM_PROVIDER = d.default || (LLM_PROVIDERS.find(p=>p.enabled!==false)?.id || "");
    }
    renderProviderSelect();
  }catch(e){ /* 静默失败：沿用默认引擎 */ }
}

function renderProviderSelect(){
  const el = $("llm-provider");
  if(!el) return;
  if(!LLM_PROVIDERS.length){ el.hidden = true; el.replaceChildren(); return; }
  el.hidden = false;
  el.onchange = e => {
    LLM_PROVIDER = e.target.value;
    providerPreference(LLM_PROVIDER);
  };
  el.replaceChildren(...LLM_PROVIDERS.map(p=>{
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = (p.name || p.model || p.id) + (p.enabled === false ? "（未配置）" : (p.local ? "（本地）" : ""));
    opt.title = (p.model || "") + (p.enabled === false ? "：共享引擎未配置" : (p.local ? "：本地部署" : "：远程 API"));
    if(p.enabled === false) opt.disabled = true;
    if(p.id === LLM_PROVIDER && p.enabled !== false) opt.selected = true;
    return opt;
  }));
}

async function showPersonalAI(back = showTitle){
  const token = AUTH.token;
  const card = $("card");
  card.innerHTML = `
    <h1>我的 AI 设置</h1>
    <div class="sub">保存后，这个账户默认使用自己的 API。</div>
    <form class="auth-form" id="personal-ai" autocomplete="off">
      <label for="personal-base">API 地址</label>
      <input id="personal-base" type="url" placeholder="https://api.example.com/v1" maxlength="512" required>
      <label for="personal-model">模型名</label>
      <input id="personal-model" type="text" maxlength="150" required>
      <label for="personal-key">API 密钥</label>
      <input id="personal-key" type="password" autocomplete="new-password" maxlength="4096">
      <div class="form-note" id="personal-status" role="status">正在读取设置……</div>
      <button type="submit" class="big-btn" id="personal-save" disabled>保存并使用</button>
      <button type="button" class="big-btn ghost" id="personal-test" disabled>测试已保存的连接</button>
      <button type="button" class="logout-btn" id="personal-delete" disabled>移除个人配置</button>
      <button type="button" class="logout-btn" id="personal-back">返回首页</button>
    </form>`;
  const form = $("personal-ai"), base = $("personal-base"), model = $("personal-model"), key = $("personal-key");
  const status = $("personal-status"), save = $("personal-save"), test = $("personal-test"), remove = $("personal-delete");
  const here = ()=>AUTH.token===token && $("personal-ai")===form;
  $("personal-back").onclick = back;
  if(back!==showTitle) $("personal-back").textContent = "返回设置";
  let personal = null, ready = false;
  function show(value){
    personal = value;
    base.value = value?.base || "";
    model.value = value?.model || "";
    key.value = "";
    key.placeholder = value?.hasKey ? "已保存，留空保留原密钥" : "";
    key.required = !value?.hasKey;
  }
  async function work(action){
    save.disabled = test.disabled = remove.disabled = true;
    try{ await action(); }
    catch(e){ if(here()) status.textContent = e.message; }
    finally{
      if(here()){
        save.disabled = !ready;
        test.disabled = remove.disabled = !ready || !personal;
      }
    }
  }
  form.onsubmit = e=>{
    e.preventDefault();
    work(async()=>{
      status.textContent = "正在保存……";
      const data = await api("/api/llm/personal",{method:"PUT",token,body:{
        base:base.value,model:model.value,key:key.value
      }});
      if(!here()) return;
      show(data.personal);
      providerPreference(PERSONAL_PROVIDER);
      await loadProviders();
      if(here()) status.textContent = "已保存，下一幕将使用你的 API。";
    });
  };
  test.onclick = ()=>work(async()=>{
    status.textContent = "正在请求模型……";
    const answer = await callLLM([{role:"user",content:"只回答 OK。"}],AbortSignal.timeout(30000),null,{provider:PERSONAL_PROVIDER});
    if(!answer.trim()) throw new Error("服务已响应，但模型未返回文字。");
    if(here()) status.textContent = "连接成功，模型已返回内容。";
  });
  remove.onclick = ()=>{
    if(!confirm("移除本账户保存的 API 地址、模型和密钥？")) return;
    work(async()=>{
      await api("/api/llm/personal",{method:"DELETE",token});
      if(!here()) return;
      show(null);
      providerPreference("");
      await loadProviders();
      if(here()) status.textContent = "已移除个人配置。";
    });
  };
  await work(async()=>{
    const data = await api("/api/llm/personal",{token});
    if(!here()) return;
    show(data.personal);
    ready = true;
    status.textContent = "填写支持 OpenAI Chat Completions 格式的公网 HTTPS API。";
  });
}

function singleErr(status,message){ const e=new Error(message); e.status=status; return e; }
function singlePathQuery(path){
  const i=String(path).indexOf("?");
  const p=i<0?String(path):String(path).slice(0,i);
  const q={}; if(i>=0) String(path).slice(i+1).split("&").forEach(kv=>{ if(!kv) return; const j=kv.indexOf("="); const k=j<0?kv:kv.slice(0,j); const v=j<0?"":kv.slice(j+1); try{ q[decodeURIComponent(k)]=decodeURIComponent(v); }catch(e){} });
  return {p,q};
}
function singleApi(path, { method="GET", body } = {}){
  const {p,q} = singlePathQuery(path);
  const now = Date.now();
  if(p==="/api/login" && method==="POST") return {token:"single-local",username:"local"};
  if(p==="/api/logout") return {ok:true};
  if(p==="/api/llm/providers"){
    const cfg = singleLLMConfig();
    return cfg
      ? {default:"personal-api", providers:[{id:"personal-api",name:"我的 API",model:cfg.model,local:false,enabled:true}]}
      : {default:"", providers:[]};
  }
  if(p==="/api/llm/personal"){
    if(method==="GET"){ const c=singleLLMConfig(); return {personal: c?{base:c.base,model:c.model,hasKey:!!c.key}:null}; }
    if(method==="PUT"){
      const b=body||{};
      if(typeof b.base!=="string"||!b.base.trim()||typeof b.model!=="string"||!b.model.trim()) throw singleErr(400,"请填写 API 地址和模型名");
      saveSingleLLM({base:b.base.trim(), model:b.model.trim(), key:String(b.key||"")});
      return {ok:true};
    }
    if(method==="DELETE"){ try{ localStorage.removeItem(SINGLE_LLM_KEY); }catch(e){} return {ok:true}; }
  }
  if(p==="/api/worlds"){
    const worlds = singleWorlds();
    if(method==="GET"){
      if(q.id){ const w=worlds.find(x=>x.id===q.id); if(!w) throw singleErr(404,"这份旅途已不存在"); return {world:w}; }
      return {worlds: worlds.map(({text,bible,...meta})=>meta)};
    }
    if(method==="POST"){
      const b=body||{};
      const name = typeof b.name==="string" ? b.name.trim() : "";
      if(!name || typeof b.text!=="string" || b.text.length>500000) throw singleErr(400,"无效的旅途名称或设定");
      const isBook = b.isBook === true;
      let w = null;
      if(!b.createNew){
        if(isBook) w = worlds.find(x=>x.name===name && x.isBook===true);
        else if(typeof b.bookId==="string" && b.bookId) w = worlds.find(x=>!x.isBook && x.bookId===b.bookId);
        else w = worlds.find(x=>x.name===name && !x.isBook);
      }
      if(!w){ w={id:"w"+now.toString(36)+Math.random().toString(36).slice(2,6), name}; worlds.push(w); }
      if(isBook) w.isBook=true;
      if(typeof b.bookId==="string" && b.bookId) w.bookId=b.bookId;
      if(b.source==="paste" || b.source==="upload") w.source=b.source;
      if(b.infiniteMode) w.infiniteMode=true;
      if(typeof b.builtinId==="string" && /^novel_[a-z]+$/.test(b.builtinId)) w.builtinId=b.builtinId;
      if(Number.isSafeInteger(b.windowStart) && b.windowStart>=0) w.windowStart=b.windowStart;
      if(typeof b.worldStart==="string" && b.worldStart) w.worldStart=b.worldStart.slice(0,600);
      if(b.role) w.role=journeyRole(b.role);
      if(typeof b.genre==="string" && b.genre) w.genre=b.genre.slice(0,24);
      Object.assign(w,{text:b.text, savedAt:now});
      if(typeof b.summary==="string" && b.summary) w.summary=b.summary.slice(0,4000);
      if(b.bible && typeof b.bible==="object"){
        try{ const s2=JSON.stringify(b.bible); if(s2.length<=400000) w.bible=JSON.parse(s2); }catch(e){}
      }
      if(typeof b.title==="string" && b.title) w.title=b.title.slice(0,120);
      if(typeof b.author==="string" && b.author) w.author=b.author.slice(0,80);
      saveSingleWorlds(worlds);
      return {world:w};
    }
  }
  if(p==="/api/worlds/rename" && method==="POST"){
    const id = body && body.id;
    const name = body && typeof body.name==="string" ? body.name.trim() : "";
    if(!id || !name || name.length>255) throw singleErr(400,"无效的名称");
    const worlds = singleWorlds();
    const w = worlds.find(x=>x.id===id);
    if(!w) throw singleErr(404,"这份记录已不存在");
    w.name = name;
    if(w.isBook) w.title = name.slice(0,120);
    w.savedAt = now;
    saveSingleWorlds(worlds);
    return {world:w};
  }
  if(p==="/api/worlds/delete-book" && method==="POST"){
    const id = body && body.id;
    if(!id) throw singleErr(400,"无效的书目编号");
    const worlds=singleWorlds();
    const target=worlds.find(w=>w.id===id);
    if(!target || !target.isBook) throw singleErr(400,"这不是书库中的小说剧本");
    const ids=new Set([id,...worlds.filter(w=>w.bookId===id).map(w=>w.id)]);
    saveSingleWorlds(worlds.filter(w=>!ids.has(w.id)));
    for(const wid of ids){ try{ localStorage.removeItem(singleSaveKey(wid)); }catch(e){} }
    return {ok:true,deleted:[...ids]};
  }
  if(p==="/api/worlds/delete" && method==="POST"){
    const id = body && body.id;
    if(!id) throw singleErr(400,"无效的旅途编号");
    const worlds=singleWorlds();
    const target=worlds.find(w=>w.id===id);
    if(target && target.isBook) throw singleErr(400,"这是书库中的小说剧本，不能从旅途记录里删除。");
    if(target && target.source==="upload" && !target.bookId && typeof target.text==="string"){
      worlds.push({...target, id:"w"+now.toString(36)+Math.random().toString(36).slice(2,6),
        name:String(target.name||"导入书").slice(0,240)+"（书库原文）", isBook:true, source:"upload",
        turn:0, scene:"", finished:false, savedAt:now});
    }
    saveSingleWorlds(worlds.filter(w=>w.id!==id));
    try{ localStorage.removeItem(singleSaveKey(id)); }catch(e){}
    return {ok:true};
  }
  if(p==="/api/save"){
    if(method==="GET"){
      if(!q.id) throw singleErr(400,"无效的旅途编号");
      let save=null; try{ save=JSON.parse(localStorage.getItem(singleSaveKey(q.id))||"null"); }catch(e){}
      return {save};
    }
    if(method==="PUT"){
      const b=body||{};
      if(!b.id || !b.save || typeof b.save!=="object") throw singleErr(400,"无效的存档");
      try{ localStorage.setItem(singleSaveKey(b.id), JSON.stringify(b.save)); }
      catch(e){ throw singleErr(507,"本地存储空间不足，存档保存失败"); }
      const worlds=singleWorlds(); const w=worlds.find(x=>x.id===b.id);
      if(w){ w.turn=Number.isSafeInteger(b.save.turn)?b.save.turn:0; w.scene=typeof b.save.scene==="string"?b.save.scene.slice(0,150):""; w.finished=!!b.save.ending; w.savedAt=now; saveSingleWorlds(worlds); }
      return {ok:true};
    }
  }
  throw singleErr(404,"未找到接口");
}

async function api(path, { method = "GET", body, token = AUTH.token } = {}){
  if(isSingleMode()) return singleApi(path, { method, body, token });
  let res;
  try{
    res = await fetch(path, {
      method,
      headers: { ...(body ? {"Content-Type":"application/json"} : {}), ...(token ? {Authorization:"Bearer "+token} : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
  }catch(e){ throw new Error("暂时无法连接酒馆，请稍后重试"); }
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    const error = new Error(data.error || ("请求失败（"+res.status+"）"));
    error.status = res.status;
    throw error;
  }
  return data;
}

/* ==================== 工具 ==================== */
const $ = id => document.getElementById(id);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

function addLog(entry){ S.log.push(entry); }
function renderLog(){
  const log = $("log");
  log.replaceChildren();
  S.log.forEach(logToDOM);
  log.scrollTop = log.scrollHeight;
}
function limitLog(){
  S.log = S.log.slice(-120);
  const log = $("log");
  while(log.children.length>S.log.length) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
}
function logAvatarFor(name, isPlayer){
  const initial = String(name || "?").slice(0,1);
  let key = "", file = "", known = false;
  if(isPlayer){
    known = true;
    key = S.avatarKey || "";
    if(!key){
      const spec = (typeof playerImageSpec==="function") ? playerImageSpec() : {name:name||"你"};
      const id = (typeof pickAvatarFor==="function") ? pickAvatarFor(spec,new Set()) : "";
      if(id && typeof AVATAR_LIB!=="undefined" && AVATAR_LIB[id]) file = AVATAR_LIB[id].file;
    }
  }else{
    const c = (S.cast||[]).find(x=>x && x.name===name);
    if(c){
      known = true;
      key = c.avatarKey || "";
      if(!key && c.avatar && typeof AVATAR_LIB!=="undefined" && AVATAR_LIB[c.avatar]) file = AVATAR_LIB[c.avatar].file;
    }
  }
  if(!known) return "";
  if(key) return '<img class="log-avatar" data-avatar-key="'+escapeHtml(key)+'" alt="">';
  if(file) return '<img class="log-avatar" src="avatars/'+encodeURIComponent(file)+'" alt="">';
  return '<span class="log-avatar log-avatar-fallback">'+escapeHtml(initial)+'</span>';
}
function logToDOM(entry){
  const log = $("log");
  const div = document.createElement("div");
  div.className = "line " + (entry.t==="speech" ? "say speech" : entry.t||"narr");
  if(entry.t==="say" || entry.t==="speech"){
    const speaker = entry.to ? entry.who+" → "+entry.to : entry.who;
    const pname = (typeof playerImageSpec==="function") ? playerImageSpec().name : "";
    const av = logAvatarFor(entry.who, !!pname && entry.who===pname);
    const body = '<span class="who">'+escapeHtml(speaker)+'</span><span class="txt">'+escapeHtml(entry.text)+'</span>';
    div.innerHTML = av ? '<div class="log-row">'+av+'<div class="log-body">'+body+'</div></div>' : body;
  } else if(entry.t==="npc-action"){
    const av = logAvatarFor(entry.who,false);
    const body = '<b>'+escapeHtml(entry.who)+' · 行动</b>　'+escapeHtml(entry.text);
    div.innerHTML = av ? '<div class="log-row">'+av+'<div class="log-body">'+body+'</div></div>' : body;
  } else if(entry.t==="action"){
    const pname = (typeof playerImageSpec==="function") ? playerImageSpec().name : "你";
    const av = logAvatarFor(pname,true);
    div.innerHTML = av ? '<div class="log-row">'+av+'<div class="log-body">'+escapeHtml(entry.text)+'</div></div>' : entry.text;
  } else if(entry.t==="image"){
    div.className = "line image";
    const img = document.createElement("img");
    img.className = "log-image";
    img.alt = entry.alt || "场景图";
    if(entry.key){
      img.dataset.imageKey = entry.key;
      if(typeof imageGet==="function") imageGet(entry.key).then(d=>{ if(d) img.src = d; }).catch(()=>{});
    }else if(entry.data){
      img.src = entry.data;
    }
    div.appendChild(img);
  } else {
    div.textContent = entry.text;
  }
  log.appendChild(div);
  const img = div.querySelector("img[data-avatar-key]");
  if(img && typeof imageGet==="function"){
    imageGet(img.dataset.avatarKey).then(d=>{ if(d) img.src = d; }).catch(()=>{});
  }
  return div;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function useItem(index){
  const it = S.items && S.items[index];
  if(!it || !S.ai || activeTurn) return;
  if(!it.effect){
    const txt = "你查看了一下「"+it.name+"」"+(it.desc?"："+it.desc:"")+"。";
    addLog({t:"sys",text:txt}); logToDOM({t:"sys",text:txt});
    return;
  }
  const before = {coin:S.coin, hp:S.hp, rep:S.rep, morality:S.morality||0, wanted:S.wanted||0};
  const effects = {...it.effect,payment:it.name};
  delete effects.rep;
  applyEffect(S,effects);
  const changes = describeStatChanges(before, S, curName(S));
  if(it.consumable!==false){ it.qty=(it.qty||1)-1; if((it.qty||0)<=0) S.items.splice(index,1); }
  const txt = "你使用了「"+it.name+"」"+(changes?"："+changes:"")+"。";
  addLog({t:"sys",text:txt}); logToDOM({t:"sys",text:txt});
  S.memory = [...(S.memory||[]), "玩家使用了「"+it.name+"」"].slice(-40);
  refreshStats(); refreshSide(); saveProgress();
}

function refreshStats(){
  if(S.ai) ensureCurrency(S);
  if(S.ai) ensureDrives(S);
  const coinLabel = $("s-coin-label");
  if(coinLabel) coinLabel.textContent = curName(S);
  $("s-coin").textContent = S.coin;
  const reputation = localReputation(S);
  $("s-rep").textContent = S.ai ? reputation.label : S.rep;
  $("s-rep").parentElement.title = S.ai
    ? (reputation.scope ? reputation.scope+" · " : "")+reputation.guide
    : "你在酒馆里累积的名声";
  $("s-hp").textContent = S.hp;
  $("s-hp").parentElement.title = S.ai ? staminaLabel(S)+" · "+S.hp+"/"+(S.hpMax||100) : "体力 "+S.hp;
  const hpMax = S.hpMax||100;
  const hpPct = clamp((S.hp/hpMax)*100, 0, 100);
  const f = $("s-hp-fill");
  f.style.width = hpPct + "%";
  f.style.background = hpPct>50 ? "linear-gradient(90deg,var(--green),#a8d070)"
                    : hpPct>20 ? "linear-gradient(90deg,#c9a227,#e0c060)"
                    : "linear-gradient(90deg,var(--red),#e07050)";
  const status = $("world-status");
  const env = S.environment;
  status.textContent = S.ai ? [formatClock(S),env.place,env.weather,"时间线："+timelineLabel(S)].filter(Boolean).join(" · ")
    : formatStoryTime(env.minute,S);
  status.hidden = !status.textContent;
}

function refreshSide(){
  if(typeof ensureTimelineState==="function") ensureTimelineState(S);
  const body = $("side-body");
  const tab = document.querySelector(".side-tab.active").dataset.tab;
  if(S.ai){
    const arr = v=>Array.isArray(v) ? v : [];
    S.memory = arr(S.memory);
    S.cast = arr(S.cast);
    S.quests = arr(S.quests);
    S.items = arr(S.items);
    S.abilities = arr(S.abilities);
    S.consequences = arr(S.consequences);
    S.social = arr(S.social);
    S.plot = (S.plot && typeof S.plot==="object") ? S.plot : {};
    S.environment = (S.environment && typeof S.environment==="object")
      ? S.environment
      : {minute:null,era:"",background:"",place:"",weather:"",conditions:""};
    const title = S.worldName || (S.genre ? S.genre + "剧本" : "暗夜酒馆");
    const reputation = localReputation(S);
    const memories = S.memory.slice(-8);
    const row = (label,value)=>value ? '<div class="qd"><b>'+escapeHtml(label)+' · </b>'+escapeHtml(value)+'</div>' : "";
    const card = (heading,content)=>'<div class="quest-item"><div class="qt">'+escapeHtml(heading)+'</div>'+content+'</div>';
    const itemCardsHtml = S.items.length
      ? card("物品与线索",'<div class="item-list">'+S.items.map((it,i)=>{
          const meta=[(it.qty>1?("×"+it.qty):""),(Number.isFinite(it.value)&&it.value>0?("约 "+it.value+" "+curName(S)):""),(it.effect?"可用":"")].filter(Boolean).join(" · ");
          return '<div class="item-row"><span class="iname">'+escapeHtml(it.name)+'</span>'
            + (it.desc?'<span class="idesc">'+escapeHtml(it.desc)+'</span>':'')
            + (meta?'<span class="imeta">'+escapeHtml(meta)+'</span>':'')
            + (it.effect?'<button type="button" class="item-use" data-use="'+i+'">使用</button>':'')+'</div>';
        }).join("")+'</div>') : "";
    const abilityCardsHtml = S.abilities.length
      ? card("习得能力",'<div class="qd">'+S.abilities.map(a=>escapeHtml(a.name)).join("、")+'</div>') : "";
    const itemTab = document.querySelector('.side-tab[data-tab="items"]');
    if(itemTab) itemTab.textContent = "物品"+(S.items.length ? " "+S.items.length : "");
    if(tab==="items"){
      body.innerHTML = (itemCardsHtml || card("物品与线索",'<div class="empty">还没有物品。调查中获得的证物、钥匙、信件、照片、账本会出现在这里。</div>'))
        + abilityCardsHtml
        + (memories.length ? card("已掌握线索",'<div class="qd">'+memories.map(m=>escapeHtml(m)).join("<br>")+'</div>') : "");
    }else if(tab==="char"){
      const editNpc = npcEditName ? (S.cast||[]).find(c=>c && c.name===npcEditName) : null;
      if(editNpc){
        const c = editNpc;
        body.innerHTML = `
          <div class="role-editor">
            <label>姓名<input id="ne-name" maxlength="60" value="${escapeHtml(String(c.name||""))}"></label>
            <div class="role-edit-row"><label>性别<input id="ne-gender" maxlength="10" value="${escapeHtml(String(c.gender||""))}"></label><label>年龄<input id="ne-age" type="number" min="1" max="200" value="${Number.isFinite(Number(c.age))?Number(c.age):""}"></label></div>
            <div class="role-edit-row"><label>身高 cm<input id="ne-height" type="number" min="30" max="300" value="${Number.isFinite(Number(c.height))?Number(c.height):""}"></label><label>体重 kg<input id="ne-weight" type="number" min="2" max="500" value="${Number.isFinite(Number(c.weight))?Number(c.weight):""}"></label></div>
            <label>物种<input id="ne-species" maxlength="40" value="${escapeHtml(String(c.species||""))}"></label>
            <label>身份<input id="ne-identity" maxlength="200" value="${escapeHtml(String(c.identity||""))}"></label>
            <label>职业<input id="ne-job" maxlength="120" value="${escapeHtml(String(c.job||""))}"></label>
            <label>外貌<input id="ne-appearance" maxlength="300" value="${escapeHtml(String(c.appearance||""))}"></label>
            <label>衣着<input id="ne-outfit" maxlength="200" value="${escapeHtml(String(c.outfit||""))}"></label>
            <label>性格<input id="ne-personality" maxlength="200" value="${escapeHtml(String(c.personality||""))}"></label>
            <label>背景<input id="ne-background" maxlength="400" value="${escapeHtml(String(c.background||""))}"></label>
            <label>长期目标<input id="ne-goal" maxlength="200" value="${escapeHtml(String(c.goal||""))}"></label>
            <label>眼下打算<input id="ne-agenda" maxlength="200" value="${escapeHtml(String(c.agenda||""))}"></label>
            <label>对玩家态度<input id="ne-attitude" maxlength="200" value="${escapeHtml(String(c.attitude||""))}"></label>
            <label>关系标签<input id="ne-tie" maxlength="120" value="${escapeHtml(String(c.tie||""))}"></label>
            <div class="card-btns"><button class="big-btn" id="ne-save">保存修正</button><button class="big-btn ghost" id="ne-cancel">取消</button></div>
          </div>`;
        $("ne-cancel").onclick = ()=>{ npcEditName=""; refreshSide(); };
        $("ne-save").onclick = ()=>{
          const oldName = c.name;
          const name = $("ne-name").value.trim();
          if(!name){ alert("姓名不能为空"); return; }
          const num = (id,min,max)=>{ const n=Number($(id).value); return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):undefined; };
          c.name = name;
          c.gender = $("ne-gender").value.trim();
          c.age = num("ne-age",1,200);
          c.height = num("ne-height",30,300);
          c.weight = num("ne-weight",2,500);
          c.species = $("ne-species").value.trim();
          c.identity = $("ne-identity").value.trim();
          c.job = $("ne-job").value.trim();
          c.appearance = $("ne-appearance").value.trim();
          c.outfit = $("ne-outfit").value.trim();
          c.personality = $("ne-personality").value.trim();
          c.background = $("ne-background").value.trim();
          c.goal = $("ne-goal").value.trim();
          c.agenda = $("ne-agenda").value.trim();
          c.attitude = $("ne-attitude").value.trim();
          c.tie = $("ne-tie").value.trim();
          if(oldName!==name){
            S.present = (S.present||[]).map(n=>n===oldName?name:n);
            if(S.talkTarget===oldName) S.talkTarget = name;
            if(S.aff && oldName in S.aff){ S.aff[name]=S.aff[oldName]; delete S.aff[oldName]; }
            if(S.intimacy && oldName in S.intimacy){ S.intimacy[name]=S.intimacy[oldName]; delete S.intimacy[oldName]; }
            for(const p of (S.cast||[])) if(Array.isArray(p.links)) p.links = p.links.map(l=>l && l.name===oldName?{...l,name}:l);
            for(const l of (S.openLoops||[])) if(Array.isArray(l.participants)) l.participants = l.participants.map(n=>n===oldName?name:n);
          }
          ensureNpcDefaults(c,S);
          npcDetailName = name;
          npcEditName = "";
          saveProgress();
          refreshSide();
        };
        return;
      }
      const detailNpc = npcDetailName ? (S.cast||[]).find(c=>c && c.name===npcDetailName && !c.dead) : null;
      if(detailNpc){
        const c = detailNpc;
        const aff = S.aff?.[c.name] || 0;
        const intim = Number.isFinite(S.intimacy?.[c.name]) ? S.intimacy[c.name] : (c.intimacy||0);
        const tierLabel = (typeof intimacyTier==="function" && typeof INTIMACY_TIERS!=="undefined")
          ? (INTIMACY_TIERS[intimacyTier(aff,intim)]?.label||"") : "";
        const status = c.hp<=20 ? "重伤/虚弱" : c.hp<=50 ? "带伤" : "正常";
        const avatarFile = c.avatar
          ? ((typeof AVATAR_LIB!=="undefined" && AVATAR_LIB[c.avatar]) ? AVATAR_LIB[c.avatar].file : c.avatar)
          : "";
        const avatar = c.avatarKey
          ? '<img class="npc-avatar" data-avatar-key="'+escapeHtml(c.avatarKey)+'" alt="">'
          : (avatarFile
            ? '<img class="npc-avatar" src="avatars/'+encodeURIComponent(avatarFile)+'" alt="" loading="lazy" decoding="async">'
            : '<div class="npc-avatar npc-avatar-fallback">'+escapeHtml(String(c.name).slice(0,1))+'</div>');
        const attrs = c.attrs ? row("智商",(c.attrs.iq??50)+"（"+attrLabel(c.attrs.iq??50)+"）")
          +row("体质",(c.attrs.physique??50)+"（"+attrLabel(c.attrs.physique??50)+"）")
          +row("魅力",(c.attrs.charm??50)+"（"+attrLabel(c.attrs.charm??50)+"）")
          +row("意志",(c.attrs.willpower??50)+"（"+attrLabel(c.attrs.willpower??50)+"）")
          +row("敏捷",(c.attrs.agility??50)+"（"+attrLabel(c.attrs.agility??50)+"）") : "";
        const combat = c.combat ? row("武力",String(c.combat.power||0))
          +row("内力",(c.combat.energy||0)+"/"+(c.combat.energyMax||0))
          +row("绝技",(c.combat.techniques||[]).map(t=>t.name).join("、")||"无") : "";
        const links = (c.links||[]).map(l=>l.name+(l.relation?("（"+l.relation+"）"):"")+(Number.isFinite(l.aff)?(" 好感"+l.aff):"")).join("；");
        const memoriesText = (c.memories||[]).slice(-4).reverse().map(m=>"第"+(m.turn||"?")+"幕："+m.text).join("<br>");
        body.innerHTML = '<div class="self-head">'+avatar+'<div class="self-head-info"><div class="self-name">'+escapeHtml(c.name)+'</div><div class="self-meta">'+escapeHtml([c.identity||c.job,c.species,c.age?c.age+"岁":"",c.gender].filter(Boolean).join(" · "))+'</div><button type="button" class="npc-gen" data-gen-avatar="'+escapeHtml(c.name)+'">'+(c.avatarKey?"重生成":"生成头像")+'</button></div></div>'
          + card("基本资料", row("姓名",c.name)+row("身份",c.identity||c.job)+row("职业",c.job)
            +row("年龄",c.age?c.age+" 岁":"未记录")+row("性别",c.gender||"未记录")
            +row("物种",c.species||"人类")+row("出身",c.origin)
            +row("身高",c.height?c.height+" cm":"未记录")+row("体重",c.weight?c.weight+" kg":"未记录"))
          + card("外貌与生活", row("外貌",c.appearance)+row("衣着",c.outfit)
            +row("作息",c.routine)+row("说话习惯",c.voice)+row("爱好",c.hobby))
          + card("性格与动机", row("性格",c.personality)+row("背景",c.background)
            +row("长期目标",c.goal)+row("眼下打算",c.agenda)+row("对玩家的态度",c.attitude))
          + card("关系与状态", row("与玩家关系",[tierLabel,aff?("好感 "+aff):"",intim?("亲密 "+intim):""].filter(Boolean).join(" · "))
            +row("与玩家关系标签",c.tie)+row("人物关系网",links)+row("状态",status+(c.dead?"":" · 体力 "+(c.hp??100)))
            +row("财产",c.wealth)+row("随身现金",Number.isFinite(c.coin)?c.coin+" "+curName(S):"")
            +row("声望",Number.isFinite(c.rep)?c.rep:"")+row("道德",Number.isFinite(c.moral)?c.moral:"")+row("通缉",Number.isFinite(c.wanted)?c.wanted:""))
          + attrs + (combat ? card("武力",combat) : "")
          + (memoriesText ? card("最近经历",'<div class="qd">'+memoriesText+'</div>') : "")
          + '<div class="card-btns"><button class="big-btn ghost" id="npc-detail-edit">修订资料</button><button class="big-btn ghost" id="npc-detail-back">返回人物列表</button></div>';
        body.querySelectorAll("img[data-avatar-key]").forEach(async img=>{
          try{ const data = await imageGet(img.dataset.avatarKey); if(data) img.src = data; }catch(e){}
        });
        body.querySelectorAll("[data-gen-avatar]").forEach(btn=>{
          btn.onclick = async ()=>{
            if(btn.disabled) return;
            const old = btn.textContent;
            btn.disabled = true; btn.textContent = "生成中…";
            try{ await generateNpcAvatar(btn.dataset.genAvatar); }
            catch(e){ btn.disabled=false; btn.textContent = old; alert("生成失败："+e.message); }
          };
        });
        const back = $("npc-detail-back");
        if(back) back.onclick = ()=>{ npcDetailName = ""; refreshSide(); };
        const edit = $("npc-detail-edit");
        if(edit) edit.onclick = ()=>{ npcEditName = c.name; npcDetailName = ""; refreshSide(); };
        return;
      }
      const present = Array.isArray(S.present)
        ? card("在场人物",'<div class="qd">'+(S.present.length
            ? S.present.map(n=>'<button type="button" class="talk-chip'+((S.talkTarget===n)?" active":"")+'" data-talk="'+escapeHtml(n)+'">'+escapeHtml(n)+'</button>').join(" ")
            : "你此刻独处")+'</div>') : "";
      const career = CAREERS[S.career];
      const roleName = S.worldRole && S.worldRole.name;
      const pi = S.playerIdentity;
      const playerName = (pi && pi.name) || roleName || "你";
      const playerSpecies = S.species || (pi && pi.species) || (S.worldRole && S.worldRole.species) || "人类";
      const playerGender = S.gender || (S.worldRole && S.worldRole.gender) || "";
      const playerAge = S.age || (S.worldRole && S.worldRole.age);
      const playerIdentity = (pi && pi.identity) || (S.worldRole && S.worldRole.identity) || (career && career.identity) || "";
      const playerSpec = {name:playerName,species:playerSpecies,gender:playerGender,age:playerAge,identity:playerIdentity,tie:"玩家本人"};
      let selfAvatarFile = "";
      if(!S.avatarKey && typeof AVATAR_LIB!=="undefined"){
        const sid = pickAvatarFor(playerSpec, new Set());
        if(sid && AVATAR_LIB[sid]) selfAvatarFile = AVATAR_LIB[sid].file;
      }
      const selfAvatar = S.avatarKey
        ? '<img class="self-avatar" data-avatar-key="'+escapeHtml(S.avatarKey)+'" alt="">'
        : (selfAvatarFile ? '<img class="self-avatar" src="avatars/'+encodeURIComponent(selfAvatarFile)+'" alt="">' : '<div class="self-avatar npc-avatar-fallback">'+escapeHtml(String(playerName).slice(0,1))+'</div>');
      const selfHead = '<div class="self-head">'+selfAvatar+'<div class="self-head-info"><div class="self-name">'+escapeHtml(playerName)+'</div><div class="self-meta">'+escapeHtml(playerIdentity||playerSpecies||"")+'</div><button type="button" class="npc-gen" data-gen-player="1">'+(S.avatarKey?"重生成":"生成头像")+'</button></div></div>';
      const selfAttrs = card("你自己",
        selfHead + row("身份", pi
          ? pi.name+(pi.identity ? "（"+pi.identity+"）" : "")
          : (roleName
            ? roleName+(S.worldRole.identity ? "（"+S.worldRole.identity+"）" : "")
            : (career ? career.name+"（"+career.identity+"）" : "无职业")))
        +row("年龄",Number.isFinite(S.age) ? (S.age+" 岁"+(S.ageMonths ? (" "+S.ageMonths+" 个月") : "")) : "未定")
        +row("生日",S.birth ? formatDateParts(S.birth,false) : "")
        +row("性别",S.gender||"未定")
        +row("出身",S.origin||"未定")
        +row("身高",S.height ? S.height+" cm" : "未定")
        +row("体重",S.weight ? S.weight+" kg" : "未定")
        +row("外貌",S.appearance||"未定")
        +row("衣着",S.outfit||"未定")
        +((S.incomePerDay||0)>0 || S.incomePlan ? row("收入",incomePlanText(S.incomePlan,S.incomePerDay||0)) : "")
        +row("存款",Number.isFinite(S.savings) ? (S.savings+" "+curName(S)) : "未记录")
        +row("食物",(S.food||0)+" 份")
        +row("资产",assetsText(S.assets))
         +row("体力",staminaLabel(S)+"（"+S.hp+"/"+(S.hpMax||100)+"）")
         +row("声望",(reputation.scope || "此地")+" · "+reputation.label)
         +row("口碑的影响",reputation.guide)
         +row("最近的传闻",reputation.reason)
        +row("智商",(S.iq??50)+"（"+attrLabel(S.iq??50)+"）")
        +row("体质",(S.physique??50)+"（"+attrLabel(S.physique??50)+"）")
        +row("魅力",(S.charm??50)+"（"+attrLabel(S.charm??50)+"）")
        +row("意志",(S.willpower??50)+"（"+attrLabel(S.willpower??50)+"）")
        +row("敏捷",(S.agility??50)+"（"+attrLabel(S.agility??50)+"）")
        +row("体力",(S.hp)+" / "+(S.hpMax||100))
        +row("欲望",DRIVE_KEYS.map(k=>DRIVE_META[k].label+" "+(S.desires?.[k]??0)).join(" · "))
        +row("健康",(S.health??100)+"（"+attrLabel(S.health??100)+"）")
        +(S.combat ? (function(){
          const cp = typeof combatProfileFor==="function" ? combatProfileFor(S) : null;
          const tn = (S.combat.techniques||[]).map(t=>t.name+(t.cost?("（耗"+t.cost+"）"):"")).join("、") || "无";
          return row(cp?cp.power:"武力",String(S.combat.power||0))+row(cp?cp.energy:"内力",(S.combat.energy||0)+"/"+(S.combat.energyMax||0))+row(cp?cp.technique:"绝技",tn);
        })() : "")
        +(combatProfileFor(S)?.id==="wuxia" ? row("修习进度",martialTrainingText(S)) : "")
        +((S.debt||0)>0 ? row("欠债",S.debt+" "+curName(S)) : "")
        +row("技能",Object.keys(S.skills||{}).length
          ? Object.entries(S.skills).map(([k,v])=>k+" "+v+"（"+skillLevel(v)+"）").join("、") : "无")
        +(career ? row("处境",career.standing) : "")
      );
      const socialCards = (S.social||[]).length
        ? card("社会关系",'<div class="qd">'+S.social.map(r=>escapeHtml(r.name+(r.relation?"（"+r.relation+"）":"")+(r.power?" · "+r.power:"")+(r.attitude?" · "+r.attitude:""))).join("<br>")+'</div>')
        : "";
      const npcCards = (S.cast||[]).filter(c=>c && c.name && !c.offstage && !c.dead && !c.group).slice(0,10).map(c=>{
        const avatarFile = c.avatar
          ? ((typeof AVATAR_LIB!=="undefined" && AVATAR_LIB[c.avatar]) ? AVATAR_LIB[c.avatar].file : c.avatar)
          : "";
        const avatar = c.avatarKey
          ? '<img class="npc-avatar" data-avatar-key="'+escapeHtml(c.avatarKey)+'" alt="">'
          : (avatarFile
            ? '<img class="npc-avatar" src="avatars/'+encodeURIComponent(avatarFile)+'" alt="" loading="lazy" decoding="async">'
            : '<div class="npc-avatar npc-avatar-fallback">'+escapeHtml(String(c.name).slice(0,1))+'</div>');
        const meta = [
          c.identity || c.job,
          Number.isFinite(c.age) && c.age>0 ? c.age+"岁" : "",
          c.gender,
          c.species,
          c.tie,
          c.attitude,
          c.combat ? ("武力 "+c.combat.power) : ""
        ].filter(Boolean).slice(0,5).join(" · ");
        const desc = [c.appearance,c.outfit].filter(Boolean).join(" · ");
        return '<div class="npc-card">'+avatar+'<div class="npc-info"><div class="npc-name">'+escapeHtml(c.name)+'</div><div class="npc-meta">'+escapeHtml(meta||"身份未明")+'</div>'+(desc?'<div class="npc-desc">'+escapeHtml(desc)+'</div>':'')+'</div><div class="npc-actions"><button type="button" class="npc-gen" data-npc-detail="'+escapeHtml(c.name)+'">详情</button><button type="button" class="npc-gen" data-gen-avatar="'+escapeHtml(c.name)+'">'+(c.avatarKey?"重生成":"生成头像")+'</button></div></div>';
      }).join("");
      const groupCards = (S.cast||[]).filter(c=>c && c.name && !c.dead && !c.offstage && c.group).slice(0,8).map(c=>{
        const info = [c.identity || c.job, c.attitude, c.hp<100 ? "受挫" : ""].filter(Boolean).join(" · ");
        return '<div class="npc-group"><b>'+escapeHtml(c.name)+'</b>'+(info?'<span>'+escapeHtml(info)+'</span>':'')+'</div>';
      }).join("");
      body.innerHTML = selfAttrs
        + (npcCards ? card("人物档案",'<div class="npc-grid">'+npcCards+'</div>') : "")
        + (groupCards ? card("群体与势力",'<div class="npc-groups">'+groupCards+'</div>') : "")
        + socialCards + present || '<div class="empty">遇到的人物会记录在这里。</div>';
      body.querySelectorAll("img[data-avatar-key]").forEach(async img=>{
        try{ const data = await imageGet(img.dataset.avatarKey); if(data) img.src = data; }catch(e){}
      });
      body.querySelectorAll("[data-npc-detail]").forEach(btn=>{
        btn.onclick = ()=>{ npcDetailName = btn.dataset.npcDetail; refreshSide(); };
      });
      body.querySelectorAll("[data-gen-avatar]").forEach(btn=>{
        btn.onclick = async ()=>{
          if(btn.disabled) return;
          const old = btn.textContent;
          btn.disabled = true; btn.textContent = "生成中…";
          try{ await generateNpcAvatar(btn.dataset.genAvatar); }
          catch(e){ btn.disabled=false; btn.textContent = old; alert("生成失败："+e.message); }
        };
      });
      body.querySelectorAll("[data-gen-player]").forEach(btn=>{
        btn.onclick = async ()=>{
          if(btn.disabled) return;
          const old = btn.textContent;
          btn.disabled = true; btn.textContent = "生成中…";
          try{ await generatePlayerAvatar(); }
          catch(e){ btn.disabled=false; btn.textContent = old; alert("生成失败："+e.message); }
        };
      });
    }else if(tab==="story"){
      const ch = S.chapter || null;
      const loops = (S.openLoops||[]).slice(-8).reverse();
      const closed = (S.loopHistory||[]).slice(-5).reverse();
      const tls = S.timelines || [];
      const ordered = typeof orderedTimelines==="function" ? orderedTimelines(S) : tls.map(t=>({t,depth:0}));
      const currentSummary = {
        turn:S.turn||0, scene:S.scene||"", chapter:S.chapter?.title||"未建立篇章",
        coin:S.coin, hp:S.hp, cast:(S.cast||[]).length, loops:(S.openLoops||[]).length
      };
      const timelineRows = ordered.map(({t,depth})=>{
        const parent = tls.find(x=>x.id===t.parentId);
        const snap = typeof timelineSnapshotSummary==="function" ? timelineSnapshotSummary(S,t.id) : null;
        const meta = [t.id===S.timelineId?"当前":"", t.parentId?("第"+(t.branchTurn??"?")+"幕从「"+(parent?.name||"上级线")+"」分叉"):"起点", snap?("存档第 "+snap.turn+" 幕"):"尚无独立快照"].filter(Boolean).join(" · ");
        return '<div class="tl-node'+(t.id===S.timelineId?' active':'')+'" style="padding-left:'+(6+depth*14)+'px">'
          +'<button class="tl-open" data-timeline="'+escapeHtml(t.id)+'"><span class="tl-name">'+escapeHtml((depth?"└ ":"")+(t.name||"未命名时间线"))+'</span><span class="tl-meta">'+escapeHtml(meta)+'</span></button>'
          +'<span class="tl-actions"><button class="tl-mini" data-timeline-compare="'+escapeHtml(t.id)+'">对比</button>'
          +(t.id!=="main"?'<button class="tl-mini danger" data-timeline-delete="'+escapeHtml(t.id)+'">删除</button>':'')+'</span></div>';
      }).join("");
      const compare = timelineCompareId && typeof timelineSnapshotSummary==="function" ? timelineSnapshotSummary(S,timelineCompareId) : null;
      const compareName = tls.find(t=>t.id===timelineCompareId)?.name || "未选择";
      const compareRow = (label,a,b)=>'<div class="tl-compare-row"><span>'+escapeHtml(label)+'</span><b>'+escapeHtml(String(a??"—"))+'</b><b>'+escapeHtml(String(b??"—"))+'</b></div>';
      const compareHtml = compare ? '<div class="tl-compare">'
        +'<div class="tl-compare-head"><span>项目</span><b>当前 · '+(currentTimeline(S)?.name||"")+'</b><b>'+escapeHtml(compareName)+'</b></div>'
        +compareRow("幕数",currentSummary.turn,compare.turn)
        +compareRow("场景",currentSummary.scene,compare.scene)
        +compareRow("篇章",currentSummary.chapter,compare.chapter)
        +compareRow("金币",currentSummary.coin,compare.coin)
        +compareRow("体力",currentSummary.hp,compare.hp)
        +compareRow("人物",currentSummary.cast,compare.cast)
        +compareRow("未了事项",currentSummary.loops,compare.loops)
        +'<div class="tl-compare-note">'+escapeHtml(compare.lastText||"")+'</div>'
        +'<button class="tl-mini" id="tl-compare-clear">清除对比</button></div>' : "";
      const snapStats = typeof timelineSnapshotStats==="function" ? timelineSnapshotStats(S) : {count:0,bytes:0};
      const timelineCard = card("时间线", '<div class="tl-list">'+timelineRows+'</div>'
        +'<button class="big-btn ghost" id="btn-branch-timeline">从当前幕创建分支</button>'
        +'<div class="tl-storage">本地快照 '+snapStats.count+' 个 · 约 '+Math.max(1,Math.round(snapStats.bytes/1024))+' KB</div>'
        +compareHtml);
      const chapterCard = ch
        ? card("当前篇章", row("篇章", ch.title)+row("目标", ch.goal)+row("筹码与代价", ch.stakes)+row("下一步", ch.next)+row("阶段", Object.hasOwn(CHAPTER_PHASES,ch.phase) ? CHAPTER_PHASES[ch.phase] : ch.phase)+row("余波",ch.outcome))
        : card("当前篇章", '<div class="empty">还没有篇章信息。持续几幕或开启新故事后，AI 会建立当前篇章。</div>');
      const chapterHistory = (S.chapterHistory||[]).slice(-4).reverse().map(c=>row(c.title,c.outcome)).join("");
      const loopCards = loops.length
        ? card("未了事项", '<div class="loop-list">'+loops.map(l=>{
            const ageMinutes = Number.isFinite(l.createdMinute) && Number.isFinite(S.environment?.minute)
            ? Math.max(0,S.environment.minute-l.createdMinute) : null;
            const age = Number.isFinite(l.createdTurn) && Number.isFinite(S.turn) ? Math.max(0,S.turn-l.createdTurn) : null;
            const meta = [l.kind,
              ageMinutes!==null ? ("已悬 "+formatDuration(ageMinutes)) : (age!==null?("已悬 "+age+" 幕"):""),
              l.dueMinute ? ("约 "+formatStoryTime(l.dueMinute,S)) : (l.dueTurn?("预计第 "+l.dueTurn+" 幕"):""),
              (l.participants||[]).join("、")].filter(Boolean).join(" · ");
            return '<div class="loop-row"><span class="loop-text">'+escapeHtml(l.text||"")+'</span>'+(meta?'<span class="loop-meta">'+escapeHtml(meta)+'</span>':'')+'</div>';
          }).join("")+'</div>')
        : card("未了事项", '<div class="empty">当前没有未了事项。</div>');
      const closedCards = closed.length
        ? card("最近收回", '<div class="qd">'+closed.map(l=>escapeHtml(l.outcome||l.text||"")+" · 第"+(l.resolvedTurn||"?")+"幕").join("<br>")+'</div>')
        : "";
      body.innerHTML = timelineCard + chapterCard + (chapterHistory ? card("篇章回顾",chapterHistory) : "") + loopCards + closedCards;
      body.querySelectorAll("[data-timeline]").forEach(btn=>{
        btn.onclick = ()=>{
          if(btn.dataset.timeline===S.timelineId) return;
          const next = switchTimelineState(S,btn.dataset.timeline);
          if(!next){ alert("这条时间线的快照丢失了，无法切换。"); return; }
          S = next;
          timelineCompareId = "";
          undoStack = [];
          renderLog();
          showCurrentScene();
          refreshStats();
          refreshSide();
          saveProgress();
        };
      });
      body.querySelectorAll("[data-timeline-compare]").forEach(btn=>{
        btn.onclick = ()=>{ timelineCompareId = btn.dataset.timelineCompare; refreshSide(); };
      });
      const compareClear = $("tl-compare-clear");
      if(compareClear) compareClear.onclick = ()=>{ timelineCompareId = ""; refreshSide(); };
      body.querySelectorAll("[data-timeline-delete]").forEach(btn=>{
        btn.onclick = ()=>{
          const id = btn.dataset.timelineDelete;
          const meta = (S.timelines||[]).find(t=>t.id===id);
          if(!meta) return;
          if(!confirm("删除时间线「"+meta.name+"」及其快照？\n它的子分支会改挂到上一级时间线，已发生的主线/其他分支不会受影响。")) return;
          if(!deleteTimelineBranch(S,id)){ alert("删除失败：找不到这条时间线。"); return; }
          timelineCompareId = "";
          undoStack = [];
          renderLog();
          showCurrentScene();
          refreshStats();
          refreshSide();
          saveProgress();
        };
      });
      const branchBtn = $("btn-branch-timeline");
      if(branchBtn) branchBtn.onclick = ()=>{
        const name = prompt("新时间线名称", "分支 "+(S.timelines||[]).length);
        if(name===null) return;
        createTimelineBranch(S,name);
        undoStack = [];
        renderLog();
        showCurrentScene();
        refreshStats();
        refreshSide();
        saveProgress();
        imageToast("已创建新时间线："+(S.timelines.find(t=>t.id===S.timelineId)?.name||""),3500);
      };
    }else{
      const itemCards = S.items.length
        ? card("物品与线索",'<div class="item-list">'+S.items.map((it,i)=>{
            const meta=[(it.qty>1?("×"+it.qty):""),(Number.isFinite(it.value)&&it.value>0?("约 "+it.value+" "+curName(S)):""),(it.effect?"可用":"")].filter(Boolean).join(" · ");
            return '<div class="item-row"><span class="iname">'+escapeHtml(it.name)+'</span>'
              + (it.desc?'<span class="idesc">'+escapeHtml(it.desc)+'</span>':'')
              + (meta?'<span class="imeta">'+escapeHtml(meta)+'</span>':'')
              + (it.effect?'<button type="button" class="item-use" data-use="'+i+'">使用</button>':'')+'</div>';
          }).join("")+'</div>') : "";
      const abilityCards = S.abilities.length
        ? card("习得能力",'<div class="qd">'+S.abilities.map(a=>escapeHtml(a.name)).join("、")+'</div>') : "";
      const consequences = S.consequences.slice(-5).reverse().map(c=>card("第 "+c.turn+" 幕的选择",
        row("你的决定",c.decision)+row("留下的影响",c.fact)
        +(c.status==="happened" ? row("后续",c.followUp) : row("后续",c.avertedReason))
      )).join("");
      const env = S.environment;
      const conditions = row("时间",formatClock(S))+row("地点",env.place)
        +row("季节",S.weatherState?.season)+row("天气",env.weather)+row("现场情况",env.conditions);
      const local = locationProfile(S);
      const background = row("时代与地区",env.era)+row("背景",env.background)
        +row("地貌与空间",local.terrain)+row("当地势力",local.authority)+row("当地风俗",local.custom)
        +row("当地规矩",local.rule);
      const totals = S.moneyTotals || {income:0,expense:0};
      const unit = " "+curName(S);
      const cashRows = (S.moneyBook||[]).slice(-10).reverse().map(entry=>
        row(entry.category+" · "+entry.date, moneyEntryText(S,entry))).join("");
      const contractRows = (S.contracts||[]).map(contract=>
        row(contract.item,contractText(S,contract))).join("");
      const expenseRows = economicMode(S)==="barter" ? "" : readExpensePlans(S.expensePlans).map(plan=>
        row(plan.name,expensePlanText(plan,curName(S)))).join("");
      const period = S.lastTimeSettlement;
      const lifeRows = (S.lifeEvents||[]).filter(event=>Object.hasOwn(event.knowledge,"玩家")).reverse().map(event=>
        row(LIFE_EVENT_LABELS[event.kind]+" · "+event.date,event.subject+" · "+[event.detail,
          ...(event.updates||[]).filter(u=>Object.hasOwn(u.knowledge,"玩家")).map(u=>u.detail)].join(" · "))).join("");
      const reactionRows = (S.lifeReactions||[]).slice(-6).reverse().map(reaction=>
        row(reaction.who+" · "+reaction.date,reaction.text)).join("");
      body.innerHTML = card(title,row("第 "+S.turn+" 幕",S.scene||"故事尚未开始")
        +row("主线目标",S.plot.goal)+row("眼前的冲突",S.plot.conflict)+row("下一步",S.plot.next))
        +(usesInvestigation(S) ? card("证据簿",investigationPanel(S,row)) : "")
        +renderGenrePanel(S,card,row)
        +(conditions ? card("当前环境",conditions) : "")
        +(background ? card("世界背景",background) : "")
        +(lifeRows ? card("重大事件",'<details><summary>查看已知事件</summary>'+lifeRows+'</details>'
          +(reactionRows ? '<details><summary>查看人物反应</summary>'+reactionRows+'</details>' : "")) : "")
        +card("收支账本",row("交易制度",economicModeLabel(S))
          +(economicMode(S)==="barter" ? "" : row("可用现金",S.coin+unit)
            +row("累计收入",totals.income+unit)+row("累计支出",totals.expense+unit))
          +(period ? row("上次时间推进",timeSettlementText(S,period)) : "")
          +(cashRows||row("近期记录","暂无收支或换物记录")))
        +(expenseRows ? card("定期开销",expenseRows) : "")
        +(contractRows ? card("生效中的合同",contractRows) : "")
        +((S.currency?.scale || S.offers?.length) ? card("当地物价",
          row("参考",economicMode(S)!=="barter" ? S.currency?.scale : "")+(S.offers||[]).map(o=>row(o.seller,
            o.item+" · "+economicQuote(S,o))).join("")) : "")
        +consequences+itemCards+abilityCards
        +(S.summary ? card("故事回顾",row("进展",S.summary)) : "")
        +memories.map(m=>card("线索",'<div class="qd">'+escapeHtml(m)+'</div>')).join("");
    }
    body.querySelectorAll("[data-talk]").forEach(btn=>{
      btn.onclick = ()=>{ S.talkTarget = btn.dataset.talk; refreshSide(); renderTalkTarget(); };
    });
    body.querySelectorAll("[data-use]").forEach(btn=>{
      btn.onclick = ()=> useItem(Number(btn.dataset.use));
    });
    body.querySelectorAll("[data-investigate]").forEach(btn=>{
      btn.onclick = ()=>{
        if(activeTurn || S.ending) return;
        const request = {kind:btn.dataset.investigate,id:$("evidence-primary").value,
          other:$("evidence-other").value,target:$("evidence-target").value};
        const move = investigationChoice(S,request);
        if(!move){ $("evidence-status").textContent = "比对须选两条不同线索，对质须选一位在场人物。"; return; }
        dismissDrawer();
        aiTurn(move);
      };
    });
    body.querySelectorAll("[data-genre-action]").forEach(btn=>{
      btn.onclick = ()=>{
        if(activeTurn || S.ending) return;
        const move = genreChoices(S)[Number(btn.dataset.genreAction)];
        if(!move) return;
        dismissDrawer();
        aiTurn(move);
      };
    });
    return;
  }
  if(tab==="char"){
    const who = NPC_VIEW[S.node] || "lyra";
    const c = CHARS[who] || CHARS.lyra;
    const aff = clamp(S.aff[c.id]||0, 0, 100);
    const career = CAREERS[S.career];
    const selfCard = career ? `
      <div class="char" style="margin-bottom:12px">
        <div class="avatar">🧑</div>
        <div class="cname">你自己</div>
        <div class="role">${career.emoji} ${career.name}</div>
        <div class="desc">智商 ${S.iq??50}（${attrLabel(S.iq??50)}）· 体质 ${S.physique??50}（${attrLabel(S.physique??50)}）· 魅力 ${S.charm??50}（${attrLabel(S.charm??50)}）<br>意志 ${S.willpower??50}（${attrLabel(S.willpower??50)}）· 敏捷 ${S.agility??50}（${attrLabel(S.agility??50)}）<br>体力 ${S.hp}/${S.hpMax||100} · 健康 ${S.health??100}<br>技能：${Object.keys(S.skills||{}).length?Object.entries(S.skills).map(([k,v])=>k+" "+v).join("、"):"无"}</div>
      </div>` : "";
    body.innerHTML = selfCard + `
      <div class="char">
        <div class="avatar">${c.emoji}</div>
        <div class="cname">${c.name}</div>
        <div class="role">${c.role}</div>
        <div class="aff">
          <span class="label">好感</span>
          <div class="aff-bar"><div class="aff-fill" style="width:${aff}%"></div></div>
          <span class="label">${aff}</span>
        </div>
        <div class="desc">${c.desc}</div>
      </div>`;
  } else {
    if(S.quests.length===0){
      body.innerHTML = `<div class="empty">尚未接受任何任务。<br>与酒馆中的人交谈，<br>或许能听到一些委托。</div>`;
    } else {
      body.innerHTML = S.quests.map(q=>`
        <div class="quest-item ${q.done?'done':''}">
          <div class="qt">${q.done?'✓ ':''}${q.title}</div>
          <div class="qd">${q.desc}</div>
          <div class="qstat">${q.done?'已完成':'进行中'}</div>
        </div>`).join("");
    }
    body.innerHTML += '<div class="quest-item"><div class="qt">收支账本</div><div class="qd">累计收入 '
      +S.moneyTotals.income+' · 累计支出 '+S.moneyTotals.expense+' · 余额 '+S.coin+' 金币</div>'
      +S.moneyBook.slice(-10).reverse().map(entry=>'<div class="qd">'+escapeHtml(entry.category+" · "+moneyEntryText(S,entry))+'</div>').join("")+'</div>';
  }
}

/* ==================== 角色 ==================== */
const CHARS = {
  lyra:{ id:"lyra", name:"莉拉", role:"酒馆老板娘", emoji:"🍺", moral:"灰色", adult:true,
    kinks:["温柔的掌控","耳语与调情","半公开的刺激"],
    desc:"暗夜酒馆的主人。她见惯了形形色色的旅人，总能从只言片语里读出故事。眼神锐利，笑容却温柔。她守着一套自己的规矩——对朋友仗义，对敌人不留情。" },
  bran:{ id:"bran", name:"布兰", role:"退役佣兵", emoji:"🛡️", moral:"正直", adult:true,
    kinks:["被需要的感觉","缓慢与耐心","伤痕与脆弱"],
    desc:"坐在角落里的独臂老兵。曾经是王国最负盛名的佣兵，如今只愿守着酒杯和回忆。他厌恶欺凌弱小，却对旧日的战场手段从不讳言。" },
  mira:{ id:"mira", name:"米拉", role:"神秘占卜师", emoji:"🔮", moral:"中立", adult:true,
    kinks:["神秘的仪式感","被看透","禁忌的好奇"],
    desc:"披着兜帽的女占卜师，据说她的牌从不失准。她似乎知道关于这座酒馆的某些秘密。她只忠于命运本身，不轻易评判善恶。" }
};

/* 亲密阶段门槛：好感度（aff）与亲密度（intimacy）共同决定可解锁的行为层级 */
const INTIMACY_TIERS = [
  { tier:0, minAff:0,  minIntimacy:0,  label:"陌生",   unlock:"无" },
  { tier:1, minAff:30, minIntimacy:20, label:"亲近",   unlock:"并肩独处、十指相扣" },
  { tier:2, minAff:55, minIntimacy:45, label:"暧昧",   unlock:"拥抱、亲吻、耳语调情" },
  { tier:3, minAff:75, minIntimacy:70, label:"亲密",   unlock:"爱抚、宽衣、亲密缠绵" },
  { tier:4, minAff:90, minIntimacy:90, label:"亲密无间", unlock:"更进一步的亲密与更多姿势" }
];

/* 各阶段解锁的亲密姿势/动作清单（供 AI 参考，具体描写由 AI 依角色性格细腻展开） */
const INTIMACY_ACTS = {
  0: [],
  1: ["并肩坐在窗边低声交谈","牵手散步","靠在肩头"],
  2: ["拥抱","亲吻","耳畔低语","指尖描摹对方轮廓","额头相抵"],
  3: ["依偎入怀","解开衣襟的暧昧","轻柔的爱抚","缠绵的相拥","贴着颈侧的低语","掌心贴着后背缓缓游走"],
  4: ["更深入的亲密缠绵","变换姿势的默契","彼此全然交付的亲密","呼吸交缠的贴近"]
};

function intimacyTier(aff, intimacy){
  let tier = 0;
  for(const t of INTIMACY_TIERS){
    if((aff||0)>=t.minAff && (intimacy||0)>=t.minIntimacy) tier = t.tier;
  }
  return tier;
}

/* ==================== 职业与技能 ==================== */
/* 职业决定初始属性加成、社会身份、能接的活、别人怎么看你 */
const CAREERS = {
  mercenary:{ id:"mercenary", name:"佣兵", emoji:"⚔️",
    desc:"刀口舔血的行当。力气与胆量是你的本钱，但也容易树敌。",
    bonus:{ physique:20, willpower:10, agility:10, iq:-5, charm:-5 },
    skills:{ 格斗:35, 威吓:25, 侦察:15 },
    identity:"一名佣兵", standing:"人们既忌惮又依赖你，官府对你格外留意。" },
  scholar:{ id:"scholar", name:"学者", emoji:"📖",
    desc:"书斋里养出的头脑。擅长推演、辨伪与交涉，但肩不能扛手不能提。",
    bonus:{ iq:25, charm:5, willpower:5, physique:-15 },
    skills:{ 学识:40, 观察:25, 交涉:20 },
    identity:"一名学者", standing:"人们敬重你的学问，却未必看得起你的拳头。" },
  rogue:{ id:"rogue", name:"盗贼", emoji:"🗡️",
    desc:"游走在阴影里的手艺人。开锁、潜行、察言观色都是吃饭的本事。",
    bonus:{ agility:20, iq:10, charm:10, physique:-5, willpower:-5 },
    skills:{ 潜行:35, 开锁:30, 扒窃:25, 观察:15 },
    identity:"一个来历不明的人", standing:"官府盯得紧，道上的人却对你客气。" },
  merchant:{ id:"merchant", name:"商人", emoji:"💰",
    desc:"走南闯北的生意人。懂得讨价还价，人脉广，但体力平平。",
    bonus:{ charm:20, iq:10, physique:-10 },
    skills:{ 交涉:35, 估算:25, 观察:15 },
    identity:"一名行商", standing:"你有钱，有人脉，也容易被人惦记。" },
  cleric:{ id:"cleric", name:"神职", emoji:"🕯️",
    desc:"侍奉神明的信徒。意志坚定，擅长安抚人心，却不擅争斗。",
    bonus:{ willpower:25, charm:15, physique:-10, agility:-5 },
    skills:{ 安抚:30, 学识:25, 医术:15 },
    identity:"一位神职人员", standing:"信徒尊敬你，市井之徒却未必买账。" },
  commoner:{ id:"commoner", name:"平民", emoji:"🧑",
    desc:"普普通通的老百姓。没有突出的长处，也没有致命的短板。",
    bonus:{},
    skills:{ 劳作:20, 观察:10 },
    identity:"一个普通人", standing:"没人特别注意你，这有时反而是好事。" }
};

const START_ATTR_KEYS = ["iq","physique","charm","willpower","agility"];
const START_ATTR_LABELS = {iq:"智商",physique:"体质",charm:"魅力",willpower:"意志",agility:"敏捷"};

function normalizeStartAttrs(value){
  if(!value || typeof value!=="object" || Array.isArray(value)) return null;
  const out = {};
  for(const key of START_ATTR_KEYS){
    const n = Number(value[key]);
    if(Number.isFinite(n)) out[key] = clamp(Math.round(n),10,90);
  }
  return Object.keys(out).length===START_ATTR_KEYS.length ? out : null;
}

function rollStartingAttrs(){
  const out = {};
  for(const key of START_ATTR_KEYS) out[key] = clamp(50 + Math.round((Math.random()*2-1)*8),25,75);
  return out;
}

/* 职业开局属性：先给一点个体差异，再叠加职业加成，避免所有人都是 50 起步 */
function startingAttrsForCareer(careerId){
  const c = CAREERS[careerId];
  const out = rollStartingAttrs();
  for(const [key,value] of Object.entries(c?.bonus||{})){
    if(Number.isFinite(value)) out[key] = clamp((out[key]??50) + value, 0, 100);
  }
  return out;
}

/* 原著角色开局属性：优先用角色卡/故事圣经里的 attrs，否则按身份与性格推断 */
function inferRoleAttrs(role){
  const explicit = normalizeStartAttrs(role?.attrs);
  if(explicit && new Set(Object.values(explicit)).size>1) return explicit;
  const text = [role?.name,role?.identity,role?.personality,role?.appearance,role?.outfit,role?.origin,role?.desc]
    .filter(Boolean).join(" ");
  const out = rollStartingAttrs();
  const add = (key,value)=>{ out[key] = clamp((out[key]??50) + value, 10, 90); };
  const rules = [
    [/武|将|兵|侠|镖|杀手|刺客|猎|剑|刀|拳|佣兵|护院|捕快|军|战|骑士|忍者|守卫/, {physique:12,agility:8,willpower:5,iq:-2}],
    [/书生|文|学士|秘书|账房|医|儒|道士|老师|记者|侦探|研究|科学家|工程师|学生|谋士|军师/, {iq:12,willpower:4,physique:-8,agility:-2}],
    [/商|掌柜|老板|富|贵族|公子|小姐|名妓|交际|伶人|演员|外交|官|经理|主持人/, {charm:12,iq:3,physique:-4}],
    [/盗|贼|斥候|探子|间谍|游侠|猎|斥|斥候|斥|偷|刺客|斥/, {agility:12,iq:4,willpower:2,physique:-2}],
    [/僧|神职|祭|巫|苦修|隐士|修士|牧师|修女|萨满|先知/, {willpower:12,iq:4,physique:-4}],
    [/农|工|匠|水手|脚夫|矿工|搬|体力|仆|厨|车夫|船夫/, {physique:8,willpower:4,charm:-2}]
  ];
  let matched = false;
  for(const [re,bonus] of rules){
    if(!re.test(text)) continue;
    matched = true;
    for(const [key,value] of Object.entries(bonus)) add(key,value);
    break;
  }
  if(!matched){
    const keys = START_ATTR_KEYS.slice();
    const strong = keys.splice(Math.floor(Math.random()*keys.length),1)[0];
    const weak = keys[Math.floor(Math.random()*keys.length)];
    add(strong,8);
    add(weak,-6);
  }
  return out;
}

/* 技能等级描述，用于展示与判定参考 */
function skillLevel(v){
  if(v>=80) return "大师";
  if(v>=60) return "熟练";
  if(v>=40) return "入门";
  if(v>=20) return "生疏";
  return "生手";
}

/* 属性档位描述（用于展示与 AI 参考） */
function attrLabel(v){
  if(v>=85) return "卓越";
  if(v>=70) return "优秀";
  if(v>=55) return "良好";
  if(v>=40) return "中等";
  if(v>=25) return "偏弱";
  return "孱弱";
}
function desireLabel(v){
  if(v>=80) return "难耐";
  if(v>=60) return "燥热";
  if(v>=40) return "心浮";
  if(v>=20) return "微澜";
  return "平静";
}

/* 当前节点所属NPC，用于侧栏显示 */
const NPC_VIEW = {};

/* ==================== 任务工具（后台记录，界面不展示） ==================== */
function addQuest(id,title,desc){
  if(S.quests.some(q=>q.id===id)) return;
  S.quests.push({id,title,desc,done:false});
}
function completeQuest(id){
  const q = S.quests.find(q=>q.id===id);
  if(q && !q.done) q.done = true;
}

/* ==================== 剧情节点 ==================== */
/* 每个节点：narr/ say 数组 + choices 数组
   choice: {text, tag, cond(), do(), go} */

function say(who,text){return {t:"say",who,text};}
function narr(text){return {t:"narr",text};}

/* 应用职业：设置属性加成、技能、身份 */
function applyCareer(careerId){
  const c = CAREERS[careerId];
  if(!c) return;
  S.career = careerId;
  const attrs = startingAttrsForCareer(careerId);
  for(const key of START_ATTR_KEYS) S[key] = attrs[key];
  S.hpMax = clamp(Math.round(80 + (S.physique||50)*0.4), 40, 140);
  S.hp = S.hpMax;
  S.skills = {...(c.skills||{})};
  S.social = [];
}

const NODES = {

  /* ---------- 开场 ---------- */
  start: {
    view:"lyra",
    lines: [
      narr("夜色浓稠，风裹着雨点拍打木窗。你推开「暗夜酒馆」的门，暖意和麦酒的香气扑面而来。"),
      say("莉拉","欢迎光临，旅人。这么大的雨，看来你今晚是走不掉了。"),
      say("莉拉","找张桌子坐下吧。要喝点什么？还是……想听听这座酒馆的故事？")
    ],
    choices: [
      { text:"来一杯麦酒，暖暖身子。", tag:"金币 -2", cost:2,
        do(){ postMoney(S,-2,"餐饮","麦酒"); S.aff.lyra+=8;
          addLog(narr("你接过一杯冒着白气的麦酒，一口下去，寒意尽消。")); },
        go:"lyra_warm" },
      { text:"我是来找活的。有什么委托吗？", tag:"任务",
        do(){ S.aff.lyra+=3; }, go:"lyra_quest" },
      { text:"我只是想打听些消息。", tag:"情报",
        do(){}, go:"lyra_info" }
    ]
  },

  lyra_warm: {
    view:"lyra",
    lines: [
      say("莉拉","看你的样子，不像只是来避雨的。"),
      say("莉拉","这年头，敢在雨夜走进暗夜酒馆的人，要么有故事，要么有麻烦。你属于哪种？")
    ],
    choices:[
      { text:"都有。而且我想找点事做。", do(){S.aff.lyra+=5;}, go:"lyra_quest" },
      { text:"我只是累了，想歇一晚。", do(){ S.aff.lyra+=5; }, go:"rest_early" }
    ]
  },

  lyra_quest: {
    view:"lyra",
    lines: [
      say("莉拉","委托啊……倒是有一桩。"),
      say("莉拉","城郊的老磨坊最近闹得不太平。夜里总有怪声，磨坊主不敢再去了。"),
      say("莉拉","你要是愿意去看看，我可以先付你一点定金。怎么样？")
    ],
    choices:[
      { text:"我去。这活我接了。", tag:"金币 +10",
        do(){ postMoney(S,10,"委托收入","老磨坊之谜"); S.aff.lyra+=10; addQuest("mill","老磨坊之谜","查明城郊老磨坊夜里的怪声来源。");
          addLog({t:"reward",text:"定金 +10 金币"}); }, go:"lyra_accept" },
      { text:"先让我了解一下情况。", do(){S.aff.lyra+=2;}, go:"lyra_detail" },
      { text:"我想先认识认识这里的人。", do(){}, go:"lyra_people" }
    ]
  },

  lyra_detail: {
    view:"lyra",
    lines: [
      say("莉拉","磨坊主说，怪声像是有人在磨盘边低声哭。可那磨坊早就不用了。"),
      say("莉拉","有人说是饿鬼，有人说是风。我觉得……没那么简单。"),
      say("莉拉","磨坊的钥匙在我这儿。你去不去，自己掂量。")
    ],
    choices:[
      { text:"我去。把钥匙给我。", tag:"金币 +10",
        do(){ postMoney(S,10,"委托收入","老磨坊之谜"); S.aff.lyra+=8; addQuest("mill","老磨坊之谜","查明城郊老磨坊夜里的怪声来源。");
          addLog({t:"reward",text:"定金 +10 金币"}); }, go:"lyra_accept" },
      { text:"我想先去见见那位老兵布兰。", do(){}, go:"bran_intro" }
    ]
  },

  lyra_accept: {
    view:"lyra",
    lines: [
      say("莉拉","好胆量。钥匙给你，磨坊在城西尽头，沿着河走就是。"),
      say("莉拉","对了——布兰那老家伙以前常往磨坊那边跑。去问问他，或许能少走些弯路。"),
      say("莉拉","祝你好运，旅人。记得活着回来。")
    ],
    choices:[
      { text:"我去找布兰问问。", do(){}, go:"bran_intro" },
      { text:"直接出发去磨坊。", do(){ S.hp=clamp(S.hp-10,0,100); addLog({t:"sys",text:"你冒雨赶往磨坊，路上摔了一跤，体力 -10。"});
        addLog(narr("你踏着泥泞，来到城西尽头。老磨坊的轮廓在雨幕里像一头伏着的兽。")); }, go:"mill_arrive" }
    ]
  },

  lyra_people: {
    view:"lyra",
    lines: [
      say("莉拉","这里的人都有些来历。"),
      say("莉拉","角落那个独臂老兵叫布兰，话不多，但心里门儿清。"),
      say("莉拉","窗边披兜帽的是米拉，占卜师。别太信她的话……也别全不信。")
    ],
    choices:[
      { text:"我去和布兰聊聊。", do(){}, go:"bran_intro" },
      { text:"我去找米拉占卜。", do(){}, go:"mira_intro" },
      { text:"还是接那桩磨坊的委托吧。", do(){ postMoney(S,10,"委托收入","老磨坊之谜"); S.aff.lyra+=5; addQuest("mill","老磨坊之谜","查明城郊老磨坊夜里的怪声来源。");
        addLog({t:"reward",text:"定金 +10 金币"}); }, go:"lyra_accept" }
    ]
  },

  lyra_info: {
    view:"lyra",
    lines: [
      say("莉拉","消息嘛，看你想问什么。"),
      say("莉拉","城里最近人心惶惶，说是河对岸出了怪事。你若想知道更多，不如问问布兰。")
    ],
    choices:[
      { text:"好，我去找布兰。", do(){S.aff.lyra+=3;}, go:"bran_intro" },
      { text:"我更想听你讲讲自己。", do(){S.aff.lyra+=10;}, go:"lyra_self" }
    ]
  },

  lyra_self: {
    view:"lyra",
    lines: [
      say("莉拉","我？开了这间酒馆快十年了。"),
      say("莉拉","见过太多人来，也见过太多人走。有的喝醉后成了朋友，有的……再也没回来。"),
      say("莉拉","所以我看人，看的不是他喝了多少，而是他敢不敢为别人举杯。")
    ],
    choices:[
      { text:"那，敬那些没能回来的人。", do(){S.aff.lyra+=12; S.rep+=2; addLog(narr("你举起酒杯。莉拉愣了一瞬，随即也举起杯，眼里有光。"));}, go:"bran_intro" },
      { text:"我该去办正事了。", do(){}, go:"bran_intro" }
    ]
  },

  rest_early: {
    view:"lyra",
    lines: [
      say("莉拉","行，二楼最后一间房，安静。明早再聊。"),
      say("莉拉","……不过要是明天你还闲着，记得那桩磨坊的活儿。")
    ],
    choices:[
      { text:"第二天一早，去找莉拉接活。", do(){
        const before = S.environment.minute ?? 22*60;
        const dawn = (Math.floor(before/1440)+(before%1440<6*60 ? 0 : 1))*1440+6*60;
        if(!S.classicRestAlreadyApplied){
          const sleep = {rested:true,restMode:"sleep",restQuality:"safe"};
          settleStamina(sleep,S,dawn-before);
          applyEffect(S,sleep.effects,true);
        }
        delete S.classicRestAlreadyApplied;
        S.environment = {...S.environment,minute:dawn};
        settleEconomy(S,before,dawn);
        postMoney(S,10,"委托收入","老磨坊之谜"); S.aff.lyra+=5; addQuest("mill","老磨坊之谜","查明城郊老磨坊夜里的怪声来源。");
        addLog(narr("一夜好眠，你精神饱满地下了楼。")); }, go:"lyra_accept" }
    ]
  },

  /* ---------- 布兰 ---------- */
  bran_intro: {
    view:"bran",
    lines: [
      narr("你走向角落。独臂老兵布兰正对着半杯残酒出神，独眼在昏光里微微眯起。"),
      say("布兰","坐吧。别站我面前，挡光。"),
      say("布兰","听莉拉说你接了磨坊的活？呵……年轻人。")
    ],
    choices:[
      { text:"你好像知道些什么。", do(){S.aff.bran+=8;}, go:"bran_mill" },
      { text:"请我喝一杯，我就听你讲。", tag:"金币 -3", cost:3,
        do(){ postMoney(S,-3,"餐饮","请布兰喝酒"); S.aff.bran+=12;
          addLog(narr("你把酒推到他面前。布兰哼了一声，仰头灌下半杯。")); }, go:"bran_mill" },
      { text:"你的手臂……是怎么没的？", do(){S.aff.bran-=3;}, go:"bran_arm" }
    ]
  },

  bran_arm: {
    view:"bran",
    lines: [
      say("布兰","……"),
      say("布兰","问得挺直接。行，我告诉你。"),
      say("布兰","十二年前，河对岸那座磨坊里，藏着一伙人。我们奉命去清剿。"),
      say("布兰","那天晚上下着和今天一样的雨。我们进去了七个人，出来的只有我一个。")
    ],
    choices:[
      { text:"所以磨坊的怪声，和你那晚有关？", do(){S.aff.bran+=10;}, go:"bran_mill" },
      { text:"对不起，我不该问。", do(){S.aff.bran+=5;}, go:"bran_soft" }
    ]
  },

  bran_soft: {
    view:"bran",
    lines: [
      say("布兰","不必道歉。往事就是往事，捂不住也躲不掉。"),
      say("布兰","既然你要去磨坊，我就说句实话——那地方的怪声，八成不是鬼。")
    ],
    choices:[
      { text:"那是什么？", do(){S.aff.bran+=8;}, go:"bran_mill" }
    ]
  },

  bran_mill: {
    view:"bran",
    lines: [
      say("布兰","那晚我们以为清剿干净了。可我总觉得，磨坊底下还有东西。"),
      say("布兰","怪声从地底传来，像有人被压在磨盘下面哭。"),
      say("布兰","你下去的时候，带上一盏灯。还有——别信你听到的所有声音。")
    ],
    choices:[
      { text:"你为什么自己不回去？", do(){}, go:"bran_why" },
      { text:"我明白了。这就去磨坊。", do(){ S.aff.bran+=8; S.flags.bran_tip=true;
        addLog({t:"sys",text:"布兰的提示：带上灯，别轻信听到的声音。"}); }, go:"mill_arrive" }
    ]
  },

  bran_why: {
    view:"bran",
    lines: [
      say("布兰","因为那晚之后，我就再没敢往那个方向走过一步。"),
      say("布兰","一只胳膊，半条命。剩下这点，我只想留着喝酒。"),
      say("布兰","……可你要是真去了，回来告诉我一声，底下到底是什么。我欠他们一个答案。")
    ],
    choices:[
      { text:"我会回来的。", do(){ S.aff.bran+=15; S.flags.bran_tip=true; S.flags.promise_bran=true;
        addLog({t:"sys",text:"你向布兰许下承诺。带灯前往磨坊。"}); }, go:"mill_arrive" }
    ]
  },

  /* ---------- 米拉 ---------- */
  mira_intro: {
    view:"mira",
    lines: [
      narr("窗边，兜帽下的女子抬起头。桌上摊着几张牌，牌面朝下。"),
      say("米拉","你来了。我早知道你会来。"),
      say("米拉","坐。抽一张牌吧。它会告诉你，磨坊里等着你的是什么。")
    ],
    choices:[
      { text:"抽一张牌。", tag:"金币 -1", cost:1,
        do(){ postMoney(S,-1,"服务","米拉的占卜"); S.aff.mira+=10; }, go:"mira_draw" },
      { text:"我不信这些。", do(){S.aff.mira-=2;}, go:"mira_scoff" },
      { text:"你怎么知道我要去磨坊？", do(){S.aff.mira+=6;}, go:"mira_know" }
    ]
  },

  mira_draw: {
    view:"mira",
    lines: [
      narr("你翻开牌面——上面画着一盏孤灯，照着一道向下的阶梯。"),
      say("米拉","「灯」。"),
      say("米拉","磨坊底下有人还活着。可你若举灯照得太亮，也会被别的东西看见。"),
      say("米拉","去之前，先决定你要照亮谁。")
    ],
    choices:[
      { text:"我会记住的。", do(){ S.aff.mira+=8; S.flags.mira_warn=true;
        addLog({t:"sys",text:"米拉的告诫：灯能照亮人，也能引来别的东西。"}); }, go:"mill_arrive" }
    ]
  },

  mira_scoff: {
    view:"mira",
    lines: [
      say("米拉","不信也好。牌从来不强求谁相信。"),
      say("米拉","只是到时候，你会想起我今天说过的话。")
    ],
    choices:[
      { text:"好吧……那我抽一张。", tag:"金币 -1", cost:1,
        do(){ postMoney(S,-1,"服务","米拉的占卜"); S.aff.mira+=5; }, go:"mira_draw" },
      { text:"告辞。", do(){}, go:"mill_arrive" }
    ]
  },

  mira_know: {
    view:"mira",
    lines: [
      say("米拉","因为这座酒馆里的人，命都连在一起。"),
      say("米拉","莉拉给了你钥匙，布兰给了你忠告，而我……给你一个选择。"),
      say("米拉","磨坊里，除了怪声，还藏着一件东西。找到它，这座城就安宁了。")
    ],
    choices:[
      { text:"什么东西？", do(){S.aff.mira+=6;}, go:"mira_thing" },
      { text:"那我这就出发。", do(){}, go:"mill_arrive" }
    ]
  },

  mira_thing: {
    view:"mira",
    lines: [
      say("米拉","一枚旧徽章。属于十二年前那伙人的首领。"),
      say("米拉","它不该留在那里。带出来，交给我，或者交给布兰——你自己选。")
    ],
    choices:[
      { text:"我会找到它。", do(){ S.aff.mira+=10; S.flags.mira_quest=true;
        addLog({t:"sys",text:"米拉透露：磨坊里有一枚旧徽章。"}); }, go:"mill_arrive" }
    ]
  },

  /* ---------- 磨坊 ---------- */
  mill_arrive: {
    view:"lyra",
    lines: [
      narr("城西尽头，老磨坊矗立在河边。雨小了，风却更冷。木门吱呀作响，里面一片漆黑。"),
      narr("你听到——很轻很轻的，哭声。从地底传来。")
    ],
    choices:[
      { text:"点亮灯火，走进去。", tag:"需要灯",
        cond(){ return S.flags.bran_tip || S.flags.mira_warn; },
        do(){ S.hp=clamp(S.hp-5,0,100); addLog(narr("你点亮灯，橘黄的光晕开黑暗。阶梯向下延伸，哭声更清晰了。")); }, go:"mill_down" },
      { text:"摸黑进去。", tag:"危险",
        do(){ S.hp=clamp(S.hp-25,0,100); addLog({t:"sys",text:"黑暗中你撞上横梁，体力 -25。但你还是找到了向下的阶梯。"}); }, go:"mill_down" },
      { text:"先在磨坊外围看看。", do(){}, go:"mill_outside" }
    ]
  },

  mill_outside: {
    view:"bran",
    lines: [
      narr("你绕着磨坊走了一圈。墙根有新翻的土，像是有人最近挖过什么。"),
      narr("河边的石头上，刻着一个模糊的符号——和米拉牌背上的图案很像。")
    ],
    choices:[
      { text:"顺着新土挖下去。", do(){ S.flags.found_symbol=true; S.rep+=1;
        addLog(narr("土里埋着一截断绳和一把生锈的刀。看来有人在这里动过手脚。")); }, go:"mill_down" },
      { text:"算了，还是进磨坊吧。", do(){}, go:"mill_down" }
    ]
  },

  mill_down: {
    view:"lyra",
    lines: [
      narr("地底潮湿阴冷。磨盘下的缝隙里，透出一线微光。哭声就在那里。"),
      narr("你听见一个虚弱的声音，在低声重复着什么。"),
      say("?", "……救我……别让灯灭……")
    ],
    choices:[
      { text:"把灯靠近缝隙，看清里面。", do(){ S.flags.saw_prisoner=true; S.rep+=2;
        addLog(narr("缝隙里蜷着一个瘦弱的身影，衣衫褴褛，眼神里满是恐惧。他被人锁在了这里。")); }, go:"mill_prisoner" },
      { text:"先找找有没有别的东西。", do(){}, go:"mill_search" },
      { text:"转身离开。", tag:"放弃委托", do(){}, go:"mill_leave" }
    ]
  },

  mill_search: {
    view:"mira",
    lines: [
      narr("你在磨盘后的暗格里摸索，指尖碰到一个冰凉的金属物件。"),
      narr("借着灯光，你看清那是一枚旧徽章，上面的纹路已经被磨得模糊。"),
      say("?", "那是……首领的东西。他不该……不该把它留在下面……")
    ],
    choices:[
      { text:"把徽章收起来，再去看那个声音。", do(){ S.flags.got_badge=true; S.rep+=2;
        addLog({t:"reward",text:"获得：旧徽章"}); }, go:"mill_prisoner" },
      { text:"先去救被困的人。", do(){}, go:"mill_prisoner" }
    ]
  },

  mill_prisoner: {
    view:"lyra",
    lines: [
      narr("缝隙里是个年轻男人，被铁链锁在磨盘下。他已经虚弱得说不出完整的话。"),
      say("囚徒","……求求你……这锁……十二年了……"),
      say("囚徒","他们说我是叛徒……可我只是……不想再杀人了……")
    ],
    choices:[
      { text:"我砸开锁链，救你出去。", tag:"体力 -15",
        do(){ S.hp=clamp(S.hp-15,0,100); S.flags.rescued=true; S.rep+=8;
          addLog(narr("你抡起石块砸开锈蚀的锁。男人踉跄着站起来，眼里第一次有了光。")); }, go:"mill_rescue" },
      { text:"先问清楚，你是谁。", do(){}, go:"mill_ask" },
      { text:"我不该卷进来。走。", tag:"放弃委托", do(){}, go:"mill_leave" }
    ]
  },

  mill_ask: {
    view:"bran",
    lines: [
      say("囚徒","我叫…卡尔。十二年前，我是布兰队里的一员。"),
      say("囚徒","那晚我们要清剿这伙人，可我发现他们是被冤枉的。我没下手，他们就……把我锁在了这里。"),
      say("囚徒","布兰以为我死了。其实我一直在这儿，听着雨声，数着日子。")
    ],
    choices:[
      { text:"布兰还活着。我带你回去见他。", tag:"体力 -15",
        do(){ S.hp=clamp(S.hp-15,0,100); S.flags.rescued=true; S.flags.karl_name=true; S.rep+=10;
          addLog(narr("你砸开锁链。卡尔抓着你的手，声音发抖：'布兰…他还活着…'")); }, go:"mill_rescue" },
      { text:"我得先拿到那枚徽章。", cond(){ return !S.flags.got_badge; },
        do(){ S.flags.got_badge=true; S.rep+=2; addLog({t:"reward",text:"获得：旧徽章"}); }, go:"mill_search" }
    ]
  },

  mill_rescue: {
    view:"lyra",
    lines: [
      narr("你扶着卡尔，一步步走上阶梯。雨停了，东方泛起微光。"),
      say("卡尔","十二年……我竟然还能看到天。"),
      say("卡尔","谢谢你，陌生人。你不知道这对我意味着什么。")
    ],
    choices:[
      { text:"我们回酒馆。布兰在等你。", do(){ S.flags.bring_karl=true; }, go:"tavern_return" },
      { text:"徽章我带走。你先去安全的地方。", do(){}, go:"tavern_return" }
    ]
  },

  mill_leave: {
    view:"lyra",
    lines: [
      narr("你退出了磨坊。哭声在你身后渐渐远去，像被夜色吞没。"),
      say("莉拉","（回到酒馆）你回来了……可你的脸色不对。")
    ],
    choices:[
      { text:"我什么都没找到。", do(){ S.aff.lyra-=5; S.rep-=3; }, go:"ending_bad" },
      { text:"等等……我后悔了，我要回去。", do(){ S.hp=clamp(S.hp-5,0,100); }, go:"mill_down" }
    ]
  },

  /* ---------- 回酒馆 ---------- */
  tavern_return: {
    view:"lyra",
    lines: [
      narr("你带着卡尔回到暗夜酒馆。推门时，莉拉手里的杯子停在了半空。"),
      say("莉拉","……卡尔？老天。我以为你早就不在了。"),
      narr("角落的布兰缓缓站了起来。他那只独眼里，有什么东西碎了又重聚。")
    ],
    choices:[
      { text:"让布兰和卡尔单独谈谈。", do(){ S.aff.bran+=20; S.aff.lyra+=10; S.rep+=5; }, go:"bran_reunion" },
      { text:"把徽章交给莉拉。", cond(){ return S.flags.got_badge; },
        do(){ S.aff.lyra+=15; S.rep+=5; S.flags.badge_to_lyra=true;
          addLog({t:"reward",text:"莉拉收下徽章，郑重地向你点头。"}); }, go:"bran_reunion" },
      { text:"把徽章交给米拉。", cond(){ return S.flags.got_badge; },
        do(){ S.aff.mira+=20; S.flags.badge_to_mira=true;
          addLog({t:"sys",text:"米拉接过徽章，轻声说：'你选对了。'"}); }, go:"mira_reveal" }
    ]
  },

  bran_reunion: {
    view:"bran",
    lines: [
      narr("布兰和卡尔在角落里低声交谈，很久很久。"),
      say("布兰","（走过来）谢谢你。真的。"),
      say("布兰","这杯我请。往后再有这种事……算我一个。")
    ],
    choices:[
      { text:"那就敬这间酒馆，敬所有回来的人。", do(){ S.rep+=8; S.flags.bran_friend=true; }, go:"ending_good" },
      { text:"我只是做了该做的事。", do(){ S.rep+=5; }, go:"ending_good" }
    ]
  },

  mira_reveal: {
    view:"mira",
    lines: [
      say("米拉","这枚徽章，是这座城的祸根。"),
      say("米拉","十二年前，有人借清剿之名，吞了不该吞的东西。徽章就是证据。"),
      say("米拉","你把它带出来了。真相，终于能见光了。")
    ],
    choices:[
      { text:"那接下来呢？", do(){ S.rep+=10; }, go:"ending_good" },
      { text:"我想让布兰也看看。", do(){ S.aff.bran+=15; S.rep+=8; }, go:"bran_reunion" }
    ]
  },

  /* ---------- 结局 ---------- */
  ending_good: {
    view:"lyra",
    lines: [
      narr("晨光透过酒馆的窗。雨停了。"),
      say("莉拉","你这一夜做的事，比很多人一辈子都多。"),
      say("莉拉","这座城欠你一个名字。留下来吧，暗夜酒馆永远有你的位置。")
    ],
    choices:[
      { text:"【查看结局】", do(){}, go:"__end_good" }
    ]
  },

  ending_bad: {
    view:"lyra",
    lines: [
      narr("你坐在酒馆里，酒杯空了又满。窗外的磨坊，依旧在雨夜里沉默。"),
      say("莉拉","有些事，错过了就再也回不去了。"),
      narr("那个哭声，或许还会在下一个雨夜响起。")
    ],
    choices:[
      { text:"【查看结局】", do(){}, go:"__end_bad" }
    ]
  }
};

