"use strict";

const GENRE_SYSTEM_LABELS = {恋爱:"信任与共同经历",科幻:"装备与能源",末日:"营地与物资",奇幻:"能力与契约"};
const CAMP_JOBS = {forage:"搜寻物资",repair:"维护营地",care:"照料伤病"};
const RELATION_EVENTS = {kept:"守约",broken:"失约",hurt:"伤害",respect:"尊重边界",crossed:"越过边界",shared:"共同经历",private:"私下交谈"};

function genreSystem(state){
  if(!state.ai) return "";
  const label = genreConflictProfile(state).label;
  return Object.hasOwn(GENRE_SYSTEM_LABELS,label) ? label : "";
}

function genreGameRules(state){
  const system = genreSystem(state);
  const rules = {
    恋爱:"关系用 relationshipEvent:{who,kind,detail,boundary,beat} 记录。kind 用 kept/broken/hurt/respect/crossed/shared/private。beat 是该 NPC 在 beats 中从 1 开始的台词或动作编号。boundary 仅在此人明确说出新的界限时填写具体内容，保留旧边界。private 必须是双方私下交谈，台词的 to 填玩家。尊重边界、兑现承诺和共同经历影响信任，信任可以带来主动邀约和沟通意愿，不代表任何亲密行为的许可。",
    科幻:"尚无装备记录时，用 genreSetup:{name,energy,parts,route} 建立当前可操作设备。route 是确实因改装才可通行的路线。充电站、配件等实际获得且已演出时用 genreFind:{source,energy,parts}（source 必须是本幕出现的具体来源）。通讯、留返程电量、改装、走新路线和返程由玩家挑选，游戏按能源及零件结算。",
    末日:"首次找到可留守的避难所时用 genreSetup:{name,rations,medicine,shelter,members}（members 为本幕在场、已同意留守的 NPC 名单，限 6 人）。实际搜到物资才用 genreFind:{source,rations,medicine}。每天消耗口粮，留守人按分工处理搜寻、设施或照料。玩家不在营地也推进，缺粮时留守人可优先自救。",
    奇幻:"首次揭示玩家已有的能力用 genreSetup:{energy,powers:[{name,effect,cost,kind,party,obligation}]}。kind 用 energy/favor/notice 代表耗魔、欠人情或引起势力注意。favor 须给明确债主 party 和履约要求 obligation；notice 须有能察觉的势力 party。实际获得魔力资源才用 genreFind:{source,energy}。只有玩家主动选用能力才支付代价并按实际效果演出。没履行委托之前，不能把契约写成已经偿还。"
  };
  return rules[system] ? "【"+GENRE_SYSTEM_LABELS[system]+"】"+rules[system]
    +"。有明确的系统操作时，实际完成才返回 genreDone:true。只询问、被拒绝或未完成用 false；程序会处理资源、行动及存档。" : "";
}

function readGenreData(obj,short){
  const setup = obj.genreSetup;
  const find = obj.genreFind;
  const relationship = obj.relationshipEvent;
  const bounded = (value,max=100)=>Number.isSafeInteger(value) ? clamp(value,0,max) : null;
  return {
    setup:setup && typeof setup==="object" ? {
      name:short(setup.name,72),route:short(setup.route,90),energy:bounded(setup.energy),parts:bounded(setup.parts),
      rations:bounded(setup.rations),medicine:bounded(setup.medicine),shelter:bounded(setup.shelter),
      members:Array.isArray(setup.members) ? [...new Set(setup.members.map(n=>short(n,60)).filter(Boolean))].slice(0,6) : [],
      powers:Array.isArray(setup.powers) ? setup.powers.slice(0,6).map(p=>({
        name:short(p?.name,64),effect:short(p?.effect,180),cost:bounded(p?.cost,20),
        kind:short(p?.kind,15),party:short(p?.party,75),obligation:short(p?.obligation,150)
      })).filter(p=>p.name && p.effect && (p.kind==="energy" ? p.cost>0
        : p.kind==="favor" ? p.party && p.obligation : p.kind==="notice" && p.party)) : []
    } : null,
    find:find && typeof find==="object" ? {source:short(find.source,100),energy:bounded(find.energy,20),
      parts:bounded(find.parts,5),rations:bounded(find.rations,20),medicine:bounded(find.medicine,5)} : null,
    relationship:relationship && Object.hasOwn(RELATION_EVENTS,relationship.kind) ? {
      who:short(relationship.who,60),kind:relationship.kind,detail:short(relationship.detail,170),
      boundary:short(relationship.boundary,150),beat:Number.isSafeInteger(relationship.beat) ? relationship.beat : 0
    } : null,
    done:obj.genreDone===true
  };
}

