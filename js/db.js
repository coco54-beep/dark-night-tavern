"use strict";
/* ==================== 本地长期记忆数据库（IndexedDB） ==================== */
const TAVERN_DB_NAME = "tavern_memory_v1";
const TAVERN_DB_VERSION = 2;
const SEMANTIC_MEMORY_KEY = "tavern_semantic_memory_v1";
const MEMORY_FIRST_KEY = "tavern_memory_first_v1";
let tavernDbPromise = null;
let memoryWriteQueue = Promise.resolve();

function queueMemoryWrite(work){
  const operation = memoryWriteQueue.then(work);
  memoryWriteQueue = operation.catch(()=>{});
  return operation;
}

function memoryFirstEnabled(){
  try{ return localStorage.getItem(MEMORY_FIRST_KEY)==="1"; }
  catch(e){ return false; }
}
function memoryFirstForState(state){
  try{
    const raw = localStorage.getItem(MEMORY_FIRST_KEY);
    if(raw==="1") return true;
    if(raw==="0") return false;
  }catch(e){}
  return !!state && (state.turn||0)>=20;
}
function setMemoryFirst(on){
  try{ localStorage.setItem(MEMORY_FIRST_KEY,on?"1":"0"); }catch(e){}
}

function semanticMemoryEnabled(){
  try{
    const raw = localStorage.getItem(SEMANTIC_MEMORY_KEY);
    return raw===null ? true : raw==="1";
  }catch(e){ return false; }
}
function setSemanticMemory(on){
  try{ localStorage.setItem(SEMANTIC_MEMORY_KEY,on?"1":"0"); }catch(e){}
}
let embedWorkerPromise = null;
let embedReqId = 0;
const embedPending = new Map();
function embedWorkerReady(){
  if(embedWorkerPromise) return embedWorkerPromise;
  embedWorkerPromise = new Promise((resolve,reject)=>{
    try{
      const worker = new Worker("js/embed-worker.js",{type:"module"});
      worker.onmessage = event=>{
        const data = event.data || {};
        const pending = embedPending.get(data.id);
        if(!pending) return;
        embedPending.delete(data.id);
        clearTimeout(pending.timer);
        if(data.ok) pending.resolve(data);
        else pending.reject(new Error(data.error || "语义模型失败"));
      };
      worker.onerror = event=>{
        for(const pending of embedPending.values()){ clearTimeout(pending.timer); pending.reject(new Error("语义模型加载失败")); }
        embedPending.clear();
        embedWorkerPromise = null;
        try{ worker.terminate(); }catch(e){}
        reject(new Error(event.message || "语义模型加载失败"));
      };
      resolve(worker);
    }catch(e){ embedWorkerPromise = null; reject(e); }
  });
  return embedWorkerPromise;
}
function embedCall(payload, timeout=180000){
  return embedWorkerReady().then(worker=>new Promise((resolve,reject)=>{
    const id = ++embedReqId;
    const timer = setTimeout(()=>{ embedPending.delete(id); reject(new Error("语义模型超时")); },timeout);
    embedPending.set(id,{resolve,reject,timer});
    worker.postMessage({id,...payload});
  }));
}
function embedTexts(texts, timeout){
  if(!semanticMemoryEnabled()) return Promise.resolve(null);
  return embedCall({type:"embed",texts},timeout).then(data=>data.vectors).catch(()=>null);
}
function warmSemanticMemory(){
  if(!semanticMemoryEnabled()) return Promise.resolve(false);
  return embedCall({type:"warm"},180000).then(()=>true).catch(()=>false);
}
function cosineSimilarity(a,b){
  if(!Array.isArray(a) || !Array.isArray(b) || a.length!==b.length) return 0;
  let dot=0, na=0, nb=0;
  for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  return na && nb ? dot/Math.sqrt(na*nb) : 0;
}

