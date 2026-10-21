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
  hud.innerHTML=`<div id="soloTopbar" data-toolbar-layout="actions-status-v1"><div id="soloTopbarActions" role="toolbar" aria-label="Simulator actions"><button id="soloExit" type="button">EXIT</button><button id="soloReset" type="button">RESET</button><button id="soloCamera" type="button">FPV</button></div><div id="soloTopbarStatus" role="status" aria-label="Flight status"><span id="soloState">DISARMED</span><span id="soloAlt">AGL 0.0 m</span><span id="soloGamepadStatus" hidden>XBOX</span></div></div>
  <div id="soloRaceHud" hidden><span id="soloLap">READY · 3 LAPS</span><strong id="soloRaceTime">00:00.000</strong><span id="soloGate">NEXT · START / FINISH</span><span id="soloBest">BEST —</span></div>
  <div id="soloLeft" class="solo-stick"><div class="solo-ring"></div><div class="solo-knob"></div><span>FWD / STRAFE</span></div>
  <div id="soloClearance"><small>ALT TARGET</small><strong id="soloClearanceValue">1.2 m</strong><div id="soloHeightPad" class="solo-height-pad" aria-label="Climb or descend altitude target"><span class="solo-height-up">CLIMB</span><div class="solo-height-track"></div><div id="soloHeightKnob" class="solo-height-knob"></div><span class="solo-height-hold">HOLD</span><span class="solo-height-down">DESCEND</span></div><span id="soloRangeStatus">AGL —</span></div>
  <div id="soloRight" class="solo-stick"><div class="solo-ring"></div><div class="solo-knob"></div><span>TURN / PITCH</span></div>
  <button id="soloArm" class="solo-action arm-start-cta" type="button">ARM</button>
  <button id="soloKill" class="solo-action" type="button">KILL</button>
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
  style.textContent=`/* Production drone HUD (simulator.mjs soloStyle), verbatim. */

  body.solo-flight{overflow:hidden!important;background:#000!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:transparent!important}
  body.solo-flight #viewport,body.solo-flight #viewport *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:transparent!important}
  body.solo-flight dialog input,body.solo-flight dialog textarea{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}
  body.solo-flight .panel,body.solo-flight .telemetry{display:none!important}
  body.solo-flight #viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;min-height:0!important;max-height:none!important;margin:0!important;z-index:50!important;overflow:hidden!important;transform:none!important;transform-origin:0 0!important;--solo-safe-top:env(safe-area-inset-top,0px);--solo-safe-right:env(safe-area-inset-right,0px);--solo-safe-bottom:env(safe-area-inset-bottom,0px);--solo-safe-left:env(safe-area-inset-left,0px)}
  html.android-stable-webgl body.solo-flight #viewport{height:100dvh!important}
  body.solo-flight #cameraModes{top:max(8px,var(--solo-safe-top))!important;left:50%!important}
  #soloHud{position:absolute;inset:0;z-index:8;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none}
  #soloHud[hidden]{display:none!important}
  #soloTopbar{position:absolute;top:max(8px,var(--solo-safe-top));left:max(8px,var(--solo-safe-left));right:max(8px,var(--solo-safe-right));display:flex;gap:8px;align-items:center;justify-content:flex-start;pointer-events:auto}
  #soloTopbar span,#soloTopbar button{border:1px solid #ffffff55;background:#112033cc;color:#fff;border-radius:9px;padding:7px 10px;font-weight:800;font-size:12px;backdrop-filter:blur(8px)}
  #soloTopbar #soloExit{background:#6b2330dd} #soloTopbar #soloReset{background:#9a5b18dd} #soloTopbar #soloCamera{margin-left:auto;background:#174f70dd}
  #soloTopbar #soloGamepadStatus{background:#17694fdd;border-color:#7ff0c5;color:#eafff7;white-space:nowrap}
  #soloRaceHud{position:absolute;top:max(52px,calc(var(--solo-safe-top) + 44px));left:50%;transform:translateX(-50%);display:grid;grid-template-columns:auto auto;gap:3px 12px;align-items:center;min-width:290px;padding:7px 12px;border:1px solid #ffffff55;border-radius:10px;background:#112033c7;backdrop-filter:blur(8px);box-shadow:0 5px 18px #0004;text-align:center;pointer-events:none}
  #soloRaceHud span{font-size:10px;font-weight:850;letter-spacing:.06em;white-space:nowrap} #soloRaceTime{font-size:19px;line-height:1;font-variant-numeric:tabular-nums;color:#fff}
  .solo-stick{position:absolute;width:min(34vw,230px);aspect-ratio:1;bottom:max(18px,var(--solo-safe-bottom));pointer-events:auto;touch-action:none;border-radius:50%}
  #soloLeft{left:max(16px,var(--solo-safe-left))} #soloRight{right:max(16px,var(--solo-safe-right))}
  .solo-ring{position:absolute;inset:0;border-radius:50%;border:2px solid #ffffff66;background:#0b18265c;box-shadow:inset 0 0 45px #0005,0 6px 22px #0005}
  .solo-knob{position:absolute;left:50%;top:50%;width:31%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:#f3f7ffcc;border:2px solid #fff;box-shadow:0 3px 14px #0008}
  .solo-stick span{position:absolute;left:50%;bottom:-18px;transform:translateX(-50%);font-size:10px;font-weight:800;letter-spacing:.08em;text-shadow:0 2px 5px #000;white-space:nowrap}
  #soloClearance{position:absolute;left:50%;bottom:max(96px,calc(var(--solo-safe-bottom) + 80px));transform:translateX(-50%);width:66px;height:176px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:8px 5px;border:1px solid #ffffff55;border-radius:13px;background:#0b1826c9;backdrop-filter:blur(8px);pointer-events:auto;box-shadow:0 6px 22px #0005}
  #soloClearance small{font-size:8px;font-weight:850;line-height:1.05;text-align:center;letter-spacing:.06em}#soloClearance strong{font:900 13px ui-monospace,SFMono-Regular,Menlo,monospace;color:#6be4b0;white-space:nowrap}#soloClearance span{font-size:8px;font-weight:850;color:#ffd06d;white-space:nowrap}
  .solo-height-pad{position:relative;height:98px;width:50px;touch-action:none;border-radius:10px;background:linear-gradient(180deg,#174f70aa 0%,#102236bb 46%,#102236bb 54%,#70402aaa 100%);border:1px solid #ffffff33;overflow:hidden}.solo-height-track{position:absolute;left:50%;top:14px;bottom:14px;width:3px;transform:translateX(-50%);background:#ffffff35;border-radius:4px}.solo-height-knob{position:absolute;left:50%;top:50%;width:28px;height:20px;transform:translate(-50%,-50%);border-radius:999px;background:#effaff;border:2px solid #8fe8ff;box-shadow:0 2px 10px #0009;pointer-events:none}.solo-height-up,.solo-height-hold,.solo-height-down{position:absolute!important;left:50%!important;transform:translateX(-50%)!important;font:800 6px/1 system-ui,-apple-system,sans-serif!important;letter-spacing:.04em!important;color:#d9f4ff!important;pointer-events:none!important}.solo-height-up{top:4px!important}.solo-height-hold{top:50%!important;transform:translate(-50%,-50%)!important;color:#7ff0c5!important}.solo-height-down{bottom:4px!important;color:#ffc29b!important}
  .solo-action{position:absolute;bottom:max(34px,calc(var(--solo-safe-bottom) + 18px));pointer-events:auto;border-radius:999px!important;width:86px;height:52px;font-weight:900!important;color:#fff!important;border:2px solid #ffffff55!important;backdrop-filter:blur(8px)}
  body.solo-flight .solo-action:disabled{opacity:1!important;cursor:not-allowed;filter:saturate(.72)}
  @keyframes startSimPulse{0%,100%{box-shadow:0 0 0 0 #63e7b833,0 0 10px #32d89a44}50%{box-shadow:0 0 0 5px #63e7b822,0 0 26px #32d89a99}}
  @keyframes armStartPulse{0%,100%{box-shadow:0 0 0 0 #63e7b844,0 0 12px #32d89a55}50%{box-shadow:0 0 0 6px #63e7b822,0 0 30px #32d89aaa}}
  #camSolo.start-sim-cta{background:#17694f!important;border-color:#63e7b8!important;color:#fff!important;animation:startSimPulse 1.55s ease-in-out infinite;transition:filter .14s ease,background .14s ease,border-color .14s ease,box-shadow .14s ease}
  #camSolo.start-sim-cta:hover,#camSolo.start-sim-cta:focus-visible{background:#218865!important;border-color:#b2ffe3!important;filter:brightness(1.14);box-shadow:0 0 0 4px #63e7b833,0 0 32px #32d89acc!important;outline:none}
  #soloArm{left:50%;transform:translateX(-105%);background:#17694fdd!important;transition:filter .14s ease,background .14s ease,border-color .14s ease,box-shadow .14s ease}
  body.solo-flight #soloArm.arm-start-cta.attention:not(:disabled){animation:armStartPulse 1.3s ease-in-out infinite;border-color:#7ff0c5!important}
  body.solo-flight #soloArm:not(:disabled):hover,body.solo-flight #soloArm:not(:disabled):focus-visible{background:#218865!important;border-color:#c2ffea!important;filter:brightness(1.16);box-shadow:0 0 0 4px #63e7b833,0 0 32px #32d89acc!important;outline:none}
  body.solo-flight #soloArm.arming,body.solo-flight #soloArm.armed{animation:none!important}
  #soloKill{left:50%;transform:translateX(5%);background:#8b2436e6!important}
  #soloGamepadHelp{position:absolute;left:50%;bottom:max(10px,var(--solo-safe-bottom));transform:translateX(-50%);max-width:94%;padding:6px 10px;border:1px solid #70ddff66;border-radius:999px;background:#071522dd;color:#dff7ff;font:800 9px/1.1 system-ui,-apple-system,sans-serif;letter-spacing:.04em;white-space:nowrap;pointer-events:none}
  body.solo-flight #viewport[data-gamepad-enabled="1"] .solo-stick,body.solo-flight #viewport[data-gamepad-enabled="1"] #soloClearance,body.solo-flight #viewport[data-gamepad-enabled="1"] .solo-action,body.solo-flight #viewport[data-control-source="xbox"] .solo-stick,body.solo-flight #viewport[data-control-source="xbox"] #soloClearance,body.solo-flight #viewport[data-control-source="xbox"] .solo-action{display:none!important}
  /* iOS ignores Screen Orientation lock in normal browser tabs. Rotate the complete
     simulator as a deterministic fallback so the flight UI is always landscape. */
  @media(orientation:portrait){
    body.solo-flight #viewport{inset:0 auto auto 100vw!important;width:100dvh!important;height:100vw!important;transform:rotate(90deg)!important;--solo-safe-top:env(safe-area-inset-right,0px);--solo-safe-right:env(safe-area-inset-bottom,0px);--solo-safe-bottom:env(safe-area-inset-left,0px);--solo-safe-left:env(safe-area-inset-top,0px)}
    html.android-stable-webgl body.solo-flight #viewport{width:100dvh!important;height:100vw!important}
    body.solo-flight dialog[open]{transform:rotate(90deg);transform-origin:50% 50%}
  }
  @media(max-height:430px){.solo-stick{width:min(30vw,180px)}.solo-action{width:76px;height:46px}}

#soloRaceHud[hidden]{display:none!important}
#hud,#help,#toolbar{display:none!important}
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
