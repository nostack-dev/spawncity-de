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
let game=null,input=null,installed=false,carButton=null,jetButton=null,lastRender=-Infinity;
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
    const jet=pose("player-jet");
    if(jet?.position&&jet.position[2]-ground(jet.position[0],jet.position[1])>JET_EXIT_AGL_M)return false;
    placeBeside("player-jet",4.2);game.setMode("foot");input?.syncModeClasses?.();render(true);return true;
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
  addEventListener("keydown",onKey,{capture:true});
  globalThis.__nativeVehicleEntry={enterCar,enterJet,exitVehicle,nearVehicles,version:NATIVE_VEHICLE_ENTRY_VERSION};
}
export function tickNativeVehicleEntry(){render(false);}
