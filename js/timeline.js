"use strict";
/* ==================== 时间线快照与分支 ==================== */
const TIMELINE_SNAP_PREFIX = "tavern_timeline_snap_v1:";
const TIMELINE_COLORS = ["#d4a24c","#6fa85c","#c97b5a","#7f9fc9","#b27ac9","#c9a85c","#5aa8a1"];
let timelineCompareId = "";

function timelineWorldKey(state){
  return String((state && (state.worldId || state.builtinId)) || "local").slice(0,180);
}
function ensureTimelineState(state){
  if(!state) return state;
  if(!state.timelineId) state.timelineId = "main";
  if(!Array.isArray(state.timelines) || !state.timelines.length){
    state.timelines = [{id:"main",name:"主线",parentId:null,branchTurn:0,createdAt:Date.now(),color:TIMELINE_COLORS[0]}];
  }
  if(!Number.isFinite(state.timelineSeq)) state.timelineSeq = state.timelines.length;
  return state;
}
function currentTimeline(state){
  ensureTimelineState(state);
  return state.timelines.find(t=>t.id===state.timelineId) || state.timelines[0];
}
function timelineLabel(state){
  const t = currentTimeline(state);
  return t ? t.name : "主线";
}
function timelineScope(state){
  ensureTimelineState(state);
  const byId = new Map(state.timelines.map(t=>[t.id,t]));
  const out = [];
  let id = state.timelineId, maxTurn = Infinity, guard = 0;
  while(id && guard++ < 40){
    const meta = byId.get(id);
    out.push({id,maxTurn});
    if(!meta) break;
    maxTurn = Math.min(maxTurn,Number.isFinite(meta.branchTurn) ? meta.branchTurn : 0);
    id = meta.parentId;
  }
  return out;
}
function timelineVisible(item,scope){
  const tid = (item && item.timelineId) || "main";
  const entry = (scope||[]).find(x=>x.id===tid);
  if(!entry) return false;
  return entry.maxTurn===Infinity || (Number(item.turn)||0) <= entry.maxTurn;
}
function timelineSnapshotStats(state){
  const prefix = TIMELINE_SNAP_PREFIX + timelineWorldKey(state) + ":";
  let count = 0, bytes = 0;
  try{
    for(let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i);
      if(!key || !key.startsWith(prefix)) continue;
      count++;
      bytes += (localStorage.getItem(key)||"").length;
    }
  }catch(e){}
  return {count,bytes};
}
function timelineSnapshotKey(state,tid){
  return TIMELINE_SNAP_PREFIX + timelineWorldKey(state) + ":" + String(tid||"main");
}
function cloneTimelineState(state){
  const copy = {};
  for(const [key,value] of Object.entries(state||{})){
    if(key==="world") continue;
    copy[key] = value;
  }
  return JSON.parse(JSON.stringify(copy));
}
function orderedTimelines(state){
  ensureTimelineState(state);
  const list = state.timelines || [];
  const byParent = new Map();
  for(const t of list){
    const key = t.parentId || "";
    if(!byParent.has(key)) byParent.set(key,[]);
    byParent.get(key).push(t);
  }
  const out = [];
  const seen = new Set();
  const walk = (parentId,depth)=>{
    for(const t of (byParent.get(parentId||"")||[])){
      if(!t || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({t,depth});
      walk(t.id,depth+1);
    }
  };
  walk(null,0);
  for(const t of list) if(!seen.has(t.id)){ seen.add(t.id); out.push({t,depth:0}); }
  return out;
}
function timelineSnapshotSummary(state,tid){
  const snap = loadTimelineSnapshot(state,tid);
  if(!snap) return null;
  const chapter = snap.chapter && snap.chapter.title ? snap.chapter.title : "未建立篇章";
  const last = (snap.log||[]).slice(-1)[0];
  return {
    turn:snap.turn||0,
    scene:snap.scene||(snap.environment&&snap.environment.place)||"",
    chapter,
    coin:snap.coin,
    hp:snap.hp,
    cast:(snap.cast||[]).length,
    loops:(snap.openLoops||[]).length,
    lastText:last ? String(last.text||"").slice(0,120) : ""
  };
}
function deleteTimelineBranch(state,id){
  ensureTimelineState(state);
  if(!id || id==="main") return false;
  const meta = state.timelines.find(t=>t.id===id);
  if(!meta) return false;
  if(state.timelineId===id){
    const parent = meta.parentId || "main";
    const next = switchTimelineState(state,parent);
    if(!next) return false;
    for(const key of Object.keys(state)) delete state[key];
    Object.assign(state,next);
  }
  for(const t of state.timelines) if(t.parentId===id) t.parentId = meta.parentId || "main";
  state.timelines = state.timelines.filter(t=>t.id!==id);
  try{ localStorage.removeItem(timelineSnapshotKey(state,id)); }catch(e){}
  if(state.timelineId===id) state.timelineId = meta.parentId || "main";
  saveTimelineSnapshot(state);
  return true;
}
function saveTimelineSnapshot(state){
  try{
    ensureTimelineState(state);
    localStorage.setItem(timelineSnapshotKey(state,state.timelineId),JSON.stringify(cloneTimelineState(state)));
    return true;
  }catch(e){ return false; }
}
function loadTimelineSnapshot(state,tid){
  try{
    const raw = localStorage.getItem(timelineSnapshotKey(state,tid));
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function deleteTimelineSnapshots(worldKey){
  try{
    const prefix = TIMELINE_SNAP_PREFIX + String(worldKey) + ":";
    const keys = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach(k=>localStorage.removeItem(k));
  }catch(e){}
}
function createTimelineBranch(state,name,saveParent=true){
  ensureTimelineState(state);
  if(saveParent) saveTimelineSnapshot(state);
  const id = "tl_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const meta = {
    id,
    name:String(name||"").trim().slice(0,60) || ("分支 "+(state.timelines.length+1)),
    parentId:state.timelineId,
    branchTurn:state.turn||0,
    branchMinute:Number.isFinite(state.environment?.minute)?state.environment.minute:null,
    createdAt:Date.now(),
    color:TIMELINE_COLORS[state.timelines.length % TIMELINE_COLORS.length]
  };
  state.timelines.push(meta);
  state.timelineId = id;
  state.timelineSeq = Math.max(state.timelineSeq||0, state.timelines.length);
  saveTimelineSnapshot(state);
  return meta;
}
function switchTimelineState(state,targetId){
  ensureTimelineState(state);
  if(!targetId || targetId===state.timelineId) return state;
  saveTimelineSnapshot(state);
  const snap = loadTimelineSnapshot(state,targetId);
  if(!snap) return null;
  snap.world = state.world;
  snap.timelines = state.timelines;
  snap.timelineId = targetId;
  snap.timelineSeq = state.timelineSeq;
  ensureTimelineState(snap);
  saveTimelineSnapshot(snap);
  return snap;
}
