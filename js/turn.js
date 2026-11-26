"use strict";
function snapshotState(state){
  try{
    return typeof structuredClone === "function" ? structuredClone(state) : JSON.parse(JSON.stringify(state));
  }catch(e){
    try{ return JSON.parse(JSON.stringify(state)); }catch(e2){ return null; }
  }
}
function compactLongRunState(state){
  if(!state || state.turn < 12 || state.turn % 12 !== 0) return;
  if(state.lastCompactTurn === state.turn) return;
  const summary = String(state.summary||"").trim();
  if(summary){
    state.longTerm = [state.longTerm,summary].filter(Boolean).join("\n").slice(-4000);
  }
  state.memory = (state.memory||[]).slice(-20);
  state.lastCompactTurn = state.turn;
}
const ATTR_LABELS = {iq:"智商",physique:"体质",charm:"魅力",willpower:"意志",agility:"敏捷"};
function localTrainingGain(state, action, before){
  if(!state || !action || !before) return null;
  const txt = String(action);
  if(!/(每天|每日|连续|反复|坚持|长期|苦练|训练|练习|锻炼|研读|钻研|请教|拜师|学习|修行|磨合|实战|对练|研习|复盘)/.test(txt)) return null;
  const rules = [
    ["physique", /锻炼|健身|跑步|负重|练功|练武|扎马步|体能|体力|劳作|体力活/],
    ["iq", /读书|研读|钻研|学习|研究|推演|复盘|请教|下棋|解题|谋略|兵法/],
    ["charm", /口才|交际|应酬|打扮|仪态|说服|谈判|魅力|待人接物/],
    ["willpower", /冥想|忍耐|克制|苦修|静坐|直面恐惧|受刑|意志|坚持/],
    ["agility", /身法|轻功|反应|闪避|潜行|逃跑|敏捷|手速|步法|对练/]
  ];
  const turn = state.turn || 0;
  state.lastTrainTurn = state.lastTrainTurn || {};
  for(const [key, re] of rules){
    if(!re.test(txt)) continue;
    if((state[key]??50) !== (before[key]??50)) continue;
    if((state.lastTrainTurn[key]||-99) > turn) continue;
    state[key] = clamp((state[key]??50) + 1, 0, 100);
    state.lastTrainTurn[key] = turn + 3;
    return {key,delta:1};
  }
  return null;
}
function syncUndoButton(){
  const btn = $("btn-undo");
  if(!btn) return;
  btn.disabled = !undoStack.length;
  btn.title = undoStack.length ? ("撤销上一步剧情（可撤销 "+undoStack.length+" 步）") : "没有可撤销的剧情";
}
function undoStory(){
  if(activeTurn || !undoStack.length) return;
  const previous = undoStack.pop();
  if(!previous) return;
  clearIdleTimer();
  const changedTurn = previous.turn!==S.turn;
  const sharedTurn = changedTurn && (S.timelines||[]).some(t=>t.parentId===S.timelineId && t.branchTurn>=S.turn);
  if(sharedTurn){
    if(!saveTimelineSnapshot(S)){
      undoStack.push(previous);
      imageToast("无法保存现有时间线，撤销未执行。",2500);
      return;
    }
    previous.timelines = S.timelines.map(t=>({...t}));
    createTimelineBranch(previous,"撤销后续玩",false);
    undoStack = [];
  }else if(changedTurn && typeof dbDeleteTurn==="function" && typeof tavernWorldId==="function"){
    dbDeleteTurn(tavernWorldId(S),S.turn,S.timelineId).catch(()=>{});
  }
  previous.dailyPace = dailyPaceMode(S);
  S = previous;
  renderLog();
  showCurrentScene();
  saveProgress();
  syncUndoButton();
  imageToast(sharedTurn ? "已撤销一步，并保留原时间线与分支。" : "已撤销一步剧情。",2500);
}

function rememberUndoState(previous){
  if(!previous) return;
  undoStack.push(previous);
  if(undoStack.length>UNDO_LIMIT) undoStack.shift();
}

function commitLocalGenreChoice(choice,result){
  rememberUndoState(snapshotState(S));
  const entries=[{t:"action",text:"你选择了："+choice.text},{t:"sys",text:result.text}];
  S={...S,genreGame:result.game,log:[...S.log,...entries].slice(-120)};
  entries.forEach(logToDOM);
  limitLog();
  showCurrentScene();
  syncUndoButton();
  return saveProgress();
}

function trimStoryMessages(messages,recent,budget){
  const removable = recent.slice(0,-2);
  const removed = new Set();
  let count=messages.length;
  let length=messages.reduce((sum,msg)=>sum+String(msg.content||"").length,0);
  while(removable.length && (count>26 || length>budget)){
    for(const old of removable.splice(0,2)){
      if(!messages.includes(old) || removed.has(old)) continue;
      removed.add(old);
      count--;
      length-=String(old.content||"").length;
    }
  }
  return messages.filter(msg=>!removed.has(msg));
}

/* ==================== 上下文预算（按 token 估算） ==================== */
/* 优先级从高到低：规则 > 玩家完整指令 > 最近对话 > NPC 卡片 > 旧事件。
   超预算时先压旧事件，再压 NPC 卡片，最后才缩短较早的对话；规则与玩家指令永不删除。 */
const CONTEXT_TOKEN_FULL = 18000;
const CONTEXT_TOKEN_COMPACT = 12000;

function messageContentText(message){
  const content = message && message.content;
  return typeof content==="string" ? content : JSON.stringify(content||"");
}

function promptTokenEstimate(messages){
  return (messages||[]).reduce((sum,message)=>sum+estimateTokens(messageContentText(message)),0);
}

function contextTokenBudget(state){
  // 动态预算：细致模式给更多余量；幕数越多，窗口越短，避免长局上下文无限膨胀
  const base = (typeof storyDetailFull==="function" && storyDetailFull()) ? CONTEXT_TOKEN_FULL : CONTEXT_TOKEN_COMPACT;
  const turn = Math.max(0,Number(state?.turn)||0);
  const factor = turn>=60 ? 0.72 : turn>=30 ? 0.82 : turn>=15 ? 0.9 : 1;
  return Math.max(4000,Math.round(base*factor));
}

function trimMessagesByTokenBudget(messages,budget){
  if(!Array.isArray(messages) || !messages.length) return messages||[];
  const drop = new Set();
  const remaining = ()=>messages.filter(message=>!drop.has(message));
  let total = promptTokenEstimate(messages);
  if(total<=budget) return messages;
  const dropLabeled = labels=>{
    for(const message of messages){
      if(total<=budget) return;
      if(drop.has(message) || !labels.includes(message.__metricLabel)) continue;
      drop.add(message);
      total -= estimateTokens(messageContentText(message));
    }
  };
  // 1) 旧事件：检索到的旧记忆、旧承诺与未了事项
  dropLabeled(["memory"]);
  dropLabeled(["loops","playerPromises"]);
  // 2) NPC 卡片与人物计划
  dropLabeled(["npcPlans"]);
  // 3) 最近对话：至少保留最后两条（本幕输入 + 上一条回复）
  const history = messages.filter(message=>!drop.has(message)
    && (message.__metricLabel==="history-assistant" || message.__metricLabel==="history-user"));
  const keepFrom = Math.max(0,history.length-2);
  for(let i=0;i<keepFrom;i++){
    if(total<=budget) break;
    drop.add(history[i]);
    total -= estimateTokens(messageContentText(history[i]));
  }
  // 4) 仍超：只截断上下文消息的尾部（开头的核心设定优先保留）
  if(total>budget){
    for(const message of messages){
      if(total<=budget) break;
      if(drop.has(message) || message.__metricLabel!=="context") continue;
      let text = String(message.content||"");
      while(total>budget && text.length>400){
        text = text.slice(0,Math.max(400,Math.floor(text.length*0.85)));
        message.content = text+"\n（上下文过长，已省略部分细节）";
        total = promptTokenEstimate(remaining());
      }
    }
  }
  return remaining();
}

const PENDING_TURN_KEY = "tavern_pending_turn_v1";
function pendingTurnKey(scope){
  return PENDING_TURN_KEY+":"+encodeURIComponent(scope.worldId||"local")+":"+encodeURIComponent(scope.timelineId||"main");
}
function readPendingTurn(scope=S){
  try{
    const current = JSON.parse(localStorage.getItem(pendingTurnKey(scope))||"null");
    if(current) return current;
    const legacy = JSON.parse(localStorage.getItem(PENDING_TURN_KEY)||"null");
    return legacy && pendingTurnKey(legacy)===pendingTurnKey(scope) ? legacy : null;
  }
  catch(error){ return null; }
}
function samePendingTurn(a,b){
  return a && b && a.id===b.id && a.worldId===b.worldId
    && a.startTurn===b.startTurn && a.createdAt===b.createdAt;
}
function writePendingTurn(pending){
  try{ localStorage.setItem(pendingTurnKey(pending),JSON.stringify(pending)); }catch(error){}
}
function clearPendingTurn(expected=readPendingTurn()){
  if(!expected || !samePendingTurn(readPendingTurn(expected),expected)) return;
  try{
    localStorage.removeItem(pendingTurnKey(expected));
    const legacy = JSON.parse(localStorage.getItem(PENDING_TURN_KEY)||"null");
    if(legacy && pendingTurnKey(legacy)===pendingTurnKey(expected)) localStorage.removeItem(PENDING_TURN_KEY);
  }catch(error){}
}
function turnErrorRetryable(error){
  if(!error || error.name==="AbortError") return false;
  const message = String(error.message||"");
  return error.name==="TimeoutError" || error.name==="TypeError"
    || /无法连接|网络|中断|超时|timeout|fetch|ECONN|network|offline|Failed to fetch|Load failed|Connection|socket/i.test(message);
}
function retryPendingTurn(expected){
  if(activeTurn || !S?.ai || document.hidden || !$("overlay").classList.contains("hidden")) return;
  const pending = readPendingTurn();
  if(!pending || (expected && !samePendingTurn(pending,expected))) return;
  if(pending.worldId!==(S.worldId||"local") || (pending.timelineId||"main")!==(S.timelineId||"main")) return;
  if(S.ending || (S.turn||0)!==pending.startTurn || Date.now()-pending.createdAt>10*60*1000){
    clearPendingTurn(pending);
    return;
  }
  if(!pending.retryable || (pending.retries||0)>=1) return;
  if(typeof imageToast==="function") imageToast("连接中断，正在自动继续生成……",3000);
  return aiTurn(pending.choice || undefined,pending);
}
function hasDailyPace(state){
  return state.ai && state.genre==="日常";
}

function dailyPaceMode(state){
  return ["slow","fast"].includes(state.dailyPace) ? state.dailyPace : "natural";
}

function importantPaceChoice(choice,state){
  if(choice?.offerId || choice?.promiseId || choice?.promiseOpportunityId || choice?.npcPlanId) return true;
  return /表白|坦白|道歉|和好|分手|离婚|求婚|结婚|怀孕|分娩|生孩子|去世|病危|就医|争吵|辞职|签约|签(?:合同|字)|付(?:钱|款)|告别|放弃|询问.*决定|亲吻|拥抱|亲密|线索|证据|秘密|真相|核对|求证|对质|交接|交锋|战斗|出招|反击|搏斗|攻击|追击|逃命|救人/.test(choice?.text||"");
}

function sceneOverstayTurns(state){
  const hist = (state?.sceneHistory||[]).slice(-6);
  if(hist.length < 4) return 0;
  const last = hist[hist.length-1];
  let count = 1;
  for(let i=hist.length-2;i>=0;i--){
    const prev = hist[i];
    if(!prev) break;
    const samePlace = !prev.place || !last.place || prev.place===last.place;
    const sameScene = prev.scene && last.scene && textSimilarity(prev.scene,last.scene)>=0.5;
    const sameAdvance = prev.advance && last.advance && textSimilarity(prev.advance,last.advance)>=0.5;
    const sameGoal = prev.goal && last.goal && textSimilarity(prev.goal,last.goal)>=0.7;
    const probeLoop = (prev.motifs||[]).some(m=>["deal","probe","warning"].includes(m))
      && (last.motifs||[]).some(m=>["deal","probe","warning"].includes(m));
    if(samePlace && (sameScene || sameAdvance || sameGoal || probeLoop)) count++;
    else break;
  }
  return count;
}

function genrePaceDirective(state,choice,keyScene,explicitWait){
  if(explicitWait){
    return "【剧情节奏：指定跳时】按玩家指定的时刻结束，概括期间能观察到的变化，保留尚未作出的决定。";
  }
  if(!choice){
    return "【剧情节奏：开场】用具体场景交代身份、地点和眼前的目标，停在玩家可以第一次行动的地方。";
  }
  if(choice.idle){
    return "【剧情节奏：等候】写出短暂沉默期间 NPC 能自行作出的反应，把下一步决定交回玩家。";
  }
  if(state?.cutScene){
    return "【剧情节奏：跳过当前场景】玩家要求结束当前会议或场景、直接快进到下一个会议/事件。用一两段概括当前场景的结果并推进时间，直接切到新场景，不要再展开当前的细节、漏洞或后果。";
  }
  if(keyScene || importantPaceChoice(choice,state) || dailyPaceMode(state)==="slow"){
    return "【剧情节奏：细致】写清当下的一步和人物、环境的具体反应。让玩家有机会接话、核实线索或调整行动。耗时活动先写眼前的一段，停在玩家还能回应的位置。";
  }
  const handoff = "先回应玩家说的话或做的事。写出实际结果和人物反应，停在下一次有取舍的行动前；发现关键线索、遇到交锋、亲密互动或重要抉择时，从当下细写并让玩家决定。时间按实际耗时，2～3 条选项应有不同机会或代价。";
  if(dailyPaceMode(state)==="fast"){
    return "【剧情节奏：快进】把原本会拆成四到五轮的准备、途中或重复操作合在一幕，推进到下一处实质变化。"+FAST_BREVITY+handoff;
  }
  return "【剧情节奏：自动】普通行动写到有结果，合并寒暄、赶路和重复准备。对话留出自然的接话机会。"+handoff;
}

const DAILY_CHOICE_GUIDANCE = "玩家已经选定的做法应带来相应结果：写出它怎样影响接下来能见谁、能做什么、关系如何变化或这件事的代价。consequence.fact 只记录玩家已看到或听到的实际后果，实质推进写进 advance。下一次只给 2～3 条会把故事带向不同结果的行动，每项用 tradeoff 说明当下可见的机会、代价或风险。沿用已发生的事实，不替玩家决定下一步。";
const DAILY_DECISION_GUIDANCE = '本幕遇到需要玩家回应的关键线索、关系转折或重要抉择时，停在玩家刚看到或听到那一刻。用 "decisionPoint":{"kind":"clue","beat":2} 标出停点。kind 可选 clue（线索）、relationship（关系）或 choice（抉择）。beat 用最后一条 beats 的序号（从 1 开始），若只有旁白则填 0。写出看得见的线索或具体对话，留出至少两条有不同取舍的行动；不代玩家回应、不揭晓未查出的答案、不结算下一步。没有这样的转折时填 null。';
const FAST_BREVITY = "快进输出要精简：narration 不超过 300 字，beats 不超过 4 条、每条不超过 120 字；只保留关键动作、结果和 2~3 个选项，优先保证 JSON 完整闭合，不要写长段环境描写或复述历史。";

function dailyPaceFor(state,choice,keyScene){
  if(state?.cutScene){
    return {maxMinutes:1440,condensed:true,expectProgress:true,expectOutcome:false,
      prompt:"【日常剧情节奏：跳过当前场景】玩家要求结束当前场景、直接到下一个会议或事件。概括当前场景的结果，用 elapsedMinutes 推进到下一场开始（合理的几十分钟到一天），直接写新场景的地点、人物与眼前目标；不要再演当前来回，也不要给留在原地的选项。"+DAILY_CHOICE_GUIDANCE};
  }
  if(!choice || !Number.isFinite(state.environment?.minute)){
    return {prompt:"【日常开场】合并无关的铺垫，直接进入一个可立即参与的生活场景。交代时间、地点、人物在做什么，以及眼前值得采取不同做法的事。"
      +DAILY_CHOICE_GUIDANCE+DAILY_DECISION_GUIDANCE};
  }
  const mode = dailyPaceMode(state);
  const waitChoice = isWaitChoice(choice)
    && !state.intimateActive && !(state.afterglow>0);
  if(waitChoice){
    const maxMinutes = mode==="slow" ? 30 : 60;
    return {maxMinutes,condensed:false,expectProgress:true,
      expectOutcome:false,
      prompt:"【等待的后果】玩家选择了等待或暂不动手。这不是放弃，也不是原地空等：本幕必须让时间真正走一段（至少 15 分钟），并写出这段时间里别人做了什么——在场的 NPC 去办事、先一步行动、改变条件或托人带话，不在场的人也可以让机会被别人拿走。用 environment.elapsedMinutes 填实际耗时（15 到 "+maxMinutes+" 分钟），至少一条 beats 写 NPC 主动做的事或传来的消息，并写清等待带来的可见变化（消息、期限、人物态度或局势），plot.next 换成变化后的下一步。不要再给「继续等」「再观察」这类原地选项。"
      +DAILY_CHOICE_GUIDANCE+DAILY_DECISION_GUIDANCE};
  }
  const text = String(choice.text||"").trim();
  const actionOnly = /^[（(][^）)]+[）)]$/.test(text);
  const actionText = actionOnly ? text.slice(1,-1).trim() : text;
  const routineAction = /^(?:我(?:先|就|去)?\s*)?(?:继续)?(?:照常|照旧|做完|完成|忙完|收拾|整理|打扫|洗衣|洗碗|散步|走回|回家|赶路|吃完|休息|去休息|等候|再等|等一会)/.test(actionText);
  // 纯对话/表态类选项：玩家只是把话说明白，不强迫模型再补一段 consequence.fact，
  // 否则每两三幕就会为「这句话带来了什么结果」重写一次。
  const speechChoice = /^(?:我|先|就|直接|干脆|照实|如实|坦白|低声|轻声|当面)?\s*(?:说|问|答|告诉|解释|反问|劝|请求|拒绝|答应|表明|坦白|承认|否认|提醒|安慰|道歉|喊|叫|开口|回(?:答|应)?)/.test(actionText)
    || /[“”"]/.test(text);
  const talking = !choice.idle && (speechChoice
    || (choice.speech && !actionOnly && (choice.target || !routineAction || /[？?]/.test(text)))
    || /^(?:开口|向.{1,12}(?:询问|问|打听)|与.{1,12}(?:交谈|聊天)|聊聊|询问|问问|打听|打招呼)/.test(actionText));
  const pending = state.dailyDecision;
  const important = keyScene || pending || importantPaceChoice(choice,state);
  const condensed = mode!=="slow" && !important;
  const transition = condensed && routineAction && !talking && !choice.idle;
  let maxMinutes = talking ? (mode==="slow" ? 8 : 15)
    : transition ? (mode==="fast" ? 180 : 90)
    : condensed ? 60 : 30;
  let deadline;
  if(condensed && !talking && !choice.idle){
    const now = state.environment.minute;
    deadline = (state.openLoops||[])
      .filter(loop=>loop.playerPromise && Number.isFinite(loop.dueMinute) && loop.dueMinute>now)
      .reduce((next,loop)=>Math.min(next,loop.dueMinute),Infinity);
    if(deadline-now<=maxMinutes) maxMinutes = deadline-now-1;
  }
  const guidance = important
    ? "保留细致节奏，逐步写重要对话、亲密互动、关键线索的发现与核实或重要决定的当场反应。停在玩家仍能回应的位置，留下尚未揭晓的细节。"
    : talking
      ? "让 NPC 具体回答玩家所说的话，写出与其性格、关系相符的反应。"+(condensed
        ? "合并寒暄、重复追问与铺垫，在这次交谈内交代对方实际做了什么、谈成或谈不拢什么，把有分量的回应留给玩家。"
        : "停在玩家还能接话的位置。")
      : transition
        ? "把玩家已选择的重复活动或转场推进到有结果的地方，再交代这个结果怎样改变眼前处境。"
        : condensed
          ? "落实玩家刚选的行动，写出结果和相关人物随之作出的反应，走到下一处有实际取舍的情境。"
          : "留在眼前的场景，写动作、环境或人物的一个具体变化。遇到耗时活动时，只演出当前的一小段。";
  const density = condensed
    ? "把原本会拆成四到五轮的琐碎过程合在这一幕。用简短过渡连接已选行动、结果和后续变化。遇到亲密、关键线索或新决定时，停下来细写并交还选择权。"
    : "";
  return {maxMinutes,condensed,expectProgress:condensed && !talking && !choice.idle,
    expectOutcome:!choice.speech && !choice.idle && !speechChoice && Boolean(pending || choice.tradeoff),
    prompt:"【日常剧情节奏】"+guidance+density
    +" 按实际经过填写整数 environment.elapsedMinutes（0 到 "+maxMinutes+" 分钟），旁白与时间一致。"
    +(Number.isFinite(deadline) && deadline-state.environment.minute-1===maxMinutes
      ? " 有一项玩家约定将在 "+formatStoryTime(deadline,state)+" 到期，给玩家留出处理的机会。" : "")
    +" 保持日常质感，变化从已有的关系、习惯或处境长出来。"+DAILY_CHOICE_GUIDANCE+DAILY_DECISION_GUIDANCE
    +(pending ? " 先承接上幕留给玩家的停点："+pending.text+"。若玩家只在了解情况，回答后把尚未决定的事留给玩家。" : "")};
}

