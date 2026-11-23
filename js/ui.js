"use strict";
/* ==================== UI 事件 ==================== */
const mobileSide = matchMedia("(max-width:680px), (orientation:landscape) and (max-height:540px)");
const splitPlay = matchMedia("(orientation:landscape) and (min-width:520px) and (max-height:540px)");
function resetChoiceExpansion(){
  choicesExpanded = !S.ai || !mobileSide.matches || splitPlay.matches;
  syncChoiceList();
}
$("btn-choices").onclick = ()=>{
  choicesExpanded = !choicesExpanded;
  syncChoiceList();
};
splitPlay.addEventListener("change",resetChoiceExpansion);
const side = $("story-side"), main = side.closest(".main"), backdrop = $("side-backdrop");
function syncSide(){
  const drawerOpen = mobileSide.matches && side.classList.contains("open");
  const open = mobileSide.matches ? drawerOpen : !main.classList.contains("side-closed");
  $("btn-side").setAttribute("aria-expanded",String(open));
  side.inert = !open;
  for(const panel of document.querySelectorAll(".play-header,.log,.play-controls")){
    panel.inert = drawerOpen;
  }
}
function closeDrawer(){
  side.classList.remove("open");
  backdrop.classList.remove("show");
  syncSide();
}
function focusDrawer(){
  if(side.classList.contains("open") && !side.contains(document.activeElement)){
    $("side-close").focus({preventScroll:true});
  }
}
side.addEventListener("transitionend",e=>{
  if(e.target===side && e.propertyName==="transform") focusDrawer();
});
$("btn-side").onclick = ()=>{
  if(mobileSide.matches){
    const open = side.classList.toggle("open");
    backdrop.classList.toggle("show",open);
    syncSide();
    if(open) requestAnimationFrame(focusDrawer);
    return;
  }
  main.classList.toggle("side-closed");
  syncSide();
};
function dismissDrawer(){
  closeDrawer();
  $("btn-side").focus();
}
backdrop.onclick = dismissDrawer;
$("side-close").onclick = dismissDrawer;
mobileSide.addEventListener("change",()=>{
  main.classList.remove("side-closed");
  closeDrawer();
  resetChoiceExpansion();
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && side.classList.contains("open")){
    dismissDrawer();
  }
});
syncSide();
$("action-text").addEventListener("focus",()=>{
  if(mobileSide.matches && !splitPlay.matches && choicesExpanded){
    choicesExpanded = false;
    syncChoiceList();
  }
});
$("action-text").oninput = e=>e.target.setCustomValidity("");
$("story-pace-mode").onchange = ({target})=>{
  if(activeTurn || !S.ai || S.ending || !$("overlay").classList.contains("hidden")){
    target.value = dailyPaceMode(S);
    return;
  }
  S.dailyPace = dailyPaceMode({dailyPace:target.value});
  if(S.turn) saveProgress();
};
$("action-text").onkeydown = e=>{
  if(e.key==="Enter" && !e.shiftKey && !e.isComposing && e.keyCode!==229){
    e.preventDefault();
    if(!activeTurn || activeTurn.automaticOpening) $("custom-action").requestSubmit();
  }
};
$("custom-action").onsubmit = e=>{
  e.preventDefault();
  if($("custom-action").hidden || !$("overlay").classList.contains("hidden")) return;
  if(activeTurn && !activeTurn.automaticOpening) return;
  const input = $("action-text"), text = input.value;
  if(!text.trim() || text.length>600){
    input.setCustomValidity("请输入 1 至 600 字。");
    input.reportValidity();
    return;
  }
  if(activeTurn) cancelTurn();
  clearIdleTimer();
  input.value = "";
  aiTurn({text,speech:true,target:S.talkTarget||""});
};
$("btn-undo").onclick = ()=>undoStory();
$("btn-menu").onclick = showTitle;

document.querySelectorAll(".side-tab").forEach(tab=>{
  tab.onclick = ()=>{
    document.querySelectorAll(".side-tab").forEach(t=>t.classList.remove("active"));
    tab.classList.add("active");
    npcDetailName = "";
    npcEditName = "";
    playerDetail = false;
    refreshSide();
  };
});

/* ==================== 登录 ==================== */
function showLogin(reason = "", {onSuccess = showTitle, onBack = showTitle} = {}){
  const ov = $("overlay"), card = $("card");
  ov.classList.remove("hidden");
  card.innerHTML = `
    <h1>暗夜酒馆</h1>
    <div class="sub">THE TAVERN · 一夜的故事</div>
    <form class="auth-form" id="auth-form">
      <label class="sr-only" for="auth-user">用户名</label>
      <input type="text" id="auth-user" placeholder="用户名" autocomplete="username" maxlength="20">
      <label class="sr-only" for="auth-pass">密码</label>
      <input type="password" id="auth-pass" placeholder="密码" autocomplete="current-password">
      <div class="auth-msg" id="auth-msg" role="status"></div>
      <button class="big-btn" id="auth-submit">登录</button>
      <button type="button" class="big-btn ghost" id="auth-single">单机模式（无需登录，存档在本机）</button>
      <button type="button" class="big-btn ghost" id="auth-back">${onBack===showTitle ? "返回酒馆" : "返回编辑文字"}</button>
    </form>`;
  $("auth-msg").textContent = typeof reason==="string" ? reason : "";
  $("auth-back").onclick = onBack;
  $("auth-single").onclick = ()=>{
    try{ localStorage.setItem(SINGLE_KEY,"1"); }catch(e){}
    AUTH = {token:"single-local",username:"local"};
    saveAuth();
    location.reload();
  };
  card.scrollTop = 0;
  const doAuth = async e=>{
    e.preventDefault();
    const submit = $("auth-submit");
    if(submit.disabled) return;
    const username = ($("auth-user").value||"").trim();
    const password = $("auth-pass").value||"";
    const msg = $("auth-msg");
    if(!username || !password){ msg.textContent = "请输入用户名和密码"; return; }
    $("auth-submit").disabled = true;
    msg.textContent = "请稍候…";
    try{
      const d = await api("/api/login", { method:"POST", body:{ username, password } });
      if($("auth-submit")!==submit) return;
      AUTH = { token:d.token, username:d.username };
      saveAuth();
      await loadProviders();
      onSuccess();
    }catch(e){
      msg.textContent = e.message || "操作失败";
      submit.disabled = false;
    }
  };
  $("auth-form").onsubmit = doAuth;
  $("auth-user").focus();
}