function genreChoices(state){
  const game=state.genreGame;
  if(!game || game.system!==genreSystem(state)) return [];
  const make = (kind,text,tradeoff,subject="",target="")=>({text,tradeoff,target,genreMove:{kind,subject}});
  const here = state.environment?.place===game.place;
  if(game.system==="恋爱"){
    return game.people.filter(p=>p.trust>=2 && (state.present||[]).includes(p.name)).map(p=>
      make("invite","邀请"+p.name+"聊聊你们的共同经历","对方可以主动回应，也可以拒绝",p.name,p.name));
  }
  if(game.system==="科幻"){
    return [
      ...(!game.signaled && game.energy>=2 ? [make("signal","给"+game.name+"的通讯设备供电","消耗 2 格可用能源，发出求援或联络信号")] : []),
      ...(!game.reserve && !game.returned && game.energy>=3 ? [make("reserve","留出 3 格能源用于返程","这部分能源将留给返程")] : []),
      ...(game.route && !game.modified && game.energy>=2 && game.parts>=1 ? [make("upgrade","改装"+game.name+"以开辟「"+game.route+"」","消耗 2 格能源和 1 份零件")] : []),
      ...(game.modified && !game.crossed && game.energy>=1 ? [make("cross","试走改装后开启的「"+game.route+"」","消耗 1 格可用能源")] : []),
      ...(game.reserve>=3 && !here ? [make("return","启用返程储备，返回「"+game.place+"」","消耗 3 格返程能源")] : [])
    ];
  }
  if(game.system==="末日"){
    if(!here) return [];
    return game.members.filter(m=>!deadCharacterNames(state).has(m.name)).flatMap(m=>
      Object.entries(CAMP_JOBS).filter(([job])=>job!==m.job).map(([job,label])=>
        make(job,"和"+m.name+"商量负责"+label,"每天根据物资和现场处境决定实际行动",m.name)));
  }
  return [
    ...game.powers.filter(p=>p.kind==="energy" ? game.energy>=p.cost
      : p.kind!=="favor" || !game.contracts.some(c=>c.power===p.name && !c.paid)).map(p=>
        make("cast","使用「"+p.name+"」",fantasyCost(p),p.name)),
    ...game.contracts.filter(c=>!c.paid).map(c=>make("repay","向"+c.party+"履约："+c.obligation,"完成约定后结清这份人情",c.id))
  ];
}

function fantasyCost(power){
  if(power.kind==="energy") return "消耗 "+power.cost+" 点魔力";
  if(power.kind==="favor") return "欠"+power.party+"一份人情："+power.obligation;
  return "会让"+power.party+"注意到这次施法";
}

function requestedGenreMove(state,choice){
  if(!choice || choice.idle || choice.endingRequest) return null;
  const options=genreChoices(state);
  if(choice.genreMove) return options.find(o=>o.genreMove.kind===choice.genreMove.kind
    && o.genreMove.subject===choice.genreMove.subject)?.genreMove||null;
  const text=(choice.text||"").trim();
  if(/[？?]|能不能|可以吗|是否|如果|别|不要/.test(text)) return null;
  const exact=options.find(o=>text.replace(/[。！!]$/,"")===o.text);
  if(exact) return exact.genreMove;
  const game=state.genreGame;
  if(game?.system==="科幻"){
    const kind=/^(我)?(?:给.+供电|给通讯供电|发出信号)/.test(text) ? "signal"
      : /^(我)?(?:留.+返程|预留.+返程)/.test(text) ? "reserve"
      : /^(我)?(?:动手改装|改装)/.test(text) ? "upgrade"
      : game.route && text.includes(game.route) && /^(我)?(?:出发|进入|前往|走|试走|穿过)/.test(text) ? "cross"
      : /^(我)?(?:启用返程储备|用储备返程)/.test(text) ? "return" : "";
    return options.find(o=>o.genreMove.kind===kind)?.genreMove || (kind ? {kind,blocked:true} : null);
  }
  if(game?.system==="奇幻" && /^(我)?(?:使用|施展|发动|施放)/.test(text)){
    const power=game.powers.find(p=>text.includes(p.name));
    return power ? options.find(o=>o.genreMove.kind==="cast" && o.genreMove.subject===power.name)?.genreMove
      || {kind:"cast",subject:power.name,blocked:true} : null;
  }
  return null;
}