function repairDailyDecision(scene,playerName){
  const point = scene?.dailyDecision;
  if(!point || !Array.isArray(scene.lines) || !scene.lines.length) return;
  const playerNames = new Set([playerName,"你","玩家","我"].filter(Boolean));
  const original = scene.lines;
  const target = point.beat > 0 ? original.find(line=>line.beat===point.beat) : null;
  // 模型偶尔会替玩家写一句；先剔掉，再让停点落在正确的最后一条可见动作/台词上
  let lines = original.filter(line=>!(line.who && playerNames.has(line.who)));
  if(target && lines.includes(target)){
    lines = lines.slice(0, lines.indexOf(target)+1);
  }else if(point.beat > 0){
    lines = lines.filter(line=>Number(line.beat)<=point.beat);
  }
  if(!lines.length) return;
  lines.forEach((line,index)=>{ line.beat = index+1; });
  point.beat = point.beat === 0 && lines.length === 1 && lines[0].t === "narr" ? 0 : lines.length;
  scene.lines = lines;
}

function checkDailyDecision(scene,pace,playerName){
  if(scene.ending) return null;
  if(!scene.dailyDecision){
    if(scene.hasDailyDecision || (pace.condensed && (scene.evidenceAdd.length
      || /亲吻|亲近|进行中|余韵|事后/.test(scene.intimacyStage||"")))){
      return "请写到玩家刚遇见这一转折，让 decisionPoint 指向停下来的最后一句，并留下两个有不同取舍的选择。";
    }
    return null;
  }
  const last = scene.lines.at(-1);
  const point = scene.dailyDecision;
  const wellPlaced = point.beat===0 ? scene.lines.length===1 && last?.t==="narr" : last?.beat===point.beat;
  const playerActs = scene.lines.some(line=>line.who && [playerName,"你","玩家","我"].includes(line.who));
  if(!wellPlaced || playerActs){
    return "转折后要停下来等玩家。请把 decisionPoint 指向本幕最后一个可见动作或台词，删掉代玩家说的话和没选过的行动。";
  }
  const choices = scene.choices.filter(c=>!isGenericChoice(c.text) && c.tradeoff);
  const distinct = choices.some((a,i)=>choices.slice(i+1).some(b=>
    textSimilarity(a.text,b.text)<0.82 && textSimilarity(a.tradeoff,b.tradeoff)<0.82));
  return distinct ? null : "重要转折至少要有两条行动与取舍都不同的具体选项，直接承接停点。";
}