function tavernDbOpen(){
  if(tavernDbPromise) return tavernDbPromise;
  tavernDbPromise = new Promise((resolve,reject)=>{
    if(typeof indexedDB==="undefined"){ reject(new Error("IndexedDB 不可用")); return; }
    const req = indexedDB.open(TAVERN_DB_NAME, TAVERN_DB_VERSION);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains("events")){
        const s = db.createObjectStore("events",{keyPath:"id"});
        s.createIndex("worldId","worldId",{unique:false});
        s.createIndex("worldId_turn",["worldId","turn"],{unique:false});
        s.createIndex("participants","participants",{multiEntry:true});
      }
      if(!db.objectStoreNames.contains("memories")){
        const s = db.createObjectStore("memories",{keyPath:"id"});
        s.createIndex("worldId","worldId",{unique:false});
        s.createIndex("name","name",{unique:false});
        s.createIndex("worldId_turn",["worldId","turn"],{unique:false});
      }
      if(!db.objectStoreNames.contains("worlds")){
        db.createObjectStore("worlds",{keyPath:"worldId"});
      }
      if(!db.objectStoreNames.contains("world_texts")){
        db.createObjectStore("world_texts",{keyPath:"id"});
      }
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error || new Error("数据库打开失败"));
  });
  return tavernDbPromise;
}

function tavernDbStore(db, store, mode, work){
  return new Promise((resolve,reject)=>{
    let tx;
    try{ tx = db.transaction(store, mode); }catch(e){ reject(e); return; }
    const os = tx.objectStore(store);
    let result;
    try{ result = work(os); }catch(e){ reject(e); return; }
    tx.oncomplete = ()=>resolve(result);
    tx.onerror = ()=>reject(tx.error || new Error("数据库事务失败"));
    tx.onabort = ()=>reject(tx.error || new Error("数据库事务中止"));
  });
}

function tavernWorldId(state){
  return String(state?.worldId || state?.builtinId || state?.worldName || "local").slice(0,180);
}

function tavernHash(text){
  let h = 0;
  for(const ch of String(text||"")) h = (h*31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
}

function tavernImportance(text, scene){
  const s = String(text||"");
  let n = 2;
  if(/(帮|修|救|照顾|陪|答应|承诺|欠|人情|约定|期限|改天|下次|以后|未了|还没)/.test(s)) n = 3;
  if(/(生死|婚|嫁|娶|怀孕|孩子|杀|死|背叛|出卖|永远|一辈子|誓言|救命|断交|决裂)/.test(s)) n = 4;
  if(scene?.ending) n = 5;
  return n;
}

function tavernIsOpen(text){
  return /(答应|承诺|欠|人情|约定|期限|改天|下次|以后|未了|还没|等|回来|再找|之后再)/.test(String(text||""));
}

function tavernEventId(worldId, turn, timelineId){ return worldId+"::"+String(timelineId||"main")+"::"+String(turn); }

async function tavernDbPutEvent(event){
  try{
    const db = await tavernDbOpen();
    await tavernDbStore(db,"events","readwrite",os=>os.put(event));
    return true;
  }catch(e){ return false; }
}

async function tavernDbPutWorld(meta){
  try{
    const db = await tavernDbOpen();
    await tavernDbStore(db,"worlds","readwrite",os=>os.put(meta));
    return true;
  }catch(e){ return false; }
}

async function tavernDbPutWorldText(id,text){
  try{
    const db = await tavernDbOpen();
    await tavernDbStore(db,"world_texts","readwrite",os=>os.put({id:String(id),text:String(text||"")}));
    return true;
  }catch(e){ return false; }
}

async function tavernDbGetWorldText(id){
  try{
    const db = await tavernDbOpen();
    return await tavernDbStore(db,"world_texts","readonly",os=>{
      const req = os.get(String(id));
      return new Promise((resolve,reject)=>{ req.onsuccess=()=>resolve(req.result && typeof req.result.text==="string" ? req.result.text : ""); req.onerror=()=>reject(req.error); });
    });
  }catch(e){ return ""; }
}

async function tavernDbDeleteWorldText(id){
  try{
    const db = await tavernDbOpen();
    await tavernDbStore(db,"world_texts","readwrite",os=>os.delete(String(id)));
    return true;
  }catch(e){ return false; }
}

async function tavernDbRecentEvents(worldId, limit=320, include=()=>true){
  try{
    const db = await tavernDbOpen();
    const list = await tavernDbStore(db,"events","readonly",os=>{
      const req = os.index("worldId").getAll(worldId);
      return new Promise((resolve,reject)=>{ req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error); });
    });
    return list.filter(include).sort((a,b)=>(b.turn||0)-(a.turn||0)).slice(0,limit);
  }catch(e){ return []; }
}

