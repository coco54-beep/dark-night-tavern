"use strict";

const TAVERN_BACKUP_FORMAT = "darknight-tavern-journey";
const TAVERN_BACKUP_MAX_BYTES = 48 * 1024 * 1024;
const BACKUP_TIMELINE_ID = /^(?:main|tl_[a-z0-9_]+)$/i;
const BACKUP_IMAGE_DATA = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const isBackupObject = value=>value!==null && typeof value==="object" && !Array.isArray(value);

function backupImageKeys(state){
  return [state.avatarKey,state.sceneImageKey,...(state.cast||[]).map(c=>c?.avatarKey),
    ...(state.log||[]).filter(entry=>entry?.t==="image").map(entry=>entry.key)]
    .filter(key=>typeof key==="string" && key);
}

function removeMissingBackupImages(states,images){
  const missing = new Set(states.flatMap(backupImageKeys).filter(key=>!images[key]));
  for(const state of states){
    if(missing.has(state.avatarKey)) delete state.avatarKey;
    if(missing.has(state.sceneImageKey)) delete state.sceneImageKey;
    for(const c of (state.cast||[])) if(missing.has(c?.avatarKey)) delete c.avatarKey;
    state.log = (state.log||[]).filter(entry=>entry?.t!=="image" || !missing.has(entry.key));
    delete state.imageData;
  }
  return missing.size;
}

function readBackupRecords(db,storeName,worldId){
  return tavernDbStore(db,storeName,"readonly",store=>new Promise((resolve,reject)=>{
    const request = store.index("worldId").getAll(worldId);
    request.onsuccess = ()=>resolve(request.result);
    request.onerror = ()=>reject(request.error);
  }));
}

async function collectJourneyBackup(id){
  await saveQueue;
  await memoryWriteQueue;
  const [{world},{save}] = await Promise.all([api("/api/worlds?id="+encodeURIComponent(id)),api("/api/save?id="+encodeURIComponent(id))]);
  if(!save) throw new Error("这段旅途还没有可备份的存档");
  if(!world.text && world.bookId && !world.builtinId){
    const {world:book} = await api("/api/worlds?id="+encodeURIComponent(world.bookId));
    if(!book.text) throw new Error("找不到这段旅途的原文");
    world.text = book.text;
    world.bible ||= book.bible;
  }
  if(!world.text && world.builtinId){
    world.text = (await readBuiltinBook(world.builtinId)).text;
    world.bible ||= await readBuiltinBook(world.builtinId,{bible:true,optional:true});
  }
  delete world.bookId;
  const snapshots = {};
  for(const timeline of (save.timelines||[])){
    if(timeline.id===save.timelineId) continue;
    const snapshot = loadTimelineSnapshot({worldId:id},timeline.id);
    if(!snapshot) throw new Error("缺少「"+timeline.name+"」时间线的本地快照");
    snapshots[timeline.id] = snapshot;
  }
  const states = [save,...Object.values(snapshots)];
  const images = Object.assign(Object.create(null),...states.map(state=>state.imageData||{}));
  const imageKeys = new Set(states.flatMap(backupImageKeys));
  if(imageKeys.size){
    const db = await imageDb();
    await tavernDbStore(db,"images","readonly",store=>{
      for(const key of imageKeys){
        const request = store.get(key);
        request.onsuccess = ()=>{ if(request.result) images[key] = request.result; };
      }
    });
  }
  const missingImageCount = removeMissingBackupImages(states,images);
  const db = await tavernDbOpen();
  const [events,memories] = await Promise.all([readBackupRecords(db,"events",id),readBackupRecords(db,"memories",id)]);
  return {format:TAVERN_BACKUP_FORMAT,version:1,world,save,snapshots,images,events,memories,missingImageCount};
}