function playerIdentityIssue(scene,playerName){
  const name = String(playerName||"").trim();
  if(!name || !scene) return "";
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const bad = new RegExp("你\\s*(?:和|跟|与|同)\\s*"+escaped+"|"+escaped+"\\s*(?:和|跟|与|同)\\s*你|"+escaped+"\\s*(?:和|跟|与|同)\\s*他|他\\s*(?:和|跟|与|同)\\s*"+escaped);
  const texts = [...(scene.choices||[]).map(c=>String(c && c.text || "")), ...(scene.lines||[]).map(l=>String(l && l.text || "")), String(scene.narration||"")];
  if(texts.some(text=>bad.test(text))) return "玩家本人就是「"+name+"」，不要把玩家和「"+name+"」写成两个人。choices、旁白和台词里不要出现「你和"+name+"」这类说法。请重写这一幕。";
  return "";
}
async function aiTurn(choice,retry=null){
  if(activeTurn) return;
  if(typeof ttsStop==="function") ttsStop();
  const localChoice=settleLocalGenreChoice(S,choice);
  if(localChoice) return commitLocalGenreChoice(choice,localChoice);
  if(!S.turn && !choice && !S.career && !S.world && !S.playerIdentity){
    if(S.genre){ showIdentityCards(S.genre); return; }
    showCareerPicker(); return;
  }
  const origin = S;
  const state = snapshotState(origin);
  if(!state){ aiMessage("当前旅途无法读取，请重新打开。"); return; }
  const beforeTurn = origin.turn > 0 ? snapshotState(origin) : null;
  if(!state.turn && !choice && !state.career && state.playerIdentity) applyCareer("commoner",state);
  if(!state.turn && !choice && !state.world && !state.storyTemplate && state.genre){
    state.storyTemplate = pickStoryTemplate();
  }
  if(!state.turn && state.ai) ensureCurrency(state);
  if(state.ai) ensureDrives(state);
  clearIdleTimer();
  const controller = new AbortController();
  const turn = {controller,automaticOpening:!state.turn && !choice};
  const pendingTurnMeta = retry ? {...retry,retries:(retry.retries||0)+1} : {
    id:globalThis.crypto?.randomUUID?.() || String(Date.now())+Math.random(),
    worldId:state.worldId||"local", timelineId:state.timelineId||"main",
    startTurn:state.turn||0, choice:choice??null, createdAt:Date.now(), retryable:true, retries:0
  };
  turn.pending = pendingTurnMeta;
  activeTurn = turn;
  writePendingTurn(pendingTurnMeta);
  const playerName = String(state.playerIdentity?.name || state.worldRole?.name || "").trim();
  const nextTurn = state.turn+1;
  const turnStartedAt = performance.now();
  let attempts = 0, identityRetries = 0, jsonErrors = 0;
  let contextTokens = 0;
  // 重试诊断：记录每次重写的原因，供调试面板与真机排错使用
  const retryReasons = [];
  const markRetry = (kind,detail)=>{
    retryReasons.push({attempt:attempts,kind,detail:String(detail||"").slice(0,160)});
    if(typeof window!=="undefined"){
      const prev = Array.isArray(window.__turnRetryLog)
        ? window.__turnRetryLog.filter(item=>item.turn!==nextTurn) : [];
      window.__turnRetryLog = [...prev,...retryReasons.map(item=>({turn:nextTurn,...item}))].slice(-60);
    }
  };
  const retryText = (text,total)=>text+"（"+(attempts+1)+"/"+total+"）";
  // 玩家明确想独处时，给几幕清静：NPC 不来敲门、不「恰好路过」、不托人带话
  const playerAction = (choice&&choice.text)||"";
  // 玩家明确要求跳过眼前场景/会议：本幕必须收束并切到下一场，不能继续原地打转
  const cutSceneRequest = typeof readSceneCut==="function" ? readSceneCut(playerAction) : "";
  if(cutSceneRequest) state.cutScene = true;
  const inquiry = investigationMove(state,choice);
  if(choice && /(?:结束(?:这段|这个|当前)?(?:故事|旅途|一切)|到此为止|完结吧|收尾吧|写出?结局|给我.{0,6}结局|故事到此)/.test(playerAction)){
    choice = {...choice, endingRequest:true};
  }
  const genreMove = requestedGenreMove(state,choice);
  if(/(独自|一个人|单独|别跟着|不要跟着|不希望有人|不想有人|谁也别|让我静静|想一个人|不想被打扰|别来打扰)/.test(playerAction)){
    state.soloUntil = Math.max(state.soloUntil||0, nextTurn+2);
    if(/(不希望有人|不想有人|谁也别|别来打扰|别跟着|不要跟着|让我静静|想一个人待着|想一个人静静|一个人待着|独处)/.test(playerAction)){
      state.soloClear = nextTurn;
    }
  }
  // 玩家主动去找人/见人时，独处状态立即结束
  {
    const seeksContact = /(去找|去见|见一见|拜访|叫住|喊住|打听|问问|问一问|搭话|招呼|请人|托人|带话|联系|找(掌柜|伙计|店家|人|他|她|对方))/;
    const mentionsCast = (state.cast||[]).some(c=>c && c.name && playerAction.includes(c.name));
    if(mentionsCast || seeksContact.test(playerAction)){
      state.soloUntil = 0;
      state.soloClear = 0;
    }
  }
  const soloActive = (state.soloUntil||0) >= nextTurn;
  // 同一场景/会议连续多幕：即使每幕都硬塞一点「推进」，也要收束它，避免十几轮开会原地打转
  const sceneOverstay = (state.cutScene || isRomanceMode(state) || (state.afterglow||0)>0 || state.intimateActive)
    ? 0 : sceneOverstayTurns(state);
  // 拖太久时清掉“下一步”这个锚点，避免模型继续沿旧 next 复述同一件事
  if(sceneOverstay >= 4 && state.plot) state.plot = {...state.plot,next:""};
  const timeAction = /^[（(][^）)]+[）)]$/.test(playerAction.trim())
    ? playerAction.trim().slice(1,-1) : playerAction;
  const timeSkip = readTimeSkip(timeAction, state);
  const skipLabel = timeSkip && timeSkipText(timeSkip);
  if(timeSkip && !confirm("检测到时间跳跃：" + skipLabel + "。\n是否推进时间？")){
    if(activeTurn===turn) activeTurn = null;
    clearPendingTurn(pendingTurnMeta);
    if(S===origin){
      // 记下「这次不要跳」，下一次生成会明确要求停在本幕
      S.holdTimeTurn = nextTurn;
      const note = "已取消时间跳跃，本幕没有推进；输入已保留，可以修改行动后再发送。";
      addLog({t:"sys",text:note});
      logToDOM({t:"sys",text:note});
    }
    showCurrentScene(playerAction);
    return;
  }
  state.worldWindow = advanceWorldWindow(state, nextTurn);
  // 交锋先算好并交给模型，AI 返回后再把体力损失写进 scene.exertion 交给本幕体力结算
  const localCombat = localCombatResolution(state, playerAction, nextTurn);
  if(localCombat) state.combat = {...state.combat, energy:localCombat.energyAfter};
  const keyScene = !!localCombat || !state.turn || !!choice?.endingRequest || state.intimateActive
    || (state.afterglow||0)>0 || (state.hiddenQuest && state.hiddenQuest.final)
    || (state.hp||100)<=20 || ((state.desires&&state.desires.sex)||0)>=70;
  const fastPace = Boolean(state.cutScene) || sceneOverstay >= 4
    || dailyPaceMode(state)==="fast" || Boolean(timeSkip);
  const outputBudget = choice?.endingRequest ? 5000 : fastPace ? 5200 : keyScene ? 4400 : 4000;
    const dueNow = Number.isFinite(state.environment?.minute) ? state.environment.minute : 8*60;
    const due = state.consequences.filter(c=>c.status==="pending"
      && (Number.isFinite(c.dueMinute) ? c.dueMinute<=dueNow : c.due<=nextTurn));
  const opener = state.worldSource==="paste" ? "从我粘贴的文本开始这次旅途。"
    : state.world ? (state.worldRole
        ? "请"+(state.builtinId && state.worldStart ? "从所选起点「"+state.worldStart+"」" : "从前文结尾处")+"开场，让我以原著角色「"+state.worldRole.name+"」的身份进入故事"+(state.worldRole.hook ? "（切入点："+state.worldRole.hook+"）" : "")+"。人物须忠于原著，剧情随我之后的行动自然发展。"
        : state.worldStart
        ? "请从原著「"+state.worldStart+"」这一节点为我开场，安排一位在当前片段中合理可扮演的原著角色，用简短剧情交代我的身份和眼前处境，并给出可立即行动的选项。此前情节视为已发生，之后随我的行动发展。"
        : "请依据原著为我安排合理的开场，让我以原著中一个真实存在的角色身份进入，不要写成穿越或凭空捏造的无名主角。")
    : state.genre ? "请为我创作一个「"+state.genre+"」故事的开场"+(state.storyTemplate ? "（叙事骨架："+state.storyTemplate.id+"——"+state.storyTemplate.premise+"；围绕它展开，但不要生硬套模板）" : "")+"。"
    : "雨夜，我推开了暗夜酒馆的门。";
  const speech = choice?.speech && !choice?.idle ? {t:"speech",who:"你",text:choice.text} : null;
  const idle = Boolean(choice?.idle);
  const target = choice?.target || "";
  const speechContent = speech
    ? (target && (state.present||[]).includes(target)
        ? "玩家正对着「"+target+"」说话：\n"+speech.text+"\n请以「"+target+"」为主要回应者，写出其动作与台词；在场其他人也可以旁听、插话或做出反应。"
        : "玩家说：\n"+speech.text)
    : null;
  const action = {role:"user",content:idle
    ? "玩家迟迟没有回应，站在原地沉默了很久。请让世界自行推进：NPC 会因等待而失去耐心、改变态度或先行离开；眼前的机会可能溜走、局势自行恶化；该发生的事照常发生。请写出这段沉默带来的后果。"
    : speechContent ? speechContent+(keepsOriginal(choice)
      ? "\n玩家要求原件全程留在自己手中。本幕只能提出举着核对、抄录或证人等方案；不要描写玩家递交原件或 NPC 接过原件。"
      : "") : choice ? ("玩家选择："+choice.text
      +(choice.skill ? "（依赖 技能·"+choice.skill+"）" : choice.attr ? "（依赖 属性·"+choice.attr+"）" : "")
      +(choice.tradeoff ? "\n选项事先告知的机会或代价："+choice.tradeoff+"。请延续已经成立的条件，实际结果按玩家行动裁定。" : "")) : opener};
  // 拒绝冷却：玩家明确拒绝或明显敷衍后，接下来几幕禁止 AI 再提、旁敲侧击、换人重提或用主线硬拽
  // 冷却同时拦住 questAdd（见 weakenTasks）与离场 NPC「恰好上门」，并把玩家原话交给 AI
  if(choice && !choice.idle){
    const said = String(choice.text||"");
    const refuseRe = /拒绝|不想帮|不想做|不想接|不想管|不想谈|不想卷|不想掺和|不帮|不做|不接|不干(?!净)|不去|没兴趣|不感兴趣|没空|顾不上|不关我事|与我无关|跟我无关|别再提|别再来|别烦|另找|找别人|免谈|懒得|不会帮|帮不了|无能为力|爱莫能助|不必了|用不着|不劳|免了|算了|再说吧|以后再说|回头再说|改天|现在不行|不是时候|先不管|先放放|先忙别的|换个话题|说点别的|别拉我|恕难从命/;
    const engageRe = /帮你|帮你办|我去办|交给我|我接了|我答应|这就去|我去看看|我去问问|愿意帮|算我一个|一起去|我来处理/;
    if(refuseRe.test(said)){
      state.noNagUntil = Math.max(state.noNagUntil||0, (state.turn||0) + 6);
      state.rejectedRequest = said.slice(0,120);
      const note = "玩家已明确拒绝过某个请求，不要再提起或换个说法重提。";
      if(!(state.memory||[]).includes(note)) state.memory = [...(state.memory||[]), note].slice(-40);
    } else if(engageRe.test(said)){
      state.noNagUntil = 0;
      state.rejectedRequest = "";
    }
  }
  // 玩家声明某事已了结：按事实处理，并像任务完成一样默认全员知情
  const resolvedClaim = typeof playerResolutionClaim==="function" ? playerResolutionClaim(state,choice) : "";
  const claimKnownBy = resolvedClaim ? ["所有人"] : [];
  if(resolvedClaim){
    state.lastResolutionClaim = {text:resolvedClaim,turn:(state.turn||0)+1};
    state.playerClaims = [...(state.playerClaims||[]),{
      text:resolvedClaim,turn:(state.turn||0)+1,knownBy:["所有人"]
    }].slice(-8);
  }
  // NPC 主动性：根据在场角色的欲望/好感，强制本幕由 TA 先出手（而不是等玩家开口）
  let driveNudge = null;
  {
    const cand = (Array.isArray(state.present)?state.present:[]).map(name=>{
      const c = (state.cast||[]).find(x=>x.name===name);
      if(!c || c.adult===false || c.dead) return null;
      return { name, desire:c.desire||0, aff:(state.aff?.[name]??0), intim:(state.intimacy?.[name]??0) };
    }).filter(Boolean);
    const hots = cand.filter(c=>c.desire>=40 || (c.aff>=45 && c.intim>=25))
      .sort((a,b)=>(b.desire+b.aff*0.5)-(a.desire+a.aff*0.5));
    const sinceInit = state.turn - (state.lastInitTurn || -99);
    const sinceAny = state.turn - (state.lastAnyInitTurn || -99);
    // 同一个人不要每幕都主动：冷却 3~4 幕；高欲望也至少隔 2 幕，且优先换别人
    const hot = hots.find(c=> c.name!==state.initiator || sinceInit >= (c.desire>=70 ? 2 : 4));
    if(!soloActive && !state.intimateActive && !(state.afterglow>0) && sinceAny >= 2 && hot && (isRomanceMode(state) || hot.desire >= 70)){
      const level = hot.desire>=70 ? "已经很难自持" : hot.desire>=55 ? "欲望很强" : "明显心动";
      driveNudge = {role:"system",content:hot.name+" 现在"+level+"（欲望 "+hot.desire+"，好感 "+hot.aff+"，亲密 "+hot.intim+"）。本幕必须由 TA 主动推进：在旁白 / beats 里先做出具体的主动动作——靠近、找借口独处、触碰、直白邀请或试探，并可能打断或改变场面；不要只是被动回应玩家。并且要由 TA 明确提出一个具体的要求或索求（例如留下、跟我走、回答我、把手给我、别急着走、替我做什么），让玩家必须正面回应；choices 至少有两项是围绕这个要求的不同回应（接受 / 拒绝 / 讨价还价）。不要犹豫、回避或答非所问，给出明确态度。此刻 TA 满脑子都是你，把手头的任务、委托、账目先抛到一边——本幕不要提这些，也不要借题发挥，只写你们两人。对方既然已经表态，就顺势推进，不要每一步都再问「可以吗」；只有玩家拒绝或犹豫时才停。也不要在这时追问「我们算什么关系」「你到底喜不喜欢我」或逼玩家给名分、给承诺——那太理性，会打断欲望的势头；名分与承诺留到事后或以后再说，此刻只凭冲动与感受。"};
      state.lastInitTurn = nextTurn;
      state.lastAnyInitTurn = nextTurn;
      state.initiator = hot.name;
    }
  }
  // 换人主动：不要总是同一个在场的人围着你转，不在场的人也会来找你
  let visitorNudge = null;
  {
    // 有人在场时每 4 幕提醒换人主动；玩家独处时只在第 8 幕偶发一次，且不一定出现，避免打断独自探案
    const presentCount = (state.present||[]).length;
    const visitDue = !soloActive && !state.intimateActive && !(state.afterglow>0)
      && !(state.noNagUntil && state.noNagUntil >= state.turn)
      && (presentCount>0 ? ((state.turn + 1) % 4 === 0) : ((state.turn + 1) % 8 === 0 && Math.random()<0.5));
    if(!driveNudge && visitDue){
      const initiatorCool = (state.turn - (state.lastInitTurn||-99) < 4) ? state.initiator : "";
      const lastVisit = state.lastVisit || {};
      const away = (state.cast||[]).filter(c=>c && c.name && c.adult!==false && !c.dead && !(state.present||[]).includes(c.name));
      const candAway = away.filter(c=> c.name!==initiatorCool
        && (state.turn - (lastVisit[c.name]||-99)) >= 6
        && ((state.aff?.[c.name]||0)>=30 || (c.desire||0)>=35 || (c.links&&c.links.length)));
      if(candAway.length){
        // 优先选最久没主动出现过的人，避免总是同一两个人
        candAway.sort((a,b)=>(lastVisit[a.name]||-99)-(lastVisit[b.name]||-99));
        const pool = candAway.slice(0,3);
        const pick = pool[Math.floor(Math.random()*pool.length)];
        state.lastVisit = state.lastVisit || {};
        state.lastVisit[pick.name] = state.turn;
        visitorNudge = {role:"system",content:"不要总让同一个在场的人围着你转，换个主动的人：让不在场的「"+pick.name+"」在本幕主动出现、托人带话、写信或在门口等你（理由要自然）；其他与你有关系的人也有自己的行动与生活，不必都等你去找。"};
      }
    }
  }
  // 独处空间：连续多幕在场的人不必一直陪站，提醒 TA 去忙自己的事
  let stayNudge = null;
  {
    state.presence = state.presence || {};
    const curPresence = new Set(state.present||[]);
    for(const nm of Object.keys(state.presence)) if(!curPresence.has(nm)) delete state.presence[nm];
    for(const nm of curPresence) state.presence[nm] = (state.presence[nm]||0) + 1;
    const stayer = [...curPresence].find(nm=>state.presence[nm]>=5);
    const playerSaid = (choice&&choice.text)||"";
    if(stayer && !soloActive && !state.intimateActive && !(state.afterglow>0) && !playerSaid.includes(stayer) && (state.turn - (state.stayHintTurn||-99))>=5){
      state.stayHintTurn = state.turn;
      stayNudge = {role:"system",content:"「"+stayer+"」已经连续在你身边好几幕了，不要让他/她只是站着等你开口。若无必要，让 TA 去忙自己的事、暂时离开（用 left），把镜头交还给玩家独自处理；只有确实有事相求或相关时才留下。"};
    }
  }
  // 玩家选择「等待/离开/换目标」：这段时间不能空转，要让局势自行推进
  let waitNudge = null;
  {
    const waitKind = typeof isWaitChoice==="function" && isWaitChoice(choice);
    if(waitKind && !state.intimateActive && !(state.afterglow>0)){
      waitNudge = {role:"system",content:"【玩家选择等待/暂不动手】这不是放弃机会，而是把这段时间让给局势：1）用 environment.elapsedMinutes 至少推进 15 分钟（玩家明确说只等一小会儿除外）；2）至少一条 beats 写在场或相关 NPC 在这段时间里主动做的事——去办事、托人带话、先一步行动、改变条件，或让机会被别人拿走；3）写清等待带来的可见变化（消息、期限、人物态度或局势），plot.next 换成变化后的下一步；4）不要写成玩家站在原地空等或「什么也没发生」，也不要再给「继续等」「再观察」这类原地选项。"
        + (soloActive ? "玩家此刻想独处：不要让人物出现在玩家面前，用消息、远处的动静或错过的机会表现变化。" : "")};
    }
  }
  // 四维欲望的行为压力：最强烈的非性欲望会改变本幕的动机与选项
  let drivePress = null;
  {
    const dv = ensureDrives(state);
    const top = [["money","金钱"],["power","权力"],["people","人"],["items","物品"]]
      .map(([k,l])=>({k,l,v:dv[k]||0})).sort((a,b)=>b.v-a.v)[0];
    if(top && top.v >= 60){
      const text = {
        money: "你现在很想要钱。本幕可以出现赚钱、交易或花钱的机会，你会更愿意为钱开口、讨价还价，甚至冒一点险。",
        power: "你现在很想掌控局面。本幕更在意谁听谁的、想压过对方或被人服从，遇到被轻视会格外在意。",
        people: "你渴望有人陪。独处会让你心里发空，本幕你会更主动去找人说话、靠近、被需要。",
        items: "你对某样东西起了占有欲。本幕看到好东西会想弄到手，愿意为它付出或交换。"
      }[top.k];
      if(text) drivePress = {role:"system",content:text+"（这是你此刻最强烈的欲望之一，请在本幕的言行里体现，但不要说破数值。）"};
    }
  }
  const returnToChoices = ()=>showCurrentScene($("action-text").value || speech?.text);
  const memoryFirst = typeof memoryFirstForState==="function" ? memoryFirstForState(state) : false;
  const historyWindow = memoryFirst || state.turn>=60 ? -10 : state.turn>=30 ? -12 : -16;
  const prior = state.history.slice(historyWindow);
  if(prior.at(-1)?.role==="user") prior.pop();
  const fullContext = requiresFullTurnContext(state,choice);
  const recent = fullContext ? fullContextMessages(prior) : recentStoryMessages(prior);
  syncStoryPace(true);
  showSpeechInput(undefined,!turn.automaticOpening);
  aiMessage(speech ? "角色正在回应……" : "命运正在书写……", [["停止生成",()=>{ cancelTurn(); returnToChoices(); }]]);
  const pendingSpeech = speech ? logToDOM(speech) : null;
  if(pendingSpeech){
    pendingSpeech.classList.add("pending");
    const log = $("log");
    log.scrollTop = log.scrollHeight;
    controller.signal.addEventListener("abort",()=>pendingSpeech.remove(),{once:true});
  }
  try{
    if(!origin.turn && origin.worldId && !retry){
      await saveProgress(false,{allowOpening:true,reportError:true,state:origin});
      if(activeTurn!==turn || S!==origin) return;
    }
    const local = localReputation(state);
    const waitMinutes = isTwoDayTrial(state) && choice?.waitUntil===1830 && state.environment.minute<1440
      ? choice.waitUntil-state.environment.minute : 0;
    const storyNow = Number.isFinite(state.environment?.minute) ? state.environment.minute : 8*60;
    if(state.infiniteMode && state.hiddenQuest?.status==="active" && !Number.isFinite(state.hiddenStageStartedMinute)){
      state.hiddenStageStartedMinute = storyNow;
    }
    const stageMinutes = Number.isFinite(state.hiddenStageStartedMinute)
      ? Math.max(0,storyNow-state.hiddenStageStartedMinute) : 0;
    const beatReady = storyBeatReady(state);
    if(state.infiniteMode) state.eventBeatDue = beatReady;
    const reactionPrompt = lifeReactionPrompt(state,choice,soloActive);
    const agencyNudge = npcAgencyPrompt(state);
    const chapterNudge = chapterLoopPrompt(state);
    const repeatNudge = repetitionPrompt(state);
    const motifGuard = typeof motifGuardPrompt==="function" ? motifGuardPrompt(state) : null;
    const voiceNudge = characterVoicePrompt(state);
    const dbMemory = typeof retrieveRelevantMemory==="function"
      ? await retrieveRelevantMemory(state,playerAction,choice?.target) : "";
    if(activeTurn!==turn || controller.signal.aborted) return;
    const anticipatedMinute = storyNow + (waitMinutes || timeSkipMinutes(timeSkip,clockNow(state)) || 5);
    const currentPeople = memoryPeople(state,playerAction,choice?.target);
    const planRequest = npcPlanRequest(state,choice,currentPeople);
    const plannedActions = pendingNpcActions(state.openLoops,state.cast,anticipatedMinute).filter(l=>
      currentPeople.has(l.npcAction.who) || (l.knownBy||[]).some(n=>currentPeople.has(n)));
    const playerPromises = (state.openLoops||[]).filter(l=>l.playerPromise
      && (currentPeople.has(l.playerPromise.who) || choice?.promiseId===l.id || l.dueMinute<=anticipatedMinute));
    const opportunity = (state.loopHistory||[]).find(l=>choice?.promiseOpportunityId===l.id
      && l.promiseStatus==="kept" && !l.opportunityUsed);
    const unavailablePromises = (state.loopHistory||[]).filter(l=>l.promiseStatus==="missed"
      && l.playerPromise?.opportunity && currentPeople.has(l.playerPromise.who)).slice(-4);
    const labelPrompt = (label,message)=>{
      if(message && typeof message==="object"){
        try{ Object.defineProperty(message,"__metricLabel",{value:label,enumerable:false,configurable:true}); }catch(e){}
      }
      return message;
    };
    const contextMessage = labelPrompt("context",{role:"system",content:""});
    const stateMessage = labelPrompt("state",{role:"system",content:""});
    const buildContextMessages = compact=>{
      contextMessage.content = [buildMemoryContext(state,due,playerAction,choice?.target,{compact}),reactionPrompt,
        npcProfilePrompt(state,choice),
        investigationPrompt(state,inquiry,playerAction,choice?.target),
        genreSystemContext(state,genreMove,choice,(timeSkip||waitMinutes) ? anticipatedMinute : undefined)]
        .filter(Boolean).join("\n");
      stateMessage.content = buildStateContext(state,Boolean(choice),{compact});
    };
    buildContextMessages(false);
    const collectedMessages = [
      labelPrompt("rules",{role:"system",content:buildSystemPrompt(state,fullContext)}),
      contextMessage,
      ...(dbMemory ? [labelPrompt("memory",{role:"system",content:dbMemory})] : []),
      labelPrompt("loops",{role:"system",content:"【角色承诺】当 NPC 在剧情里明确答应独自办一件小事，并且期限确定，用 loopsAdd 的 npcAction:{who,text} 与 dueInMinutes 记录届时自行发生的具体行动。text 只写 NPC 的行动，不能替玩家答应、付款、领奖或离开。按真实进度才填 loopsDone。"
        +(plannedActions.length ? " 本幕预计到期，只有实际跨过期限时才承接结果："+plannedActions.map(l=>l.id+" "+l.npcAction.who+"："+l.npcAction.text).join("；")+"。" : "")}),
      labelPrompt("playerPromises",{role:"system",content:"【玩家承诺】只有玩家明确答应且在场 NPC 当幕接受，才用 loopsAdd 中的 {id,text,kind:'promise',dueInMinutes,playerPromise:{who,action,kept,missed,opportunity}}。期限必须明确，kept/missed 写对方在两种结果下实际会做什么，opportunity 写守约后可尝试的具体行动。承诺对象亲自确认履约才填写 promiseDone:[{id,beat}]，beat 是该 NPC 的台词或动作中从 1 开始的编号。单纯答应、询问或说打算做都不算完成。程序处理逾期和关系变化。"
        +(playerPromises.length ? " 本幕相关承诺："+JSON.stringify(playerPromises.map(l=>({id:l.id,dueMinute:l.dueMinute,...l.playerPromise})))+"。" : "")
        +(unavailablePromises.length ? " 已失约而关闭的机会："+JSON.stringify(unavailablePromises.map(l=>l.playerPromise.opportunity))+"。只能通过明确的补救或重新约定争取，当前不能直接领到。" : "")
        +(opportunity ? " 玩家申请兑现履约后的机会："+opportunity.playerPromise.opportunity+"。实际兑现后用 promiseDone 记录 id "+opportunity.id+" 和兑现的 beat。" : "")}),
      stateMessage,
      ...(localCombat ? [{role:"system",content:localCombat.prompt}] : []),
      ...(isTwoDayTrial(state) ? [{role:"system",content:
        "按《桥头客栈的两天》的固定时间和人物作息推进。已订房在关柜后仍有效，未订房须等开柜或另想办法。"
        +"第二天根据真实成交、劳动和消息来源演出。未接任务或错过交接都应留后续。固定事件："+TRIAL_MILESTONES.map(([minute,note])=>formatStoryTime(minute,state)+" "+note).join("；")
        +(waitMinutes ? "。玩家主动跳过今夜剩余时间，本幕必须经过 "+waitMinutes+" 分钟，结尾在次日 06:30，简述等待经过。"
          : "。自由输入明确要求等候或休息至次日时，如果中途没有需要玩家选择的事件，在本幕直接推进到约定时间，elapsedMinutes 填完整耗时。")
      }] : []),
      {role:"system",content:"【已报出的本地现货与服务】"+JSON.stringify(state.offers||[])
        +"。本地旧报价："+JSON.stringify((state.marketPrices||[]).filter(o=>o.place===marketPlace(state)).slice(-12))
        +"。已付款的近期交易："+JSON.stringify((state.receipts||[]).slice(-8))
        +"。游戏会直接显示购买按钮，choices 留给议价、换物、打听、离开等其他行动。"
        +(choice?.offerId ? "玩家明确选择按已报价格购买编号 "+choice.offerId+"。" : "")},
      {role:"system",content:"【当地口碑】"+(local.scope||"尚无明确圈子")+" · "+local.label+"。"+local.guide
        +(local.reason ? "已传开的事："+local.reason : "")
        +"。其他圈子的记录："+JSON.stringify((state.reputations||[]).slice(-10))
        +"。只让有消息来源的人根据口碑改变反应。"},
      ...(!state.turn && speech ? [{role:"system",content:opener+" 在同一幕交代开场，并让角色直接回应玩家的台词。"}] : []),
      ...recent.map(message=>labelPrompt(message.role==="assistant" ? "history-assistant" : "history-user",message)),
      ...(state.lastProse ? [{role:"system",content:"注意：你上一条回复没有使用规定的 JSON 格式，而是写了散文或编号列表。请务必只输出一个 JSON 对象（含 narration、beats、choices、plot 等字段），不要输出任何 JSON 之外的文字或 markdown 标题。"}] : []),
      ...(state.stallCount >= 2 && !isRomanceMode(state) && !(state.afterglow>0) && !state.intimateActive
        && sceneOverstay < 4 && !state.cutScene
        && !(state.noNagUntil && state.noNagUntil >= state.turn) ? [{role:"system",content:"节奏提醒：最近已连续 " + state.stallCount + " 幕主线几乎没有实质推进。不要再用「新漏洞、新条件、上级不同意、再确认」来延长同一件事；本幕必须让当前事情出结果或改变状态——达成、失败、暂缓、放弃、换目标、换地点或跳到下一个事件。若这一幕已经在同一场来回，就收束并转场。把 plot.next 写成真正不同的下一步，不要复述旧目标。"}] : []),
      ...(state.cutScene ? [{role:"system",content:"【玩家要求跳过当前场景】玩家明确要求结束/跳过眼前的会议或场景，直接快进到下一个会议/事件。本幕必须：1）用一两段概括交代当前场景的结果（谈成、谈崩、暂缓、改期、不欢而散或改由他人接手都行），不要再制造新的漏洞、责任、争执或需要核对的细节来延长它；2）用 environment.elapsedMinutes 推进到下一个会议/事件开始的时刻（不知道具体就取合理的几十分钟到一天）；3）直接写出新场景的地点、在场人物和新的眼前目标，不要重现同一场会的来回；4）不要再给「继续谈判/再核对/再劝对方签字」这类留在原地的选项。"}] : []),
      ...((!state.cutScene && sceneOverstay >= 4) ? [{role:"system",content:"【场景已拖太久】这一幕已经在同一场合并同一件事上连续 " + sceneOverstay + " 幕，玩家在反复打转。本幕必须收束它：给出一个阶段性结果（谈成、谈崩、暂缓、改期、离场、换人接手或暂时放弃），用 environment.elapsedMinutes 或蒙太奇跳到下一个场景/时间点；不要再制造新的漏洞、责任、争执、试探或追查来延长它，也不要再给「继续谈/再核对/再劝」的选项。新场景要有新的眼前目标，plot.next 必须换成与之前不同的下一步，不能仍是同一件事。"}] : []),
      ...(state.hiddenNextPending ? [{role:"system",content:"隐藏主线进入新阶段：上一阶段（第" + (state.hiddenStage||1) + "阶段）已完成。请在本幕自然开启下一阶段——用 hiddenQuest 提供新的 title / desc / stakes / reward，status 设为 active，承接上阶段的线索与后果并抬高筹码；不要复用旧阶段，也不要让玩家看出这些是「任务」。若剧情已到高潮收束，可令最终阶段 final=true 并在结束时给出结局。"}] : []),
      ...(state.infiniteMode && (!state.hiddenQuest || state.hiddenQuest.status!=="active") ? [{role:"system",content:"无限模式：本幕必须建立一个明确的当前篇章（hiddenQuest，status=active）。给出一个能在约 4~8 个故事小时内推进或完成的具体目标、阻力、代价与下一步；不要只写日常寒暄、原地试探或重复旧目标。篇章完成后在下一幕开启新篇章。"}] : []),
      ...(state.infiniteMode && state.hiddenQuest && state.hiddenQuest.status==="active" && beatReady && stageMinutes>=360
        && !(state.noNagUntil && state.noNagUntil >= state.turn) ? [{role:"system",content:"无限模式：当前篇章已在故事时间里持续 " + Math.floor(stageMinutes/60) + " 小时。本幕必须让它发生实质变化——新阻碍、反转、期限、代价，或直接收束并在下一幕开启新篇章；不要用闲聊、重复对峙或原地打转拖时间。"}] : []),
      ...(state.infiniteMode && beatReady && (state.beatCount||0)%2===0 ? [{role:"system",content:"无限模式：如果当前篇章需要新人物，本幕可以让一个与篇章有关的新角色加入，或让一个长期不出现的边缘角色彻底退场；若人物关系已经够用，不要为了换人而换人。只动边缘角色，不要动长期稳定关系（高好感、高亲密、家人、伴侣、长期盟友、宿敌、死对头、长期对手、债主、上司）；新角色要有自己的目标与麻烦，不是临时工具人。"}] : []),
      ...(state.infiniteMode && state.hiddenQuest && state.hiddenQuest.status==="active" && !(state.arcSeeds||[]).some(s=>s&&s.status==="planted") ? [{role:"system",content:"当前篇章还没有有效伏笔。本幕必须补 1~2 条：写清 hint（具体细节/异常）、conflict（会引发什么冲突）、basis（建立在哪个已发生事实/人物/地点上），并用 foreshadowAdd 记录；不要为了伏笔而凭空发明无关设定。"}] : []),
      ...(beatReady && stageMinutes >= 480 && !(state.afterglow>0) && !state.intimateActive
        && !(state.noNagUntil && state.noNagUntil >= state.turn) ? [{role:"system",content:(isRomanceMode(state)) ? ("隐藏主线就是这段关系，当前阶段在故事时间里已持续 " + Math.floor(stageMinutes/60) + " 小时。请让它作为一个关系里程碑推进：在最近 1~2 个节拍里安排一次明确的关系变化（靠近、坦白、心动、承诺、冲突或和解），达成后把 hiddenQuest.status 设为 done 并自然开启下一阶段。不要把玩家拽去处理外部事务，也不要用房租账单或流言蜚语凑数，不要为了推进而打断玩家正在享受的相处。") : ("隐藏主线当前阶段在故事时间里已持续 " + Math.floor(stageMinutes/60) + " 小时。请让它自然收束：要么在最近 1~2 个节拍内达成（达成即 hiddenQuest.status=done），要么随世界推进自然演进（NPC 自行行动、期限到时、局势变质），不要把玩家反复拽回同一件事。若玩家明显在过自己的日子（闲聊、经营），不要为了推动阶段而打断或催逼；可以留作背景压力。若这是最终阶段，达成后收束结局。")}] : []),
      ...((state.noNagUntil && state.noNagUntil >= state.turn) ? [{role:"system",content:"【拒绝冷却】玩家刚刚明确推掉了一件事"+(state.rejectedRequest?"（原话：「"+state.rejectedRequest+"」）":"")+"，并且真的不想被卷进去。在冷却结束前：1）任何 NPC 都不要再提这件事，不要反复劝说、旁敲侧击、借他人之口、换个说法、换个理由或换个人重新塞回来；2）也不要安排「恰好路过」「临时求助」「只有你能做」之类的巧合把玩家拽回同一件事；3）隐藏主线和篇章可以在后台由 NPC 自行推进、由局势与后果自然发酵，但不要用 NPC 缠着玩家说话的方式来表现；4）让 NPC 收住、去做自己的事，把镜头还给玩家想做的事。玩家沉默或岔开话题不代表同意；催促只会显得啰嗦，台词要短，不要复述已说过的话。如果你判断玩家拒绝的就是某条进行中的委托，把它填进 questDrop，让这桩事永久作废。"}] : []),
      ...(resolvedClaim ? [(()=>{
        const items = [
          ...(state.openLoops||[]).filter(l=>l && !l.playerPromise).map(l=>"未了事项「"+String(l.text||"").slice(0,40)+"」(id "+l.id+")"),
          ...(state.openLoops||[]).filter(l=>l && l.playerPromise).map(l=>"承诺「"+String(l.playerPromise.action||l.text||"").slice(0,40)+"」(id "+l.id+")"),
          ...(state.quests||[]).filter(q=>q && !q.done && !q.abandoned).map(q=>"委托「"+String(q.title||"").slice(0,40)+"」(id "+q.id+")")
        ].slice(0,8);
        return {role:"system",content:"【玩家声明已了结·按事实处理】玩家刚刚说：「"+resolvedClaim+"」。把它当作已成立的既成事实（除非与硬性事实或时间线直接冲突）：1）不要让在场者否认、要求重新证明或反复追问；最多用一两句话确认或作出反应，然后翻篇。2）知情范围：所有人。所有 NPC 都默认知道这件事已经了结，不需要再传话、证明或重新确认；不要让任何人表现出不知情。3）如果它对应下列待办中的某一项，且是玩家能独自完成的事，立刻用 questDone/loopsDone 收回；承诺必须由承诺对象在场并当面确认后填 promiseDone——对方不在场就不要替 TA 宣布已收妥，承诺仍按原期限结算。已无意义的人物计划用 npcPlanCancel 取消对应 id。4）本幕直接写到完成之后的当下；若这件事本来需要时间，用 elapsedMinutes 跳过完成过程（玩家提到花了几天/多久就按此推进），不要再演一遍解决过程，也不要给「回去确认」「再打听」这类原地选项。5）之后不要换个说法、换个人或借后果再次提起这件事。"+(items.length?" 当前待办："+items.join("；")+"。":"")};
      })()] : []),
      ...(state.filteredSpeakers && state.filteredSpeakers.length ? [{role:"system",content:"上一幕中这些角色并不在场，他们的话没有发生，不要当作已发生的事实或已经传出的消息："+state.filteredSpeakers.join("、")+"。若需要他们知情，必须在本幕安排人当面告知、送信或让他们进场。"}] : []),
      ...(function(){
        const paid = (state.ledger||[]).slice(-6).find(l=>l && /房租|租金|房钱|账单/.test(l.detail||""));
        return paid ? [{role:"system",content:"玩家已经支付过这笔款项（第"+paid.turn+"幕："+String(paid.detail||"").slice(0,80)+"）。本幕不要再催同一笔房租/账单，也不要换个人重提。"}] : [];
      })(),
      ...(driveNudge ? [driveNudge] : []),
      ...(visitorNudge ? [visitorNudge] : []),
      ...(stayNudge ? [stayNudge] : []),
      ...(waitNudge ? [waitNudge] : []),
      ...(agencyNudge ? [agencyNudge] : []),
      labelPrompt("npcPlans",{role:"system",content:npcPlanPrompt(state,currentPeople,choice)}),
      ...(chapterNudge ? [chapterNudge] : []),
      ...(motifGuard ? [motifGuard] : []),
      ...(repeatNudge ? [repeatNudge] : []),
      ...(voiceNudge ? [voiceNudge] : []),
      ...(soloActive ? [{role:"system",content:"玩家现在想一个人待着 / 独自查案：本幕不要安排任何人来敲门、送东西、传话、在门外守着或「恰好路过」；也不要用脚步、叹息、影子暗示有人在附近。在场的人若识趣，可以让他们离开（用 left）。只写玩家自己的行动、环境与发现。除非性命攸关的急事，才可让人出现，并说明为何非打断不可。"}] : []),
      ...(timeSkip ? [{role:"system",content:"玩家要求推进 "+skipLabel+"。概括期间的局势、关系和身份变化，再写抵达新日期后的处境。系统按日历推进，自动结算任务之外的固定收入、租约、到期和已设开销。不要猜测收支合计，也不要把同一笔再填入 moneyMoves。"+FAST_BREVITY}] : []),
      ...(isRomanceMode(state) ? [{role:"system",content:"恋爱类型额外规则：不要把房租、账单、算账、买菜、邻居闲话、世俗眼光、流言蜚语、催婚逼婚当作反复出现的主要事件或固定反派；这些至多是一句背景。恋爱故事的事件应推进关系本身——心动、试探、坦白、承诺、失约、旧伤、共同经历、和解或离别。不要为了制造冲突把玩家拽去处理外部事务。"}] : []),
      ...(state.infiniteMode ? [{role:"system",content: beatReady ? storyBeatPrompt(state,stageMinutes) : storyCalmPrompt(state)}] : []),
      ...(state.infiniteMode ? [{role:"system",content:"无限模式：这段故事没有预设终点。除非玩家主动要求结束，否则不要输出 end，也不要用主线完成、原作结局、通缉或力竭来收束。主线走完或明显偏离时，顺势开启新的局部目标、事件、地点或人物，让故事自然延续；旧角色可以离场并不再回来，长期不出现的人标记 offstage，不再主动回来；只有在剧情节拍到达、题材需要且玩家没有在安静相处时，才让新角色加入；不要为了换人而换人。长期稳定关系（高好感、高亲密、家人、伴侣、长期盟友、宿敌、死对头、长期对手、债主、上司）不适用自动退场：他们可以暂时不在场、在忙自己的事，但不会因为几幕没出现就消失，也不会被新角色顶替。只在剧情节拍到达或玩家主动推动时引入新事件；安静相处的时间不是流水账，不要用房租、账单、流言或路人琐事硬填。建立新篇章时必须同时留下 1~3 条伏笔（hint/conflict/basis），并在 2~5 个故事小时内推进或回收；伏笔要建立在已发生的事实、人物或地点上，不要凭空发明无关设定。"}] : []),
      ...(choice && choice.endingRequest ? [{role:"system",content:"玩家主动要求结束故事。这是最后一幕，必须从玩家当前所处的场景、刚刚发生的动作和本局已经成立的事件收束，不能跳到原著临近结局的位置，不能预写尚未发生的新篇章，也不要拿原著的后续情节替代本局结局。把当前主线、关系和未了之事交代清楚，并在 JSON 的 end 字段返回 {good:true/false,title,text}；不要输出后续 choices，不要开启新钩子。结局必须基于本局实际发生的事和玩家此前的选择。"}] : []),
      ...(drivePress ? [drivePress] : []),
      ...((state.intimateActive || state.afterglow>0 || (((state.desires&&state.desires.sex)||0)>=45 && /亲吻|吻|抱住|搂|抚摸|摸|解开|脱下|贴紧|贴身|上床|胸前|腰|腿间|身体/.test((choice&&choice.text)||""))) ? [{role:"system",content:"亲密已经进行中，或双方早已明确愿意：不要再问「可以吗 / 要不要 / 你确定吗 / 要我继续吗」这类问题，也不要停下来征求同意；直接写动作、身体状态与进展，并明确是尚未释放还是已经释放。只有玩家明确说停或表现犹豫时才停。"}] : []),
      ...((state.afterglow>0 || state.intimateActive) ? [{role:"system",content:"你们刚刚（或正在）亲密，仍处在余韵里。本幕不要突然谈任务、委托或推进主线；先写身体的疲惫、情绪的余温与相处（喘息、发软、犯困、黏人、沉默、满足或后悔），让这一场自然收尾或继续，等余韵过去再谈别的事。NPC 此刻是被欲望与疲惫影响的人，不是随时能公事公办的机器。"}] : []),
      ...(planRequest ? [{role:"system",content:npcPlanRequestReminder(planRequest)}] : []),
      ...(playerName ? [{role:"system",content:"【身份锁定】玩家本人就是「"+playerName+"」，不是 NPC、不是第三方、不是另一个角色。历史中「"+playerName+"」作为说话人时就是玩家本人；NPC 对玩家说话可称「你」或「"+playerName+"」，但 present / characters / cast 中不得把「"+playerName+"」列为 NPC。choices 用玩家第一人称，不要写「你和"+playerName+"」「"+playerName+"和他」这种把玩家拆成两个人的话。"}] : []),
      labelPrompt("action",action)
    ];
    if(state.filteredSpeakers) delete state.filteredSpeakers;
    const corrective = choice?.endingRequest
      ? {role:"system",content:"上一次的结局输出不可用。请只返回一个完整 JSON 对象，以 { 开头、} 结尾，包含 narration / beats / end；end 必须是 {\"good\":true或false,\"title\":\"结局标题\",\"text\":\"结局正文\"}。不要返回 choices，不要写下一幕、新钩子或原著临近结局的原文。必须从玩家当前幕的处境和已经发生的事件收束。"}
      : {role:"system",content:"上一次的输出不可用（可能是 JSON 格式错误或不完整，或缺少 plot 主线 / choices 选项 / beats 台词）。请严格只输出一个完整的 JSON 对象，以 { 开头、} 结尾，包含 narration / beats / choices / plot / effects / advance 等字段；不要输出任何解释、Markdown 代码块、标题或编号列表。"};
    let raw, scene, lastErr, environment, money, calculatedStamina, truncated = false;
    const protectedScene = !state.cutScene && sceneOverstay < 4
      && (keyScene || Boolean(driveNudge || planRequest || genreMove || inquiry));
    const dailyPace = hasDailyPace(state)
      ? (timeSkip || waitMinutes
          ? {prompt:"【日常时间跳跃】本轮按玩家指定的时长推进。概括等待期间的可见变化和已发生的后果，停在指定时刻；留给玩家决定的事不代做。"+FAST_BREVITY+DAILY_DECISION_GUIDANCE}
          : dailyPaceFor(state,choice,protectedScene))
      : null;
    // 玩家刚拒绝了上一幕的时间跳跃：这一幕按「停在本幕」重写，避免同样的快进再来一次
    const HOLD_TIME_PROMPT = "【时间停在本幕】玩家拒绝了上一幕的时间跳跃。本幕不要推进超过 60 分钟，不要跳到下一个时间段；把玩家这次行动的结果写完整，停在玩家仍可行动的当下。如果上一版把场景写成了夜里、入夜或傍晚，请把旁白、光线和人物作息改回当前时刻，不要只改数字。";
    let holdTime = state.holdTimeTurn === nextTurn && !timeSkip && !waitMinutes
      && !state.cutScene && dailyPaceMode(state)!=="fast";
    let holdPrompt = holdTime ? HOLD_TIME_PROMPT : "";
    const pacePrompt = state.cutScene
      ? "【剧情节奏：跳过当前场景】玩家要求结束当前会议或场景、直接快进到下一个会议/事件。用一两段概括当前场景的结果并推进时间，直接切到新场景，不要再展开当前的细节、漏洞或后果，也不要给留在原地的选项。"+FAST_BREVITY
      : sceneOverstay >= 4
        ? "【剧情节奏：收束当前场景】这一幕已在同一场合并同一件事上连续 " + sceneOverstay + " 幕。用一两段概括阶段性结果（谈成、谈崩、暂缓、改期、离场或换人接手），用 environment.elapsedMinutes 推进时间并直接切到下一场；不要再展开细节、漏洞或后果，也不要给继续磨的选项。"+FAST_BREVITY
        : (dailyPace?.prompt || genrePaceDirective(state,choice,protectedScene,timeSkip || waitMinutes));
    const assembleMessages = compact=>{
      buildContextMessages(compact);
      const list = collectedMessages.slice();
      if(list.length) list.splice(list.length-1,0,labelPrompt("rules",{role:"system",content:pacePrompt}));
      if(holdPrompt && list.length) list.splice(list.length-1,0,labelPrompt("rules",{role:"system",content:holdPrompt}));
      const clockText = state.environment && Number.isFinite(state.environment.minute)
        ? formatStoryTime(state.environment.minute,state) : "";
      if(clockText && list.length){
        list.splice(list.length-1,0,labelPrompt("rules",{role:"system",content:
          "【此刻时间】现在是 "+clockText+"。本幕旁白、人物作息和期限都必须与这个时刻一致；如果写到傍晚、入夜、第二天等时间变化，必须同时用 environment.elapsedMinutes 推进到那个时刻。并在 JSON 顶层用 clockCheck 写本幕结束时的当地时刻 HH:MM。"}));
      }
      const changeLine = typeof goalChangePrompt==="function" ? goalChangePrompt(state) : null;
      if(changeLine && list.length) list.splice(list.length-1,0,labelPrompt("rules",{role:"system",content:changeLine}));
      const openingLine = !state.turn && state.genre && !state.world && typeof genreOpeningLine==="function"
        ? genreOpeningLine(state) : "";
      if(openingLine && list.length) list.splice(list.length-1,0,labelPrompt("rules",{role:"system",content:openingLine}));
      if(list.length) list.splice(list.length-1,0,labelPrompt("rules",{role:"system",content:
        "【输出格式】只输出一个完整 JSON 对象：第一字符 {，最后 }；不要 Markdown、代码块、解释或散文。必须包含 narration、beats、choices、plot、advance、environment、clockCheck；choices 2~3 条，每条写 kind，至少一项写 cost。"}));
      return list;
    };
    const tokenBudget = contextTokenBudget(state);
    // 先用完整上下文；超预算就整体改用精简版（压缩 NPC 卡片与旧事件），再按优先级继续裁
    let baseMessages = assembleMessages(false);
    let promptTokens = promptTokenEstimate(baseMessages);
    let usedCompact = false;
    if(promptTokens>tokenBudget){
      baseMessages = assembleMessages(true);
      promptTokens = promptTokenEstimate(baseMessages);
      usedCompact = true;
    }
    baseMessages = trimMessagesByTokenBudget(baseMessages,tokenBudget);
    promptTokens = promptTokenEstimate(baseMessages);
    contextTokens = promptTokens;
    if(typeof console!=="undefined") console.info("[上下文预算]",{budget:tokenBudget,tokens:promptTokens,compact:usedCompact});
    const openingWithGenre = !state.turn && state.genre && !state.world;
    let maxAttempts = choice?.endingRequest ? 3 : openingWithGenre ? 3 : 2;
    let jumpAsked = false;
    for(let attempt=0; attempt<maxAttempts; attempt++){
      attempts = attempt + 1;
      const retryBase = attempt===0 ? null
        : trimMessagesByTokenBudget(assembleMessages(true),Math.floor(tokenBudget*0.8));
      const compression = truncated ? {role:"system",content:"上一段输出因达到长度上限被截断。请压缩本幕："+FAST_BREVITY} : null;
      const retryTokens = truncated ? 8192 : Math.min(6000,Math.max(3000,outputBudget+1200));
      const messages = attempt===0 ? baseMessages : [...(retryBase || baseMessages).slice(0,-1), ...(compression ? [compression] : []), corrective,
        ...(lastErr?.message ? [{role:"system",content:"还需纠正："+lastErr.message}] : []),
        (retryBase || baseMessages)[(retryBase || baseMessages).length-1]];
            try{
        raw = await callLLM(messages, AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]), text=>{
          if(activeTurn===turn) streamPreview(text);
        }, {temperature: attempt===0 ? 0.95 : 0.7, maxTokens: attempt===0 ? outputBudget : retryTokens, turn:nextTurn, label:attempt===0 ? "scene" : "retry"});
        const metrics = (typeof window!=="undefined" && Array.isArray(window.__llmMetrics)) ? window.__llmMetrics : [];
        const metric = metrics[metrics.length-1];
        truncated = Boolean(metric && metric.turn===nextTurn && metric.label===(attempt===0 ? "scene" : "retry") && metric.hitMaxTokens);
        if(truncated && maxAttempts < 3) maxAttempts = 3;
      }catch(err){
        lastErr = err;
        if(attempt===maxAttempts-1 || activeTurn!==turn || controller.signal.aborted || err.name==="AbortError") throw err;
        markRetry("network",err.message||err.name);
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("连接中断，正在重试",maxAttempts);
        continue;
      }
      if(activeTurn!==turn) return;
      try{
        scene = canonicalProfileNames(readScene(raw),state);
      }catch(err){
        lastErr = err;
        jsonErrors++;
        if(attempt===maxAttempts-1) throw err;
        markRetry("json",err.message);
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("格式不合，正在重写",maxAttempts);
        continue;
      }
      // 命中 max_tokens：即使修复后勉强能解析，也压缩重写一次，避免接受被截断的半幕
      if(truncated && attempt<maxAttempts-1){
        lastErr = new Error("上一段输出因长度上限被截断，请压缩后重写完整 JSON");
        markRetry("truncated","输出命中长度上限");
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("输出超长，正在压缩重写",maxAttempts);
        continue;
      }
      const identityIssue = playerIdentityIssue(scene,playerName);
      if(identityIssue && attempt===0){
        lastErr = new Error(identityIssue);
        identityRetries++;
        markRetry("identity",identityIssue);
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("正在修正玩家身份",maxAttempts);
        continue;
      }
      if(attempt===0 && ((planRequest==="draft" && !scene.hasNpcPlanField)
        || (planRequest==="news" && !scene.hasNpcPlanNewsField))){
        lastErr = new Error(npcPlanRequestReminder(planRequest));
        markRetry("plan",lastErr.message);
        continue;
      }
      if(!verifyNpcPlanNews(state,scene,attempt>0) && attempt===0){
        lastErr = new Error("npcPlanNews 只允许在场知情人亲口报告已结算的行动，并引用真实台词编号。");
        markRetry("plan-news",lastErr.message);
        continue;
      }
      if(choice?.endingRequest && !scene.ending){
        lastErr = new Error("结局请求必须从当前幕收束，并在 end 字段返回 good/title/text；不要返回普通剧情或下一幕选项。");
        if(attempt===maxAttempts-1) throw lastErr;
        markRetry("ending",lastErr.message);
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("正在重新生成结局",maxAttempts);
        continue;
      }
      const earlyConsistency = validateSceneConsistency(scene,state);
      if(earlyConsistency && attempt===0){
        lastErr = new Error(earlyConsistency);
        markRetry("consistency",earlyConsistency);
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("正在修正人物一致性",maxAttempts);
        continue;
      }
      const dead = deadCharacterNames(state);
      if(dead.size){
        scene.lines = scene.lines.filter(line=>!dead.has(line.who));
        scene.entered = scene.entered.filter(name=>!dead.has(name));
        scene.left = scene.left.filter(name=>!dead.has(name));
        scene.characters = scene.characters.filter(character=>!dead.has(character.name));
        if(Array.isArray(scene.present)) scene.present = scene.present.filter(name=>!dead.has(name));
        if(!scene.lines.length && !scene.ending){
          lastErr = new Error("这幕只有已死亡人物的台词或动作，请改用在世人物或旁白推进。");
          if(attempt===maxAttempts-1) throw lastErr;
          markRetry("dead-cast",lastErr.message);
          continue;
        }
      }
      if(waitMinutes || timeSkip){
        const openingClock = advanceEnvironment(state.environment,{...scene.environment,elapsedMinutes:0},false,state);
        scene.environment.elapsedMinutes = waitMinutes || timeSkipMinutes(timeSkip,clockNow({...state,environment:openingClock}));
        scene.environment.longSkip = true;
      }
      // 等待类选项必须让时间真的走一段：模型常把「等一等」写成原地不动
      {
        const waitKind = typeof isWaitChoice==="function" && isWaitChoice(choice);
        if(waitKind && !timeSkip && !waitMinutes && !scene.ending && scene.environment
          && !state.intimateActive && !(state.afterglow>0) && !scene.environment.longSkip){
          const waited = Number(scene.environment.elapsedMinutes);
          if(!Number.isFinite(waited) || waited<15) scene.environment.elapsedMinutes = 15;
        }
      }
      environment = advanceEnvironment(state.environment,scene.environment,Boolean(choice),state);
      const beforeClock = clockNow(state);
      const afterClock = clockNow({...state,environment});
      const jumpMinutes = Math.max(0,Math.round((afterClock-beforeClock)/60000));
      const jumpDateChanged = beforeClock.toISOString().slice(0,10)!==afterClock.toISOString().slice(0,10);
      // 明显的时间跳跃交给玩家确认，不再被日常节奏直接打回重写。
      // 否则模型会为了过检查只推进几分钟，却把旁白写成夜里。
      const bigJump = Boolean(choice) && !timeSkip && !waitMinutes && !scene.ending
        && (jumpMinutes>=120 || (jumpDateChanged && jumpMinutes>15));
      // 上一幕已经取消过时间跳跃：先尝试让模型把这一幕停回当下，最后一轮仍超时则接受
      if(holdTime && environment.minute-state.environment.minute>60 && attempt<maxAttempts-1){
        lastErr = new Error("上一幕已取消时间跳跃：本幕请不要推进超过 60 分钟，停在玩家可以行动的当下。");
        markRetry("hold-time","本幕仍推进超过 60 分钟");
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("正在把这一幕停回当下",maxAttempts);
        continue;
      }
      // 旁白与环境时钟对不上：先让模型把时刻写对或补足 elapsedMinutes，改写后的大跳会走确认。
      // 玩家刚拒绝过大跳时也要查：否则模型会停在「不多走一分钟、但旁白还是夜里」的状态。
      if((attempt===0 || holdTime) && !timeSkip && !waitMinutes && !scene.ending && !bigJump){
        const timeIssue = typeof timeOfDayMismatch==="function" ? timeOfDayMismatch(scene,environment,state) : "";
        const clockIssue = typeof clockCheckMismatch==="function" ? clockCheckMismatch(scene,environment,state) : "";
        const issue = [timeIssue,clockIssue].filter(Boolean).join("；");
        if(issue){
          lastErr = new Error(issue);
          if(attempt>=maxAttempts-1) break;
          markRetry(clockIssue ? "clock-check" : "time-of-day",issue);
          const pv = $("stream-preview");
          if(pv) pv.textContent = retryText("正在校准本幕时刻",maxAttempts);
          continue;
        }
      }
      if(!bigJump && Number.isFinite(dailyPace?.maxMinutes) && (environment.minute-state.environment.minute>dailyPace.maxMinutes
        || scene.environment.elapsedMinutes>dailyPace.maxMinutes)){
        lastErr = new Error("本幕超出了日常节奏允许的 "+dailyPace.maxMinutes+" 分钟。请重写场景和经过时间，停在玩家可以行动的地方。");
        if(attempt===maxAttempts-1) throw lastErr;
        markRetry("pace","超过日常节奏 "+dailyPace.maxMinutes+" 分钟");
        continue;
      }
      // 时间跳跃确认：选「否」不再整幕作废，而是自动改写一版停在这一小段时间里的剧情
      if(bigJump && choice){
        const jump = jumpMinutes;
        const dateChanged = jumpDateChanged;
        if(jump>=120 || (dateChanged && jump>15)){
          if(!jumpAsked && !confirm("本幕将推进 "+formatDuration(jump)+"。\n是否继续这次时间跳跃？\n选「否」会自动改写一版停在这一小段时间里的剧情。")){
            jumpAsked = true;
            holdTime = true;
            holdPrompt = HOLD_TIME_PROMPT;
            if(maxAttempts < attempt+3) maxAttempts = Math.min(4, attempt+3);
            lastErr = new Error("玩家拒绝了这次 "+formatDuration(jump)+" 的时间跳跃：请改写本幕，只推进不超过 60 分钟，不要跳到下一个时间段，把同样的行动结果写在当下，停在玩家仍可行动的地方。如果这一版把场景写成了夜里或傍晚，也要把旁白、光线和作息改回当前时刻。");
            markRetry("jump-cancel","玩家拒绝 "+formatDuration(jump)+" 的时间跳跃，改写停在本幕");
            const pv = $("stream-preview");
            if(pv) pv.textContent = retryText("已取消时间跳跃，正在改写这一幕",maxAttempts);
            continue;
          }
          if(jumpAsked){
            // 改写后模型仍然要大步跳：按玩家的选择整幕作废，并记下「下次不要跳」
            activeTurn = null;
            clearPendingTurn(pendingTurnMeta);
            if(S===origin){
              S.holdTimeTurn = nextTurn;
              const note = "已取消这次时间跳跃，本幕没有推进；下次生成会停在这一小段时间里。";
              addLog({t:"sys",text:note});
              logToDOM({t:"sys",text:note});
            }
            showCurrentScene(playerAction);
            return;
          }
        }
      }
      scene.fromMinute = sceneStartMinute(state.environment,scene.environment,environment,Boolean(choice));
      const commitIssue = tradeProblem(scene,state,choice) || custodyProblem(scene,choice)
        || genreSceneProblem(state,environment,genreMove,scene.genreData.done);
      money = commitIssue ? null : settleTurnMoney(state,scene,environment,choice);
      if(commitIssue || money.error){
        lastErr = new Error(commitIssue || money.error);
        if(attempt===maxAttempts-1) throw lastErr;
        markRetry("settlement",lastErr.message);
        continue;
      }
      if(localCombat && Number.isFinite(localCombat.hpLoss) && localCombat.hpLoss>0){
        // 交锋的体力损失并入本幕活动量，交给体力结算统一扣，避免 AI 的 effects.hp 与本地的损失重复
        const minutes = Math.max(Number(scene.exertion?.minutes)||0,20);
        scene.exertion = {...(scene.exertion||{}),kind:"strenuous",minutes,
          reason:[scene.exertion?.reason,"交锋"].filter(Boolean).join("、")};
        delete scene.effects?.hp;
      }
      const staminaHp = Number.isFinite(scene.effects?.hp) ? scene.effects.hp : undefined;
      const staminaOk = resolveTurnStamina(scene,{...state,species:state.species||(!state.turn ? scene.playerSpecies : ""),
        environment:{...state.environment,minute:scene.fromMinute}},
        environment.minute-scene.fromMinute,choice);
      // 明确休整且 AI 给了净体力值：本幕体力以 AI 的净值为准，结算不再叠加恢复/疲劳
      // （结算失败或为负时说明玩家并未真正休整，保留本地疲劳/恢复的结果）
      // 明确休整且 AI 给了净体力值：本幕体力以 AI 的净值为准，不再叠加本地恢复
      // （未明确休整时结算结果为负，说明玩家并未真正休息，保留本地疲劳结果）
      if(staminaOk && scene.rested && Number.isFinite(staminaHp) && staminaHp>0 && !(scene.effects.hp<0)){
        scene.effects.hp = staminaHp;
        // 明确休整时 AI 给的是本幕净体力，标记为本幕唯一结算
        scene.staminaSettled = true;
        calculatedStamina = true;
      }else{
        calculatedStamina = staminaOk;
      }
      if(dailyPace && scene?.dailyDecision) repairDailyDecision(scene,playerName);
      let dailyIssue = dailyPace && checkDailyDecision(scene,dailyPace,playerName);
      // 模型常漏写 consequence.fact：有 advance 时直接把它当作本轮影响，
      // 既保留「本轮影响」提示，也避免为一句字段再重写整幕。
      if(dailyPace && !scene.consequence && scene.advance && String(scene.advance).trim()){
        scene.consequence = {fact:String(scene.advance).trim()};
      }
      if(!dailyIssue && dailyPace?.expectOutcome && !scene.consequence){
        dailyIssue = "这次还没写清你选的做法带来了什么结果。请用 consequence.fact 记录幕中已发生、应影响后续的变化。";
      }
      if(!dailyIssue && dailyPace?.expectProgress && !scene.ending && !scene.advance && !scene.consequence && !scene.dailyDecision){
        dailyIssue = "快进后需要一个看得见的进展。请在场景中写出玩家的行动造成的实际变化，再用 advance 简短记录，停在下一处有取舍的情境。";
      }
      if(dailyIssue){
        lastErr = new Error(dailyIssue);
        if(attempt===maxAttempts-1) throw lastErr;
        markRetry("daily",dailyIssue);
        continue;
      }
      repairChoicesFromScene(scene,state);
      const problem = validateSceneForTurn(scene, state);
      if(problem){
        lastErr = new Error(problem);
        // 解析成功但质量欠佳：先重试一次；若仍不理想，也不再阻断，直接接受这一幕，避免反复弹错
        if(attempt===maxAttempts-1) break;
        markRetry("quality",problem);
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("正在调整这一幕",maxAttempts);
        continue;
      }
      const stallIssue = typeof chapterStallIssue==="function" ? chapterStallIssue(scene,state) : "";
      if(stallIssue){
        lastErr = new Error(stallIssue);
        if(attempt>=maxAttempts-1) break;
        markRetry("chapter-stall",stallIssue);
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("正在推进当前篇章",maxAttempts);
        continue;
      }
      const loopStall = typeof loopStallIssue==="function" ? loopStallIssue(scene,state) : "";
      if(loopStall){
        lastErr = new Error(loopStall);
        if(attempt>=maxAttempts-1) break;
        markRetry("loop-stall",loopStall);
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("正在收回过旧的线索",maxAttempts);
        continue;
      }
      // 模型写成散文：先尝试重生成一次，仍不行再接受散文兜底
      if(scene.prose && attempt===0){
        lastErr = new Error("上一版是散文，不是 JSON。请只输出一个完整 JSON 对象：第一字符 {，最后 }；不要解释、Markdown 或代码块；必须包含 narration、beats、choices、plot、advance、environment、clockCheck。");
        markRetry("prose","模型返回散文，不是完整 JSON");
        const pv = $("stream-preview");
        if(pv) pv.textContent = retryText("格式不合，正在重写",maxAttempts);
        continue;
      }
      break;
    }
    if(!scene || !money?.funds) throw lastErr || new Error("剧情格式无法解析，请重试");
    // 亲密状态追踪：进行中 / 刚结束（余韵）
    {
      const stage = scene.intimacyStage || "";
      const effS = scene.effects || {};
      const released = (Number.isFinite(effS.desire) && effS.desire <= -30) || /结束|高潮|余韵|事后|释放|射精/.test(stage);
      const ongoing = !released && /亲吻|爱抚|宽衣|进入|进行中|试探|亲近/.test(stage);
      const wasAfterglow = (state.afterglow||0) > 0;
      state.refractoryThisTurn = wasAfterglow || released;
      state.afterglowTurn = wasAfterglow;
      state.intimateActive = ongoing;
      state.afterglow = (released && !wasAfterglow) ? 2 : Math.max(0, (state.afterglow||0) - 1);
      // 释放后的疲惫与满足：每次释放只结算一次，余韵期间不重复扣
      if(released && !wasAfterglow){
        if((state.hp||0) > 1){
          state.hp = clamp((state.hp||100) - 5, 1, state.hpMax||100);
        }
        const partners = new Set(Object.keys((scene.effects||{}).intimacy||{})
          .filter(n=>n && (state.present||[]).includes(n)));
        if(!partners.size){
          const cand = (state.present||[]).map(nm=>{
            const c = (state.cast||[]).find(x=>x.name===nm);
            if(!c || c.adult===false) return null;
            return {nm, score:(state.intimacy?.[nm]||0)+(state.aff?.[nm]||0)*0.3};
          }).filter(Boolean).sort((a,b)=>b.score-a.score);
          if(cand[0]) partners.add(cand[0].nm);
        }
        for(const nm of partners){
          const c = (state.cast||[]).find(x=>x.name===nm);
          if(c && c.adult!==false) c.desire = clamp((c.desire||0) - 35, 0, 100);
        }
      }
    }
    const profileEdits = state.playerProfileEdits||{};
    if(!profileEdits.age && Number.isFinite(scene.playerAge) && (!Number.isFinite(state.age) || state.birthAuto)){
      state.age = clamp(Math.round(scene.playerAge),0,200);
      if(state.birthAuto || !state.birth){ state.birth = null; state.birthAuto = false; }
    }
    if(!profileEdits.height && Number.isFinite(scene.playerHeight)) state.height = clamp(Math.round(scene.playerHeight),30,300);
    if(!profileEdits.weight && Number.isFinite(scene.playerWeight)) state.weight = clamp(Math.round(scene.playerWeight),2,500);
    if(Number.isFinite(scene.playerSavings)) state.savings = Math.max(0,Math.round(scene.playerSavings));
    if(!profileEdits.origin && scene.playerOrigin) state.origin = scene.playerOrigin;
    if(!profileEdits.appearance && scene.playerAppearance) state.appearance = scene.playerAppearance;
    if(!profileEdits.outfit && scene.playerOutfit) state.outfit = scene.playerOutfit;
    const wuxia = combatProfileFor(state)?.id==="wuxia";
    if(scene.playerCombat && (!wuxia || !state.turn)){
      state.combat = wuxia ? {...scene.playerCombat,mode:"wuxia"} : scene.playerCombat;
    }
    if(!state.turn){
      if(!profileEdits.gender && !state.gender && scene.playerGender) state.gender = scene.playerGender;
      if(!state.species && scene.playerSpecies) state.species = scene.playerSpecies;
      if(Number.isFinite(scene.playerIncome)) state.incomePerDay = scene.playerIncome;
      if(!profileEdits.age && scene.playerBirth && (!state.birth || state.birthAuto)) { state.birth = scene.playerBirth; state.birthAuto = false; }
      if(scene.playerIncomePlan) state.incomePlan = scene.playerIncomePlan;
      state.economyMode = economicMode(state,scene);
      if(scene.playerAssets) state.assets = scene.playerAssets;
      if(Number.isFinite(scene.playerCoin)) state.coin = scene.playerCoin;
      const {unit,reference} = scene.economy;
      if(unit && unit!==curName(state) && scene.playerCoin!==null && scene.playerIncome!==null){
        state.currency = {name:unit,symbol:"",scale:reference};
      }else if(reference && (!unit || unit===curName(state))){
        state.currency = {...state.currency,scale:reference};
      }
    }
    const {funds} = money;
    for(const key of ["coin","debt","items","moneyTotals","moneyBook","contracts","receipts","food","cast","assets","incomePlan"]){
      state[key] = funds[key];
    }
    if(scene.playerExpensePlans!==undefined) state.expensePlans = scene.playerExpensePlans;
    // 自动开场设定关系基线，玩家首幕有行动时则按回合增量处理。
    if(!state.turn && !choice){
      // 开场欲望基线：按原文初始化玩家与 NPC 的欲望（与好感/亲密度独立）
      { const dv0 = ensureDrives(state);
        if(Number.isFinite(scene.playerDesire)) dv0.sex = clamp(scene.playerDesire,0,100);
        if(scene.playerDrives && typeof scene.playerDrives==="object"){
          for(const k of DRIVE_KEYS) if(Number.isFinite(scene.playerDrives[k])) dv0[k] = clamp(scene.playerDrives[k],0,100);
        }
        state.desire = dv0.sex;
      }
      // 开场关系基线：优先用专门的关系字段 relations（effects 里的数值一律视为回合增量）
      if(Array.isArray(scene.relations) && scene.relations.length){
        for(const r of scene.relations){
          if(Number.isFinite(r.aff)) state.aff[r.name] = clamp(r.aff,-100,100);
          if(Number.isFinite(r.intimacy)) state.intimacy[r.name] = clamp(r.intimacy,0,100);
          const ch = (scene.characters||[]).find(c=>c && c.name===r.name);
          if(ch && Number.isFinite(r.intimacy)) ch.intimacy = clamp(r.intimacy,0,100);
          if(Number.isFinite(r.desire)){
            if(ch) ch.desire = clamp(r.desire,0,100);
            else { state.npcDesireInit = state.npcDesireInit || {}; state.npcDesireInit[r.name] = clamp(r.desire,0,100); }
          }
        }
      }
      const se = scene.effects || {};
      if(Array.isArray(se.social) && se.social.length){
        state.social = state.social || [];
        for(const r of se.social){ const idx = state.social.findIndex(x=>x.name===r.name); if(idx>=0) state.social[idx] = {...state.social[idx],...r}; else state.social.push(r); }
        state.social = state.social.slice(-16);
      }
    }
    // 进度检测（防拖沓）：只认「实质推进」——AI 自报的本幕推进点 advance，或剧情支线/物品/能力/暗线状态变化。
    // 不看 plot.next/goal/conflict 的措辞变化（模型每幕都会改写），也不看 consequence.fact（常被无意义填满）。
    // 关系推进也算实质推进：恋爱/日常里一次走心的互动不该被判为「拖沓」
    const eff0 = scene.effects || {};
    const relational = Object.values(eff0.aff||{}).some(v=>Number.isFinite(v)&&v>0)
      || Object.values(eff0.intimacy||{}).some(v=>Number.isFinite(v)&&v>0);
    const progressed = relational
      || (scene.advance && scene.advance.length >= 8)
      || (scene.questAdd && scene.questAdd.length > 0)
      || (scene.questDone && scene.questDone.length > 0)
      || (scene.items && scene.items.length > 0)
      || (scene.abilities && scene.abilities.length > 0)
      || (scene.hiddenQuest && (!state.hiddenQuest || scene.hiddenQuest.status !== state.hiddenQuest.status));
    const stalled = state.turn > 0 && !progressed;
    // 判定失败/勉强成功要留痕：确定涉及的在場 NPC，扣一点信任并记一条未了事项
    const checkSetback = (()=>{
      const c = scene.check;
      if(!c || !choice || choice.idle || (c.result!=="fail" && c.result!=="partial")) return null;
      const names = [...new Set([...(state.present||[]),...(scene.present||[]),...(scene.entered||[])])]
        .filter(n=>n && n!==playerName);
      const speakers = (scene.lines||[]).map(l=>l && l.who).filter(n=>n && n!==playerName);
      const who = (choice.target && names.includes(choice.target)) ? choice.target
        : speakers.find(n=>names.includes(n)) || names[0] || null;
      return {result:c.result,who,note:String(c.note||"").slice(0,60),hit:0};
    })();
    const entries = due.map(c=>({t:"sys",text:"局势变化 · "+c.followUp}));
    // 属性/技能判定的可见结果
    if(scene.check){
      const val = attrValueOf(state, scene.check);
      const tier = val==null ? "" : (val>=70?"高":val>=40?"中":"低");
      const rl = {success:"成功",partial:"勉强成功",fail:"失败"}[scene.check.result] || "";
      const label = scene.check.kind==="skill" ? "技能·"+scene.check.name : "属性·"+scene.check.name;
      entries.push({t:"check", text:"判定 · "+label+(val!=null?" "+val+"（"+tier+"）":"")+" → "+rl+(scene.check.note?"："+scene.check.note:"")});
    }
    const afterglowOnly = state.afterglowTurn && !state.intimateActive && /余韵|事后|结束/.test(scene.intimacyStage||"");
    if(!afterglowOnly && (scene.intimacyStage || (scene.effects && Number.isFinite(scene.effects.desire) && scene.effects.desire <= -30) || state.intimateActive)){
      const st = scene.intimacyStage || (state.intimateActive ? "进行中" : "结束");
      const released = (Number.isFinite((scene.effects||{}).desire) && scene.effects.desire <= -30) || /高潮|释放|射精|结束|余韵/.test(st);
      entries.push({t:"sys",text:"亲密 · "+st+(released ? " · 已释放" : " · 尚未释放")});
    }
    if(state.afterglowTurn) delete state.afterglowTurn;
    // 到期的报警：提示执法力量可能找上门
    for(const r of (state.reports||[])){
      if(r.status!=="closed" && r.status!=="suppressed" && Number.isFinite(r.due) && r.due===nextTurn){
        entries.push({t:"sys",text:"街面上多了几个陌生面孔，像是循着风声在打听你。"});
      }
    }
    if(speech) entries.push(speech);
    else if(choice) entries.push({t:"action",text:"你选择了："+choice.text});
    // 独处硬约束：不在场者的台词/动作直接丢弃，避免「门外的人」仍参与剧情
    if(soloActive){
      const presentNow = new Set((Array.isArray(state.present)?state.present:[]).filter(n=>n && !(scene.left||[]).includes(n)));
      if((state.soloClear||0) >= nextTurn) presentNow.clear();
      const knownNames = new Set([...(state.cast||[]).map(c=>c&&c.name).filter(Boolean), ...(scene.characters||[]).map(c=>c&&c.name).filter(Boolean)]);
      const filtered = [];
      scene.lines = (scene.lines||[]).filter(line=>{
        if(line.t!=="say" && line.t!=="npc-action") return true;
        if(!line.who || presentNow.has(line.who) || !knownNames.has(line.who)) return true;
        filtered.push(line.who);
        return false;
      });
      if(filtered.length) state.filteredSpeakers = [...new Set(filtered)];
    }
    entries.push(...scene.lines);
    if(dailyPace && choice && scene.consequence && !state.consequences.some(c=>c.fact===scene.consequence.fact)){
      entries.push({t:"sys",text:"本轮影响 · "+scene.consequence.fact});
    }
    entries.push(...money.entries);
    if(choice){
      const effects = {...scene.effects};
      delete effects.coin;
      if(!scene.reputation) delete effects.rep;
      const trainingAttempt = /练|切磋|修习|修炼|运功|突破|瓶颈/.test(choice.text||"");
      if(wuxia){
        if(effects.combatPower>0) delete effects.combatPower;
        if(effects.skills) effects.skills = Object.fromEntries(Object.entries(effects.skills)
          .filter(([key,delta])=>delta<=0 || !Object.values(MARTIAL_PATHS).includes(key)));
        if(trainingAttempt && effects.attrs) effects.attrs = Object.fromEntries(Object.entries(effects.attrs)
          .filter(([key,delta])=>delta<=0 || !["physique","agility","willpower"].includes(key)));
      }
      // 交锋的体力损失已写入 scene.exertion，由本幕体力结算统一扣；
      // 结算未生效（如本幕不推进时间）时才退回按交锋结果直接扣一次，避免重复扣血
      if(localCombat && Number.isFinite(localCombat.hpLoss) && !calculatedStamina && localCombat.hpLoss>0){
        const sceneLoss = Number.isFinite(effects.hp) && effects.hp<0 ? Math.abs(effects.hp) : 0;
        effects.hp = -Math.max(localCombat.hpLoss,sceneLoss);
      }
      const attrBefore = {};
      for(const key of Object.keys(ATTR_LABELS)) attrBefore[key] = state[key]??50;
      applyEffect(state,effects,calculatedStamina);
      // 判定失败/勉强成功：若模型没有在 effects.aff 里体现，程序补一点信任损失，避免失败毫无代价
      if(checkSetback && checkSetback.who){
        const who = checkSetback.who;
        const already = Number.isFinite(scene.effects?.aff?.[who]) && scene.effects.aff[who] <= -3;
        if(!already){
          const hit = checkSetback.result==="fail" ? -5 : -2;
          state.aff = state.aff || {};
          state.aff[who] = clamp((state.aff[who]||0) + hit, -100, 100);
          checkSetback.hit = hit;
        }
      }
      if(checkSetback){
        const who = checkSetback.who;
        const tail = checkSetback.hit ? "（好感 "+checkSetback.hit+"）" : "";
        entries.push({t:"check",text: who
          ? (checkSetback.result==="fail"
            ? "试探落空 · "+who+" 起了戒心"+tail
            : "勉强过关 · "+who+" 留了个心眼"+tail)
          : "线索断在这里 · 这次尝试没拿到想要的，得换个办法。"});
      }
      if(localCombat && state.combat) state.combat = {...state.combat, energy:localCombat.energyAfter};
      if(localCombat){
        entries.push({t:"sys",text:"交锋判定 · "+localCombat.outcome+" · "+localCombat.attrLabel+" "+localCombat.attrValue
          +" · "+localCombat.skillName+" "+localCombat.skillValue
          +(localCombat.stance ? " · "+({evade:"游走闪避",guard:"格挡招架",ambush:"偷袭先手",allout:"全力猛攻"}[localCombat.stance]||"") : "")
          +(localCombat.drained ? " · 内力将尽" : "")+(localCombat.lowHp ? " · 重伤在身" : "")
          +" · 体力 -"+localCombat.hpLoss});
      }
      const trainGain = !wuxia && localTrainingGain(state,choice.text,attrBefore);
      if(wuxia){
        for(const text of settleMartialTraining(state,scene,choice,environment.minute-scene.fromMinute,S.hp)){
          entries.push({t:"sys",text});
        }
      }
      for(const [key,label] of Object.entries(ATTR_LABELS)){
        const delta = (state[key]??50) - attrBefore[key];
        if(delta) entries.push({t:"sys",text:"属性 · "+label+" "+(delta>0?"+":"")+delta+" → "+(state[key]??50)});
      }
      if(trainGain){
        entries.push({t:"sys",text:"属性 · "+ATTR_LABELS[trainGain.key]+" +1 → "+(state[trainGain.key]??50)+"（长期练习）"});
      }
      if(scene.staminaReason && state.hp!==S.hp){
        entries.push({t:"sys",text:"体力变化 · "+scene.staminaReason});
      }
      // 五维欲望：暧昧互动会抬升「性」欲望；对应资源获得会降低相应欲望
      {
        const dv = ensureDrives(state);
        const _eff = scene.effects || {};
        const affSum = Object.values(_eff.aff||{}).filter(v=>v>0).reduce((a,b)=>a+b,0);
        const intSum = Object.values(_eff.intimacy||{}).filter(v=>v>0).reduce((a,b)=>a+b,0);
        if(!Number.isFinite(_eff.desire) && (affSum||intSum)){
          dv.sex = clamp(dv.sex + Math.min(20, Math.round(intSum*0.8 + affSum*0.4)), 0, 100);
        }
        const earned = (state.moneyTotals?.income||0)-(S.moneyTotals?.income||0);
        if(earned>0) dv.money = clamp(dv.money - Math.min(20,2+Math.round(earned/20)),0,100);
        if(Number.isFinite(_eff.rep) && _eff.rep>0) dv.power = clamp(dv.power - Math.min(20, _eff.rep*2),0,100);
        if(affSum||intSum) dv.people = clamp(dv.people - Math.min(20, Math.round(affSum*0.8+intSum)),0,100);
        if(scene.items && scene.items.length)         dv.items = clamp(dv.items - Math.min(20, scene.items.length*6),0,100);
        state.desire = dv.sex;
      }
      // 扫兴判定：暧昧气氛中，一句冒犯/恶心的话或一个动作，可让欲望瞬间归零
      {
        const txt = (choice && choice.text) || "";
        const intimateCtx = (state.desires && state.desires.sex >= 20) || (state.cast||[]).some(c=>c.adult!==false && (c.desire||0)>=25);
        const turnOff = intimateCtx && /口臭|酒气|酸臭|发臭|恶臭|腐臭|尸臭|血污|恶心|呕吐|吐了|猥琐|下流|龌龊|强拽|硬拽|动手动脚|冒犯|羞辱|辱骂|滚开|打嗝|放屁|脏手/.test(txt);
        const aiDropped = Number.isFinite((scene.effects||{}).desire) && scene.effects.desire <= -20;
        if(turnOff && !aiDropped){
          state.desire = clamp((state.desire||0) - 60, 0, 100);
          ensureDrives(state).sex = state.desire;
          for(const nm of (state.present||[])){
            const c = (state.cast||[]).find(x=>x.name===nm);
            if(!c || c.adult===false) continue;
            const nd = clamp((c.desire||0) - 60, 0, 100);
            c.desire = nd;
            const sc = (scene.characters||[]).find(ch=>ch && ch.name===nm);
            if(sc) sc.desire = nd;
            else { scene.characters = scene.characters||[]; scene.characters.push({name:nm, desire:nd}); }
          }
          entries.push({t:"sys",text:"气氛瞬间冷了下来，先前的暧昧荡然无存。"});
        }
      }
      // 点燃判定：暧昧气氛中，一次大胆靠近/一句低语/一件旧物，可让欲望瞬间暴涨
      {
        const txt = (choice && choice.text) || "";
        const intimateCtx = (state.desires && state.desires.sex >= 18) || (state.cast||[]).some(c=>c.adult!==false && (c.desire||0)>=22);
        const turnOff = /口臭|酒气|酸臭|发臭|恶臭|腐臭|尸臭|血污|恶心|呕吐|吐了|猥琐|下流|龌龊|强拽|硬拽|动手动脚|冒犯|羞辱|辱骂|滚开|打嗝|放屁|脏手/.test(txt);
        const charge = intimateCtx && !turnOff && /吻|亲吻|耳语|贴着耳朵|脖颈|锁骨|腰肢|腰间|腿根|肌肤|赤裸|宽衣|解开衣|贴紧|贴身|抱住|搂住|撩|挑逗|勾引|按住|咬|舔|发簪|信物|肩带|肚兜|呼吸交缠/.test(txt);
        const strongGiven = Number.isFinite((scene.effects||{}).desire) && scene.effects.desire >= 15;
        if(charge && !strongGiven){
          state.desire = clamp((state.desire||0) + 40, 0, 100);
          ensureDrives(state).sex = state.desire;
          // 只点燃玩家明确指向的人；在场的旁人最多被气氛带起一点，不该全体暴涨
          const eff = scene.effects || {};
          const targets = new Set([...Object.keys(eff.aff||{}), ...Object.keys(eff.intimacy||{})]
            .filter(n=>n && (state.present||[]).includes(n)));
          for(const nm of (state.present||[])) if(nm && txt.includes(nm)) targets.add(nm);
          if(!targets.size){
            const scored = (state.present||[]).map(nm=>{
              const c = (state.cast||[]).find(x=>x.name===nm);
              if(!c || c.adult===false) return null;
              return {nm, score:(state.aff?.[nm]||0)+(state.intimacy?.[nm]||0)+(c.desire||0)*0.5};
            }).filter(Boolean).sort((a,b)=>b.score-a.score);
            if(scored[0]) targets.add(scored[0].nm);
          }
          for(const nm of (state.present||[])){
            const c = (state.cast||[]).find(x=>x.name===nm);
            if(!c || c.adult===false) continue;
            const nd = clamp((c.desire||0) + (targets.has(nm) ? 40 : 5), 0, 100);
            c.desire = nd;
            const sc = (scene.characters||[]).find(ch=>ch && ch.name===nm);
            if(sc) sc.desire = nd;
            else { scene.characters = scene.characters||[]; scene.characters.push({name:nm, desire:nd}); }
          }
          entries.push({t:"sys",text:targets.size ? "你们之间的空气陡然热了起来。" : "空气陡然热了起来，欲望被一下子点燃。"});
        }
      }
    }
    // 独处硬约束：不让人新进场；明确要求独处时，在场者识趣离开
    if(soloActive){
      scene.entered = [];
      if((state.soloClear||0) >= nextTurn){
        const leaving = [...new Set((state.present||[]).filter(Boolean))];
        if(leaving.length) scene.left = [...new Set([...(scene.left||[]), ...leaving])];
      }
      if(Array.isArray(scene.present) && Array.isArray(state.present)){
        const prevPresent = new Set(state.present);
        scene.present = scene.present.filter(n=>prevPresent.has(n));
      }
    }
    if(playerName){
      if(Array.isArray(scene.present)) scene.present = scene.present.filter(n=>n!==playerName);
      scene.entered = (scene.entered||[]).filter(n=>n!==playerName);
      scene.left = (scene.left||[]).filter(n=>n!==playerName);
      scene.lines = (scene.lines||[]).filter(l=>l && l.who!==playerName);
    }
    // 进出场：日志提示
    for(const name of (scene.left||[])){
      entries.push({t:"sys",text:name+" 起身离开了这里。"});
    }
    for(const name of (scene.entered||[])){
      entries.push({t:"sys",text:name+" 出现在这里。"});
    }
    // 在场名单：合并 entered、剔除离场/死亡、去重并限员，避免前后矛盾
    const leftSet = new Set(scene.left||[]);
    const locationChanged = state.environment?.place && environment.place && state.environment.place!==environment.place;
    const basePresent = Array.isArray(scene.present) ? scene.present
      : !locationChanged && Array.isArray(state.present) ? state.present : [];
    const deadSet = new Set((state.cast||[]).filter(c=>c && c.dead).map(c=>c.name));
    const cleanPresent = [...new Set([...basePresent, ...(scene.entered||[])])]
      .filter(n=>n && n!==playerName && !leftSet.has(n) && !deadSet.has(n))
      .slice(0,8);
    // 知识边界：不在场的人不能直接获得本幕的私密信息或亲密进展；托人带话/送信是唯一例外
    const presentSet = new Set(cleanPresent||[]);
    const sceneText = (scene.lines||[]).map(l=>l.text||"").join("\n") + " " + (scene.advance||"") + " " + (scene.summary||"");
    const hasMessenger = /(托人|带话|送信|捎信|传话|差人|打发人|派人)/.test(sceneText);
    const castUpdates = (scene.characters||[]).filter(ch=>ch && ch.name && ch.name!==playerName).map(ch=>{
      const copy = {...ch};
      if(!presentSet.has(ch.name) && !hasMessenger){
        delete copy.knows;
        delete copy.intimacy;
      }
      if(copy.shift && !scene.lines.some(l=>l.who===ch.name || (l.t==="narr" && l.text.includes(ch.name)))
        && ![scene.advance,scene.consequence?.fact].some(text=>text?.includes(ch.name))) delete copy.shift;
      return copy;
    });
    let nextCast = updateCast(state.cast, castUpdates, scene.lines)
      .filter(c=>c && c.name!==playerName)
      .map(c=>ensureNpcDefaults(c,state));
    // 亲身经历自动记入人物记忆：避免 NPC 在几幕后忘记一起做过的事
    const witnesses = [...new Set([...(state.present||[]),...cleanPresent,...(scene.entered||[])])];
    const observedFacts = witnessedStoryFacts(scene,choice,witnesses,playerName);
    for(const c of nextCast){
      if(c.dead) continue;
      const notes = observedFacts.filter(f=>f.knownBy.includes(c.name)).map(f=>({turn:nextTurn,text:f.text,observed:true}));
      if(notes.length) c.memories = [...(c.memories||[]).filter(m=>m.observed && !notes.some(n=>n.text===m.text)),...notes].slice(-8);
    }
    const lifeDate = formatClock({...state,environment});
    let lifeEvents = recordLifeEvents({...state,cast:nextCast},scene,lifeDate,nextTurn,choice);
    nextCast = applyLifeEvents(nextCast,lifeEvents.filter(e=>e.kind==="death" || e.turn===nextTurn));
    // 主动者冷却：记录本幕实际主动出手的人（玩家没点名），让后续随机提示避开 TA
    if(!driveNudge){
      const proactiveRe = /(走近|靠近|凑近|凑到.{0,6}(耳边|身侧|跟前)|拉住|抓住|抱住|搂住|亲吻|吻上|吻住|抚摸|牵住|握住|挡在|拦住|邀请|找上门|闯进|贴上|靠过来|凑上来|伸手.{0,6}(搂|抱|拉|牵|摸))/;
      const firstAct = (scene.lines||[]).find(line=> line.t==="npc-action" && line.who && presentSet.has(line.who)
        && !playerAction.includes(line.who) && proactiveRe.test(line.text||""));
      if(firstAct){
        state.lastInitTurn = nextTurn;
        state.lastAnyInitTurn = nextTurn;
        state.initiator = firstAct.who;
      }
    }
    if(state.npcDesireInit){
      for(const nm in state.npcDesireInit){
        const c = nextCast.find(x=>x.name===nm);
        if(c && c.desire===undefined) c.desire = state.npcDesireInit[nm];
      }
      delete state.npcDesireInit;
    }
    // 同步 AI 给出的绝对亲密度到关系表，避免 relations 基线一直覆盖后续变化
    // （若本幕已用 effects.intimacy 给了增量，则以增量为准，不被档案里的绝对值覆盖）
    {
      const effInt = (scene.effects||{}).intimacy || {};
      for(const ch of (scene.characters||[])){
        if(ch && ch.name && presentSet.has(ch.name) && Number.isFinite(ch.intimacy) && ch.adult!==false && !(Number.isFinite(ch.age)&&ch.age<18) && !Number.isFinite(effInt[ch.name])){
          state.intimacy[ch.name] = clamp(ch.intimacy, 0, 100);
        }
      }
    }
    // NPC economy settles in settleEconomy (daily/weekly/monthly/asset output).

    // NPC 欲望兜底：暧昧/亲密互动会抬升在场成年 NPC 的欲望（AI 未显式给 desire 时）
    {
      const _eff = scene.effects || {};
      const names = new Set([...Object.keys(_eff.aff||{}), ...Object.keys(_eff.intimacy||{})]);
      for(const nm of names){
        const aff = _eff.aff?.[nm]||0, intim = _eff.intimacy?.[nm]||0;
        if(aff<=0 && intim<=0) continue;
        if(!presentSet.has(nm)) continue;
        const c = nextCast.find(x=>x.name===nm);
        if(!c || c.adult===false || c.dead) continue;
        const explicit = (scene.characters||[]).some(ch=>ch && ch.name===nm && ch.desire!==undefined);
        if(explicit) continue;
        c.desire = clamp((c.desire||0) + Math.max(1, Math.round(intim*1.5 + aff*0.6)), 0, 100);
      }
    }

    // ===== NPC 属性硬机制 =====
    const outSet = new Set();
    const deathSet = new Set();
    for(const c of nextCast){
      if(!c || !c.name) continue;
      if(c.dead){ outSet.add(c.name); deathSet.add(c.name); continue; }
      // 伤势：重伤会拖垮，久不处理会恶化甚至死亡
      if(Number.isFinite(c.hp)){
        if(c.hp<=0){ c.dead = true; outSet.add(c.name); deathSet.add(c.name); entries.push({t:"sys",text:c.name+" 再也支撑不住，倒下了。"}); if(!state.anchors) state.anchors=[]; if(!state.anchors.includes(c.name+" 已死亡，不可再出场")) state.anchors.push(c.name+" 已死亡，不可再出场"); continue; }
        if(c.hp<=25){
          c.woundedTurns = (c.woundedTurns||0)+1;
          if(c.woundedTurns>=3){
            c.hp = Math.max(0, c.hp-6); c.woundedTurns = 0;
            if(c.hp<=0){ c.dead = true; outSet.add(c.name); deathSet.add(c.name); entries.push({t:"sys",text:c.name+" 的伤一直没处理，终究没能撑过去。"}); if(!state.anchors) state.anchors=[]; if(!state.anchors.includes(c.name+" 已死亡，不可再出场")) state.anchors.push(c.name+" 已死亡，不可再出场"); }
            else entries.push({t:"sys",text:c.name+" 的伤一直没好，气息越来越弱。"});
          }
        } else c.woundedTurns = 0;
      }
      // 敌对者出卖：玩家有通缉在身时，长期敌视你的人可能把你的行踪卖出去
      const cAff = state.aff?.[c.name];
      if(Number.isFinite(cAff) && cAff<=0 && /敌|恨|仇|不满|戒备|提防/.test(c.attitude||"") && (state.wanted||0)>=15){
        c.betrayCounter = (c.betrayCounter||0)+1;
        if(c.betrayCounter>=5){
          c.betrayCounter = 0;
          state.wanted = clamp((state.wanted||0)+8,0,100);
          entries.push({t:"sys",text:c.name+" 暗中递了话，把你的行踪卖了出去。"});
        }
      } else c.betrayCounter = 0;
      // 重伤到 12 以下：退场休养
      if(Number.isFinite(c.hp) && c.hp<=12) outSet.add(c.name);
    }
    lifeEvents = recordLifeEvents({...state,cast:nextCast,lifeEvents},{},lifeDate,nextTurn);
    const lifeDeaths = deadCharacterNames({cast:nextCast,lifeEvents});
    const finalPresent = cleanPresent.filter(n=>!outSet.has(n) && !lifeDeaths.has(n));
    const investigation = settleInvestigation(state,scene,inquiry,environment,finalPresent,nextTurn);
    entries.push(...investigation.notices.map(text=>({t:"sys",text})));
    const genreProgress = settleGenreGame(state,scene,choice,genreMove,environment,finalPresent,nextTurn);
    entries.push(...genreProgress.notices.map(text=>({t:"sys",text})));
    for(const name of genreProgress.treatments||[]){
      const patient=nextCast.find(c=>c.name===name && !c.dead);
      if(patient && Number.isFinite(patient.hp)) patient.hp=Math.min(100,patient.hp+8);
    }
    const reactions = recordLifeReactions(state,scene,lifeEvents,nextCast,finalPresent,lifeDate,nextTurn,choice,soloActive);
    entries.push(...reactions.lines);
    for(const nm of outSet){
      if(!deathSet.has(nm) && Array.isArray(cleanPresent) && cleanPresent.includes(nm)) entries.push({t:"sys",text:nm+" 伤重难支，退了下去。"});
    }
    if(state.infiniteMode && !(choice && choice.endingRequest) && scene.ending){
      entries.push({t:"sys",text:"主线告一段落，但故事还在继续。"});
      if(scene.ending.text) entries.push({t:"narr",text:scene.ending.text});
      scene.ending = null;
      if(!scene.choices.length) scene.choices=[{text:"继续"}];
    }
    {
      const onStage = new Set(finalPresent||[]);
      const spoke = new Set((scene.lines||[]).map(l=>l && l.who).filter(Boolean));
      for(const c of nextCast){
        if(!c || !c.name) continue;
        const tieText = [c.tie,c.relation,c.attitude,c.identity,c.goal,c.agenda].filter(Boolean).join(" ");
        const inQuest = (state.quests||[]).some(q=>q && !q.done && (String(q.title||"").includes(c.name) || String(q.desc||"").includes(c.name)));
        const inLoop = (state.openLoops||[]).some(l=>l && (l.participants||[]).includes(c.name));
        const bonded = c.core===true || c.antagonist===true || c.nemesis===true || c.recurring===true
          || (state.aff?.[c.name]||0)>=30 || (state.aff?.[c.name]||0)<=-10 || (state.intimacy?.[c.name]||0)>=15 || inQuest || inLoop
          || (state.anchors||[]).some(a=>String(a).includes(c.name))
          || /(宿敌|死对头|仇敌|宿怨|长期对手|长期盟友|家人|伴侣|未婚|夫|妻|父|母|子|女|兄弟|姐妹|债主|上司|师父|徒弟)/.test(tieText);
        const on = onStage.has(c.name) || spoke.has(c.name);
        if(on){
          c.lastSeenTurn = nextTurn;
          c.lastSeenPlace = onStage.has(c.name) ? environment.place||state.environment?.place : state.environment?.place||environment.place;
          c.offstage = false;
          if(bonded) c.transient = false;
        }else{
          if(!Number.isFinite(c.lastSeenTurn)) c.lastSeenTurn = state.turn || 0;
          if(c.transient && !bonded){
            c.offstage = true;
          }else if(!bonded && nextTurn - c.lastSeenTurn >= 4){
            c.offstage = true;
          }else if(bonded){
            c.offstage = false;
          }
        }
      }
    }
    const previous = origin;
    const place = marketPlace(state,scene);
    const previousPlace = marketPlace(state);
    const market = updateMarket(state,scene,place,finalPresent);
    if(isTwoDayTrial(state)){
      for(const [minute,note] of TRIAL_MILESTONES){
        if(state.environment.minute<minute && environment.minute>=minute) entries.push({t:"sys",text:note});
      }
      if(place===TWO_DAY_TRIAL.place && !trialDeskOpen(environment.minute)){
        market.offers = market.offers.filter(offer=>offer.seller!=="梁掌柜");
      }
    }
    // 无限模式：AI 仍可写“收束感”，但不会真正结束故事
    if(state.infiniteMode && !(choice && choice.endingRequest) && scene.ending){
      if(scene.ending.text) entries.push({t:"narr",text:scene.ending.text});
      entries.push({t:"sys",text:"这一段落告一段落，但故事还在继续。"});
      scene.ending = null;
      if(!scene.choices || !scene.choices.length) scene.choices = [{text:"继续"}];
    }
    // 篇章与未了事项账本
    let loopSeq = state.loopSeq || 0;
    let openLoops = (state.openLoops||[]).map(l=>({...l}));
    let loopHistory = [...(state.loopHistory||[])];
    const doneLoops = new Set(scene.loopsDone||[]);
    if(doneLoops.size){
      openLoops = openLoops.filter(l=>{
        if(!l.playerPromise && (doneLoops.has(l.id) || doneLoops.has(l.text))){
          if(l.npcAction && !scene.lines.some(line=>line.who===l.npcAction.who) && l.dueMinute>environment.minute) return true;
          loopHistory.push({...l,resolvedTurn:nextTurn,...(l.npcAction ? {outcome:scene.advance||l.npcAction.who+" 已处理「"+l.text+"」"} : {})});
          return false;
        }
        return true;
      });
    }
    // 玩家声明已了结：把唯一最匹配的那条未了事项当场收回，避免它之后继续被提起
    if(resolvedClaim && typeof claimMatchScore==="function"){
      const ranked = openLoops.filter(l=>l && !l.playerPromise)
        .map(l=>({l,score:claimMatchScore(resolvedClaim,String(l.text||""))}))
        .filter(row=>row.score>0).sort((a,b)=>b.score-a.score);
      if(ranked.length && (ranked.length===1 || ranked[0].score>ranked[1].score)){
        const target = ranked[0].l;
        loopHistory.push({...target,resolvedTurn:nextTurn,outcome:"玩家已了结："+resolvedClaim,
          knownBy:[...new Set([...(target.knownBy||[]),"玩家",...claimKnownBy])]});
        openLoops = openLoops.filter(l=>l!==target);
      }
    }
    const livingNames = new Set(nextCast.filter(c=>!c.dead).map(c=>c.name));
    for(const add of (scene.loopsAdd||[])){
      const p = add.playerPromise;
      if(p && (!(choice && !choice.idle && /答应|保证|承诺|我会|我负责|我愿意|交给我|包在我身上|我接下/.test(choice.text||""))
        || !p.who || !p.action || !p.kept || !p.missed || !livingNames.has(p.who)
        || !witnesses.includes(p.who) || !scene.lines.some(line=>line.who===p.who)
        || (add.dueMinute ?? (environment.minute+(add.dueInMinutes||0)))<=environment.minute)) continue;
      if(add.npcAction && add.id && loopHistory.some(l=>l.id===add.id && l.npcAction)) continue;
      if(p && (loopHistory.some(l=>l.playerPromise && l.id===add.id)
        || openLoops.some(l=>l.playerPromise?.who===p.who && l.playerPromise?.action===p.action))) continue;
      if(add.npcAction && (!livingNames.has(add.npcAction.who) || (add.dueMinute===null && add.dueInMinutes===null))) continue;
      const existing = openLoops.find(l=>l && ((add.id && l.id===add.id) || (add.text && l.text===add.text)));
      const knownBy = (add.knownBy||[]).map(n=>n==="你" || n===playerName ? "玩家" : n)
        .filter(n=>n==="玩家" || witnesses.includes(n));
      if(existing){
        if(existing.playerPromise || p) continue;
        existing.text = add.text || existing.text;
        existing.kind = add.kind || existing.kind;
        existing.dueTurn = add.dueTurn || existing.dueTurn;
        existing.dueMinute = existing.npcAction ? existing.dueMinute
          : add.dueMinute ?? (add.dueInMinutes!==null ? environment.minute+add.dueInMinutes : existing.dueMinute);
        if(add.participants && add.participants.length) existing.participants = add.participants;
        if(add.npcAction && !existing.npcAction) existing.npcAction = add.npcAction;
        if(knownBy.length) existing.knownBy = [...new Set([...(existing.knownBy||[]),...knownBy])];
      }else{
        const id = add.id || ("L"+(++loopSeq));
        const dueMinute = add.dueMinute ?? (add.dueInMinutes!==null ? environment.minute+add.dueInMinutes : null);
        openLoops.push({id,text:add.text||add.id||"未命名事项",kind:add.kind||"thread",
          createdTurn:nextTurn,createdMinute:Number.isFinite(environment?.minute)?environment.minute:null,
          dueTurn:add.dueTurn||null,dueMinute,participants:add.participants||[],npcAction:p ? null : add.npcAction,
          ...(p ? {playerPromise:p} : {}),knownBy:p ? [...new Set(["玩家",p.who,...knownBy])] : knownBy});
      }
    }
    // 判定失败/勉强成功：写进未了事项，之后 NPC 会更戒备，玩家得换办法或补代价
    if(checkSetback){
      const who = checkSetback.who;
      const text = checkSetback.result==="fail"
        ? (who ? "试探失败：「"+who+"」已起戒心，之后要多花代价才肯再开口。" : "线索断了：这次尝试没拿到想要的东西，得换个方向。")
        : (who ? "试探只算勉强：「"+who+"」留了心眼，没有把话说完。" : "只摸到一点边：这次尝试没得到完整结果。");
      if(!openLoops.some(l=>l && l.text===text)){
        openLoops.push({id:"L"+(++loopSeq),text,kind:"setback",createdTurn:nextTurn,
          createdMinute:Number.isFinite(environment?.minute)?environment.minute:null,
          dueTurn:null,dueMinute:null,participants:who?[who]:[],npcAction:null,
          knownBy:who?["玩家",who]:["玩家"]});
      }
    }
    settlePlayerPromises(state,scene,choice,environment,nextCast,openLoops,loopHistory,nextTurn,entries);
    for(const l of pendingNpcActions(openLoops,nextCast,environment.minute)){
      if(!livingNames.has(l.npcAction.who)) continue;
      const outcome = l.npcAction.who+" · "+l.npcAction.text;
      loopHistory.push({...l,outcome,resolvedTurn:nextTurn,resolvedMinute:l.dueMinute});
      entries.push({t:"sys",text:"承诺进展 · "+outcome});
      openLoops = openLoops.filter(other=>other!==l);
    }
    const recentClosed = loopHistory.filter(l=>!isStoryCommitment(l)).slice(-12);
    loopHistory = loopHistory.filter(l=>isStoryCommitment(l) || recentClosed.includes(l));
    const ordinary = openLoops.filter(l=>!isStoryCommitment(l)).slice(-8);
    openLoops = openLoops.filter(l=>isStoryCommitment(l) || ordinary.includes(l));
    const chapterProgress = settleChapter(state,scene,loopHistory,environment,nextTurn,
      choice && (choice.text || choice.speech || ""));
    const chapterNow = chapterProgress.chapter;
    if(chapterNow?.goalChangedTurn===nextTurn && chapterNow.previousGoal){
      entries.push({t:"sys",text:"篇章目标改写 · 「"+String(chapterNow.previousGoal).slice(0,80)+"」→「"+String(chapterNow.goal||"").slice(0,80)+"」"});
    }
    // 每个目标版本只清理一次旧线索；旧存档里遗留的旧承诺也会在下一幕被收回
    if(chapterNow?.previousGoal && chapterNow.goalCleanupTurn!==chapterNow.goalChangedTurn){
      const pruned = typeof resolveGoalBoundLoops==="function"
        ? resolveGoalBoundLoops(openLoops,loopHistory,chapterNow,nextTurn,environment.minute) : null;
      chapterNow.goalCleanupTurn = chapterNow.goalChangedTurn;
      if(pruned){
        openLoops = pruned.open;
        loopHistory = pruned.history;
        for(const item of pruned.closed) entries.push({t:"sys",text:"随旧目标收回 · "+String(item.text||"").slice(0,80)});
      }
    }
    const closedChapter = (chapterProgress.chapterHistory||[]).slice((state.chapterHistory||[]).length)[0];
    if(closedChapter?.outcome) entries.push({t:"sys",text:"篇章收束 · "+String(closedChapter.title||"").slice(0,40)+" · "+String(closedChapter.outcome).slice(0,120)});
    if(!environment.place){
      environment.place = String(scene.scene || chapterProgress.chapter?.title || state.scene || "").slice(0,100);
    }
    const npcPlans = settleNpcPlans(state,scene,environment,nextCast,finalPresent,loopHistory,choice,nextTurn);
    entries.push(...npcPlans.entries);
    observedFacts.push(...npcPlans.facts);
    const locations = updateLocationProfiles(state,environment.place,scene.environment.location);
    const canOffer = choice=>promiseAllowsChoice(choice,loopHistory) && npcPlanAllowsChoice(choice,npcPlans.plans);
    if(!scene.ending) scene.choices = completeSceneChoices(scene.choices.filter(canOffer),
      scene.lines,finalPresent,environment.place,
      {...state.plot,...Object.fromEntries(Object.entries(scene.plot).filter(([,text])=>text))})
      .filter(canOffer).slice(0,fullContext ? 4 : 3);
    const decisionLine = scene.lines.at(-1);
    const decisionPoint = scene.dailyDecision;
    const decisionVisible = decisionPoint && (decisionPoint.beat===0
      ? decisionLine?.t==="narr" : decisionLine?.beat===decisionPoint.beat);
    const nextState = {
      ...state,
      ...market,
      turn:nextTurn,
      cutScene:false,
      holdTimeTurn:0,
      idleCount: idle ? Math.min(6, (state.idleCount||0)+1) : Math.max(0, (state.idleCount||0)-1),
      scene:scene.scene||state.scene,
      summary:scene.summary||state.summary,
      environment,
      dailyDecision:dailyPace && !scene.ending
        ? (decisionVisible
          ? {kind:decisionPoint.kind,text:decisionLine.text.slice(0,240)}
          : scene.consequence || timeSkip ? null : state.dailyDecision || null)
        : null,
      reputationScope:scene.community || (place===previousPlace ? state.reputationScope : "")
        || place || scene.reputation?.scope || "",
      cast:nextCast,
      lifeEvents,
      lifeReactions:reactions.records,
      investigation:investigation.book,
      genreGame:genreProgress.game,
      present:finalPresent,
      plot:{...state.plot,...Object.fromEntries(Object.entries(scene.plot).filter(([,text])=>text))},
      ...chapterProgress, locations, openLoops, loopSeq, loopHistory,
      npcPlans:npcPlans.plans,
      sceneHistory:[...(state.sceneHistory||[]),{
        turn:nextTurn,
        place:environment.place||state.environment?.place||"",
        scene:scene.scene||state.scene||"",
        advance:scene.advance||"",
        summary:scene.summary||"",
        goal:scene.plot?.goal || state.plot?.goal || "",
        motifs:typeof sceneMotifs==="function" ? sceneMotifs(scene) : [],
        narration:(scene.lines||[]).filter(l=>l.t==="narr").map(l=>l.text||"").join(" ").slice(0,120)
      }].slice(-8),
      consequences:advanceConsequences(state.consequences,scene,nextTurn,choice,environment.minute),
      memory:[...new Set([...state.memory,...scene.memory])].slice(-40),
      history:[...prior,action,{role:"assistant",content:raw}].slice(-16),
      choices:scene.choices,
      ending:scene.ending,
      worldWindow: state.world ? advanceWorldWindow(state, nextTurn, scene.worldProgress) : (state.worldWindow||0),
      lastProse: Boolean(scene.prose),
      llmMetrics:[...(state.llmMetrics||[]), ...((typeof window!=="undefined" && Array.isArray(window.__llmMetrics))
        ? window.__llmMetrics.filter(metric=>metric.turn===nextTurn) : [])].slice(-20),
      turnStats:[...(state.turnStats||[]), {turn:nextTurn, at:Date.now(), ms:Math.round(performance.now()-turnStartedAt), attempts, identityRetries, jsonErrors, contextTokens, retryReasons:retryReasons.slice(-4).map(r=>({attempt:r.attempt,kind:r.kind,detail:String(r.detail||"").slice(0,120)})), advanceChars:String(scene.advance||"").length, choices:(scene.choices||[]).length, beats:(scene.lines||[]).length, elapsedMinutes:Number(scene.environment?.elapsedMinutes)||0, pace:dailyPace ? (dailyPace.condensed ? "fast" : "detailed") : "auto"}].slice(-40),
      stallCount: stalled ? Math.min(6, (state.stallCount||0) + 1) : 0,
      reports:(()=>{
        const prev = (state.reports||[]).map(r=>{
          if(r.status!=="closed" && r.status!=="suppressed" && Number.isFinite(r.due) && r.due<=nextTurn){
            return {...r, status:"closed"};
          }
          return r;
        });
        if(!scene.reports.length) return prev;
        const fresh = scene.reports.map(r=>({
          ...r,
          turn:nextTurn,
          due:r.status==="已受理" ? nextTurn+2 : null,   // 已受理的报警 2 幕后可能引来巡捕
          place:r.place || (state.environment&&state.environment.place) || "",
          delayMinutes:r.delayMinutes ?? (r.status==="已受理" ? 30 : null)
        }));
        return [...prev,...fresh].slice(-12);
      })()
    };
    // 在场或本幕进场但尚无档案的人，自动补一份最简档案
    const needsFile = new Set([...(Array.isArray(nextState.present)?nextState.present:[]),...(scene.entered||[])]);
    for(const name of needsFile){
      if(!name) continue;
      if(nextState.cast.some(c=>c.name===name)) continue;
      nextState.cast.push(ensureNpcDefaults({name,background:"",goal:"",attitude:"",knows:"",changes:[]},nextState));
    }
    // 若当前对话对象已不在场，切回不限
    if(nextState.talkTarget && !(Array.isArray(nextState.present)&&nextState.present.includes(nextState.talkTarget))) nextState.talkTarget = "";
    // 任务：AI 可下发多个新任务（内容隐藏，后台存在，玩家界面不可见）
    // 恋爱/日常弱化任务系统：不登记外部委托，避免 NPC 反复催办
    const noNag = state.noNagUntil && state.noNagUntil >= nextTurn;
    const weakenTasks = isRomanceMode(state) || state.afterglow>0 || state.intimateActive || noNag;
    const taskMax = taskProfileFor(state).max;
    const activeQuestsCount = ()=>nextState.quests.filter(q=>!q.done && !q.abandoned).length;
    for(const q of (weakenTasks ? [] : scene.questAdd)){
      if(nextState.quests.some(x=>x.id===q.id || x.title===q.title
        || (x.abandoned && (textSimilarity(x.title||"",q.title||"")>=0.85
          || textSimilarity(x.desc||"",q.desc||"")>=0.85)))) continue;
      if(activeQuestsCount() >= taskMax) break;
      nextState.quests.push({id:q.id||("q"+nextState.turn+"_"+nextState.quests.length),title:q.title,desc:q.desc||"",
        secret:q.secret||"",reward:q.reward||null,done:false,revealed:false,abandoned:false,addedTurn:nextState.turn});
    }
    // 玩家拒绝/放弃的任务：标记为已放弃，之后不再出现在 AI 的上下文里，避免 NPC 反复催
    for(const id of (scene.questDrop||[])){
      const q = nextState.quests.find(x=>x.id===id || x.title===id);
      if(q){
        q.abandoned = true;
        const a = "委托「"+q.title+"」已被玩家拒绝/放弃，之后再也不要提起。";
        nextState.anchors = nextState.anchors||[]; if(!nextState.anchors.includes(a)) nextState.anchors.push(a); nextState.anchors = nextState.anchors.slice(-24);
      }
    }
    const questRewards = [];
    for(const id of scene.questDone){
      const q = nextState.quests.find(x=>x.id===id || x.title===id);
      if(q && !q.done && !q.abandoned){
        q.done = true;
        q.revealed = true;
        questRewards.push({id:q.id || id,reward:q.reward || {}});
      }
    }
    // 玩家声明已了结：若明确对应某个进行中的委托，静默完成并结算奖励，避免继续挂着
    if(resolvedClaim && typeof claimMatchScore==="function"){
      const ranked = nextState.quests.filter(q=>q && !q.done && !q.abandoned)
        .map(q=>({q,score:claimMatchScore(resolvedClaim,String(q.title||"")+" "+String(q.desc||""))}))
        .filter(row=>row.score>0).sort((a,b)=>b.score-a.score);
      if(ranked.length && (ranked.length===1 || ranked[0].score>ranked[1].score)){
        ranked[0].q.done = true;
        ranked[0].q.revealed = true;
        questRewards.push({id:ranked[0].q.id,reward:ranked[0].q.reward||{}});
      }
    }
    // 过期任务自动放弃：太久没推进的任务不再出现在 AI 上下文里，避免长期纠缠
    for(const q of nextState.quests){
      if(q.done || q.abandoned) continue;
      if(!Number.isFinite(q.addedTurn)) q.addedTurn = nextState.turn;
      else if(nextState.turn - q.addedTurn >= 18) q.abandoned = true;
    }
    // 隐藏阶段寿命：当前阶段每过一幕 +1；新阶段/完成/失败时归零
    nextState.hiddenStageTurns = (state.hiddenQuest && state.hiddenQuest.status==="active") ? (state.hiddenStageTurns||0)+1 : 0;
    if(nextState.infiniteMode && state.eventBeatDue){
      nextState.lastBeatMinute = nextState.environment.minute;
      nextState.beatCount = (nextState.beatCount||0)+1;
      nextState.nextBeatMinute = (nextState.environment.minute||0) + 240 + Math.floor(Math.random()*121);
    }
    delete nextState.eventBeatDue;
    // 隐藏主线：分阶段推进（玩家不可见）。完成一阶段 → 领取奖励 → 等 AI 开启下一阶段
    if(scene.hiddenQuest){
      const hq = scene.hiddenQuest;
      const prev = nextState.hiddenQuest;
      if(!prev || (hq.status==="active" && prev.status!=="active")){
        // 首次建立，或上一阶段完成后开启新阶段
        const nextStage = prev ? Math.max(nextState.hiddenStage||0, prev.stage||0) + 1 : 1;
        nextState.hiddenQuest = {
          title:hq.title || ("第"+nextStage+"阶段"), desc:hq.desc||"", stakes:hq.stakes||"",
          status:"active", reward:hq.reward || {},
          stage:nextStage, final:Boolean(hq.final)
        };
        nextState.hiddenStage = nextStage;
        nextState.hiddenStageStartedMinute = nextState.environment.minute;
        nextState.hiddenStageTurns = 0;
        nextState.hiddenNextPending = false;
        if(prev && prev.status==="done"){
          entries.push({t:"sys",text:"旧的悬念刚刚落定，新的暗流又悄然涌动。"});
        }
      }else if(hq.status==="active" && prev.status==="active"){
        // 当前阶段内的更新
        nextState.hiddenQuest = {...prev,
          title:hq.title||prev.title, desc:hq.desc||prev.desc, stakes:hq.stakes||prev.stakes,
          reward:hq.reward||prev.reward, final:Boolean(hq.final)||Boolean(prev.final)};
      }else if(hq.status==="done" && prev.status==="active"){
        nextState.hiddenQuest = {...prev, status:"done"};
        nextState.hiddenArc = [...(nextState.hiddenArc||[]), {stage:prev.stage||nextState.hiddenStage||1, title:prev.title, desc:prev.desc, outcome:"done"}].slice(-12);
        nextState.hiddenStage = Math.max(nextState.hiddenStage||0, prev.stage||1);
        nextState.hiddenStageTurns = 0;
        // 阶段完成写入长期锚点，避免长局遗忘关键转折
        { const a = "第"+(prev.stage||1)+"阶段「"+prev.title+"」已完成"+(prev.desc?"："+prev.desc:""); nextState.anchors = nextState.anchors||[]; if(!nextState.anchors.includes(a)) nextState.anchors.push(a); nextState.anchors = nextState.anchors.slice(-24); }
        questRewards.push({id:"@stage",reward:prev.reward || {}});
        entries.push({t:"sys",text:"压在心头的一件事终于落了地。"});
        if(nextState.infiniteMode){
          nextState.hiddenNextPending = true;
          entries.push({t:"sys",text:"这一段主线告一段落，但故事还在继续。"});
        }else if(hq.final || prev.final){
          if(!nextState.ending) nextState.ending = {good:true,title:prev.title||"尘埃落定",text:hq.desc||prev.desc||"这条贯穿始终的暗线，到此收束。"};
        }else{
          nextState.hiddenNextPending = true;   // 下一幕让 AI 开启新阶段
        }
      }else if(hq.status==="failed" && prev.status==="active"){
        nextState.hiddenQuest = {...prev, status:"failed"};
        nextState.hiddenStageTurns = 0;
        nextState.hiddenArc = [...(nextState.hiddenArc||[]), {stage:prev.stage||1, title:prev.title, desc:prev.desc, outcome:"failed"}].slice(-12);
        if(nextState.infiniteMode){
          entries.push({t:"sys",text:"你失去了些什么，但路还没走完。"});
        }else if(!nextState.ending){
          nextState.ending = {good:false,title:"隐秘的代价",text:hq.stakes||prev.stakes||"你没能守住那件从一开始就压在你肩上的事。有些机会，错过了就是一辈子——这一夜，以遗憾收场。"};
          entries.push({t:"sys",text:"你隐约觉得，有什么重要的东西永远地失去了。"});
        }
      }
    }
    settleQuestRewards(nextState,scene,questRewards,Boolean(choice));
    // 金币没能入账时不再静默丢弃，给玩家一条可见的说明
    if(nextState._effectIssues?.length){
      const coinIssues = nextState._effectIssues.filter(i=>i.kind==="coin");
      if(coinIssues.length){
        const amount = coinIssues.reduce((sum,i)=>sum+i.amount,0);
        entries.push({t:"sys",text:"本幕有 "+(amount>0?"+":"")+amount+" 金币没能入账"
          +(economicMode(nextState)==="barter" ? "（此地以物易物，金币用不上）" : "（余额不足或数额无效）")+"。"});
      }
      delete nextState._effectIssues;
    }
    // 无限模式：伏笔账本——新篇章种下带冲突与依据的伏笔，按时推进/回收
    if(nextState.infiniteMode){
      const seeds = Array.isArray(nextState.arcSeeds) ? nextState.arcSeeds : [];
      for(const f of (scene.foreshadowAdd||[])){
        if(!f.hint || !f.conflict || !f.basis) continue;
        if(seeds.some(x=>x && x.hint===f.hint)) continue;
        seeds.push({id:"fs"+nextTurn+"_"+seeds.length,hint:f.hint,conflict:f.conflict,basis:f.basis,
          status:"planted",plantedTurn:nextTurn,dueTurn:nextTurn+(f.due||3),
          plantedMinute:nextState.environment.minute,dueMinute:(nextState.environment.minute||0)+(f.due||3)*60});
      }
      for(const key of (scene.foreshadowDone||[])){
        const hit = seeds.find(x=>x && (x.id===key || x.hint===key));
        if(hit){ hit.status="paid"; hit.paidTurn=nextTurn; }
      }
      const active = seeds.filter(x=>x && x.status==="planted");
      if(active.length>6){
        const keep = new Set(active.slice(-6).map(x=>x.id));
        for(const x of active) if(!keep.has(x.id)) x.status="dropped";
      }
      nextState.arcSeeds = seeds.slice(-12);
    }
    const reputationDelta = nextState.rep-previous.rep;
    if(scene.reputation && reputationDelta){
      const {scope,reason} = scene.reputation;
      const oldScore = (nextState.reputations||[]).find(r=>r.scope===scope)?.score || 0;
      const score = clamp(oldScore+reputationDelta,-100,100);
      nextState.rep = previous.rep+score-oldScore;
      nextState.reputations = [...(nextState.reputations||[]).filter(r=>r.scope!==scope),
        {scope,score,reason}].slice(-24);
      entries.push({t:"sys",text:scope+"的口碑 · "+reason});
    }
    // 核心设定锚点：始终成立、不可被后续遗忘或篡改
    if(scene.anchors && scene.anchors.length){
      const existing = new Set(nextState.anchors||[]);
      for(const a of scene.anchors){ if(a && !existing.has(a)){ existing.add(a); } }
      nextState.anchors = [...existing].slice(-24);
    }
    // 物品与能力
    for(const it of scene.items){
      const name = typeof it==="string" ? it : it.name;
      if(!name) continue;
      const ex = nextState.items.find(x=>x.name===name);
      if(ex){ if(Number.isFinite(it.qty)) ex.qty = (ex.qty||1) + it.qty; continue; }
      nextState.items.push({name, desc:(it&&it.desc)||"", value:(it&&it.value), effect:(it&&it.effect), consumable:(it&&it.consumable), qty:(it&&it.qty)||1});
      entries.push({t:"reward",text:"获得物品："+name});
    }
    for(const name of scene.abilities){
      if(!nextState.abilities.some(a=>a.name===name)){
        nextState.abilities.push({name,desc:""});
        entries.push({t:"reward",text:"习得能力："+name});
      }
    }
    // 欲望自然累积（与好感/亲密度独立）：五维随时间缓慢上涨，性欲涨得稍快
    // 但若本幕 AI 明确让欲望骤降/归零（扫兴、惊吓、厌恶等），这一轮不再自动回涨
    if(!nextState.ending && state.turn>0){
      const dvn = ensureDrives(nextState);
      const effN = scene.effects || {};
      const sexDropped = Number.isFinite(effN.desire) && effN.desire < 0;
      const explicitNpc = new Set((scene.characters||[]).filter(c=>c && c.name && c.desire!==undefined).map(c=>c.name));
      for(const k of DRIVE_KEYS){
        if(k==="sex" && sexDropped) continue;
        dvn[k] = clamp(dvn[k] + (k==="sex"?2:1), 0, 100);
      }
      // 四维欲望各自的独有后果：高欲望时若得不到满足，会以不同方式累积/反噬
      if(dvn.people>=60 && (!nextState.present || !nextState.present.length)){
        dvn.people = clamp(dvn.people+1, 0, 100);
        nextState.hp = Math.max(0,nextState.hp-1);                    // 孤独消耗
      }
      if(dvn.power>=60 && Number.isFinite(effN.rep) && effN.rep < 0){
        dvn.power = clamp(dvn.power+2, 0, 100);          // 被驳面子，更想掌权
      }
      if(dvn.money>=60 && (nextState.moneyTotals?.income||0)===(previous.moneyTotals?.income||0)){
        dvn.money = clamp(dvn.money+1, 0, 100);          // 没进账就焦虑
      }
      if(dvn.items>=60 && scene.items && scene.items.length===0 && /得到|获得|拿到|拾到|买到|收下/.test((scene.advance||""))){
        dvn.items = clamp(dvn.items+1, 0, 100);
      }
      nextState.desire = dvn.sex;
      if(Array.isArray(nextState.present)){
        for(const nm of nextState.present){
          if(explicitNpc.has(nm)) continue;
          const c = nextState.cast.find(x=>x.name===nm);
          if(c && c.adult!==false) c.desire = clamp((c.desire||0)+2, 0, 100);
        }
      }
    }
    // 余韵期硬上限：不管 AI 怎么写，刚做完的人不会立刻又满格欲望
    if(state.refractoryThisTurn){
      for(const c of nextState.cast){
        if(c && c.adult!==false && (nextState.present||[]).includes(c.name)){
          c.desire = clamp(Math.min(c.desire||0, 60), 0, 100);
        }
      }
      delete nextState.refractoryThisTurn;
    }
    if(previous.hp>0 && nextState.hp<=0 && !nextState.ending){
      entries.push({t:"sys",text:"你已经力竭。可以停下喘息、找地方休息，或开口向周围的人求助。"});
    }
    // 通缉度过高 → 被追捕，触发坏结局
    if((nextState.wanted||0)>=90 && !nextState.ending && !nextState.infiniteMode){
      nextState.ending = {good:false,title:"法网难逃",text:"官府终于动了真格。巡捕循着积压的报案与线人的口供，摸到了你的落脚处。火把照亮雨幕，刀剑出鞘的声音在巷口响起。你犯下的事一桩桩被翻了出来，这一次，没人再能压下案子——你没能走出这座城。"};
      entries.push({t:"sys",text:"你的罪行终于被官府追查到底。"});
    }
    ensureEconomy(nextState);
    if(choice){
      const changes = describeStatChanges(previous,nextState,curName(nextState));
      if(changes) entries.push({t:"reward",text:"本幕合计 · "+changes});
    }
    if(timeSkip){
      const fact = "时间跳跃："+skipLabel+"（第"+nextTurn+"幕，"+formatClock(nextState)+"）";
      nextState.keyFacts = [...new Set([...(nextState.keyFacts||[]),fact])].slice(-50);
      nextState.anchors = [...new Set([...(nextState.anchors||[]),fact])].slice(-30);
      entries.push({t:"sys",text:"时间过去了 "+skipLabel+"，现在是 "+formatClock(nextState)+"。"});
      if(economicMode(nextState)!=="barter"){
        const period = {label:skipLabel,before:money.openingCash,after:nextState.coin,
          income:(nextState.moneyTotals?.income||0)-(previous.moneyTotals?.income||0),
          expense:(nextState.moneyTotals?.expense||0)-(previous.moneyTotals?.expense||0),
          unpaid:[...money.skippedExpenses.values()].reduce((sum,n)=>sum+n,0)};
        period.principal = period.after-period.before-period.income+period.expense;
        nextState.lastTimeSettlement = period;
        entries.push({t:"sys",text:"期间收支 · "+timeSettlementText(nextState,period)});
      }
    }
    // 账本与不可遗忘事实
    {
      const cashDelta = (nextState.coin||0)-(previous.coin||0);
      if(cashDelta && economicMode(nextState)!=="barter"){
        entries.push({t:"sys",text:"金币 "+(cashDelta>0?"+":"")+cashDelta+" → "+nextState.coin+"（"+curName(nextState)+"）"});
      }
      const detail = [choice && choice.text, scene.advance, ...(scene.lines||[]).map(l=>l.text)].filter(Boolean).join(" ").slice(0,260);
      const paid = Math.max(0,(nextState.moneyTotals?.expense||0)-(previous.moneyTotals?.expense||0));
      if(paid > 0){
        nextState.ledger = [...(nextState.ledger||[]),{turn:nextTurn,amount:paid,detail:scene.payment||detail,place:nextState.environment.place||""}];
        nextState.ledger = nextState.ledger.slice(-30);
        if(scene.payment && /(房租|租金|房钱|账单|欠款|还债)/.test(scene.payment)){
          const a = "已支付/处理："+detail.slice(0,170)+"（不要重复索要）";
          nextState.anchors = [...new Set([...(nextState.anchors||[]),a])].slice(-30);
        }
      }
      const facts = [scene.advance,...(scene.anchors||[])].filter(text=>text && /改嫁|结婚|离婚|破产|入狱|失踪/.test(text));
      if(facts.length){
        nextState.keyFacts = nextState.keyFacts || [];
        for(const f of facts){ if(f && !nextState.keyFacts.includes(f)) nextState.keyFacts.push(f); }
        nextState.keyFacts = nextState.keyFacts.slice(-50);
      }
    }
    ensureEconomy(nextState);
    ensureAvatars(nextState);
    compactLongRunState(nextState);
    nextState.log = [...previous.log,...entries.map(e=>e.turn===undefined ? {...e,turn:nextTurn} : e)].slice(-120);
    // 物品已在本地结算，提示只对紧接着的这一幕有效。
    delete nextState.itemUsedNote;
    const persistTurn = ()=>{
      if(S!==origin || activeTurn && activeTurn!==turn) return;
      turn.committing = true;
      activeTurn = turn;
      turn.commitPromise = (async()=>{
        try{
          await saveProgress(false,{reportError:true,state:nextState});
          clearPendingTurn(pendingTurnMeta);
          if(typeof recordTurnToDb==="function") recordTurnToDb(nextState,nextTurn,observedFacts).catch(()=>{});
          if(S!==origin) return;
          S = nextState;
          rememberUndoState(beforeTurn);
          if(!$("overlay").classList.contains("hidden")) return;
          pendingSpeech?.remove();
          entries.forEach(logToDOM);
          limitLog();
          showCurrentScene();
          if(!S.ending && typeof ttsReadCurrent==="function") ttsReadCurrent();
          $("save-status").textContent = "进度已保存"+(typeof formatSaveSize==="function" ? " · "+formatSaveSize(lastSaveBytes) : "");
          syncUndoButton();
        }catch(error){
          if(S===nextState){
            console.error("刷新已保存的剧情失败",error);
            return;
          }
          if(samePendingTurn(readPendingTurn(pendingTurnMeta),pendingTurnMeta)){
            writePendingTurn({...pendingTurnMeta,retryable:false});
          }
          if(S===origin) aiMessage("这一幕已生成，保存失败："+error.message,
            [["重试保存",()=>!activeTurn && persistTurn()]]);
        }finally{
          turn.committing = false;
          if(activeTurn===turn) activeTurn = null;
        }
      })();
      return turn.commitPromise;
    };
    await persistTurn();
  }catch(e){
    if(activeTurn!==turn) return;
    window.__lastTurnError = e;
    try{
      S.turnStats = [...(S.turnStats||[]), {turn:nextTurn, at:Date.now(), ms:Math.round(performance.now()-turnStartedAt), attempts, identityRetries, jsonErrors, contextTokens, retryReasons:retryReasons.slice(-4).map(r=>({attempt:r.attempt,kind:r.kind,detail:String(r.detail||"").slice(0,120)})), error:String(e && e.message || e), pace:dailyPace ? (dailyPace.condensed ? "fast" : "detailed") : "auto"}].slice(-40);
    }catch(e2){}
    const message = e.name==="TimeoutError" ? "这一幕生成超时。" : e.name==="TypeError" ? "网络连接中断。" :
      e instanceof SyntaxError ? "AI 返回的剧情不完整。" : e.message;
    const retryable = turnErrorRetryable(e);
    if(samePendingTurn(readPendingTurn(pendingTurnMeta),pendingTurnMeta)){
      writePendingTurn({...pendingTurnMeta,retryable});
    }
    syncStoryPace();
    showSpeechInput($("action-text").value || speech?.text);
    aiMessage(message, [[speech ? "重新发送" : "重试这一幕",()=>aiTurn(choice)],...(choice ? [[speech ? "编辑这句话" : "返回选项",returnToChoices]] : [])]);
    if(retryable && !pendingTurnMeta.retries) setTimeout(()=>retryPendingTurn(pendingTurnMeta),2500);
    armIdleTimer();
  }finally{
    pendingSpeech?.remove();
    if(activeTurn===turn) activeTurn = null;
  }
}