function genreSceneProblem(state,environment,move,completed){
  const game=state.genreGame;
  if(game?.system!=="科幻" || !game.route || environment.place!==game.route || state.environment?.place===game.route) return "";
  if(!game.modified) return "这条路线还没有改装开放。请留在当前位置，按确实能做的事续写。";
  if(!game.crossed && (move?.kind!=="cross" || move.blocked || !completed)){
    return "首次通过这条改装路线必须由玩家主动选择并完成，且需要 1 格可用能源。请保留实际所在地点。";
  }
  return "";
}

function genreSystemContext(state,move,choice,futureMinute){
  const game=state.genreGame;
  if(!game) return "";
  let visible = game;
  if(game.system==="恋爱"){
    const names=memoryPeople(state,choice?.text||"",choice?.target);
    visible = {...game,people:game.people.filter(p=>names.has(p.name))};
  }else{
    const {found,...rest} = game;
    visible = {...rest,history:game.history.slice(-6)};
  }
  const option=move && genreChoices(state).find(o=>o.genreMove.kind===move.kind && o.genreMove.subject===move.subject);
  const forecast=game.system==="末日" && Number.isFinite(futureMinute)
    ? advanceCamp(JSON.parse(JSON.stringify(game)),state,{minute:futureMinute}).text : "";
  return "【"+GENRE_SYSTEM_LABELS[game.system]+"的本局记录】"+JSON.stringify(visible)
    +(game.system==="恋爱" ? "。每个人的私话与经历只属于该人物。信任较深时，以该人物的性格决定是否主动承接经历或发起邀约。" : "")
    +(game.system==="奇幻" ? "。延续未还的人情和对应势力已经察觉的次数，让债主或势力在合适时机按自己的立场行动。" : "")
    +(forecast ? "\n已知跳时期间的营地结算："+forecast+"。按此呈现留守人员的决定。" : "")
    +(move?.blocked ? "\n玩家尝试的操作当前条件不足。只描写尝试和眼前限制，不能写成已完成。" : "")
    +(option ? "\n玩家授权的操作："+option.text+"；"+option.tradeoff
      +"。按当前条件演出，实际完成必须返回 genreDone:true。试走新路线或返程成功时，把 environment.place 写成操作中引号标出的地点名。留守和其他时间结算由程序处理。" : "");
}

function setupGenreGame(system,setup,place,witnesses){
  if(system==="恋爱") return {system,people:[]};
  if(!setup) return null;
  const base = {system,place,found:[],history:[]};
  if(system==="科幻" && setup.name && setup.energy!==null){
    return {...base,name:setup.name,energy:setup.energy,parts:setup.parts??0,route:setup.route===place ? "" : setup.route,
      reserve:0,signaled:false,modified:false,crossed:false,returned:false};
  }
  if(system==="末日" && place && setup.name && setup.rations!==null){
    const members=setup.members.filter(name=>witnesses.has(name)).map((name,index)=>({
      name,job:["forage","repair","care"][Math.min(index,2)],treated:false
    }));
    return {...base,name:setup.name,rations:setup.rations,medicine:setup.medicine??0,shelter:setup.shelter??70,members};
  }
  if(system==="奇幻" && setup.powers.length){
    const powers=[...new Map(setup.powers.map(p=>[p.name,p])).values()];
    return {...base,energy:setup.energy??0,powers,contracts:[],attention:[]};
  }
  return null;
}

function settleRelationship(game,scene,choice,witnesses,turn){
  const event=scene.genreData.relationship;
  if(!event?.detail || !witnesses.has(event.who)) return "";
  const line=scene.lines.find(l=>l.who===event.who && l.beat===event.beat && ["say","npc-action"].includes(l.t));
  if(!line || (line.to && !["玩家","你"].includes(line.to))) return "";
  if(event.kind==="private" && !["玩家","你"].includes(line.to)) return "";
  if(["respect","crossed","kept","broken","hurt"].includes(event.kind) && (!choice || choice.idle)) return "";
  let person=game.people.find(p=>p.name===event.who);
  if(!person){
    person={name:event.who,trust:0,boundaries:[],experiences:[]};
    game.people.push(person);
  }
  if(event.boundary && line.t==="say" && line.text.includes(event.boundary) && !person.boundaries.includes(event.boundary)){
    person.boundaries.push(event.boundary);
  }
  if(["respect","crossed"].includes(event.kind) && !person.boundaries.length) return "";
  if(person.experiences.some(e=>e.kind===event.kind && e.detail===event.detail)) return "";
  const delta={kept:2,broken:-2,hurt:-2,respect:1,crossed:-3,shared:1,private:0}[event.kind];
  person.trust=clamp(person.trust+delta,-10,10);
  person.experiences.push({turn,kind:event.kind,detail:event.detail});
  return event.who+" · "+RELATION_EVENTS[event.kind]+(delta ? " · 信任 "+(delta>0 ? "+" : "")+delta : "");
}

