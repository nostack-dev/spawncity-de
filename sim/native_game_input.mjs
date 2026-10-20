// Single input owner for the native SpawnCity game. In the browser it is the
// same control layer as main: desktop_controls.mjs writes the drone sample,
// applyGameStick and the AGL height law turn it into Flight Core commands,
// and foot / car / jet use the same keys as the live game.
import "./desktop_controls.mjs";
import "./foot_touch_controller.mjs";
import "./pad_actions.mjs";
import {applyGameStick,stepGroundClearanceTarget,clearanceRateMps,clearanceLeadM,MIN_GAME_CLEARANCE_M,MAX_GAME_CLEARANCE_M} from "./control_semantics.mjs";
import {shapeFirstPersonMove,loadFirstPersonControlSettings,firstPersonLookDelta,firstPersonLookAxes,firstPersonLookSensitivity,buildFirstPersonLookProfile} from "./first_person_control_settings.mjs";
import {FPS_CONTROL_PROFILE,FPS_PITCH_LIMIT_RAD,wrapFpsAngleRad,fpsTouchLookDelta,shapeFpsStick,fpsStickVelocity} from "./fps_control_math.mjs";
import {findXboxGamepad,sampleXboxGamepad} from "./xbox_gamepad.mjs";
import {loadVehicleControlSettings} from "./vehicle_control_settings.mjs";
import {installNativeFlightTouch,readNativeFlightTouch} from "./native_flight_touch.mjs";
import {claimSticks,releaseSticks,sticks} from "./shared_sticks.mjs";
export const NATIVE_GAME_INPUT_VERSION="native-game-input-v1";
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
const deadzone=(v,d=.12)=>Math.abs(v)<=d?0:Math.sign(v)*Math.min(1,(Math.abs(v)-d)/(1-d));
const key=(keys,...names)=>names.some(name=>keys.has(name));
export function resolveNativeInput({
 keys=new Set(),gamepad=null,look=[0,0],sticks=null,
 mode="drone",arm=false,clearance=2,yaw=0,pitch=0
}={}){
 const axes=gamepad?.axes??[],buttons=gamepad?.buttons??[];
 const axis=i=>deadzone(Number(axes[i])||0);
 const button=i=>Math.max(0,Number(buttons[i]?.value??(buttons[i]?.pressed?1:0))||0);
 const x=clamp((key(keys,"KeyD","ArrowRight")?1:0)-(key(keys,"KeyA","ArrowLeft")?1:0)+(sticks?.left?.x??axis(0)),-1,1);
 const y=clamp((key(keys,"KeyW","ArrowUp")?1:0)-(key(keys,"KeyS","ArrowDown")?1:0)-(sticks?.left?.y??axis(1)),-1,1);
 const rx=clamp((sticks?.right?.x??axis(2)),-1,1);
 const ry=clamp((sticks?.right?.y??axis(3)),-1,1);
 const trigger=clamp(button(7)-button(6),-1,1);
 const altitude=clamp((key(keys,"KeyE","PageUp")?1:0)-(key(keys,"KeyQ","PageDown")?1:0)+trigger,-1,1);
 const yawDelta=Number(look[0])||0,pitchDelta=Number(look[1])||0;
 const heading=yaw+yawDelta*.0024+rx*.018;
 const looking=clamp(pitch-pitchDelta*.0024-ry*.014,-1.42,1.42);
 const controls={
  arm:Boolean(arm),gameMode:true,groundClearance:clamp(clearance+altitude*.055,.6,25),
  roll:clamp(x,-1,1),pitch:clamp(-y,-1,1),yaw:clamp(rx+(key(keys,"KeyZ")?-1:0)+(key(keys,"KeyC")?1:0),-1,1),
  throttle:clamp(button(7),0,1),
  foot:{forward:y,strafe:x,yaw:heading,pitch:looking,
   sprint:key(keys,"ShiftLeft","ShiftRight")||button(10)>.5,
   jump:key(keys,"Space")||button(0)>.5},
  car:{pedal:clamp(y+trigger,-1,1),steer:x,handbrake:key(keys,"Space")||button(0)>.5},
  jet:{lift:clamp(y+trigger,-1,1),pitchIn:clamp(-ry,-1,1),
   rollIn:x,yawIn:rx,brake:key(keys,"Space")||button(0)>.5}
 };
 return {mode,controls,yaw:heading,pitch:looking,clearance:controls.groundClearance};
}
const controlKeys=new Set(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight",
 "Space","ShiftLeft","ShiftRight","KeyQ","KeyE","KeyR","KeyF","KeyZ","KeyC",
 "Digit1","Digit2","Digit3","Digit4","Digit5","PageUp","PageDown"]);
