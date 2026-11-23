"use strict";

/* ==================== 剧情朗读（TTS） ====================
 * 按人物档案（性别/年龄/物种/说话习惯/性格/态度/好感）推算音高与语速，
 * 让不同角色听起来像不同的人；旁白固定用中性声线。
 */
const TTS_KEY = "tavern_tts_v1";
const TTS = {
  enabled: (()=>{ try{ return localStorage.getItem(TTS_KEY)==="1"; }catch(e){ return false; } })(),
  token: 0,
  speaking: false,
  lastKey: "",
  voiceWarned: false
};

/* 音高/语速的合法范围，系统 TTS 与 Web Speech 都接受 0.5~2.0 */
const TTS_PITCH_MIN = 0.55, TTS_PITCH_MAX = 1.8;
const TTS_RATE_MIN = 0.75, TTS_RATE_MAX = 1.35;

function ttsPlugin(){
  return (typeof window!=="undefined" && window.Capacitor && window.Capacitor.Plugins)
    ? window.Capacitor.Plugins.NativeTTS : null;
}

function ttsUpdateButton(){
  const btn = document.getElementById("btn-voice");
  if(!btn) return;
  btn.classList.toggle("active", TTS.enabled);
  btn.setAttribute("aria-pressed", TTS.enabled ? "true" : "false");
  btn.title = TTS.enabled ? "关闭剧情朗读" : "朗读剧情（按人物声线）";
  btn.textContent = TTS.enabled ? "🔊" : "🗣";
}

function ttsSaveEnabled(){
  try{ localStorage.setItem(TTS_KEY, TTS.enabled ? "1" : "0"); }catch(e){}
}

function ttsStop(){
  TTS.token++;
  TTS.speaking = false;
  TTS.lastKey = "";
  try{
    const plugin = ttsPlugin();
    if(plugin && plugin.stop) plugin.stop().catch(()=>{});
  }catch(e){}
  try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(e){}
}

/* 人物档案查找：先按姓名精确匹配，再按包含关系兜底 */
function ttsCastFor(name){
  if(!name || typeof S==="undefined" || !S || !Array.isArray(S.cast)) return null;
  return S.cast.find(c=>c && c.name===name) || S.cast.find(c=>c && c.name && (name.includes(c.name) || c.name.includes(name))) || null;
}

function ttsClamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

/* 从人物档案推算声线：返回 {pitch, rate, why} */
function ttsVoiceFor(name){
  if(!name || name==="你" || name==="玩家"){
    return {pitch:1.0, rate:0.98, why:"玩家"};
  }
  const c = ttsCastFor(name);
  if(!c) return {pitch:0.98, rate:0.98, why:"未登记"};
  const text = [c.gender,c.species,c.personality,c.voice,c.attitude,c.identity,c.job].filter(Boolean).join(" ");
  const age = Number(c.age)||0;

  // 1) 性别：女声更高，男声更低
  const female = /女|姑娘|夫人|太太|娘|姐|妹|母|妇/.test(String(c.gender||""));
  const male = /男|汉子|小子|先生|爷|叔|兄|哥/.test(String(c.gender||""));
  let pitch = female ? 1.18 : male ? 0.84 : 1.0;
  let rate = 1.0;

  // 2) 年龄：孩童更高更慢，老人更低更慢
  if(age>0 && age<13){ pitch += 0.14; rate -= 0.12; }
  else if(age>0 && age<20){ pitch += 0.08; rate -= 0.04; }
  else if(age>=60){ pitch -= 0.10; rate -= 0.16; }
  else if(age>=45){ pitch -= 0.05; rate -= 0.08; }

  // 3) 物种：非人类给更极端的音色
  const species = String(c.species||"人类");
  if(/妖|鬼|魔|灵|魅/.test(species)){ pitch += 0.08; rate -= 0.05; }
  else if(/兽|狼|虎|熊|龙|兽人/.test(species)){ pitch -= 0.12; rate -= 0.04; }
  else if(/机械|机器|机|仿生|机器人|AI/i.test(species)){ pitch = 0.92; rate = 1.08; }
  else if(/孩童|幼|小|小孩/.test(species)){ pitch += 0.14; rate -= 0.08; }
  else if(/巨人|半兽|蛮|巨/.test(species)){ pitch -= 0.10; rate -= 0.06; }

  // 4) 说话习惯 / 性格：语速与音色微调
  const slow = /慢|迟缓|沉稳|沉静|老成|寡言|话少|沉默|稳重|谨慎/.test(text);
  const fast = /快|急|利落|爽利|麻利|健谈|话多|活泼|急躁|直爽|连珠/.test(text);
  const hard = /冷|硬|严厉|凶狠|粗暴|威严|压迫|刻薄|阴冷/.test(text);
  const soft = /温|柔|和善|体贴|害羞|腼腆|细腻|亲切|甜/.test(text);
  if(slow){ rate -= 0.10; pitch -= 0.02; }
  if(fast){ rate += 0.12; }
  if(hard){ pitch -= 0.04; rate += 0.03; }
  if(soft){ pitch += 0.05; rate -= 0.02; }

  // 5) 对玩家的态度与好感：敌意更硬更冷，亲近更柔
  const aff = Number((typeof S!=="undefined" && S && S.aff) ? S.aff[name] : 0) || 0;
  if(aff<=-10){ pitch -= 0.04; rate += 0.04; }
  else if(aff>=30){ pitch += 0.04; rate -= 0.03; }
  if(/敌对|仇视|戒备|提防|不满|敌意/.test(String(c.attitude||""))){ pitch -= 0.03; rate += 0.02; }
  if(/爱慕|亲近|信任|依赖|温柔/.test(String(c.attitude||""))){ pitch += 0.04; rate -= 0.03; }

  // 6) 情绪词出现在台词里时再微调
  return {
    pitch: ttsClamp(pitch, TTS_PITCH_MIN, TTS_PITCH_MAX),
    rate: ttsClamp(rate, TTS_RATE_MIN, TTS_RATE_MAX),
    why: [female?"女":male?"男":"", age?age+"岁":"", species, slow?"慢":fast?"快":"", hard?"硬":soft?"柔":""].filter(Boolean).join("·")
  };
}