function advanceCamp(game,state,environment){
  const before=state.environment?.minute;
  const after=environment.minute;
  if(!Number.isFinite(before) || !Number.isFinite(after)) return {text:"",treatments:[]};
  const days=Math.max(0,Math.floor(after/1440)-Math.floor(before/1440));
  if(!days) return {text:"",treatments:[]};
  const dead=deadCharacterNames(state);
  const living=game.members.filter(m=>!dead.has(m.name));
  const actors=new Map((state.cast||[]).map(c=>[c.name,c]));
  const start=[game.rations,game.medicine,game.shelter];
  const acts=new Set();
  const treatments=[];
  for(let day=0;day<days;day++){
    game.shelter=Math.max(0,game.shelter-2);
    const shortage=game.rations<living.length;
    for(const member of living){
      const actor=actors.get(member.name);
      if(Number.isFinite(actor?.hp) && actor.hp<=12){ acts.add(member.name+"留营休养"); continue; }
      const job=shortage && member.job!=="forage" ? "forage" : member.job;
      if(job==="forage"){
        game.rations=Math.min(100,game.rations+2);
        acts.add(member.name+(job!==member.job ? "发现口粮告急，优先外出搜寻" : "搜回口粮"));
      }else if(job==="repair"){
        game.shelter=Math.min(100,game.shelter+3);
        acts.add(member.name+"修补营地");
      }else if(job==="care" && game.medicine>0){
        const wounded=living.find(m=>!m.treated && Number.isFinite(actors.get(m.name)?.hp) && actors.get(m.name).hp<80);
        if(wounded){
          game.medicine--;
          wounded.treated=true;
          treatments.push(wounded.name);
          acts.add(member.name+"给"+wounded.name+"用药");
        }
      }
    }
    game.rations=Math.max(0,game.rations-living.length);
  }
  const changed="口粮 "+start[0]+"→"+game.rations+"，药品 "+start[1]+"→"+game.medicine+"，营地 "+start[2]+"→"+game.shelter;
  return {text:game.name+"经过 "+days+" 天 · "+changed+(acts.size ? " · "+[...acts].join("、") : ""),treatments};
}

function settleGenreMove(game,move,scene,environment,turn){
  if(!move || move.blocked || !scene.genreData.done) return "";
  const {kind,subject}=move;
  if(game.system==="科幻"){
    if(kind==="signal"){ game.energy-=2; game.signaled=true; return "通讯设备已通电，消耗 2 格能源。"; }
    if(kind==="reserve"){ game.energy-=3; game.reserve=3; return "已留出 3 格返程能源。"; }
    if(kind==="upgrade"){ game.energy-=2; game.parts--; game.modified=true; return "改装已完成，可试走「"+game.route+"」。"; }
    if(kind==="cross" && environment.place===game.route){game.energy--; game.crossed=true; return "已抵达「"+game.route+"」。";}
    if(kind==="return" && environment.place===game.place){game.reserve-=3; game.returned=true; return "已使用返程储备，返回「"+game.place+"」。";}
    return "";
  }
  if(game.system==="末日"){
    const member=game.members.find(m=>m.name===subject);
    if(environment.place!==game.place || !member || !Object.hasOwn(CAMP_JOBS,kind)
      || !scene.lines.some(l=>l.who===subject && ["say","npc-action"].includes(l.t))) return "";
    member.job=kind;
    return subject+"接下分工 · "+CAMP_JOBS[kind];
  }
  if(game.system!=="奇幻") return "";
  if(kind==="repay"){
    const contract=game.contracts.find(c=>c.id===subject && !c.paid);
    if(contract){contract.paid=true;return "契约已履行 · "+contract.party+" · "+contract.obligation;}
    return "";
  }
  const power=game.powers.find(p=>p.name===subject);
  if(kind!=="cast" || !power) return "";
  if(power.kind==="energy") game.energy-=power.cost;
  if(power.kind==="favor") game.contracts.push({id:"favor-"+turn,power:power.name,party:power.party,obligation:power.obligation,paid:false});
  if(power.kind==="notice"){
    const notice=game.attention.find(a=>a.party===power.party);
    if(notice) notice.count++;
    else game.attention.push({party:power.party,count:1});
  }
  return "已使用「"+power.name+"」· "+fantasyCost(power);
}