function renderAIChoices(choices){
  const box = $("choices");
  box.innerHTML = "";
  const btns = [];
  // 首幕额外说明：选项不是唯一出路。放在选项区顶部，
  // 否则 3 个选项已超出可视高度时提示会被挤到滚动区最底部、一进来就看不见。
  if(S.turn<=1 && !S.ending){
    const hint = document.createElement("div");
    hint.className = "choice-hint";
    hint.textContent = "你也可以直接输入任何行动，不必从选项里挑。";
    box.appendChild(hint);
  }
  choices.forEach((c, idx)=>{
    const btn = document.createElement("button");
    btn.className = "choice";
    if(idx<9){
      const num = document.createElement("span");
      num.className = "choice-num";
      num.textContent = String(idx+1);
      btn.appendChild(num);
    }
    const span = document.createElement("span");
    span.textContent = c.text;
    btn.appendChild(span);
    if(c.tradeoff){
      const tradeoff = document.createElement("small");
      tradeoff.className = "choice-tradeoff";
      tradeoff.textContent = c.tradeoff;
      btn.appendChild(tradeoff);
    }
    // 明确的代价/风险：单独标出来，玩家在选之前就能看见要付出什么
    if(c.cost){
      const tag = document.createElement("span");
      tag.className = "choice-tag cost";
      tag.textContent = "代价 · "+c.cost;
      btn.appendChild(tag);
    }
    // 代价标签：金币不足则禁用并提示
    const eff = c.effect || {};
    const cost = Number.isFinite(eff.coin) && eff.coin < 0 ? -eff.coin : 0;
    const hurt = Number.isFinite(eff.hp) && eff.hp < 0 ? -eff.hp : 0;
    const tags = [];
    if(cost) tags.push(cost+" "+curName(S));
    if(hurt) tags.push("❤️-"+hurt);
    if(tags.length){
      const tag = document.createElement("span");
      tag.className = "choice-tag";
      tag.textContent = tags.join(" ");
      btn.appendChild(tag);
    }
    // 属性/技能驱动的选项目标
    if(c.skill || c.attr){
      const chip = document.createElement("span");
      chip.className = "choice-tag attr";
      chip.textContent = [c.skill ? "技能·"+c.skill : "", c.attr ? "属性·"+c.attr : ""].filter(Boolean).join(" ");
      btn.appendChild(chip);
    }
    if(c.offerUnavailable || cost > S.coin){
      btn.classList.add("unaffordable");
      btn.disabled = true;
      const warn = document.createElement("span");
      warn.className = "choice-tag warn";
      warn.textContent = cost > S.coin ? curName(S)+"不足" : "缺少交换物资";
      btn.appendChild(warn);
    }
    btn.onclick = ()=>{
      if(btn.disabled) return;
      clearIdleTimer();
      btns.forEach(b=>b.disabled=true);
      aiTurn(c);
    };
    btns.push(btn);
    box.appendChild(btn);
  });
  syncChoiceList(btns.length);
  box.scrollTop = 0;
  // 键盘 1-9 快速选择
  const keyHandler = (e)=>{
    const n = parseInt(e.key, 10);
    if(n>=1 && n<=btns.length && !e.ctrlKey && !e.metaKey && !e.altKey){
      const t = document.activeElement && document.activeElement.tagName;
      if(box.hidden || t==="INPUT" || t==="TEXTAREA" || t==="SELECT" || !$("overlay").classList.contains("hidden")) return;
      e.preventDefault();
      btns[n-1].click();
    }
  };
  document.addEventListener("keydown", keyHandler);
  // 渲染新选项时移除旧的监听（一次性）
  const observer = new MutationObserver(()=>{
    if(!btns.some(b=>b.isConnected)){ document.removeEventListener("keydown", keyHandler); observer.disconnect(); }
  });
  observer.observe(box, { childList:true });
}