/* 台词本身的情绪：问号上扬、感叹更急、省略更慢 */
function ttsEmotionOf(text){
  const t = String(text||"");
  let pitch = 0, rate = 0;
  if(/[？！!?]/.test(t)){ pitch += 0.04; rate += 0.04; }
  if(/[……]|…/.test(t)){ rate -= 0.06; pitch -= 0.02; }
  if(/[（(][^）)]*(低声|小声|轻声|喃喃|嘀咕)/.test(t)){ rate -= 0.10; pitch -= 0.03; }
  if(/[（(][^）)]*(喊|吼|大叫|怒|厉声)/.test(t)){ rate += 0.08; pitch += 0.04; }
  if(/[（(][^）)]*(笑|轻笑|笑着)/.test(t)){ pitch += 0.03; rate += 0.02; }
  return {pitch, rate};
}

/* 去掉台词里的动作提示与引号，只读出声 */
function ttsCleanLine(text){
  return String(text||"")
    .replace(/[（(][^）)]*[）)]/g,"")
    .replace(/[「」『』“”"]/g,"")
    .replace(/\s+/g," ")
    .trim();
}

function ttsSceneParts(){
  if(typeof S==="undefined" || !S || !S.ai) return [];
  if(S.ending?.text){
    return [{text:S.ending.text, pitch:1.0, rate:0.95, who:""}];
  }
  const last = (S.history||[]).slice().reverse().find(m=>m && m.role==="assistant");
  if(!last) return [];
  let scene;
  try{ scene = readScene(last.content); }catch(e){ return []; }
  const parts = [];
  for(const line of (scene.lines||[])){
    if(!line || !line.text) continue;
    if(line.t==="npc-action"){
      // 动作不念人物原话，交给旁白读一句简短的画面描述
      const action = String(line.text).trim();
      if(action) parts.push({text:(line.who ? line.who+"" : "")+"　"+action, pitch:1.0, rate:0.94, who:""});
      continue;
    }
    if(line.t!=="say" && line.t!=="speech") continue;
    const spoken = ttsCleanLine(line.text);
    if(!spoken) continue;
    const base = ttsVoiceFor(line.who);
    const emotion = ttsEmotionOf(line.text);
    parts.push({
      text:(line.who && line.who!=="？" ? line.who+"：" : "")+spoken,
      pitch: ttsClamp(base.pitch + emotion.pitch, TTS_PITCH_MIN, TTS_PITCH_MAX),
      rate: ttsClamp(base.rate + emotion.rate, TTS_RATE_MIN, TTS_RATE_MAX),
      who: line.who||"",
      why: base.why
    });
  }
  return parts;
}

/* 分句：保留标点，丢掉只有标点的碎片（如单独一个右引号） */
function ttsSplitText(text, max=140){
  const source = String(text||"").trim();
  if(!source) return [];
  const parts = source.match(new RegExp("[^。！？!?；;\\n]{1,"+max+"}[。！？!?；;\\n]?","g")) || [source];
  return parts.map(p=>p.trim()).filter(p=>/[\p{L}\p{N}]/u.test(p));
}

/* Web Speech 兜底：Android WebView 常无中文声音，此时明确提示而不是静默失败 */
function ttsWebSpeak(text, opts){
  return new Promise((resolve,reject)=>{
    if(!window.speechSynthesis || typeof SpeechSynthesisUtterance==="undefined"){
      reject(new Error("当前环境不支持语音朗读"));
      return;
    }
    const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
    const zh = voices.find(v=>/^zh(-|_)/i.test(v.lang)) || voices.find(v=>/chinese|中文|普通话/i.test(v.name));
    if(!zh){
      reject(new Error("系统没有中文语音包，请安装系统 TTS 中文语音"));
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = zh.lang || "zh-CN";
    utter.voice = zh;
    utter.rate = opts.rate;
    utter.pitch = opts.pitch;
    utter.onend = ()=>resolve();
    utter.onerror = event=>reject(new Error(event?.error || "语音播放失败"));
    window.speechSynthesis.speak(utter);
  });
}

async function ttsSpeakPart(text, opts, token){
  if(token!==TTS.token) return false;
  const plugin = ttsPlugin();
  if(plugin && plugin.speak){
    await plugin.speak({text,lang:"zh-CN",rate:opts.rate,pitch:opts.pitch});
  }else{
    await ttsWebSpeak(text,opts);
  }
  return token===TTS.token;
}

/* 只读最近这一幕（朗读按钮点一次读一次） */
async function ttsReadCurrent(force=false){
  if(!force && !TTS.enabled) return;
  const parts = ttsSceneParts();
  if(!parts.length){
    if(force) ttsUpdateButton();
    return;
  }
  const key = String(S.turn||0)+"|"+parts.map(p=>p.who+"|"+p.pitch.toFixed(2)+"|"+p.rate.toFixed(2)+"|"+p.text.length).join(",");
  if(!force && key===TTS.lastKey) return;
  ttsStop();
  const token = TTS.token;
  TTS.lastKey = key;
  TTS.speaking = true;
  for(const part of parts){
    if(token!==TTS.token) break;
    const chunks = ttsSplitText(part.text);
    for(const chunk of chunks){
      if(token!==TTS.token) break;
      try{
        const ok = await ttsSpeakPart(chunk,{rate:part.rate,pitch:part.pitch},token);
        if(!ok) break;
      }catch(e){
        if(token===TTS.token){
          TTS.speaking = false;
          TTS.lastKey = "";
          const btn = document.getElementById("btn-voice");
          if(btn) btn.title = "朗读失败："+(e.message||"系统 TTS 不可用");
          if(!TTS.voiceWarned){
            TTS.voiceWarned = true;
            const txt = "朗读失败："+(e.message||"系统 TTS 不可用");
            try{ addLog({t:"sys",text:txt}); logToDOM({t:"sys",text:txt}); }catch(err){}
          }
          console.warn("[TTS]",e);
        }
        return;
      }
    }
  }
  if(token===TTS.token) TTS.speaking = false;
}

/* 单条台词单独朗读：点剧情里的人物台词即可 */
async function ttsReadLine(who, text){
  const spoken = ttsCleanLine(text);
  if(!spoken) return;
  ttsStop();
  const token = TTS.token;
  const base = ttsVoiceFor(who);
  const emotion = ttsEmotionOf(text);
  const opts = {
    pitch: ttsClamp(base.pitch + emotion.pitch, TTS_PITCH_MIN, TTS_PITCH_MAX),
    rate: ttsClamp(base.rate + emotion.rate, TTS_RATE_MIN, TTS_RATE_MAX)
  };
  TTS.speaking = true;
  try{
    for(const chunk of ttsSplitText(spoken)){
      if(token!==TTS.token) break;
      await ttsSpeakPart(chunk,opts,token);
    }
  }catch(e){
    const txt = "朗读失败："+(e.message||"系统 TTS 不可用");
    try{ addLog({t:"sys",text:txt}); logToDOM({t:"sys",text:txt}); }catch(err){}
    console.warn("[TTS]",e);
  }
  if(token===TTS.token) TTS.speaking = false;
}

function ttsToggle(){
  TTS.enabled = !TTS.enabled;
  ttsSaveEnabled();
  ttsUpdateButton();
  if(!TTS.enabled){
    ttsStop();
    return;
  }
  // 首次开启时确认系统有中文声音，没有就直说，避免开了没反应
  const plugin = ttsPlugin();
  if(!plugin){
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if(!voices.some(v=>/^zh(-|_)/i.test(v.lang))){
      const txt = "当前系统没有中文语音包，朗读无法出声。请安装系统 TTS 中文语音。";
      try{ addLog({t:"sys",text:txt}); logToDOM({t:"sys",text:txt}); }catch(e){}
      TTS.enabled = false;
      ttsSaveEnabled();
      ttsUpdateButton();
      return;
    }
  }
  ttsReadCurrent(true);
}

(function initTTS(){
  const btn = document.getElementById("btn-voice");
  if(btn) btn.onclick = ttsToggle;
  ttsUpdateButton();
  if(window.speechSynthesis && window.speechSynthesis.getVoices){
    window.speechSynthesis.getVoices();
  }
})();