async function tavernDbRankedEvents(worldId, visible, scoreEvent, limit){
  try{
    const db = await tavernDbOpen();
    return await tavernDbStore(db,"events","readonly",store=>new Promise((resolve,reject)=>{
      const best = [];
      const compare = (a,b)=>b.score-a.score || (b.e.turn||0)-(a.e.turn||0);
      const req = store.index("worldId").openCursor(worldId);
      req.onerror = ()=>reject(req.error);
      req.onsuccess = ()=>{
        const cursor = req.result;
        if(!cursor){ resolve(best); return; }
        const e = cursor.value;
        if(visible(e)){
          const row = {e,score:scoreEvent(e)};
          if(row.score>=5 && (best.length<limit || compare(row,best.at(-1))<0)){
            best.push(row);
            best.sort(compare);
            if(best.length>limit) best.pop();
          }
        }
        cursor.continue();
      };
    }));
  }catch(error){ return []; }
}

async function tavernDbMemories(worldId, names, limit=40){
  try{
    const db = await tavernDbOpen();
    const list = await tavernDbStore(db,"memories","readonly",os=>{
      const req = os.index("worldId").getAll(worldId);
      return new Promise((resolve,reject)=>{ req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error); });
    });
    const set = new Set((names||[]).filter(Boolean));
    return list.filter(m=>m && (!set.size || set.has(m.name)))
      .sort((a,b)=>(b.turn||0)-(a.turn||0)).slice(0,limit);
  }catch(e){ return []; }
}

function tavernKeywordScore(text, event){
  const t = String(text||"");
  const hay = [event.summary,event.place,(event.participants||[]).join(" "),event.kind].filter(Boolean).join(" ");
  let score = 0;
  for(const kw of ["屋顶","修","答应","承诺","欠","人情","约定","任务","线索","证据","钥匙","账","药","伤","救","帮","婚","爱","背叛","仇","船","货"]){
    if(hay.includes(kw) && t.includes(kw)) score += 2;
  }
  for(const name of (event.participants||[])) if(name && t.includes(name)) score += 3;
  return score;
}

function memoryPeople(state,action,target){
  const names = new Set(target ? [target] : (state.present||[]));
  for(const c of state.cast||[]){
    if(!c?.name) continue;
    const aliases = c.profileAliases||[];
    if(names.has(c.name) || aliases.some(name=>names.has(name))
      || (!target && (action.includes(c.name) || aliases.some(name=>name && action.includes(name))))){
      names.add(c.name);
      for(const name of aliases) names.add(name);
    }
  }
  return names;
}

function relevantCommitments(state,names,action){
  const closed = (state.loopHistory||[]).filter(isStoryCommitment).map(l=>({...l,closed:true}));
  const extras = (state.openLoops||[]).filter(isStoryCommitment);
  const ranked = [];
  for(const loop of [...extras,...closed]){
    const knownBy = [...new Set([...(loop.knownBy||[]),...(loop.npcAction?.who ? [loop.npcAction.who] : [])])];
    if(!knownBy.some(n=>n!=="玩家" && names.has(n))) continue;
    const score = (loop.closed ? 0 : 8)+knownBy.reduce((sum,n)=>sum+(n!=="玩家" && action.includes(n) ? 8 : 0),0)
      +tavernKeywordScore(action,{summary:loop.text});
    ranked.push({loop,knownBy,score});
  }
  return ranked.sort((a,b)=>b.score-a.score || (b.loop.createdTurn||0)-(a.loop.createdTurn||0)).slice(0,5)
    .map(({loop,knownBy})=>"- "+(loop.closed ? "已处理" : "尚待处理")+" · "+(loop.outcome||loop.text)
      +"（知情："+knownBy.join("、")+"）");
}