function settleGenreGame(state,scene,choice,move,environment,present,turn){
  const system=genreSystem(state);
  if(!system) return {game:state.genreGame,notices:[]};
  const witnesses=new Set([...(state.present||[]),...present,...(scene.entered||[]),...(scene.left||[])]);
  for(const name of deadCharacterNames(state)) witnesses.delete(name);
  const existing=state.genreGame?.system===system;
  const game=existing ? JSON.parse(JSON.stringify(state.genreGame))
    : setupGenreGame(system,scene.genreData.setup,environment.place,witnesses);
  if(!game) return {game:state.genreGame,notices:[]};
  if(system==="恋爱"){
    const result=settleRelationship(game,scene,choice,witnesses,turn);
    return {game,notices:result ? [result] : []};
  }
  const notices=[];
  let treatments=[];
  if(system==="末日" && existing){
    const report=advanceCamp(game,state,environment);
    if(report.text) notices.push(report.text);
    treatments=report.treatments;
  }
  const result=settleGenreMove(game,move,scene,environment,turn);
  if(result) notices.push(result);
  else if(move) notices.push(move.blocked ? "当前条件不足，操作未完成。":"本幕尚未完成所选行动，相关代价未结算。");
  const find=scene.genreData.find;
  if(find?.source && !game.found.includes(find.source)
    && (scene.lines.some(l=>(!l.to || ["你","玩家"].includes(l.to)) && l.text.includes(find.source))
      || (scene.items||[]).some(i=>(i?.name||i)===find.source))){
    const keys=system==="末日" ? ["rations","medicine"] : system==="科幻" ? ["energy","parts"] : ["energy"];
    const labels={rations:"口粮",medicine:"药品",energy:"能源",parts:"零件"};
    const gains=[];
    for(const key of keys){
      const amount=Math.min(find[key]||0,100-game[key]);
      if(amount>0){game[key]+=amount;gains.push((system==="奇幻" ? "魔力" : labels[key])+" +"+amount);}
    }
    if(gains.length){game.found.push(find.source);notices.push(find.source+" · "+gains.join("，"));}
  }
  game.history=[...game.history,...notices.map(text=>({turn,text}))].slice(-24);
  return {game,notices,treatments};
}

function renderGenrePanel(state,card,row){
  const system=genreSystem(state);
  if(!system) return "";
  const game=state.genreGame?.system===system ? state.genreGame : null;
  const label=GENRE_SYSTEM_LABELS[system];
  if(!game) return card(label,row("当前","会随剧本中实际发生的事建立记录。"));
  let details="";
  if(system==="恋爱"){
    details=game.people.map(p=>row(p.name,"信任 "+p.trust)
      +p.boundaries.map(b=>row("已说明的边界",b)).join("")
      +p.experiences.slice(-5).reverse().map(e=>row(RELATION_EVENTS[e.kind],e.detail)).join("")).join("");
  }else if(system==="科幻"){
    details=row(game.name,"可用能源 "+game.energy+" · 返程储备 "+game.reserve+" · 零件 "+game.parts)
      +row("通讯",game.signaled ? "已供电" : "未供电")
      +row("路线",game.route ? game.route+(game.modified ? " · 已开放" : " · 待改装") : "");
  }else if(system==="末日"){
    details=row(game.name,"口粮 "+game.rations+" · 药品 "+game.medicine+" · 营地状况 "+game.shelter+"/100")
      +game.members.map(m=>row(m.name,CAMP_JOBS[m.job])).join("");
  }else{
    details=row("可用魔力",String(game.energy))+game.powers.map(p=>row(p.name,p.effect+" · "+fantasyCost(p))).join("")
      +game.contracts.map(c=>row(c.paid ? "已结清" : "待履行",c.party+" · "+c.obligation)).join("")
      +game.attention.map(a=>row(a.party,"已察觉 "+a.count+" 次施法")).join("");
  }
  const recent=(game.history||[]).slice(-4).reverse().map(e=>row("第 "+e.turn+" 幕",e.text)).join("");
  const actions=genreChoices(state).map((c,i)=>'<div class="genre-action"><button type="button" class="item-use" data-genre-action="'+i+'">'
    +escapeHtml(c.text)+'</button><div class="qd">'+escapeHtml(c.tradeoff)+'</div></div>').join("");
  return card(label,details+(actions ? '<div class="genre-actions">'+actions+'</div>' : "")
    +(recent ? '<details><summary>近期变化</summary>'+recent+'</details>' : ""));
}
