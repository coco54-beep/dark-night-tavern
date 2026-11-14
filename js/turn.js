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
  S = previous;
  renderLog();
  showCurrentScene();
  saveProgress();
  syncUndoButton();
  imageToast("已撤销一步剧情。",2500);
}
async function aiTurn(choice){
  if(activeTurn) return;
  if(!S.turn && !choice && !S.career && S.playerIdentity){
    applyCareer("commoner");
  }
  if(!S.turn && !choice && !S.career && !S.world){
    if(S.genre){ showIdentityCards(S.genre); return; }
    showCareerPicker(); return;
  }
  // 随机剧本：开场时抽一个叙事骨架，贯穿本局，降低套路重复感
  if(!S.turn && !choice && !S.world && !S.storyTemplate && S.genre){
    S.storyTemplate = pickStoryTemplate();
  }
  if(!S.turn && S.ai) ensureCurrency(S);
  if(S.ai) ensureDrives(S);
  const beforeTurn = S.turn > 0 ? snapshotState(S) : null;
  clearIdleTimer();
  const controller = new AbortController();
  const turn = {controller,automaticOpening:!S.turn && !choice};
  activeTurn = turn;
  const state = {...S, aff:{...S.aff}, intimacy:{...(S.intimacy||{})}};
  const nextTurn = state.turn+1;
  // 玩家明确想独处时，给几幕清静：NPC 不来敲门、不「恰好路过」、不托人带话
  const playerAction = (choice&&choice.text)||"";
  if(choice && /(?:结束(?:这段|这个|当前)?(?:故事|旅途|一切)|到此为止|完结吧|收尾吧|写出?结局|给我.{0,6}结局|故事到此)/.test(playerAction)){
    choice = {...choice, endingRequest:true};
  }
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
  const timeSkip = readTimeSkip(playerAction);
  const skipLabel = timeSkip && timeSkipText(timeSkip);
  state.worldWindow = advanceWorldWindow(state, nextTurn);
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
  // 拒绝冷却：玩家明确拒绝后，接下来几幕禁止 AI 再提、旁敲侧击或换人重提
  if(choice && !choice.idle){
    const refuseRe = /拒绝|不想帮|不想做|不想接|不想管|不帮|不做|不接|不干|没兴趣|没空|不关我事|别再提|别再来|另找别人|找别人|免谈|懒得管|不会帮|帮不了|我有自己的打算/;
    if(refuseRe.test(choice.text||"")){
      S.noNagUntil = (state.turn||0) + 4;
      state.noNagUntil = S.noNagUntil;
      const note = "玩家已明确拒绝过某个请求，不要再提起或换个说法重提。";
      if(!(S.memory||[]).includes(note)) S.memory = [...(S.memory||[]), note].slice(-40);
      state.memory = S.memory;
    }
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
    const visitDue = !soloActive && !state.intimateActive && !(state.afterglow>0) && (presentCount>0 ? ((state.turn + 1) % 4 === 0) : ((state.turn + 1) % 8 === 0 && Math.random()<0.5));
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
  const prior = state.history.slice(-16);
  if(prior.at(-1)?.role==="user") prior.pop();
  const fullContext = requiresFullTurnContext(state,choice);
  const recent = fullContext ? fullContextMessages(prior) : recentStoryMessages(prior);
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
    const baseMessages = [
      {role:"system",content:buildSystemPrompt(state,fullContext)},
      {role:"system",content:[buildMemoryContext(state,due,[choice?.target,playerAction].filter(Boolean).join(" ")),reactionPrompt]
        .filter(Boolean).join("\n")},
      {role:"system",content:buildStateContext(state,Boolean(choice))},
      ...(isTwoDayTrial(state) ? [{role:"system",content:
        "按《桥头客栈的两天》的固定时间和人物作息推进。已订房在关柜后仍有效，未订房须等开柜或另想办法。"
        +"第二天根据真实成交、劳动和消息来源演出。未接任务或错过交接都应留后续。固定事件："+TRIAL_MILESTONES.map(([minute,note])=>formatStoryTime(minute)+" "+note).join("；")
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
      ...recent,
      ...(state.lastProse ? [{role:"system",content:"注意：你上一条回复没有使用规定的 JSON 格式，而是写了散文或编号列表。请务必只输出一个 JSON 对象（含 narration、beats、choices、plot 等字段），不要输出任何 JSON 之外的文字或 markdown 标题。"}] : []),
      ...(state.stallCount >= 2 && !isRomanceMode(state) && !(state.afterglow>0) && !state.intimateActive ? [{role:"system",content:"节奏提醒：最近已连续 " + state.stallCount + " 幕主线几乎没有实质推进，剧情正在拖沓。本幕必须让主线发生具体变化——揭示一条关键线索、制造新的阻碍或反转、逼近的期限，或逼玩家做出有代价的抉择；收束无关闲谈与重复对峙，让故事果断向前。把 plot.next 写成真正新的下一步，不要只是复述旧目标。"}] : []),
      ...(state.hiddenNextPending ? [{role:"system",content:"隐藏主线进入新阶段：上一阶段（第" + (state.hiddenStage||1) + "阶段）已完成。请在本幕自然开启下一阶段——用 hiddenQuest 提供新的 title / desc / stakes / reward，status 设为 active，承接上阶段的线索与后果并抬高筹码；不要复用旧阶段，也不要让玩家看出这些是「任务」。若剧情已到高潮收束，可令最终阶段 final=true 并在结束时给出结局。"}] : []),
      ...(state.infiniteMode && (!state.hiddenQuest || state.hiddenQuest.status!=="active") ? [{role:"system",content:"无限模式：本幕必须建立一个明确的当前篇章（hiddenQuest，status=active）。给出一个能在约 4~8 个故事小时内推进或完成的具体目标、阻力、代价与下一步；不要只写日常寒暄、原地试探或重复旧目标。篇章完成后在下一幕开启新篇章。"}] : []),
      ...(state.infiniteMode && state.hiddenQuest && state.hiddenQuest.status==="active" && beatReady && stageMinutes>=360 ? [{role:"system",content:"无限模式：当前篇章已在故事时间里持续 " + Math.floor(stageMinutes/60) + " 小时。本幕必须让它发生实质变化——新阻碍、反转、期限、代价，或直接收束并在下一幕开启新篇章；不要用闲聊、重复对峙或原地打转拖时间。"}] : []),
      ...(state.infiniteMode && beatReady && (state.beatCount||0)%2===0 ? [{role:"system",content:"无限模式：如果当前篇章需要新人物，本幕可以让一个与篇章有关的新角色加入，或让一个长期不出现的边缘角色彻底退场；若人物关系已经够用，不要为了换人而换人。只动边缘角色，不要动长期稳定关系（高好感、高亲密、家人、伴侣、长期盟友、宿敌、死对头、长期对手、债主、上司）；新角色要有自己的目标与麻烦，不是临时工具人。"}] : []),
      ...(state.infiniteMode && state.hiddenQuest && state.hiddenQuest.status==="active" && !(state.arcSeeds||[]).some(s=>s&&s.status==="planted") ? [{role:"system",content:"当前篇章还没有有效伏笔。本幕必须补 1~2 条：写清 hint（具体细节/异常）、conflict（会引发什么冲突）、basis（建立在哪个已发生事实/人物/地点上），并用 foreshadowAdd 记录；不要为了伏笔而凭空发明无关设定。"}] : []),
      ...(beatReady && stageMinutes >= 480 && !(state.afterglow>0) && !state.intimateActive ? [{role:"system",content:(isRomanceMode(state)) ? ("隐藏主线就是这段关系，当前阶段在故事时间里已持续 " + Math.floor(stageMinutes/60) + " 小时。请让它作为一个关系里程碑推进：在最近 1~2 个节拍里安排一次明确的关系变化（靠近、坦白、心动、承诺、冲突或和解），达成后把 hiddenQuest.status 设为 done 并自然开启下一阶段。不要把玩家拽去处理外部事务，也不要用房租账单或流言蜚语凑数，不要为了推进而打断玩家正在享受的相处。") : ("隐藏主线当前阶段在故事时间里已持续 " + Math.floor(stageMinutes/60) + " 小时。请让它自然收束：要么在最近 1~2 个节拍内达成（达成即 hiddenQuest.status=done），要么随世界推进自然演进（NPC 自行行动、期限到时、局势变质），不要把玩家反复拽回同一件事。若玩家明显在过自己的日子（闲聊、经营），不要为了推动阶段而打断或催逼；可以留作背景压力。若这是最终阶段，达成后收束结局。")}] : []),
      ...((state.noNagUntil && state.noNagUntil >= state.turn) ? [{role:"system",content:"玩家最近明确拒绝过某个请求或委托。本幕不要再提起它，也不要旁敲侧击、借他人之口、换个说法或让另一个人重新塞回来；让 NPC 收起这件事，或让它自然淡出，可以转而聊别的、做别的事。"}] : []),
      ...(state.filteredSpeakers && state.filteredSpeakers.length ? [{role:"system",content:"上一幕中这些角色并不在场，他们的话没有发生，不要当作已发生的事实或已经传出的消息："+state.filteredSpeakers.join("、")+"。若需要他们知情，必须在本幕安排人当面告知、送信或让他们进场。"}] : []),
      ...(function(){
        const paid = (state.ledger||[]).slice(-6).find(l=>l && /房租|租金|房钱|账单/.test(l.detail||""));
        return paid ? [{role:"system",content:"玩家已经支付过这笔款项（第"+paid.turn+"幕："+String(paid.detail||"").slice(0,80)+"）。本幕不要再催同一笔房租/账单，也不要换个人重提。"}] : [];
      })(),
      ...(driveNudge ? [driveNudge] : []),
      ...(visitorNudge ? [visitorNudge] : []),
      ...(stayNudge ? [stayNudge] : []),
      ...(soloActive ? [{role:"system",content:"玩家现在想一个人待着 / 独自查案：本幕不要安排任何人来敲门、送东西、传话、在门外守着或「恰好路过」；也不要用脚步、叹息、影子暗示有人在附近。在场的人若识趣，可以让他们离开（用 left）。只写玩家自己的行动、环境与发现。除非性命攸关的急事，才可让人出现，并说明为何非打断不可。"}] : []),
      ...(timeSkip ? [{role:"system",content:"玩家要求推进 "+skipLabel+"。概括期间的局势、关系和身份变化，再写抵达新日期后的处境。系统按日历推进，自动结算任务之外的固定收入、租约、到期和已设开销。不要猜测收支合计，也不要把同一笔再填入 moneyMoves。"}] : []),
      ...(isRomanceMode(state) ? [{role:"system",content:"恋爱类型额外规则：不要把房租、账单、算账、买菜、邻居闲话、世俗眼光、流言蜚语、催婚逼婚当作反复出现的主要事件或固定反派；这些至多是一句背景。恋爱故事的事件应推进关系本身——心动、试探、坦白、承诺、失约、旧伤、共同经历、和解或离别。不要为了制造冲突把玩家拽去处理外部事务。"}] : []),
      ...(state.infiniteMode ? [{role:"system",content: beatReady ? storyBeatPrompt(state,stageMinutes) : storyCalmPrompt(state)}] : []),
      ...(state.infiniteMode ? [{role:"system",content:"无限模式：这段故事没有预设终点。除非玩家主动要求结束，否则不要输出 end，也不要用主线完成、原作结局、通缉或力竭来收束。主线走完或明显偏离时，顺势开启新的局部目标、事件、地点或人物，让故事自然延续；旧角色可以离场并不再回来，长期不出现的人标记 offstage，不再主动回来；只有在剧情节拍到达、题材需要且玩家没有在安静相处时，才让新角色加入；不要为了换人而换人。长期稳定关系（高好感、高亲密、家人、伴侣、长期盟友、宿敌、死对头、长期对手、债主、上司）不适用自动退场：他们可以暂时不在场、在忙自己的事，但不会因为几幕没出现就消失，也不会被新角色顶替。只在剧情节拍到达或玩家主动推动时引入新事件；安静相处的时间不是流水账，不要用房租、账单、流言或路人琐事硬填。建立新篇章时必须同时留下 1~3 条伏笔（hint/conflict/basis），并在 2~5 个故事小时内推进或回收；伏笔要建立在已发生的事实、人物或地点上，不要凭空发明无关设定。"}] : []),
      ...(choice && choice.endingRequest ? [{role:"system",content:"玩家主动要求结束故事。本幕只写收束：把当前主线、关系和未了之事交代清楚，并在 JSON 的 end 字段返回 {good:true/false,title,text}；不要输出后续 choices，不要开启新钩子。结局必须基于本局实际发生的事，不要照搬原著结局。"}] : []),
      ...(drivePress ? [drivePress] : []),
      ...((state.intimateActive || state.afterglow>0 || (((state.desires&&state.desires.sex)||0)>=45 && /亲吻|吻|抱住|搂|抚摸|摸|解开|脱下|贴紧|贴身|上床|胸前|腰|腿间|身体/.test((choice&&choice.text)||""))) ? [{role:"system",content:"亲密已经进行中，或双方早已明确愿意：不要再问「可以吗 / 要不要 / 你确定吗 / 要我继续吗」这类问题，也不要停下来征求同意；直接写动作、身体状态与进展，并明确是尚未释放还是已经释放。只有玩家明确说停或表现犹豫时才停。"}] : []),
      ...((state.afterglow>0 || state.intimateActive) ? [{role:"system",content:"你们刚刚（或正在）亲密，仍处在余韵里。本幕不要突然谈任务、委托或推进主线；先写身体的疲惫、情绪的余温与相处（喘息、发软、犯困、黏人、沉默、满足或后悔），让这一场自然收尾或继续，等余韵过去再谈别的事。NPC 此刻是被欲望与疲惫影响的人，不是随时能公事公办的机器。"}] : []),
      action
    ];
    if(state.filteredSpeakers) delete state.filteredSpeakers;
    const corrective = {role:"system",content:"上一次的输出不可用（可能是 JSON 格式错误或不完整，或缺少 plot 主线 / choices 选项 / beats 台词）。请严格只输出一个完整的 JSON 对象，以 { 开头、} 结尾，包含 narration / beats / choices / plot / effects / advance 等字段；不要输出任何解释、Markdown 代码块、标题或编号列表。"};
    let raw, scene, lastErr, environment, money, calculatedStamina;
    // 服务端最多接受 28 条消息，预留重试时的两条纠正指令。
    if(baseMessages.length>26 && recent.length){
      const overflow = Math.ceil((baseMessages.length-26)/2)*2;
      baseMessages.splice(baseMessages.indexOf(recent[0]),overflow);
    }
    for(let attempt=0; attempt<2; attempt++){
      const messages = attempt===0 ? baseMessages : [...baseMessages.slice(0,-1), corrective,
        ...(lastErr?.message ? [{role:"system",content:"还需纠正："+lastErr.message}] : []),
        baseMessages[baseMessages.length-1]];
            try{
        raw = await callLLM(messages, AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]), text=>{
          if(activeTurn===turn) streamPreview(text);
        }, {temperature: attempt===0 ? 0.95 : 0.7});
      }catch(err){
        lastErr = err;
        if(attempt===1 || activeTurn!==turn || controller.signal.aborted || err.name==="TimeoutError" || err.name==="AbortError") throw err;
        continue;
      }
      if(activeTurn!==turn) return;
      try{
        scene = readScene(raw);
      }catch(err){
        lastErr = err;
        if(attempt===1) throw err;
        const pv = $("stream-preview");
        if(pv) pv.textContent = "正在重新生成剧情……";
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
          if(attempt===1) throw lastErr;
          continue;
        }
      }
      if(waitMinutes || timeSkip){
        const openingClock = advanceEnvironment(state.environment,{...scene.environment,elapsedMinutes:0},false);
        scene.environment.elapsedMinutes = waitMinutes || timeSkipMinutes(timeSkip,clockNow({...state,environment:openingClock}));
        scene.environment.longSkip = true;
      }
      environment = advanceEnvironment(state.environment,scene.environment,Boolean(choice));
      scene.fromMinute = sceneStartMinute(state.environment,scene.environment,environment,Boolean(choice));
      const commitIssue = tradeProblem(scene,state,choice) || custodyProblem(scene,choice);
      money = commitIssue ? null : settleTurnMoney(state,scene,environment,choice);
      if(commitIssue || money.error){
        lastErr = new Error(commitIssue || money.error);
        if(attempt===1) throw lastErr;
        continue;
      }
      calculatedStamina = settleStamina(scene,{...state,species:state.species||(!state.turn ? scene.playerSpecies : ""),
        environment:{...state.environment,minute:scene.fromMinute}},
        environment.minute-scene.fromMinute,choice);
      const problem = validateSceneForTurn(scene, state);
      if(problem){
        lastErr = new Error(problem);
        // 解析成功但质量欠佳：先重试一次；若仍不理想，也不再阻断，直接接受这一幕，避免反复弹错
        if(attempt===1) break;
        const pv = $("stream-preview");
        if(pv) pv.textContent = "正在调整这一幕……";
        continue;
      }
      // 模型写成散文：先尝试重生成一次，仍不行再接受散文兜底
      if(scene.prose && attempt===0){
        lastErr = new Error("剧情格式无法解析，请重试");
        const pv = $("stream-preview");
        if(pv) pv.textContent = "正在重新生成剧情……";
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
    if(Number.isFinite(scene.playerAge)){
      state.age = clamp(Math.round(scene.playerAge),0,200);
      if(state.birthAuto || !state.birth){ state.birth = null; state.birthAuto = false; }
    }
    if(Number.isFinite(scene.playerHeight)) state.height = clamp(Math.round(scene.playerHeight),30,300);
    if(Number.isFinite(scene.playerWeight)) state.weight = clamp(Math.round(scene.playerWeight),2,500);
    if(Number.isFinite(scene.playerSavings)) state.savings = Math.max(0,Math.round(scene.playerSavings));
    if(scene.playerOrigin) state.origin = scene.playerOrigin;
    if(scene.playerAppearance) state.appearance = scene.playerAppearance;
    if(scene.playerOutfit) state.outfit = scene.playerOutfit;
    if(!state.turn){
      if(!state.gender && scene.playerGender) state.gender = scene.playerGender;
      if(!state.species && scene.playerSpecies) state.species = scene.playerSpecies;
      if(Number.isFinite(scene.playerIncome)) state.incomePerDay = scene.playerIncome;
      if(scene.playerBirth && (!state.birth || state.birthAuto)) { state.birth = scene.playerBirth; state.birthAuto = false; }
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
          if(Number.isFinite(r.aff)) state.aff[r.name] = clamp(r.aff,0,100);
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
    entries.push(...money.entries);
    if(choice){
      const effects = {...scene.effects};
      delete effects.coin;
      if(!scene.reputation) delete effects.rep;
      applyEffect(state,effects,calculatedStamina);
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
    // 进出场：日志提示
    for(const name of (scene.left||[])){
      entries.push({t:"sys",text:name+" 起身离开了这里。"});
    }
    for(const name of (scene.entered||[])){
      entries.push({t:"sys",text:name+" 出现在这里。"});
    }
    // 在场名单：合并 entered、剔除离场/死亡、去重并限员，避免前后矛盾
    const leftSet = new Set(scene.left||[]);
    const basePresent = Array.isArray(scene.present) ? scene.present : (Array.isArray(state.present) ? state.present : []);
    const deadSet = new Set((state.cast||[]).filter(c=>c && c.dead).map(c=>c.name));
    const cleanPresent = [...new Set([...basePresent, ...(scene.entered||[])])]
      .filter(n=>n && !leftSet.has(n) && !deadSet.has(n))
      .slice(0,8);
    // 知识边界：不在场的人不能直接获得本幕的私密信息或亲密进展；托人带话/送信是唯一例外
    const presentSet = new Set(cleanPresent||[]);
    const sceneText = (scene.lines||[]).map(l=>l.text||"").join("\n") + " " + (scene.advance||"") + " " + (scene.summary||"");
    const hasMessenger = /(托人|带话|送信|捎信|传话|差人|打发人|派人)/.test(sceneText);
    const castUpdates = (scene.characters||[]).map(ch=>{
      if(!ch || !ch.name || presentSet.has(ch.name) || hasMessenger) return ch;
      const copy = {...ch};
      delete copy.knows;
      delete copy.intimacy;
      return copy;
    });
    let nextCast = updateCast(state.cast, castUpdates, scene.lines);
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
      if(Number.isFinite(cAff) && cAff<=3 && /敌|恨|仇|不满|戒备|提防/.test(c.attitude||"") && (state.wanted||0)>=15){
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
    if(state.infiniteMode){
      const onStage = new Set(finalPresent||[]);
      for(const c of nextCast){
        if(!c || !c.name) continue;
        const tieText = [c.tie,c.relation,c.attitude,c.identity,c.goal].filter(Boolean).join(" ");
        const bonded = c.core===true || c.antagonist===true || c.nemesis===true || c.recurring===true
          || (state.aff?.[c.name]||0)>=55 || (state.intimacy?.[c.name]||0)>=35
          || /(宿敌|死对头|仇敌|宿怨|长期对手|长期盟友|家人|伴侣|未婚|夫|妻|父|母|子|女|兄弟|姐妹|债主|上司|师父|徒弟)/.test(tieText);
        if(onStage.has(c.name)){
          c.lastSeenTurn = nextTurn;
          c.offstage = false;
        }else{
          if(!Number.isFinite(c.lastSeenTurn)) c.lastSeenTurn = state.turn || 0;
          if(nextTurn - c.lastSeenTurn >= 8){
            c.offstage = !bonded;
          }else if(bonded){
            c.offstage = false;
          }
        }
      }
    }
    const previous = S;
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
    S = {
      ...state,
      ...market,
      turn:nextTurn,
      idleCount: idle ? Math.min(6, (state.idleCount||0)+1) : Math.max(0, (state.idleCount||0)-1),
      scene:scene.scene||state.scene,
      summary:scene.summary||state.summary,
      environment,
      reputationScope:scene.community || (place===previousPlace ? state.reputationScope : "")
        || place || scene.reputation?.scope || "",
      cast:nextCast,
      lifeEvents,
      lifeReactions:reactions.records,
      present:finalPresent,
      plot:{...state.plot,...Object.fromEntries(Object.entries(scene.plot).filter(([,text])=>text))},
      consequences:advanceConsequences(state.consequences,scene,nextTurn,choice,environment.minute),
      memory:[...new Set([...state.memory,...scene.memory])].slice(-40),
      history:[...prior,action,{role:"assistant",content:raw}].slice(-16),
      choices:scene.choices,
      ending:scene.ending,
      worldWindow: state.world ? advanceWorldWindow(state, nextTurn, scene.worldProgress) : (state.worldWindow||0),
      lastProse: Boolean(scene.prose),
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
    const needsFile = new Set([...(Array.isArray(S.present)?S.present:[]),...(scene.entered||[])]);
    for(const name of needsFile){
      if(!name) continue;
      if(S.cast.some(c=>c.name===name)) continue;
      S.cast.push({name,background:"",goal:"",attitude:"",knows:"",changes:[]});
    }
    // 若当前对话对象已不在场，切回不限
    if(S.talkTarget && !(Array.isArray(S.present)&&S.present.includes(S.talkTarget))) S.talkTarget = "";
    // 任务：AI 可下发多个新任务（内容隐藏，后台存在，玩家界面不可见）
    // 恋爱/日常弱化任务系统：不登记外部委托，避免 NPC 反复催办
    const noNag = state.noNagUntil && state.noNagUntil >= nextTurn;
    const weakenTasks = isRomanceMode(state) || state.afterglow>0 || state.intimateActive || noNag;
    const taskMax = taskProfileFor(state).max;
    const activeQuestsCount = ()=>S.quests.filter(q=>!q.done && !q.abandoned).length;
    for(const q of (weakenTasks ? [] : scene.questAdd)){
      if(S.quests.some(x=>x.id===q.id || x.title===q.title)) continue;
      if(activeQuestsCount() >= taskMax) break;
      S.quests.push({id:q.id||("q"+S.turn+"_"+S.quests.length),title:q.title,desc:q.desc||"",
        secret:q.secret||"",reward:q.reward||null,done:false,revealed:false,abandoned:false,addedTurn:S.turn});
    }
    // 玩家拒绝/放弃的任务：标记为已放弃，之后不再出现在 AI 的上下文里，避免 NPC 反复催
    for(const id of (scene.questDrop||[])){
      const q = S.quests.find(x=>x.id===id || x.title===id);
      if(q){
        q.abandoned = true;
        const a = "委托「"+q.title+"」已被玩家拒绝/放弃，之后再也不要提起。";
        S.anchors = S.anchors||[]; if(!S.anchors.includes(a)) S.anchors.push(a); S.anchors = S.anchors.slice(-24);
      }
    }
    const questRewards = [];
    for(const id of scene.questDone){
      const q = S.quests.find(x=>x.id===id || x.title===id);
      if(q && !q.done && !q.abandoned){
        q.done = true;
        q.revealed = true;
        questRewards.push({id:q.id || id,reward:q.reward || {}});
      }
    }
    // 过期任务自动放弃：太久没推进的任务不再出现在 AI 上下文里，避免长期纠缠
    for(const q of S.quests){
      if(q.done || q.abandoned) continue;
      if(!Number.isFinite(q.addedTurn)) q.addedTurn = S.turn;
      else if(S.turn - q.addedTurn >= 18) q.abandoned = true;
    }
    // 隐藏阶段寿命：当前阶段每过一幕 +1；新阶段/完成/失败时归零
    S.hiddenStageTurns = (state.hiddenQuest && state.hiddenQuest.status==="active") ? (state.hiddenStageTurns||0)+1 : 0;
    if(S.infiniteMode && state.eventBeatDue){
      S.lastBeatMinute = S.environment.minute;
      S.beatCount = (S.beatCount||0)+1;
      S.nextBeatMinute = (S.environment.minute||0) + 240 + Math.floor(Math.random()*121);
    }
    delete S.eventBeatDue;
    // 隐藏主线：分阶段推进（玩家不可见）。完成一阶段 → 领取奖励 → 等 AI 开启下一阶段
    if(scene.hiddenQuest){
      const hq = scene.hiddenQuest;
      const prev = S.hiddenQuest;
      if(!prev || (hq.status==="active" && prev.status!=="active")){
        // 首次建立，或上一阶段完成后开启新阶段
        const nextStage = prev ? Math.max(S.hiddenStage||0, prev.stage||0) + 1 : 1;
        S.hiddenQuest = {
          title:hq.title || ("第"+nextStage+"阶段"), desc:hq.desc||"", stakes:hq.stakes||"",
          status:"active", reward:hq.reward || {},
          stage:nextStage, final:Boolean(hq.final)
        };
        S.hiddenStage = nextStage;
        S.hiddenStageStartedMinute = S.environment.minute;
        S.hiddenStageTurns = 0;
        S.hiddenNextPending = false;
        if(prev && prev.status==="done"){
          entries.push({t:"sys",text:"旧的悬念刚刚落定，新的暗流又悄然涌动。"});
        }
      }else if(hq.status==="active" && prev.status==="active"){
        // 当前阶段内的更新
        S.hiddenQuest = {...prev,
          title:hq.title||prev.title, desc:hq.desc||prev.desc, stakes:hq.stakes||prev.stakes,
          reward:hq.reward||prev.reward, final:Boolean(hq.final)||Boolean(prev.final)};
      }else if(hq.status==="done" && prev.status==="active"){
        S.hiddenQuest = {...prev, status:"done"};
        S.hiddenArc = [...(S.hiddenArc||[]), {stage:prev.stage||S.hiddenStage||1, title:prev.title, desc:prev.desc, outcome:"done"}].slice(-12);
        S.hiddenStage = Math.max(S.hiddenStage||0, prev.stage||1);
        S.hiddenStageTurns = 0;
        // 阶段完成写入长期锚点，避免长局遗忘关键转折
        { const a = "第"+(prev.stage||1)+"阶段「"+prev.title+"」已完成"+(prev.desc?"："+prev.desc:""); S.anchors = S.anchors||[]; if(!S.anchors.includes(a)) S.anchors.push(a); S.anchors = S.anchors.slice(-24); }
        questRewards.push({id:"@stage",reward:prev.reward || {}});
        entries.push({t:"sys",text:"压在心头的一件事终于落了地。"});
        if(S.infiniteMode){
          S.hiddenNextPending = true;
          entries.push({t:"sys",text:"这一段主线告一段落，但故事还在继续。"});
        }else if(hq.final || prev.final){
          if(!S.ending) S.ending = {good:true,title:prev.title||"尘埃落定",text:hq.desc||prev.desc||"这条贯穿始终的暗线，到此收束。"};
        }else{
          S.hiddenNextPending = true;   // 下一幕让 AI 开启新阶段
        }
      }else if(hq.status==="failed" && prev.status==="active"){
        S.hiddenQuest = {...prev, status:"failed"};
        S.hiddenStageTurns = 0;
        S.hiddenArc = [...(S.hiddenArc||[]), {stage:prev.stage||1, title:prev.title, desc:prev.desc, outcome:"failed"}].slice(-12);
        if(S.infiniteMode){
          entries.push({t:"sys",text:"你失去了些什么，但路还没走完。"});
        }else if(!S.ending){
          S.ending = {good:false,title:"隐秘的代价",text:hq.stakes||prev.stakes||"你没能守住那件从一开始就压在你肩上的事。有些机会，错过了就是一辈子——这一夜，以遗憾收场。"};
          entries.push({t:"sys",text:"你隐约觉得，有什么重要的东西永远地失去了。"});
        }
      }
    }
    settleQuestRewards(S,scene,questRewards,Boolean(choice));
    // 无限模式：伏笔账本——新篇章种下带冲突与依据的伏笔，按时推进/回收
    if(S.infiniteMode){
      const seeds = Array.isArray(S.arcSeeds) ? S.arcSeeds : [];
      for(const f of (scene.foreshadowAdd||[])){
        if(!f.hint || !f.conflict || !f.basis) continue;
        if(seeds.some(x=>x && x.hint===f.hint)) continue;
        seeds.push({id:"fs"+nextTurn+"_"+seeds.length,hint:f.hint,conflict:f.conflict,basis:f.basis,
          status:"planted",plantedTurn:nextTurn,dueTurn:nextTurn+(f.due||3),
          plantedMinute:S.environment.minute,dueMinute:(S.environment.minute||0)+(f.due||3)*60});
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
      S.arcSeeds = seeds.slice(-12);
    }
    const reputationDelta = S.rep-previous.rep;
    if(scene.reputation && reputationDelta){
      const {scope,reason} = scene.reputation;
      const oldScore = (S.reputations||[]).find(r=>r.scope===scope)?.score || 0;
      const score = clamp(oldScore+reputationDelta,-100,100);
      S.rep = previous.rep+score-oldScore;
      S.reputations = [...(S.reputations||[]).filter(r=>r.scope!==scope),
        {scope,score,reason}].slice(-24);
      entries.push({t:"sys",text:scope+"的口碑 · "+reason});
    }
    // 核心设定锚点：始终成立、不可被后续遗忘或篡改
    if(scene.anchors && scene.anchors.length){
      const existing = new Set(S.anchors||[]);
      for(const a of scene.anchors){ if(a && !existing.has(a)){ existing.add(a); } }
      S.anchors = [...existing].slice(-24);
    }
    // 物品与能力
    for(const it of scene.items){
      const name = typeof it==="string" ? it : it.name;
      if(!name) continue;
      const ex = S.items.find(x=>x.name===name);
      if(ex){ if(Number.isFinite(it.qty)) ex.qty = (ex.qty||1) + it.qty; continue; }
      S.items.push({name, desc:(it&&it.desc)||"", value:(it&&it.value), effect:(it&&it.effect), consumable:(it&&it.consumable), qty:(it&&it.qty)||1});
      entries.push({t:"reward",text:"获得物品："+name});
    }
    for(const name of scene.abilities){
      if(!S.abilities.some(a=>a.name===name)){
        S.abilities.push({name,desc:""});
        entries.push({t:"reward",text:"习得能力："+name});
      }
    }
    // 欲望自然累积（与好感/亲密度独立）：五维随时间缓慢上涨，性欲涨得稍快
    // 但若本幕 AI 明确让欲望骤降/归零（扫兴、惊吓、厌恶等），这一轮不再自动回涨
    if(!S.ending && state.turn>0){
      const dvn = ensureDrives(S);
      const effN = scene.effects || {};
      const sexDropped = Number.isFinite(effN.desire) && effN.desire < 0;
      const explicitNpc = new Set((scene.characters||[]).filter(c=>c && c.name && c.desire!==undefined).map(c=>c.name));
      for(const k of DRIVE_KEYS){
        if(k==="sex" && sexDropped) continue;
        dvn[k] = clamp(dvn[k] + (k==="sex"?2:1), 0, 100);
      }
      // 四维欲望各自的独有后果：高欲望时若得不到满足，会以不同方式累积/反噬
      if(dvn.people>=60 && (!S.present || !S.present.length)){
        dvn.people = clamp(dvn.people+1, 0, 100);
        S.hp = Math.max(0,S.hp-1);                    // 孤独消耗
      }
      if(dvn.power>=60 && Number.isFinite(effN.rep) && effN.rep < 0){
        dvn.power = clamp(dvn.power+2, 0, 100);          // 被驳面子，更想掌权
      }
      if(dvn.money>=60 && (S.moneyTotals?.income||0)===(previous.moneyTotals?.income||0)){
        dvn.money = clamp(dvn.money+1, 0, 100);          // 没进账就焦虑
      }
      if(dvn.items>=60 && scene.items && scene.items.length===0 && /得到|获得|拿到|拾到|买到|收下/.test((scene.advance||""))){
        dvn.items = clamp(dvn.items+1, 0, 100);
      }
      S.desire = dvn.sex;
      if(Array.isArray(S.present)){
        for(const nm of S.present){
          if(explicitNpc.has(nm)) continue;
          const c = S.cast.find(x=>x.name===nm);
          if(c && c.adult!==false) c.desire = clamp((c.desire||0)+2, 0, 100);
        }
      }
    }
    // 余韵期硬上限：不管 AI 怎么写，刚做完的人不会立刻又满格欲望
    if(state.refractoryThisTurn){
      for(const c of S.cast){
        if(c && c.adult!==false && (S.present||[]).includes(c.name)){
          c.desire = clamp(Math.min(c.desire||0, 60), 0, 100);
        }
      }
      delete S.refractoryThisTurn;
    }
    if(previous.hp>0 && S.hp<=0 && !S.ending){
      entries.push({t:"sys",text:"你已经力竭。可以停下喘息、找地方休息，或开口向周围的人求助。"});
    }
    // 通缉度过高 → 被追捕，触发坏结局
    if((S.wanted||0)>=90 && !S.ending && !S.infiniteMode){
      S.ending = {good:false,title:"法网难逃",text:"官府终于动了真格。巡捕循着积压的报案与线人的口供，摸到了你的落脚处。火把照亮雨幕，刀剑出鞘的声音在巷口响起。你犯下的事一桩桩被翻了出来，这一次，没人再能压下案子——你没能走出这座城。"};
      entries.push({t:"sys",text:"你的罪行终于被官府追查到底。"});
    }
    if(choice && choice.endingRequest && !S.ending){
      S.ending = {good:true,title:"故事到此为止",text:"你选择在这里停下。之后的事，留给想象。"};
    }
    ensureEconomy(S);
    if(choice){
      const changes = describeStatChanges(previous,S,curName(S));
      if(changes) entries.push({t:"reward",text:"本幕合计 · "+changes});
    }
    if(timeSkip){
      const fact = "时间跳跃："+skipLabel+"（第"+nextTurn+"幕，"+formatClock(S)+"）";
      S.keyFacts = [...new Set([...(S.keyFacts||[]),fact])].slice(-50);
      S.anchors = [...new Set([...(S.anchors||[]),fact])].slice(-30);
      entries.push({t:"sys",text:"时间过去了 "+skipLabel+"，现在是 "+formatClock(S)+"。"});
      if(economicMode(S)!=="barter"){
        const period = {label:skipLabel,before:money.openingCash,after:S.coin,
          income:(S.moneyTotals?.income||0)-(previous.moneyTotals?.income||0),
          expense:(S.moneyTotals?.expense||0)-(previous.moneyTotals?.expense||0),
          unpaid:[...money.skippedExpenses.values()].reduce((sum,n)=>sum+n,0)};
        period.principal = period.after-period.before-period.income+period.expense;
        S.lastTimeSettlement = period;
        entries.push({t:"sys",text:"期间收支 · "+timeSettlementText(S,period)});
      }
    }
    // 账本与不可遗忘事实
    {
      const detail = [choice && choice.text, scene.advance, ...(scene.lines||[]).map(l=>l.text)].filter(Boolean).join(" ").slice(0,260);
      const paid = Math.max(0,(S.moneyTotals?.expense||0)-(previous.moneyTotals?.expense||0));
      if(paid > 0){
        S.ledger = [...(S.ledger||[]),{turn:nextTurn,amount:paid,detail:scene.payment||detail,place:S.environment.place||""}];
        S.ledger = S.ledger.slice(-30);
        if(scene.payment && /(房租|租金|房钱|账单|欠款|还债)/.test(scene.payment)){
          const a = "已支付/处理："+detail.slice(0,170)+"（不要重复索要）";
          S.anchors = [...new Set([...(S.anchors||[]),a])].slice(-30);
        }
      }
      const facts = [scene.advance,...(scene.anchors||[])].filter(text=>text && /改嫁|结婚|离婚|破产|入狱|失踪/.test(text));
      if(facts.length){
        S.keyFacts = S.keyFacts || [];
        for(const f of facts){ if(f && !S.keyFacts.includes(f)) S.keyFacts.push(f); }
        S.keyFacts = S.keyFacts.slice(-50);
      }
    }
    ensureEconomy(S);
    ensureAvatars(S);
    compactLongRunState(S);
    S.log = [...previous.log,...entries].slice(-120);
    pendingSpeech?.remove();
    entries.forEach(logToDOM);
    limitLog();
    if(beforeTurn){
      undoStack.push(beforeTurn);
      if(undoStack.length > UNDO_LIMIT) undoStack.shift();
    }
    showCurrentScene();
    saveProgress();
    syncUndoButton();
    if(S.sceneImageAuto) autoSceneImage();
  }catch(e){
    if(activeTurn!==turn) return;
    window.__lastTurnError = e;
    const message = e.name==="TimeoutError" ? "这一幕生成超时。" : e.name==="TypeError" ? "网络连接中断。" :
      e instanceof SyntaxError ? "AI 返回的剧情不完整。" : e.message;
    showSpeechInput($("action-text").value || speech?.text);
    aiMessage(message, [[speech ? "重新发送" : "重试这一幕",()=>aiTurn(choice)],...(choice ? [[speech ? "编辑这句话" : "返回选项",returnToChoices]] : [])]);
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
  return parts.length ? "<br><br><span style=\"color:var(--muted);font-size:13px\">"+parts.join(" · ")+"</span>" : "";
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
    <div class="end-text">${escapeHtml(end.text||"").replace(/\n/g,"<br>")}<br><br><b>${escapeHtml(localReputation(S).label)} · ${escapeHtml(curName(S))} ${S.coin} · 体力 ${S.hp}</b>${endingSummary()}</div>
    <div class="card-btns">
      <button class="big-btn" id="btn-title">返回酒馆首页</button>
      <button class="big-btn ghost" id="btn-end-save">保存这一夜</button>
      <div class="form-note" id="ending-status" role="status"></div>
    </div>`;
  $("btn-end-save").onclick = ()=>saveProgress(true);
  $("btn-title").onclick = showTitle;
}

