// The drone touch layer from simulator.mjs: same sticks, same height pad,
// same normalizedPointer and applyGameStick. Desktop hides it. Foot, car and
// jet keep the shared MOVE / LOOK sticks.
import {normalizedPointer,endPointerDrag} from "./control_semantics.mjs";
import {loadPhoneControlSettings} from "./drone_control_settings.mjs";

export const NATIVE_FLIGHT_TOUCH_VERSION="simulator-solo-sticks-v1";
const points={left:{x:0,y:0},right:{x:0,y:0},height:0};
const held={left:false,right:false,height:false};
export function readNativeFlightTouch(){
  return {touching:held.left||held.right||held.height,left:{...points.left},right:{...points.right},height:points.height,settings:loadPhoneControlSettings()};
}
function stick(el,kind){
  let pointer=null;
  const apply=e=>{const point=normalizedPointer(el,e);points[kind].x=point.x;points[kind].y=point.y;held[kind]=true;
    const knob=el.querySelector(".solo-knob");if(knob){knob.style.left=`${50+point.x*42}%`;knob.style.top=`${50+point.y*42}%`;}e.preventDefault();};
  el.addEventListener("pointerdown",e=>{pointer=e.pointerId;el.setPointerCapture?.(pointer);apply(e);});
  el.addEventListener("pointermove",e=>{if(e.pointerId===pointer)apply(e);});
  const release=e=>{if(pointer===null||(e?.pointerId!=null&&e.pointerId!==pointer))return;endPointerDrag(el,pointer);pointer=null;points[kind].x=points[kind].y=0;held[kind]=false;
    const knob=el.querySelector(".solo-knob");if(knob){knob.style.left="50%";knob.style.top="50%";}e?.preventDefault();};
  el.addEventListener("pointerup",release);el.addEventListener("pointercancel",release);el.addEventListener("lostpointercapture",release);
}
export function installNativeFlightTouch(){
  if(typeof document==="undefined"||document.getElementById("soloHud"))return;
  const view=document.getElementById("viewport");if(!view)return;
  const hud=document.createElement("div");hud.id="soloHud";
  hud.innerHTML=`<div id="soloTopbar" data-toolbar-layout="actions-status-v1"><div id="soloTopbarActions" role="toolbar" aria-label="Simulator actions"><button id="soloExit" type="button">EXIT</button><button id="soloReset" type="button">RESET</button></div><div id="soloTopbarStatus" role="status" aria-label="Flight status"><span id="soloState">DISARMED</span><span id="soloAlt">AGL 0.0 m</span><span id="soloGamepadStatus" hidden>XBOX</span></div></div>
  <div id="soloLeft" class="solo-stick"><div class="solo-ring"></div><div class="solo-knob"></div><span>FWD / STRAFE</span></div>
  <div id="soloClearance"><small>ALT TARGET</small><strong id="soloClearanceValue">1.2 m</strong><div id="soloHeightPad" class="solo-height-pad" aria-label="Climb or descend altitude target"><span class="solo-height-up">CLIMB</span><div class="solo-height-track"></div><div id="soloHeightKnob" class="solo-height-knob"></div><span class="solo-height-hold">HOLD</span><span class="solo-height-down">DESCEND</span></div><span id="soloRangeStatus">AGL —</span></div>
  <div id="soloRight" class="solo-stick"><div class="solo-ring"></div><div class="solo-knob"></div><span>TURN / PITCH</span></div>
  <div id="soloGamepadHelp" hidden>LS MOVE · RS TURN/PITCH · LT/RT ALT −/+ · LB+RS LOOK · RB FIRE · A ARM · Y WEAPON · VIEW CAM · ↓ ON FOOT</div>`;
  view.appendChild(hud);
  const actions=hud.querySelector("#soloTopbarActions");
  const toolbar=document.getElementById("toolbar");
  if(actions&&toolbar){for(const node of [...toolbar.children])actions.appendChild(node);toolbar.hidden=true;}
  const foot=document.createElement("div");foot.id="footHud";
  foot.innerHTML=`<div id="footLookZone" aria-label="Drag anywhere to look"></div><div id="footReadout"><b>WALK</b></div><div id="footReticle" aria-hidden="true"></div>
  <div id="footMove" class="foot-stick" aria-label="Move"><div class="ring"></div><div class="knob"></div><span>MOVE</span></div>
  <div id="footLook" class="foot-stick" aria-label="Look"><div class="ring"></div><div class="knob"></div><span>LOOK</span></div>
  <button id="footFire" type="button">FIRE</button><button id="footJump" type="button">JUMP</button>`;
  view.appendChild(foot);
  const style=document.createElement("style");style.dataset.nativeFlightTouch=NATIVE_FLIGHT_TOUCH_VERSION;
  style.textContent=`#soloHud{display:block;position:absolute;inset:0;z-index:8;pointer-events:none}
#hud,#help,#toolbar{display:none!important}
body.solo-flight #soloTopbar{top:max(5px,env(safe-area-inset-top));left:50%;width:min(calc(100% - 16px),980px);transform:translateX(-50%);display:grid;grid-template-rows:auto auto;gap:4px;position:absolute;z-index:30;pointer-events:none}
body.solo-flight #soloTopbarActions{display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;padding:4px;border:1px solid #7cccfb3b;border-radius:12px;background:linear-gradient(180deg,#0d2133e8,#071522dc);box-shadow:0 7px 22px #0006,inset 0 1px #ffffff12;pointer-events:auto}
body.solo-flight #soloTopbarStatus{display:flex;align-items:center;justify-content:center;gap:4px;pointer-events:none}
body.solo-flight #soloTopbar button,body.solo-flight #soloTopbar span{box-sizing:border-box;padding:5px 8px;font:800 10px/1 system-ui,sans-serif;border-radius:8px;white-space:nowrap;color:#e7f4ff}
body.solo-flight #soloTopbar button{display:inline-flex;align-items:center;justify-content:center;min-height:30px;border:1px solid #6b839b77;background:#102033;cursor:pointer}
body.solo-flight #soloTopbar button[aria-pressed=true]{background:#ffb42d;color:#162136;border-color:#ffb42d}
body.solo-flight #soloTopbarStatus>span{display:inline-flex;align-items:center;min-height:20px;padding:3px 7px;border:1px solid #8ecdf02d;background:#071522c2;color:#d9efff;font-size:9px}
body.solo-flight #soloExit{background:#672532df;border-color:#d76f7d77}
body.solo-flight #soloReset{background:#704819dc;border-color:#e1ad6170}
body.solo-flight #soloCamera{background:#164c6cdd}
body.desktop-input #soloLeft,body.desktop-input #soloRight,body.desktop-input #soloClearance,body.desktop-input #soloArm,body.desktop-input #soloKill{display:none!important}
body.pad-input #soloGamepadHelp{display:block!important}
.solo-stick{position:absolute;width:min(34vw,230px);aspect-ratio:1;bottom:max(18px,env(safe-area-inset-bottom));pointer-events:auto;touch-action:none}
#soloLeft{left:max(16px,env(safe-area-inset-left))}#soloRight{right:max(16px,env(safe-area-inset-right))}
.solo-ring{position:absolute;inset:0;border-radius:50%;border:2px solid #ffffff66;background:#0b18265c}
.solo-knob{position:absolute;left:50%;top:50%;width:31%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:#f3f7ffcc;border:2px solid #fff}
.solo-stick span{position:absolute;left:50%;bottom:-18px;transform:translateX(-50%);font-size:10px;font-weight:800;letter-spacing:.08em;color:#fff}
#soloClearance{position:absolute;left:50%;bottom:max(96px,calc(env(safe-area-inset-bottom) + 80px));transform:translateX(-50%);width:66px;height:176px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:8px 5px;border:1px solid #ffffff55;border-radius:13px;background:#0b1826c9;pointer-events:auto;color:#fff}
.solo-height-pad{position:relative;height:98px;width:50px;touch-action:none;border-radius:10px;background:linear-gradient(180deg,#174f70aa,#102236bb 50%,#70402aaa);border:1px solid #ffffff33}
.solo-height-knob{position:absolute;left:50%;top:50%;width:28px;height:20px;transform:translate(-50%,-50%);border-radius:999px;background:#effaff;border:2px solid #8fe8ff;pointer-events:none}
#soloGamepadHelp{position:absolute;left:50%;bottom:max(8px,env(safe-area-inset-bottom));transform:translateX(-50%);color:#dff7ff;font:800 9px system-ui;pointer-events:none}
body.pad-input #soloGamepadHelp{display:block!important}
#footHud{display:none;position:absolute;inset:0;z-index:8;pointer-events:none}
body.on-foot-mode:not(.desktop-input) #footHud,body.sticks-claimed #footHud{display:block}
.foot-stick{position:absolute;width:min(25vw,150px);aspect-ratio:1;bottom:max(20px,env(safe-area-inset-bottom));pointer-events:auto;touch-action:none}
#footMove{left:max(12px,env(safe-area-inset-left))}#footLook{right:max(12px,env(safe-area-inset-right))}
.foot-stick .ring{position:absolute;inset:0;border-radius:50%;border:2px solid #ffffff66;background:#0b18265c}
.foot-stick .knob{position:absolute;left:50%;top:50%;width:31%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:#f3f7ffcc;border:2px solid #fff}
.foot-stick span{position:absolute;left:50%;bottom:-16px;transform:translateX(-50%);font-size:9px;font-weight:800;color:#fff}
#footFire,#footJump{position:absolute;pointer-events:auto;width:64px;height:64px;border-radius:50%;border:2px solid #fff;background:#0d1118b8;color:#fff;font:800 12px system-ui}
#footJump{right:calc(max(12px,env(safe-area-inset-right)) + min(25vw,150px) + 18px);bottom:max(28px,env(safe-area-inset-bottom))}
#footFire{left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%)}
#sticks{display:none!important}
@media(pointer:coarse){#toolbar{top:max(8px,env(safe-area-inset-top));bottom:auto}}`;
  document.head.appendChild(style);
  stick(hud.querySelector("#soloLeft"),"left");stick(hud.querySelector("#soloRight"),"right");
  const pad=hud.querySelector("#soloHeightPad"),knob=hud.querySelector("#soloHeightKnob"),value=hud.querySelector("#soloClearanceValue");
  let pointer=null;
  const apply=e=>{const r=pad.getBoundingClientRect(),center=r.top+r.height/2,span=Math.max(1,r.height*.40);points.height=Math.max(-1,Math.min(1,(center-e.clientY)/span));held.height=true;knob.style.top=`${50-points.height*38}%`;e.preventDefault();};
  pad.addEventListener("pointerdown",e=>{pointer=e.pointerId;pad.setPointerCapture?.(pointer);apply(e);});
  pad.addEventListener("pointermove",e=>{if(e.pointerId===pointer)apply(e);});
  const release=e=>{if(pointer===null||(e?.pointerId!=null&&e.pointerId!==pointer))return;pointer=null;points.height=0;held.height=false;knob.style.top="50%";};
  pad.addEventListener("pointerup",release);pad.addEventListener("pointercancel",release);pad.addEventListener("lostpointercapture",release);
  globalThis.__nativeFlightClearanceLabel=text=>{if(value)value.textContent=text;};
}
