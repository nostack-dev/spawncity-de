// Entering and leaving the car and the jet on the native page, with the
// production contract (player_car_mode.mjs, jet_mode.mjs, pad_actions.mjs):
//  * on foot next to the car (5.2 m) or a parked jet (9 m, low AGL) a
//    contextual EINSTEIGEN button appears on every device;
//  * E interacts (F is mapped to E by pad_actions.mjs, Xbox X sends E too);
//  * E / the button again leaves the vehicle and puts the pilot on the ground
//    next to the driver's door, facing the vehicle's heading.
// No vehicle is ever entered from a distance and no mode key teleports.
export const NATIVE_VEHICLE_ENTRY_VERSION="native-vehicle-entry-prod-v1";
const CAR_ENTER_M=5.2,JET_ENTER_M=9,JET_PARKED_AGL_M=8,JET_EXIT_AGL_M=4;
const CAR_CSS=`#enterCarButton{position:absolute;z-index:30;left:50%;transform:translateX(-50%);bottom:calc(max(14px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + 64px);min-width:150px;height:46px;padding:0 18px;border-radius:14px;font:900 15px/1 "Nunito","Trebuchet MS",system-ui,sans-serif;letter-spacing:.06em;color:#3a2600;background:#ffc93c;border:2.5px solid #fff;box-shadow:0 4px 0 #c48a12;pointer-events:auto;touch-action:manipulation}#enterCarButton[hidden]{display:none!important}#enterCarButton[data-mode^="exit"]{background:#ff6b5a;color:#fff;box-shadow:0 4px 0 #b13b2e}html.neon-line-style:not(#ng-a):not(#ng-b):not(#ng-c) #enterCarButton{background:#ffc93c!important;color:#3a2600!important;border:2.5px solid #fff!important;box-shadow:0 4px 0 #c48a12!important}html.neon-line-style:not(#ng-a):not(#ng-b):not(#ng-c) #enterCarButton[data-mode^="exit"]{background:#ff6b5a!important;color:#fff!important;box-shadow:0 4px 0 #b13b2e!important}
html body.mobile-gameplay-compact.solo-flight:not(.desktop-input) #viewport #enterCarButton{left:max(12px,var(--solo-safe-left,env(safe-area-inset-left)))!important;right:auto!important;transform:none!important;bottom:calc(max(18px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + min(25vw,150px) + 16px)!important;min-width:54px!important;width:54px!important;height:54px!important;padding:0!important;border-radius:50%!important;font:900 24px/1 system-ui,-apple-system,sans-serif!important}
#enterJetButton{position:absolute;z-index:30;left:50%;transform:translateX(-50%);bottom:calc(max(14px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + 118px);min-width:170px;height:46px;padding:0 18px;border-radius:14px;font:900 15px/1 "Nunito","Trebuchet MS",system-ui,sans-serif;letter-spacing:.06em;color:#0f2433;background:#7fd3ff;border:2.5px solid #fff;box-shadow:0 4px 0 #2d86b5;pointer-events:auto;touch-action:manipulation}#enterJetButton[hidden]{display:none!important}
html body.mobile-gameplay-compact.solo-flight:not(.desktop-input) #viewport #enterJetButton{left:auto!important;right:max(12px,var(--solo-safe-right,env(safe-area-inset-right)))!important;transform:none!important;bottom:calc(max(18px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + min(25vw,150px) + 56px)!important;min-width:54px!important;width:54px!important;height:54px!important;padding:0!important;border-radius:50%!important;font:900 24px/1 system-ui,-apple-system,sans-serif!important}`;
// Production driving HUD (player_car_mode.mjs installStyle / mountUi), verbatim.
const DRIVE_CSS=`body.player-driving .vehicle-stick,html body.player-driving #footHud #footFire,html body.player-driving #footHud #footJump,body.player-driving #soloLeft,body.player-driving #soloRight,body.player-driving #soloClearance,body.player-driving .solo-action{display:none!important;pointer-events:none!important}#vehicleHud{display:none;position:absolute;inset:0;z-index:12;pointer-events:none;font-family:system-ui,-apple-system,sans-serif}body.player-driving #vehicleHud{display:block}.vehicle-stick{position:absolute!important;bottom:max(20px,var(--solo-safe-bottom,env(safe-area-inset-bottom)))!important;width:min(25vw,150px)!important;aspect-ratio:1!important;border:0!important;border-radius:50%!important;background:transparent!important;box-shadow:none!important;opacity:1!important;pointer-events:auto!important;touch-action:none!important;z-index:20!important}.vehicle-stick .ring{position:absolute!important;inset:0!important;border-radius:50%!important;border:2px solid #ffffff66!important;background:#0b18265c!important;box-shadow:inset 0 0 45px #0005,0 6px 22px #0005!important}.vehicle-stick .knob{position:absolute!important;left:50%;top:50%;width:31%!important;aspect-ratio:1!important;transform:translate(-50%,-50%)!important;border-radius:50%!important;background:#f3f7ffcc!important;border:2px solid #fff!important;box-shadow:0 3px 14px #0008!important}.vehicle-stick span{position:absolute;left:50%;bottom:-15px;transform:translateX(-50%);color:#f2f4f7;font:600 9px/1 system-ui;letter-spacing:.06em;white-space:nowrap;text-shadow:0 1px 1px #0008}#vehicleMove{left:max(12px,var(--solo-safe-left,env(safe-area-inset-left)))!important}#vehicleLook{right:max(12px,var(--solo-safe-right,env(safe-area-inset-right)))!important}#vehicleButtons{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(max(18px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + 36px);display:flex;gap:8px;pointer-events:auto}#vehicleButtons button{height:36px;padding:0 14px;border-radius:6px;font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.06em;color:#f2f4f7;background:rgba(10,13,18,.6);border:1px solid rgba(255,255,255,.18)}#vehicleReadout{position:absolute;left:50%;bottom:max(18px,var(--solo-safe-bottom,env(safe-area-inset-bottom)));transform:translateX(-50%);padding:7px 10px;border:1px solid #ffffff2c;border-radius:9px;background:#071522d8;color:#dff5ff;font:900 9px/1 system-ui;letter-spacing:.07em}#driveModeButton[data-near="1"]{border-color:#7de7b988!important;background:#154932e8!important}body.player-driving #driveModeButton{border-color:#ffcf6f88!important;background:#52350fe8!important}@media(max-height:340px){.vehicle-stick{width:min(22vw,128px)!important;bottom:max(16px,var(--solo-safe-bottom,env(safe-area-inset-bottom)))!important}#vehicleReadout{bottom:max(10px,var(--solo-safe-bottom,env(safe-area-inset-bottom)));font-size:8px}}`;
let game=null,input=null,installed=false,carButton=null,jetButton=null,lastRender=-Infinity,readout=null;
let handbrakeHeld=false,chute=null;
export function nativeCarHandbrakeHeld(){return handbrakeHeld;}
const dist2=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function pose(id){try{return game?.rigids?.pose?.(id)||null;}catch{return null;}}
function ground(x,y){try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}}
function dead(){return Boolean(globalThis.__arondightPlayerDamageModel?.dead);}
function blocked(){
  const menu=document.getElementById("gameMenu");
  return Boolean((menu&&!menu.hidden)||document.querySelector("dialog[open],#quitConfirmDialog,#worldOptionsPanel:not([hidden]),#changelogPanel:not([hidden])"));
}
export function nearVehicles(){
  const foot=pose("player-foot");if(!foot?.position||game?.mode!=="foot")return {car:null,jet:null};
  const car=pose("player-car"),jet=pose("player-jet");
  const carD=car?.position?dist2(car.position,foot.position):Infinity;
  const jetD=jet?.position?dist2(jet.position,foot.position):Infinity;
  const jetLow=jet?.position?jet.position[2]-ground(jet.position[0],jet.position[1])<JET_PARKED_AGL_M:false;
  return {car:carD<=CAR_ENTER_M?{distance:carD}:null,jet:jetLow&&jetD<=JET_ENTER_M?{distance:jetD}:null};
}
// Production exit: the pilot stands beside the driver's door, looking along
// the vehicle, on the real Box3D/terrain ground.
function placeBeside(id,side){
  const v=pose(id);if(!v?.position)return;
  const yaw=Number(v.yaw)||0,fx=Math.cos(yaw),fy=Math.sin(yaw),lx=-fy,ly=fx;
  const x=v.position[0]+lx*side,y=v.position[1]+ly*side,z=ground(x,y)+.97;
  try{game.rigids.setPose("player-foot",{position:[x,y,z],yaw});}catch{}
  // FPS heading convention of native_game_runtime: yaw 0 looks along +Y.
  input?.walk?.setPose?.({yaw:Math.atan2(fx,fy),pitch:-.05});
}
export function enterCar(){if(!game||dead()||game.mode!=="foot"||!nearVehicles().car)return false;game.setMode("car");input?.syncModeClasses?.();render(true);return true;}
export function enterJet(){if(!game||dead()||game.mode!=="foot"||!nearVehicles().jet)return false;game.setMode("jet");input?.syncModeClasses?.();render(true);return true;}
export function exitVehicle(){
  if(!game)return false;
  if(game.mode==="car"){placeBeside("player-car",2.1);game.setMode("foot");input?.syncModeClasses?.();render(true);return true;}
  if(game.mode==="jet"){
    // E / F / Xbox X / EJECT: on the ground the pilot climbs out beside the
    // jet; in the air production ejects under a parachute, here the pilot is
    // set down on the ground below while the empty jet comes down.
    const jet=pose("player-jet");
    const high=jet?.position&&jet.position[2]-ground(jet.position[0],jet.position[1])>JET_EXIT_AGL_M;
    if(high){
      // Production ejection seat: thrown 2.8 m out along the jet's up axis
      // at 28 m/s, canopy opens after 1.1 s, then a steerable 6.5 m/s descent.
      const q=jet.rotation||[0,0,0,1],[x,y,z,w]=q;
      const up=[2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y)];
      const v=jet.velocity||[0,0,0];
      try{game.rigids.setPose("player-foot",{position:[jet.position[0]+up[0]*2.8,jet.position[1]+up[1]*2.8,jet.position[2]+up[2]*2.8],velocity:[v[0]+up[0]*28,v[1]+up[1]*28,v[2]+up[2]*28]});}catch{}
      chute={t:performance.now()};
    }else placeBeside("player-jet",4.2);
    game.setMode("foot");input?.syncModeClasses?.();render(true);return true;
  }
  return false;
}
function interact(){
  if(!game||blocked())return false;
  if(game.mode==="car"||game.mode==="jet")return exitVehicle();
  if(game.mode!=="foot")return false;
  const near=nearVehicles();
  if(near.car&&(!near.jet||near.car.distance<=near.jet.distance))return enterCar();
  if(near.jet)return enterJet();
  return false;
}
function onKey(e){
  if(e.code!=="KeyE"||e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.target instanceof Element&&e.target.closest("input,textarea,select,[contenteditable]"))return;
  if(interact()){e.preventDefault();e.stopImmediatePropagation();}
}
function render(force=false){
  const now=performance.now();if(!force&&now-lastRender<200)return;lastRender=now;
  if(!carButton||!jetButton||!game)return;
  const cls=document.body.classList,touch=cls.contains("mobile-gameplay-compact")&&!cls.contains("desktop-input");
  const key=cls.contains("pad-input")?"Ⓧ  ":cls.contains("desktop-input")?"F · ":"";
  const playing=cls.contains("solo-flight")&&!dead();
  const near=nearVehicles(),driving=game.mode==="car";
  const showCar=playing&&(driving||Boolean(near.car));
  if(carButton.hidden===showCar)carButton.hidden=!showCar;
  const carMode=`${driving?"exit":"enter"}:${key}:${touch?"touch":"full"}`;
  if(carButton.dataset.mode!==carMode){
    carButton.dataset.mode=carMode;
    carButton.textContent=touch?(driving?"↗":"🚗"):driving?`${key}AUSSTEIGEN`:`${key}🚗 EINSTEIGEN`;
    carButton.setAttribute("aria-label",driving?"Aus Auto aussteigen":"In Auto einsteigen");
  }
  if(readout&&driving){const kmh=Math.round(Math.abs(Number(game.gameplayState?.car?.speedMps)||0)*3.6);const t=`CAR · ${kmh} km/h · E EXIT`;if(readout.textContent!==t)readout.textContent=t;}
  const showJet=playing&&game.mode==="foot"&&Boolean(near.jet)&&!near.car;
  if(jetButton.hidden===showJet)jetButton.hidden=!showJet;
  const jetText=touch?"✈":`${key}✈ JET EINSTEIGEN`;
  if(jetButton.textContent!==jetText)jetButton.textContent=jetText;
}
export function installNativeVehicleEntry(runtime,{input:owner=null}={}){
  game=runtime;input=owner;
  if(installed||typeof document==="undefined")return;installed=true;
  const view=document.getElementById("viewport");if(!view)return;
  const style=document.createElement("style");style.dataset.nativeVehicleEntry=NATIVE_VEHICLE_ENTRY_VERSION;style.textContent=CAR_CSS;document.head.appendChild(style);
  carButton=document.createElement("button");carButton.id="enterCarButton";carButton.type="button";carButton.hidden=true;
  carButton.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();game?.mode==="car"?exitVehicle():enterCar();});
  carButton.addEventListener("pointerdown",e=>e.stopPropagation());
  jetButton=document.createElement("button");jetButton.id="enterJetButton";jetButton.type="button";jetButton.hidden=true;
  jetButton.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();enterJet();});
  jetButton.addEventListener("pointerdown",e=>e.stopPropagation());
  view.append(carButton,jetButton);
  const driveStyle=document.createElement("style");driveStyle.dataset.playerCarMode="gta-physical-v1";driveStyle.textContent=DRIVE_CSS;document.head.appendChild(driveStyle);
  const hud=document.createElement("div");hud.id="vehicleHud";
  hud.innerHTML='<div id="vehicleReadout">CAR · 0 km/h · E EXIT</div><div id="vehicleButtons"><button id="vehicleCamButton" type="button">🎥 INNEN</button><button id="vehicleBrakeButton" type="button">HANDBREMSE</button></div>';
  view.appendChild(hud);readout=hud.querySelector("#vehicleReadout");
  const cam=hud.querySelector("#vehicleCamButton");
  cam.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();input?.cycleCamera?.();});
  const hb=hud.querySelector("#vehicleBrakeButton");
  hb.addEventListener("pointerdown",e=>{handbrakeHeld=true;e.preventDefault();e.stopPropagation();});
  for(const ev of ["pointerup","pointercancel","pointerleave"])hb.addEventListener(ev,()=>{handbrakeHeld=false;});
  addEventListener("keydown",onKey,{capture:true});
  globalThis.__nativeVehicleEntry={enterCar,enterJet,exitVehicle,nearVehicles,version:NATIVE_VEHICLE_ENTRY_VERSION};
}
// Canopy flight after an ejection (jet_mode.mjs stepPara): gravity, then the
// open canopy eases the sink rate to 6.5 m/s and the move input steers it at
// up to 4 m/s, until the pilot is on the ground.
const CANOPY={positions:new Float32Array([-2.2,-1.4,3.2, 2.2,-1.4,3.2, 2.2,1.4,3.2, -2.2,-1.4,3.2, 2.2,1.4,3.2, -2.2,1.4,3.2, -2.2,-1.4,3.2, 0,0,0, 2.2,-1.4,3.2, 2.2,1.4,3.2, 0,0,0, -2.2,1.4,3.2]),
  colors:new Float32Array([.86,.32,.18, .86,.32,.18, .96,.9,.82, .86,.32,.18, .96,.9,.82, .96,.9,.82, .4,.4,.4, .4,.4,.4, .4,.4,.4, .4,.4,.4, .4,.4,.4, .4,.4,.4])};