async function retrieveRelevantMemory(state, action="",target=""){
  if(!state || !state.ai) return "";
  await memoryWriteQueue;
  const worldId = tavernWorldId(state);
  const names = memoryPeople(state,action,target);
  const text = [action, state.scene, state.plot?.goal, state.plot?.conflict].filter(Boolean).join(" ");
  const commitments = relevantCommitments(state,names,action);
  if(!names.size) return "";
  const queryText = text.slice(0,500);
  const scope = timelineScope(state);
  const visible = e=>e && e.turn<=state.turn && timelineVisible(e,scope) && Array.isArray(e.knownBy)
    && e.knownBy.some(n=>n!=="玩家" && names.has(n));
  const queryVecs = await embedTexts([queryText],1200);
  const queryVec = queryVecs && queryVecs[0];
  const scored = await tavernDbRankedEvents(worldId,visible,e=>{
    let score = (e.importance||2)*2;
    if(e.status==="open") score += 3;
    if((e.participants||[]).some(n=>names.has(n))) score += 4;
    score += tavernKeywordScore(text,e);
    if((state.turn||0)-(e.turn||0) <= 12) score += 2;
    if(queryVec && Array.isArray(e.vector) && e.vector.length===queryVec.length){
      score += Math.round(Math.max(0,cosineSimilarity(queryVec,e.vector))*30);
    }
    return score;
  },memoryFirstForState(state) ? 14 : 10);
  const maxLen = memoryFirstForState(state) ? 2200 : 1600;
  const lines = commitments.length ? ["【先找回相关旧承诺】"+commitments.join("\n")] : [];
  let length = lines.join("\n").length;
  const header = "【按知情人召回的往事】只让名单里的角色表现知道。";
  let hasEvents = false;
  for(const {e} of scored){
    const line = "- 第"+e.turn+"幕（知情："+e.knownBy.join("、")+"）："+String(e.summary||"").slice(0,170);
    if(length+line.length+(hasEvents ? 1 : header.length+2)>maxLen) continue;
    if(!hasEvents){ lines.push(header); length+=header.length+1; hasEvents=true; }
    lines.push(line);
    length+=line.length+1;
  }
  return lines.join("\n");
}

async function recordTurnToDb(state, turn, facts){
  if(!state?.ai || !facts.length) return;
  const worldId = tavernWorldId(state);
  const eventBase = tavernEventId(worldId,turn,state.timelineId);
  const events = facts.map(({text,knownBy},index)=>({
    id: eventBase+"::"+index,worldId,turn,
    timelineId: state.timelineId || "main",
    minute: Number.isFinite(state.environment?.minute) ? state.environment.minute : null,
    place: state.environment?.place || "", summary: text,
    participants:knownBy.filter(n=>n!=="玩家"),knownBy,
    importance: tavernImportance(text),
    status: tavernIsOpen(text) ? "open" : "closed",
    kind:/答应|承诺|约定|欠/.test(text)?"promise":"event",
    createdAt:Date.now(),revision:Math.random().toString(36).slice(2)
  }));
  await queueMemoryWrite(async()=>{
    const db = await tavernDbOpen();
    await tavernDbStore(db,"events","readwrite",os=>{for(const event of events) os.put(event);});
    await tavernDbPutWorld({worldId,name:state.worldName||"",savedAt:Date.now(),turn});
  });
  const vectors = await embedTexts(events.map(e=>e.summary));
  if(vectors){
    const db = await tavernDbOpen();
    for(const [index,event] of events.entries()){
      if(vectors[index]?.length) await attachMemoryVector(db,event,vectors[index]);
    }
  }
}