function parseJourneyBackup(text){
  let data;
  try{
    data = JSON.parse(text.replace(/^\uFEFF/,""),(key,value)=>{
      if(key==="__proto__" || key==="constructor" || key==="prototype") throw new Error("无效字段");
      return value;
    });
  }catch(error){ throw new Error("无法读取备份文件"); }
  if(data?.format==="tavern-journey-backup" && data.version===1
    && isBackupObject(data.world) && isBackupObject(data.save)
    && Array.isArray(data.save.cast) && Array.isArray(data.save.log)){
    const {world,save} = data;
    const images = Object.fromEntries(Object.entries(save.imageData||{}).filter(([,value])=>
      typeof value==="string" && BACKUP_IMAGE_DATA.test(value)));
    world.name ||= world.title || "旅途";
    world.text ||= "";
    save.worldId = world.id;
    const active = Array.isArray(save.timelines) ? save.timelines.find(t=>t?.id===save.timelineId) : null;
    save.timelineId = "main";
    save.timelines = [{...active,id:"main",parentId:null,branchTurn:0,name:active?.name||"主线"}];
    const missingImageCount = removeMissingBackupImages([save],images);
    data = {format:TAVERN_BACKUP_FORMAT,version:1,world,save,images,snapshots:{},events:[],memories:[],
      legacy:true,missingImageCount};
  }
  const validState = state=>isBackupObject(state) && state.ai===true && state.worldId===data.world.id
    && Number.isSafeInteger(state.turn) && state.turn>=0 && Array.isArray(state.cast)
    && state.cast.every(c=>isBackupObject(c) && typeof c.name==="string")
    && Array.isArray(state.log) && state.log.every(e=>isBackupObject(e) && typeof e.t==="string"
      && (e.t!=="image" || !e.data || typeof e.data==="string" && BACKUP_IMAGE_DATA.test(e.data)));
  if(data?.format!==TAVERN_BACKUP_FORMAT || data.version!==1 || !isBackupObject(data.world)
    || !/^[a-z0-9_-]{1,80}$/i.test(data.world.id||"") || typeof data.world.name!=="string" || !data.world.name.trim()
    || typeof data.world.text!=="string" || !validState(data.save)
    || !isBackupObject(data.snapshots) || !isBackupObject(data.images)
    || !Array.isArray(data.events) || !Array.isArray(data.memories)){
    throw new Error("备份格式或版本不受支持");
  }
  const timelineId = data.save.timelineId || "main";
  const timelines = data.save.timelines || [{id:"main",parentId:null}];
  if(!Array.isArray(timelines) || !timelines.every(t=>isBackupObject(t) && BACKUP_TIMELINE_ID.test(t.id||""))){
    throw new Error("备份里的时间线无效");
  }
  const timelineIds = new Set(timelines.map(t=>t.id));
  if(timelineIds.size!==timelines.length || !timelineIds.has("main") || !timelineIds.has(timelineId)
    || timelines.some(t=>t.parentId && !timelineIds.has(t.parentId))
    || Object.entries(data.snapshots).some(([id,state])=>!timelineIds.has(id) || state?.timelineId!==id || !validState(state))
    || timelines.some(t=>t.id!==timelineId && !data.snapshots[t.id])){
    throw new Error("备份里的时间线不完整");
  }
  const rows = [...data.events,...data.memories];
  if(rows.some(row=>!isBackupObject(row) || typeof row.id!=="string" || row.worldId!==data.world.id
    || !Number.isSafeInteger(row.turn) || row.turn<0
    || ["knownBy","participants"].some(key=>row[key]!==undefined
      && (!Array.isArray(row[key]) || row[key].some(name=>typeof name!=="string"))))){
    throw new Error("备份里的记忆记录无效");
  }
  if(Object.values(data.images).some(value=>typeof value!=="string" || !BACKUP_IMAGE_DATA.test(value))
    || [data.save,...Object.values(data.snapshots)].flatMap(backupImageKeys).some(key=>!Object.hasOwn(data.images,key))){
    throw new Error("备份里的图片不完整或格式不受支持");
  }
  return data;
}

async function restoreJourneyBackup(data){
  await saveQueue;
  const oldId = data.world.id;
  const id = "w"+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  const name = data.world.name.slice(0,240)+"（恢复）";
  const images = new Map(Object.keys(data.images).map((key,i)=>[key,"backup:"+id+":"+i]));
  const states = [data.save,...Object.values(data.snapshots)];
  const remapImage = key=>images.get(key)||"";
  for(const state of states){
    state.worldId = id;
    state.worldName = name;
    if(state.avatarKey) state.avatarKey = remapImage(state.avatarKey);
    if(state.sceneImageKey) state.sceneImageKey = remapImage(state.sceneImageKey);
    for(const c of state.cast) if(c.avatarKey) c.avatarKey = remapImage(c.avatarKey);
    for(const entry of state.log) if(entry.t==="image") entry.key = remapImage(entry.key);
    delete state.imageData;
    delete state.world;
  }
  const {text,...meta} = data.world;
  const world = {...meta,id,name,text:"",restoredBackup:true,turn:data.save.turn,scene:data.save.scene,
    finished:!!data.save.ending,savedAt:Date.now(),isBook:false};
  delete world.bookId;
  let imageStore;
  const writtenKeys = [];
  try{
    if(images.size){
      imageStore = await imageDb();
      await tavernDbStore(imageStore,"images","readwrite",store=>{
        for(const [oldKey,newKey] of images) store.put(data.images[oldKey],newKey);
      });
    }
    if(!await tavernDbPutWorldText(id,text)) throw new Error("无法写入旅途原文");
    const db = await tavernDbOpen();
    await queueMemoryWrite(async()=>{
      for(const storeName of ["events","memories"]){
        await tavernDbStore(db,storeName,"readwrite",store=>{
          data[storeName].forEach((row,index)=>{
            const rowId = row.id.startsWith(oldId+"::") ? id+row.id.slice(oldId.length) : id+"::backup::"+index;
            store.put({...row,id:rowId,worldId:id});
          });
        });
      }
    });
    for(const [tid,state] of Object.entries(data.snapshots)){
      const key = timelineSnapshotKey({worldId:id},tid);
      localStorage.setItem(key,JSON.stringify(state));
      writtenKeys.push(key);
    }
    localStorage.setItem(singleSaveKey(id),JSON.stringify(data.save));
    writtenKeys.push(singleSaveKey(id));
    saveSingleWorlds([...singleWorlds(),world]);
    return world;
  }catch(error){
    for(const key of writtenKeys) localStorage.removeItem(key);
    await Promise.allSettled([tavernDbDeleteWorldText(id),dbDeleteWorld(id),
      imageStore && tavernDbStore(imageStore,"images","readwrite",store=>{
        for(const key of images.values()) store.delete(key);
      })]);
    throw error;
  }
}

async function exportJourneyBackup(id){
  const data = await collectJourneyBackup(id);
  const text = JSON.stringify(data);
  const blob = new Blob([text],{type:"application/json"});
  if(blob.size>TAVERN_BACKUP_MAX_BYTES) throw new Error("这份备份超过 48 MB");
  const name = data.world.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,"_").slice(0,60)+".tavern.json";
  const native = globalThis.Capacitor?.Plugins?.TavernBackup;
  if(native?.save) return {saved:(await native.save({name,text})).saved,missingImages:data.missingImageCount};
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  return {saved:true,missingImages:data.missingImageCount};
}
