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

/* ==================== 氛围音效 ==================== */
const SOUND_KEY = "tavern_sound_v1";
const Sound = {
  ctx: null, master: null, nodes: [], on: false, timer: null,
  wanted: (()=>{ try{ return localStorage.getItem(SOUND_KEY)==="1"; }catch(e){ return false; } })(),

  ensure(){
    if(this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
  },

  noiseBuffer(seconds){
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
    return buf;
  },

  start(){
    this.ensure();
    if(!this.ctx || this.on) return;
    this.on = true;
    const ctx = this.ctx, now = ctx.currentTime;

    // 1) 雨声：白噪声经带通滤波
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuffer(4);
    rain.loop = true;
    const rainBP = ctx.createBiquadFilter();
    rainBP.type = "bandpass"; rainBP.frequency.value = 2400; rainBP.Q.value = 0.6;
    const rainGain = ctx.createGain(); rainGain.gain.value = 0.12;
    rain.connect(rainBP).connect(rainGain).connect(this.master);
    rain.start();
    this.nodes.push(rain);

    // 2) 低频雨垫：暗噪声
    const low = ctx.createBufferSource();
    low.buffer = this.noiseBuffer(4);
    low.loop = true;
    const lowLP = ctx.createBiquadFilter();
    lowLP.type = "lowpass"; lowLP.frequency.value = 420;
    const lowGain = ctx.createGain(); lowGain.gain.value = 0.18;
    low.connect(lowLP).connect(lowGain).connect(this.master);
    low.start();
    this.nodes.push(low);

    // 3) 炉火低频嗡鸣
    const drone = ctx.createOscillator();
    drone.type = "sine"; drone.frequency.value = 58;
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.04;
    drone.connect(droneGain).connect(this.master);
    drone.start();
    this.nodes.push(drone);

    // 淡入
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.9, now + 2.5);

    // 4) 炉火噼啪：随机脉冲
    const crackle = ()=>{
      if(!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(0.06);
      const bp = this.ctx.createBiquadFilter();
      bp.type = "highpass"; bp.frequency.value = 1200 + Math.random()*2600;
      const g = this.ctx.createGain();
      const peak = 0.05 + Math.random()*0.12;
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random()*0.08);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t); src.stop(t + 0.15);
      this.timer = setTimeout(crackle, 120 + Math.random()*900);
    };
    this.timer = setTimeout(crackle, 400);
  },

  stop(){
    if(!this.ctx) { this.on = false; return; }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    clearTimeout(this.timer);
    const nodes = this.nodes; this.nodes = [];
    setTimeout(()=>{ nodes.forEach(n=>{ try{ n.stop(); }catch(e){} }); }, 900);
    this.on = false;
  },

  set(enable){
    this.wanted = enable;
    try{ localStorage.setItem(SOUND_KEY, enable ? "1" : "0"); }catch(e){}
    const btn = $("btn-sound");
    if(enable){
      // 需用户手势后恢复 AudioContext
      this.ensure();
      if(this.ctx && this.ctx.state==="suspended") this.ctx.resume();
      this.start();
      btn.textContent = "🔊";
      btn.setAttribute("aria-pressed","true");
      btn.title = "关闭氛围音效";
    } else {
      this.stop();
      btn.textContent = "🔇";
      btn.setAttribute("aria-pressed","false");
      btn.title = "开启氛围音效";
    }
  }
};

$("btn-sound").onclick = ()=> Sound.set(!Sound.on);

// 首次用户交互时，若用户此前开启过音效，则恢复播放（浏览器需手势）
function resumeSoundOnGesture(){
  if(Sound.wanted && !Sound.on) Sound.set(true);
  window.removeEventListener("pointerdown", resumeSoundOnGesture);
  window.removeEventListener("keydown", resumeSoundOnGesture);
}
window.addEventListener("pointerdown", resumeSoundOnGesture, { once:false });
window.addEventListener("keydown", resumeSoundOnGesture, { once:false });
// 初始化按钮状态
(function initSoundBtn(){
  const btn = $("btn-sound");
  if(Sound.wanted){ btn.textContent = "🔊"; btn.setAttribute("aria-pressed","true"); btn.title="关闭氛围音效"; }
})();

