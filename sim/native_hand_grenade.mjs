// Cooked hand grenades. The fuse is the live one: 4 s from the pin, three
// carried, one back every 20 s. Hold T, LB or the round button, release to
// throw. Hold it too long and it goes off in the hand. A thrown one only
// waits on the fuse — it does not explode on contact.
export const NATIVE_HAND_GRENADE_VERSION="cooked-hand-grenade-v1";
const FUSE_MS=4000,MAX_CARRY=3,REGEN_MS=20000,DRAG_PX=110;
const $=id=>typeof document==="undefined"?null:document.getElementById(id);
let installed=false,btn=null,cooking=null,carry=MAX_CARRY,regenAt=0,lastTick=0,padLB=false,keyT=false,game=null;
function canUse(){
  const w=globalThis.__arondightWalkMode;
  return game?.mode==="foot"&&!w?.dead&&!globalThis.__arondightPlayerDamageModel?.dead;
}
function blocked(){
  const menu=$("gameMenu");
  if(menu&&!menu.hidden)return true;
  return Boolean(document.querySelector("dialog[open],#quitConfirmDialog"));
}
function unit(v){const l=Math.hypot(v[0],v[1],v[2]);return l<1e-6?[0,1,0]:[v[0]/l,v[1]/l,v[2]/l];}
function hand(){
  const cam=game?.world?.camera;if(!cam?.eye||!cam?.target)return null;
  const f=unit([cam.target[0]-cam.eye[0],cam.target[1]-cam.eye[1],cam.target[2]-cam.eye[2]]);
  const fl=Math.hypot(f[0],f[1])||1,flat=[f[0]/fl,f[1]/fl,0],right=[flat[1],-flat[0],0];
  const origin=[cam.eye[0]+flat[0]*.45+right[0]*.2,cam.eye[1]+flat[1]*.45+right[1]*.2,cam.eye[2]-.12];
  const dir=unit([f[0],f[1],f[2]+.26]);
  return {origin,dir};
}
export function pull(source="touch"){
  if(cooking||!canUse()||carry<=0||blocked())return false;
  carry--;if(!regenAt)regenAt=performance.now()+REGEN_MS;
  cooking={at:performance.now(),power:.7,source};lastTick=0;render();
  const v=$("viewport");if(v)v.dataset.handGrenade="cooking";
  return true;
}
export function release(){
  if(!cooking)return false;
  const ck=cooking;cooking=null;
  const h=hand(),api=globalThis.__arondightFootWeapons;
  if(!h||!api?.throwHandGrenade){render();return false;}
  const speed=9+13*Math.max(0,Math.min(1,ck.power));
  const J=globalThis.__arondightWalkJump||{};
  const vel=[h.dir[0]*speed+(Number(J.vx)||0),h.dir[1]*speed+(Number(J.vy)||0),h.dir[2]*speed];
  const ok=api.throwHandGrenade({origin:h.origin,velocity:vel,fuseAt:ck.at+FUSE_MS,source:`hand-grenade:${ck.source}`});
  if(ok&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("arondight:weapon-fired",{detail:{weapon:"hand-grenade",intensity:.2,source:ck.source,mode:"foot"}}));
  const v=$("viewport");
  if(v){v.dataset.handGrenade="thrown";v.dataset.handGrenadeThrows=String((Number(v.dataset.handGrenadeThrows)||0)+1);v.dataset.handGrenadeCookedMs=String(Math.round(performance.now()-ck.at));}
  render();
  return ok;
}
function cookOff(reason){
  const ck=cooking;cooking=null;
  const h=hand();
  if(h){
    if(reason==="dropped")globalThis.__arondightFootWeapons?.throwHandGrenade?.({origin:[h.origin[0],h.origin[1],h.origin[2]-1],velocity:[0,0,-1],fuseAt:ck.at+FUSE_MS,source:"hand-grenade:dropped"});
    else globalThis.__arondightFootWeapons?.explodeAt?.(h.origin,"hand-grenade:cooked-off");
  }
  const v=$("viewport");if(v)v.dataset.handGrenade=reason;
  render();
}
function ensureButton(){
  const v=$("viewport");if(!v||typeof document==="undefined")return null;
  if(btn?.isConnected)return btn;
  btn=document.createElement("button");btn.id="handGrenadeBtn";btn.type="button";
  btn.setAttribute("aria-label","Hand grenade: press to pull the pin, release to throw");
  btn.innerHTML='<b>●</b><small>GRANATE</small><i></i>';
  v.appendChild(btn);
  const st=document.createElement("style");st.dataset.handGrenade=NATIVE_HAND_GRENADE_VERSION;
  st.textContent=`#handGrenadeBtn{position:absolute;z-index:23;display:none;width:64px;height:64px;border:0;border-radius:50%;background:#1c2414d8;color:#e9f2d8;touch-action:none;flex-direction:column;align-items:center;justify-content:center}
#handGrenadeBtn.show{display:flex}#handGrenadeBtn b{font:900 20px/1 system-ui}#handGrenadeBtn small{font:800 7.5px/1 system-ui;letter-spacing:.08em}
#handGrenadeBtn i{position:absolute;right:-4px;top:-4px;min-width:18px;height:18px;border-radius:9px;background:#ffd76a;color:#111;font:900 11px/18px system-ui;font-style:normal;text-align:center}
#handGrenadeBtn.cooking{background:#3a1c0ce8}#handGrenadeBtn.empty{opacity:.45}`;
  document.head.appendChild(st);
  let pid=null,startY=0;
  btn.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();if(pid!==null||!pull("touch"))return;pid=e.pointerId;startY=e.clientY;},{capture:true});
  btn.addEventListener("pointermove",e=>{if(e.pointerId!==pid||!cooking)return;cooking.power=Math.max(0,Math.min(1,.7+(startY-e.clientY)/DRAG_PX*.6));e.preventDefault();e.stopPropagation();},{capture:true});
  const up=e=>{if(e.pointerId!==pid)return;pid=null;e.preventDefault();e.stopPropagation();release();};
  btn.addEventListener("pointerup",up,{capture:true});
  btn.addEventListener("pointercancel",up,{capture:true});
  return btn;
}
function touchPlay(){
  const b=document.body;
  return !b.classList.contains("desktop-input")&&!b.classList.contains("player-driving")&&!b.classList.contains("jet-mode")&&(b.classList.contains("on-foot-mode")||game?.mode==="foot");
}
function place(){
  const b=ensureButton();if(!b)return;
  const stick=$("footMove"),on=touchPlay()&&canUse()&&stick&&stick.offsetParent;
  b.classList.toggle("show",Boolean(on));
  if(!on)return;
  const top=Math.max(8,(stick.offsetTop||0)-66);
  b.style.left=`${Math.round((stick.offsetLeft||0)+(stick.offsetWidth||0)-38)}px`;
  b.style.top=`${Math.round(top)}px`;
}
function render(){
  const b=ensureButton();if(!b)return;
  const now=performance.now(),left=cooking?Math.max(0,FUSE_MS-(now-cooking.at)):0;
  b.classList.toggle("cooking",Boolean(cooking));
  b.classList.toggle("empty",!cooking&&carry<=0);
  const label=b.querySelector("b"),count=b.querySelector("i");
  if(label)label.textContent=cooking?(left/1000).toFixed(1):"●";
  if(count)count.textContent=String(carry);
}
function frame(){
  requestAnimationFrame(frame);
  const now=performance.now();
  if(carry<MAX_CARRY&&regenAt&&now>=regenAt){carry++;regenAt=carry<MAX_CARRY?now+REGEN_MS:0;render();}
  if(cooking){
    const held=now-cooking.at;
    if(!canUse()){cookOff("dropped");return;}
    if(held>=FUSE_MS){cookOff("cooked-off");return;}
    const sec=Math.floor(held/1000);
    if(sec>=lastTick)lastTick=sec+1;
    render();
  }
  let pad=null;
  for(const p of navigator.getGamepads?.()||[])if(p?.connected){pad=p;break;}
  const lb=Boolean(pad?.buttons?.[4]?.pressed);
  if(lb&&!padLB&&canUse())pull("pad");
  else if(!lb&&padLB&&cooking?.source==="pad")release();
  padLB=lb;
}
export function installNativeHandGrenade(runtime){
  if(installed||typeof window==="undefined")return;
  installed=true;game=runtime;
  addEventListener("keydown",e=>{
    if(e.code!=="KeyT"||e.repeat||e.metaKey||e.ctrlKey||e.altKey||blocked())return;
    const typing=e.target instanceof Element&&e.target.closest("input,textarea,select,[contenteditable=true]");
    if(typing)return;
    if(pull("keyboard")){keyT=true;e.preventDefault();}
  });
  addEventListener("keyup",e=>{if(e.code==="KeyT"&&keyT){keyT=false;if(cooking?.source==="keyboard")release();}});
  setInterval(place,250);
  requestAnimationFrame(frame);
  globalThis.__arondightHandGrenade={pull,release,get cooking(){return cooking?{msLeft:Math.max(0,FUSE_MS-(performance.now()-cooking.at)),power:cooking.power}:null;},get carry(){return carry;},version:NATIVE_HAND_GRENADE_VERSION};
}