function endingSummary(){
  const parts = [];
  if((S.items||[]).length) parts.push("收获 "+S.items.length+" 件物品");
  if((S.abilities||[]).length) parts.push("掌握 "+S.abilities.length+" 项能力");
  const hq = S.hiddenQuest;
  if(hq && hq.status==="done") parts.push("达成隐秘目标「"+hq.title+"」");
  else if(hq && hq.status==="failed") parts.push("错失隐秘目标「"+hq.title+"」");
  return parts.length ? "<br><br><span style=\"color:var(--muted);font-size:13px\">"+escapeHtml(parts.join(" · "))+"</span>" : "";
}

function showEndingAI(end){
  clearIdleTimer();
  $("custom-action").hidden = true;
  $("choices").replaceChildren();
  const ov = $("overlay"), card = $("card");
  ov.classList.remove("hidden");
  const good = !!end.good;
  card.innerHTML = `
    <h1 class="end-title ${good?'good':'bad'}">${escapeHtml(end.title||"结局")}</h1>
    <div class="sub">${escapeHtml(end.note || "— AI 随机结局 —")}</div>
    <div class="end-text">${escapeHtml(end.text||"").replace(/\n/g,"<br>")}<br><br><b>${escapeHtml(localReputation(S).label)} · ${escapeHtml(curName(S))} ${escapeHtml(S.coin)} · 体力 ${escapeHtml(S.hp)}</b>${endingSummary()}</div>
    <div class="card-btns">
      <button class="big-btn" id="btn-title">返回酒馆首页</button>
      <button class="big-btn ghost" id="btn-end-save">保存这一夜</button>
      <div class="form-note" id="ending-status" role="status"></div>
    </div>`;
  $("btn-end-save").onclick = ()=>saveProgress(true);
  $("btn-title").onclick = showTitle;
  if(typeof ttsReadCurrent==="function") ttsReadCurrent();
}

