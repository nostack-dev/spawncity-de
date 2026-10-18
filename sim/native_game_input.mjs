// Single input owner for the native SpawnCity game. No THREE, old controller
// scene, alternate RAF, global key handler overrides, or framework dependency.
// Desktop keyboard/mouse/touchpad, touch virtual sticks, Xbox/standard pads.
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
  const listen=(target,type,fn,options)=>{target?.addEventListener?.(type,fn,options);
   this.handlers.push(()=>target?.removeEventListener?.(type,fn,options));};
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
 sample(){
  if(this.closed)return null;
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