function attachMemoryVector(db,event,vector){
  return tavernDbStore(db,"events","readwrite",os=>{
    const req=os.get(event.id);
    req.onsuccess=()=>{
      const current=req.result;
      if(current && current.revision===event.revision && current.summary===event.summary
        && current.createdAt===event.createdAt) os.put({...current,vector});
    };
  });
}

async function dbDeleteTurn(worldId, turn, timelineId="main"){
  return queueMemoryWrite(async()=>{
    const db = await tavernDbOpen();
    const tid = timelineId || "main";
    await tavernDbStore(db,"events","readwrite",os=>{
      const req = os.index("worldId").getAll(worldId);
      req.onsuccess = ()=>{ for(const e of (req.result||[])) if(e.turn===turn && (e.timelineId||"main")===tid) os.delete(e.id); };
    });
    await tavernDbStore(db,"memories","readwrite",os=>{
      const req = os.index("worldId").getAll(worldId);
      req.onsuccess = ()=>{ for(const m of (req.result||[])) if(m.turn===turn && (m.timelineId||"main")===tid) os.delete(m.id); };
    });
  });
}

async function dbDeleteWorld(worldId){
  return queueMemoryWrite(async()=>{
    const db = await tavernDbOpen();
    for(const store of ["events","memories","worlds"]){
      await tavernDbStore(db,store,"readwrite",os=>{
        if(store==="worlds"){ os.delete(worldId); return; }
        const req = os.index("worldId").getAll(worldId);
        req.onsuccess = ()=>{ for(const x of (req.result||[])) os.delete(x.id); };
      });
    }
  });
}

async function backfillEmbeddings(worldId, limit=400){
  if(!semanticMemoryEnabled()) return 0;
  try{
    const db = await tavernDbOpen();
    const events = await tavernDbRecentEvents(worldId, limit);
    const todo = events.filter(e=>e && !Array.isArray(e.vector));
    let done = 0;
    for(let i=0;i<todo.length;i+=6){
      const batch = todo.slice(i,i+6);
      const vectors = await embedTexts(batch.map(e=>String(e.summary||"").slice(0,400)));
      if(!vectors) break;
      for(let j=0;j<batch.length;j++){
        if(!vectors[j] || !vectors[j].length) continue;
        await attachMemoryVector(db,batch[j],vectors[j]);
        done++;
      }
    }
    return done;
  }catch(e){ return 0; }
}

async function dbBackfillWorld(state){
  if(!state || !state.ai || state.dbBackfilled) return;
  const worldId = tavernWorldId(state);
  state.dbBackfilled = true;
  try{
    const existing = await tavernDbRecentEvents(worldId, 1);
    if(existing.length) return;
    const memories = Array.isArray(state.memory) ? state.memory.slice(-40) : [];
    for(let i=0;i<memories.length;i++){
      const text = String(memories[i]||"").trim();
      if(!text) continue;
      await tavernDbPutEvent({
        id:worldId+"::legacy::"+i, worldId, timelineId:"main", turn:0, minute:null, place:"",
        summary:text.slice(0,600), participants:[], importance:tavernImportance(text),
        status:tavernIsOpen(text)?"open":"closed", kind:"legacy", keywords:[], createdAt:Date.now()
      });
    }
    const cons = Array.isArray(state.consequences) ? state.consequences.slice(-30) : [];
    for(const c of cons){
      const text = [c.decision,c.fact,c.followUp].filter(Boolean).join("；");
      if(!text) continue;
      await tavernDbPutEvent({
        id:worldId+"::legacy-c::"+String(c.id||c.turn||tavernHash(text)), worldId, timelineId:"main",
        turn:Number.isFinite(c.turn)?c.turn:0, minute:null, place:"",
        summary:text.slice(0,600), participants:[], importance:tavernImportance(text),
        status:c.status==="pending"?"open":"closed", kind:"legacy", keywords:[], createdAt:Date.now()
      });
    }
    await tavernDbPutWorld({worldId,name:state.worldName||"",savedAt:Date.now(),turn:state.turn||0,backfilled:true});
  }catch(e){}
}