let canopyShown=false;
function tickChute(dt){
  const renderer=game?.world?.renderer;
  if(!chute||game.mode!=="foot"){chute=null;if(canopyShown){renderer?.remove?.("player/canopy");canopyShown=false;}return;}
  const p=pose("player-foot");if(!p?.position)return;
  const age=(performance.now()-chute.t)/1000,agl=p.position[2]-ground(p.position[0],p.position[1]);
  if(age>.6&&agl<1.3){chute=null;if(canopyShown){renderer?.remove?.("player/canopy");canopyShown=false;}return;}
  if(age>1.1){
    const v=p.velocity||[0,0,0],m=82,k=Math.min(1,dt*1.6),kh=Math.min(1,dt*.8);
    const yaw=Number(game.footInput?.yaw)||0,f=Number(game.footInput?.forward)||0,st=Number(game.footInput?.strafe)||0;
    const wantX=(Math.sin(yaw)*f+Math.cos(yaw)*st)*4,wantY=(Math.cos(yaw)*f-Math.sin(yaw)*st)*4;
    try{game.rigids.applyImpulse("player-foot",[m*(wantX-v[0])*kh,m*(wantY-v[1])*kh,m*(-6.5-v[2])*k]);}catch{}
    if(renderer?.upsert){
      const t=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,p.position[0],p.position[1],p.position[2]+.6,1]);
      if(!canopyShown){renderer.upsert("player/canopy",{...CANOPY,instances:{transforms:t},material:{doubleSided:true,castShadow:false}});canopyShown=true;}
      else renderer.updateInstances("player/canopy",{transforms:t});
    }
  }
}
let lastTick=0;
// production arondight:vehicle-mode (car_radio, sirens, audio follow it)
let lastVehicleMode="foot";
function announceVehicle(){const m=game?.mode;if(!m||m===lastVehicleMode)return;const was=lastVehicleMode;lastVehicleMode=m;
  try{if(was==="car"||was==="jet")window.dispatchEvent(new CustomEvent("arondight:vehicle-mode",{detail:{active:false,id:was==="car"?"player-car":"player-jet",jet:was==="jet"}}));
    if(m==="car"||m==="jet")window.dispatchEvent(new CustomEvent("arondight:vehicle-mode",{detail:{active:true,id:m==="car"?"player-car":"player-jet",jet:m==="jet"}}));}catch{}}
export function tickNativeVehicleEntry(){const now=performance.now(),dt=lastTick?Math.min(.1,(now-lastTick)/1000):1/60;lastTick=now;tickChute(dt);announceVehicle();render(false);}