const keyToMode={Digit1:"drone",Digit2:"foot",Digit3:"car",Digit4:"jet",Digit5:"multiplayer"};
export class NativeGameInput{
 constructor(runtime,{canvas,win=globalThis.window,doc=globalThis.document,
  navigator=globalThis.navigator,stickRoot=null}={}){
  if(!runtime?.setControls||!runtime?.setMode||!canvas?.addEventListener||!win?.addEventListener)
   throw Error("native input needs real game, canvas and DOM");
  this.runtime=runtime;this.canvas=canvas;this.win=win;this.doc=doc;this.navigator=navigator;
  this.keys=new Set();this.look=[0,0];this.yaw=0;this.pitch=0;this.clearance=2;
  this.arm=false;this.closed=false;this.pointers=new Map();
  this.touch={left:{x:0,y:0},right:{x:0,y:0}};
  this.handlers=[];this.root=stickRoot;this.pointerLocked=false;
  this.main=Boolean(globalThis.__arondightDesktopInput)&&this.win===globalThis.window;
  this.prevArm=false;this.prevCam=false;this.heightHeld=false;this.mouseStick={x:0,y:0};this.lastMs=0;
  this.touchMove={x:0,y:0};this.touchSprint=false;this.jumpHeld=false;this.stickOwner=null;this.vehicleFire=false;
  if(this.main){
   installNativeFlightTouch();
   import("./xbox_control_mode.mjs");
   const jump=this.doc.getElementById?.("footJump");
   jump?.addEventListener("pointerdown",e=>{this.jumpHeld=true;e.preventDefault();});
   for(const type of ["pointerup","pointercancel"])jump?.addEventListener(type,()=>{this.jumpHeld=false;});
   this.walk={mode:"drone",
    setMode:mode=>{try{runtime.setMode(mode==="foot"?"foot":"drone");}catch{}this.syncModeClasses();},
    beginTouchLook(){},endTouchLook(){},
    setTouchMove:(x,y,{sprint=false}={})=>{
     const shaped=shapeFirstPersonMove(x,y,loadFirstPersonControlSettings());
     this.touchMove=shaped;this.touchSprint=Boolean(sprint);
    },
    applyTouchLook:({dx=0,dy=0,speedPxS}={})=>{
     const s=loadFirstPersonControlSettings(),input=firstPersonLookDelta(dx,dy,s),look=fpsTouchLookDelta(input.x,input.y,{speedPxS}),sens=firstPersonLookSensitivity(s);
     this.yaw=wrapFpsAngleRad(this.yaw+look.yaw*sens.yaw);
     this.pitch=clamp(this.pitch+look.pitch*sens.pitch,-FPS_PITCH_LIMIT_RAD,FPS_PITCH_LIMIT_RAD);
    },
    applyTouchLookStick:({x=0,y=0,dt=1/60}={})=>{
     const s=loadFirstPersonControlSettings(),profile={...buildFirstPersonLookProfile(FPS_CONTROL_PROFILE,s),innerDeadzone:.025};
     const axes=firstPersonLookAxes(x,y,s),stick=shapeFpsStick(axes.x,axes.y,profile),velocity=fpsStickVelocity(stick,profile,{touch:true}),sens=firstPersonLookSensitivity(s);
     this.yaw=wrapFpsAngleRad(this.yaw+velocity.yaw*sens.yaw*dt);
     this.pitch=clamp(this.pitch+velocity.pitch*sens.pitch*dt,-FPS_PITCH_LIMIT_RAD,FPS_PITCH_LIMIT_RAD);
    },
    applyMouseLook:({dx,dy}={})=>{
     if(this.runtime.mode!=="foot")return null;
     const s=loadFirstPersonControlSettings();
     const h=(Number(s.horizontalLookSensitivityPercent)||100)/100;
     const v=(Number(s.verticalLookSensitivityPercent)||100)/100;
     this.yaw=wrapFpsAngleRad(this.yaw+(s.invertLookHorizontal?-1:1)*(Number(dx)||0)*.0026*h);
     this.pitch=clamp(this.pitch-(s.invertLookVertical?-1:1)*(Number(dy)||0)*.0026*v,-FPS_PITCH_LIMIT_RAD,FPS_PITCH_LIMIT_RAD);
     return {yaw:this.yaw,pitch:this.pitch};
    }};
   globalThis.__arondightWalkMode=this.walk;
   globalThis.__arondightRealWorld||={lookYawDeg:0,lookPitchDeg:0,lookSnapping:false,renderLookHud(){}};
   this.syncModeClasses();
  }
  const listen=(target,type,fn,options)=>{target?.addEventListener?.(type,fn,options);
   this.handlers.push(()=>target?.removeEventListener?.(type,fn,options));};
  if(this.main){
   // Drone keys, pointer lock and the mouse sample belong to desktop_controls.
   // These listeners only cover the modes that module leaves to the vehicle.
   listen(win,"keydown",e=>{
    if(this.closed||e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.target?.closest?.("input,textarea,select,[contenteditable=true]"))return;
    const mode=runtime.mode;
    if(mode==="drone")return;
    const move=new Set(["KeyW","KeyA","KeyS","KeyD","Space","ShiftLeft","ShiftRight","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);
    if(move.has(e.code)){this.keys.add(e.code);e.preventDefault?.();return;}
    if(e.code==="KeyV"&&mode==="foot"){try{runtime.setMode("drone");}catch{}e.preventDefault?.();return;}
    if(e.code==="KeyF"||e.code==="KeyE"){
     try{runtime.setMode(mode==="foot"?"car":"foot");}catch{}
     e.preventDefault?.();return;
    }
    if(e.code==="KeyC"){this.cycleCamera();e.preventDefault?.();}
   });
   listen(win,"keyup",e=>this.keys.delete(e.code));
   listen(win,"blur",()=>this.releaseInputs());
   return;
  }
  listen(win,"keydown",e=>{
   if(this.closed||e.repeat||e.target?.closest?.("input,textarea,select,[contenteditable=true]"))return;
   if(controlKeys.has(e.code))e.preventDefault?.();
   if(keyToMode[e.code]){
    try{runtime.setMode(keyToMode[e.code]);}catch{/* no multiplayer peer available */}
    return;
   }
   if(e.code==="KeyR"){this.arm=!this.arm;return;}
   if(e.code==="KeyF"){
    const m=runtime.world?.flightCameraMode??"follow",next=m==="follow"?"fpv":m==="fpv"?"third":"follow";
    runtime.world?.setFlightCameraMode?.(next);return;
   }
   this.keys.add(e.code);
  },{passive:false});
  listen(win,"keyup",e=>this.keys.delete(e.code));
  listen(win,"blur",()=>this.releaseInputs());
  listen(doc,"visibilitychange",()=>{if(doc?.hidden)this.releaseInputs();});
  listen(doc,"pointerlockchange",()=>{this.pointerLocked=doc?.pointerLockElement===canvas;});
  listen(canvas,"click",e=>{if(e.pointerType!=="touch")canvas.requestPointerLock?.().catch?.(()=>{});});
  listen(win,"mousemove",e=>{
   if(this.pointerLocked){this.look[0]+=Number(e.movementX)||0;this.look[1]+=Number(e.movementY)||0;}
  },{passive:true});
  listen(canvas,"pointerdown",e=>{
   if(e.pointerType==="mouse")return;
   const width=canvas.getBoundingClientRect().width||1;
   const side=(e.clientX-canvas.getBoundingClientRect().left)<width/2?"left":"right";
   this.pointers.set(e.pointerId,{side,x:e.clientX,y:e.clientY});
   canvas.setPointerCapture?.(e.pointerId);e.preventDefault?.();
  },{passive:false});
  listen(canvas,"pointermove",e=>{
   const p=this.pointers.get(e.pointerId);if(!p)return;
   const dx=e.clientX-p.x,dy=e.clientY-p.y;
   this.touch[p.side]={x:clamp(dx/48,-1,1),y:clamp(dy/48,-1,1)};
   e.preventDefault?.();
  },{passive:false});
  const end=e=>{
   const p=this.pointers.get(e.pointerId);if(!p)return;
   this.pointers.delete(e.pointerId);
   if(![...this.pointers.values()].some(v=>v.side===p.side))this.touch[p.side]={x:0,y:0};
  };
  for(const type of ["pointerup","pointercancel","lostpointercapture"])listen(canvas,type,end);
 }
 releaseInputs(){
  this.keys.clear();this.look=[0,0];this.pointers.clear();
  this.touch.left={x:0,y:0};this.touch.right={x:0,y:0};
 }
 syncModeClasses(){
  const body=this.doc?.body;if(!body?.classList)return;
  const mode=this.runtime.mode;
  body.classList.toggle("jet-mode",mode==="jet");
  body.classList.toggle("player-driving",mode==="car");
  body.classList.toggle("on-foot-mode",mode==="foot");
  globalThis.__arondightOnFootMode=mode==="foot";
  if(this.walk)this.walk.mode=mode==="foot"?"foot":"drone";
 }
 cycleCamera(){
  const m=this.runtime.world?.flightCameraMode??"follow";
  const next=m==="follow"?"fpv":m==="fpv"?"third":"follow";
  this.runtime.world?.setFlightCameraMode?.(next);
 }
 steerHeight(axis){
  let agl=null,vz=0;
  try{
   const p=this.runtime.flight?.position?.(),v=this.runtime.flight?.linear?.();
   const ground=this.runtime.world?.terrain?.heightAt?.(p?.[0],p?.[1]);
   if(p&&Number.isFinite(ground)){agl=p[2]-ground;vz=Number(v?.[2])||0;}
  }catch{/* height falls back to the integrated target */}
  if(Math.abs(axis)>1e-4){
   this.heightHeld=true;
   const rate=clearanceRateMps(axis);
   this.clearance=agl==null?stepGroundClearanceTarget(this.clearance,axis,.016):
    clamp(agl+clearanceLeadM(rate),MIN_GAME_CLEARANCE_M,MAX_GAME_CLEARANCE_M);
   return;
  }
  if(this.heightHeld){
   this.heightHeld=false;
   if(agl!=null)this.clearance=clamp(agl+clearanceLeadM(vz),MIN_GAME_CLEARANCE_M,MAX_GAME_CLEARANCE_M);
  }
 }
 sampleMain(){
  this.syncModeClasses();
  if(globalThis.__arondightPlayerDamageModel?.dead){
   this.runtime.setControls({arm:false,gameMode:true,groundClearance:this.clearance,throttle:0,roll:0,pitch:0,yaw:0,bodyPitch:0,
    foot:{forward:0,strafe:0,yaw:this.yaw,pitch:this.pitch,sprint:false,jump:false},
    car:{pedal:0,steer:0,handbrake:true},jet:{lift:0,yawIn:0,pitchIn:0,rollIn:0,brake:1}});
   return {mode:this.runtime.mode,dead:true};
  }
  const now=typeof performance!=="undefined"?performance.now():0;
  const dt=this.lastMs?clamp((now-this.lastMs)/1000,1/240,.1):1/60;
  this.lastMs=now;
  const mode=this.runtime.mode;
  const desktop=Boolean(this.doc.body?.classList.contains("desktop-input"));
  if(!desktop&&(mode==="car"||mode==="jet")){
   if(this.stickOwner!==mode){
    claimSticks({name:mode,labels:mode==="jet"?{move:"STEIGEN / SCHUB",look:"KNÜPPEL",fire:"KANONE"}:{move:"GAS",look:"LENKEN",fire:"BRAKE"},onFire:v=>{this.vehicleFire=Boolean(v);}});
    this.stickOwner=mode;
   }
  }else if(this.stickOwner){releaseSticks();this.stickOwner=null;this.vehicleFire=false;}
  const held=code=>this.keys.has(code);
  const base={arm:this.arm,gameMode:true,groundClearance:this.clearance,throttle:0,roll:0,pitch:0,yaw:0,bodyPitch:0,
   foot:{forward:0,strafe:0,yaw:this.yaw,pitch:this.pitch,sprint:false,jump:false},
   car:{pedal:0,steer:0,handbrake:true},
   jet:{lift:0,yawIn:0,pitchIn:0,rollIn:0,brake:0}};
  if(mode==="drone"){
   const d=globalThis.__arondightDesktopDroneInput;
   const pad=sampleXboxGamepad(findXboxGamepad(this.navigator?.getGamepads?.()));
   const touch=readNativeFlightTouch();
   const desktopFlying=Boolean(d?.active)&&(d.left.x||d.left.y||Math.abs(d.right.x)>.02||Math.abs(d.right.y)>.02||d.heightAxis||d.arm||d.camera);
   if(touch.touching&&!desktopFlying){
    applyGameStick(base,"left",touch.left,touch.settings);
    applyGameStick(base,"right",touch.right,touch.settings);
    this.steerHeight(touch.height);
    base.groundClearance=this.clearance;base.arm=this.arm;
    globalThis.__nativeFlightClearanceLabel?.(this.clearance.toFixed(1)+" m");
   }else if(pad&&!desktopFlying){
    applyGameStick(base,"left",pad.left);
    applyGameStick(base,"right",pad.aim?{x:0,y:0}:pad.right);
    this.steerHeight(pad.heightAxis);
    base.groundClearance=this.clearance;
    if(pad.arm&&!this.prevArm)this.arm=!this.arm;
    if(pad.camera&&!this.prevCam)this.cycleCamera();
    this.prevArm=Boolean(pad.arm);this.prevCam=Boolean(pad.camera);
    base.arm=this.arm;
   }else if(d?.active){
    applyGameStick(base,"left",d.left);
    applyGameStick(base,"right",d.right);
    this.steerHeight(Number(d.heightAxis)||0);
    base.groundClearance=this.clearance;
    if(d.arm&&!this.prevArm)this.arm=!this.arm;
    if(d.camera&&!this.prevCam)this.cycleCamera();
    this.prevArm=Boolean(d.arm);this.prevCam=Boolean(d.camera);
    base.arm=this.arm;
   }
  }else if(mode==="foot"){
   // player_walk_mode_v4.update: keys plus the shaped first-person stick.
   const fps=loadFirstPersonControlSettings();
   const stick=this.touchMove||{x:0,y:0};
   const pad=findXboxGamepad(this.navigator?.getGamepads?.());
   const padMove=pad?shapeFirstPersonMove(pad.axes?.[0],pad.axes?.[1],fps):{x:0,y:0};
   let forward=-stick.y-padMove.y+(held("KeyW")?1:0)-(held("KeyS")?1:0);
   let strafe=stick.x+padMove.x+(held("KeyD")?1:0)-(held("KeyA")?1:0);
   const mag=Math.hypot(forward,strafe);
   if(mag>1){forward/=mag;strafe/=mag;}
   base.foot.forward=forward;base.foot.strafe=strafe;
   base.foot.sprint=held("ShiftLeft")||held("ShiftRight")||this.touchSprint||(pad?Math.max(0,Number(pad.buttons?.[10]?.value)||(pad.buttons?.[10]?.pressed?1:0))>.5:false);
   base.foot.jump=held("Space")||this.jumpHeld||(pad?Math.max(0,Number(pad.buttons?.[0]?.value)||(pad.buttons?.[0]?.pressed?1:0))>.5:false);
   base.foot.yaw=this.yaw;base.foot.pitch=this.pitch;
  }else if(mode==="car"){
   // gta_runtime_v1.updateVehicle, written into the engine drive instead of a second car.
   const car=loadVehicleControlSettings();
   const pad=findXboxGamepad(this.navigator?.getGamepads?.());
   let steer=(held("KeyA")?-1:0)+(held("KeyD")?1:0)+(this.stickOwner==="car"?sticks.look.x:0);
   let gas=Math.max(held("KeyW")?1:0,this.stickOwner==="car"?Math.max(0,-sticks.move.y):0),brake=Math.max(held("KeyS")?1:0,this.vehicleFire&&this.stickOwner==="car"?1:0);
   if(pad){steer+=clamp(pad.axes?.[0],-1,1);gas=Math.max(gas,clamp(pad.buttons?.[7]?.value||0,0,1));brake=Math.max(brake,clamp(pad.buttons?.[6]?.value||0,0,1));}
   const scale=car.throttleSensitivityPercent/100,turn=car.steeringSensitivityPercent/100;
   base.car.pedal=clamp((gas-brake)*scale,-1,1);
   base.car.steer=clamp(steer*turn,-1,1);
   base.car.handbrake=held("Space");
  }else if(mode==="jet"){
   let lift=(held("KeyW")?1:0)-(held("KeyS")?1:0)-(this.stickOwner==="jet"?sticks.move.y:0);
   let yawIn=(held("KeyD")?1:0)-(held("KeyA")?1:0)+(this.stickOwner==="jet"?sticks.move.x:0);
   let pitchIn=(held("ArrowUp")?-1:0)+(held("ArrowDown")?1:0)+(this.stickOwner==="jet"?sticks.look.y:0);
   let rollIn=(held("ArrowRight")?1:0)-(held("ArrowLeft")?1:0)+(this.stickOwner==="jet"?sticks.look.x:0);
   const desk=globalThis.__arondightDesktopInput;
   if(desk?.active&&desk.locked){
    const d=desk.takeMouseDelta?.()||{x:0,y:0};
    const a=1-Math.exp(-dt/.025);
    this.mouseStick.x+=(clamp(d.x/dt/730,-1,1)-this.mouseStick.x)*a;
    this.mouseStick.y+=(clamp(d.y/dt/730,-1,1)-this.mouseStick.y)*a;
    rollIn+=this.mouseStick.x;pitchIn-=this.mouseStick.y;
   }else this.mouseStick.x=this.mouseStick.y=0;
   base.jet={lift:clamp(lift,-1,1),yawIn:clamp(yawIn,-1,1),pitchIn:clamp(pitchIn,-1,1),rollIn:clamp(rollIn,-1,1),brake:0};
  }
  this.runtime.setControls(base);
  return {mode,controls:base,yaw:this.yaw,pitch:this.pitch,clearance:this.clearance};
 }
 sample(){
  if(this.closed)return null;
  if(this.main)return this.sampleMain();
  const gamepad=Array.from(this.navigator?.getGamepads?.()??[]).find(p=>p?.connected&&p.mapping==="standard")??null;
  const p=resolveNativeInput({keys:this.keys,gamepad,look:this.look,sticks:this.pointers.size?this.touch:null,
   mode:this.runtime.mode,arm:this.arm,clearance:this.clearance,yaw:this.yaw,pitch:this.pitch});
  this.look=[0,0];this.yaw=p.yaw;this.pitch=p.pitch;this.clearance=p.clearance;
  this.runtime.setControls(p.controls);
  return p;
 }
 dispose(){if(this.closed)return;this.closed=true;this.releaseInputs();
  for(const remove of this.handlers.splice(0))remove();
 }
}
