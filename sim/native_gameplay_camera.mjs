// Full-game native camera source selection: one existing state for each
// SpawnCity mode, no Three.js camera/renderer and no second physics simulation.
// Do not put this in the live Three pipeline until the exclusive native release
// gate has passed for all five game modes on actual devices.
import {fpsVerticalFovDegForAspect} from "./camera_pitch_contract.mjs";
import {rotateByQuaternion} from "./native_airframe_presentation.mjs";
import {unobstructedNativeChaseEye} from "./native_camera_occlusion.mjs";
export const NATIVE_GAMEPLAY_CAMERA_VERSION="box3d-mode-cameras-v1";
const RAD=Math.PI/180;
const valid3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
const finite=(x,def)=>Number.isFinite(Number(x))?Number(x):def;
const xyz=value=>{
 const p=Array.isArray(value)?value:[value?.x,value?.y,value?.z];
 if(!valid3(p))throw Error("native camera requires authoritative finite XYZ position");
 return [...p];
};
const q4=q=>{
 if(!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||Math.hypot(...q)<1e-8)
  throw Error("native camera requires authoritative quaternion");
 return q;
};
const camera=(eye,target,{up=[0,0,1],fovDeg=72,near=.05,far=5000}={})=>{
 if(!valid3(eye)||!valid3(target)||!valid3(up)||Math.hypot(...target.map((v,i)=>v-eye[i]))<.001)
  throw Error("invalid native camera eye/target/up");
 if(!(far>near&&near>0&&fovDeg>0&&fovDeg<180))throw Error("invalid native camera projection");
 return {eye,target,up,fov:fovDeg*RAD,near,far};
};
// Same mode precedence as the product's player camera-provider chain:
// a jet/passenger overrides a car, a car overrides on-foot, then drone.
// Multiplayer observation is deliberate: mere presence of a remote peer must
// NOT unexpectedly hijack the local player's camera.
export function nativeCurrentGameMode({mode="auto",walk,car,jet}={}){
 if(mode!=="auto"&&mode!==null&&mode!==undefined){
  if(!["drone","foot","car","jet","multiplayer"].includes(mode))throw Error("invalid native game mode");
  return mode;
 }
 return jet?.active?"jet":car?.active?"car":walk?.mode==="foot"?"foot":"drone";
}
export function nativeGameplayCamera(state,{aspect=16/9,now=performance.now()}={}){
 if(!state||typeof state!=="object"||!(aspect>0&&Number.isFinite(aspect))||!Number.isFinite(now))
  throw Error("native game camera requires live game state, viewport aspect and time");
 const mode=nativeCurrentGameMode(state);
 if(mode==="drone")return {mode,camera:null}; // Flight uses existing 1 kHz airframe presentation.
 if(mode==="foot"){
  const w=state.walk;
  if(!w?.position||!Number.isFinite(w.yaw)||!Number.isFinite(w.pitch)||w.mode!=="foot")
   throw Error("foot camera requires real __arondightWalkMode state");
  const eye=xyz(w.position);
  const head=state.look||{};
  const yaw=w.yaw+finite(head.yawDeg,0)*RAD;
  const pitch=clamp(w.pitch+finite(head.pitchDeg,0)*RAD,-1.45,1.45);
  const forward=[Math.sin(yaw)*Math.cos(pitch),Math.cos(yaw)*Math.cos(pitch),Math.sin(pitch)];
  // Existing FPS contract specifies H-FOV=90 deg, converted for viewport.
  const vertical=fpsVerticalFovDegForAspect(aspect);
  const zoom=Math.max(1,finite(state.adsZoom,1));
  const fovDeg=2*Math.atan(Math.tan(vertical*RAD/2)/zoom)/RAD;
  return {mode,camera:camera(eye,add(eye,forward,12),{fovDeg,near:.035,far:5000})};
 }
 if(mode==="car"){
  const car=state.car,pose=car?.pose;
  if(!car?.active||!pose?.position)throw Error("car camera requires real __arondightVehicleDrive pose");
  const p=xyz(pose.position),q=q4(pose.rotation||[0,0,0,1]);
  const yaw=Number.isFinite(pose.yaw)?pose.yaw:Math.atan2(2*(q[3]*q[2]+q[0]*q[1]),1-2*(q[1]**2+q[2]**2));
  const forward=[Math.cos(yaw),Math.sin(yaw),0];
  if(state.carCameraMode==="cockpit"){
   const seat=rotateByQuaternion([.04,.36,1.24],q),eye=add(p,seat);
   const look=rotateByQuaternion([1,0,0],q),up=rotateByQuaternion([0,0,1],q);
   return {mode,camera:camera(eye,add(eye,look,12),{up,fovDeg:80,near:.04,far:5000})};
  }
  const dist=clamp(finite(state.carDistanceM,5),2,12),height=clamp(finite(state.carHeightM,2.2),.5,10);
  const target=add(add(p,forward,1.05),[0,0,1.2]);
  const desired=add(add(target,forward,-dist),[0,0,height]);
  // As buildings stream in, a clear Box3D car can still have its trailing
  // eye INSIDE a wall 5m behind it. Clamp the real camera before the first
  // intersected OSM prism; never delete geometry or fly through facades.
  const eye=unobstructedNativeChaseEye(desired,target,state.carObstacleSnapshot);
  return {mode,camera:camera(eye,target,{fovDeg:clamp(70+Math.abs(finite(car.speedMps,0))*.25,70,80),near:.22,far:5000})};
 }
 if(mode==="jet"){
  const j=state.jet,pose=j?.pose;
  if(!j?.active||!pose)throw Error("jet camera requires real __jetMode active pose");
  const p=xyz([pose.x,pose.y,pose.z]);
  const quat=q4(pose.q||[0,0,0,1]);
  const forward=rotateByQuaternion([0,1,0],quat),up=rotateByQuaternion([0,0,1],quat);
  if(pose.para){
   const eye=add(p,[0,-14,7]);
   return {mode,camera:camera(eye,add(p,[0,0,2]),{fovDeg:70,near:.5,far:20000})};
  }
  if(j.occupantSeat==="passenger"){
   const eye=add(p,rotateByQuaternion([.48,2.5,1.25],quat));
   return {mode,camera:camera(eye,add(eye,forward,40),{up,fovDeg:72,near:.5,far:20000})};
  }
  if(j.cockpit){
   const eye=add(p,rotateByQuaternion([0,3.5,1.42],quat));
   return {mode,camera:camera(eye,add(eye,forward,40),{up,fovDeg:72,near:.035,far:20000})};
  }
  const speed=Math.max(0,finite(j.state?.speed,0)),dist=22+Math.min(14,speed/40);
  const eye=add(add(p,forward,-dist),up,6.5);
  return {mode,camera:camera(eye,add(p,forward,30),{up,fovDeg:clamp(66+speed/30,66,90),near:.5,far:20000})};
 }
 // Dedicated spectator mode uses the SAME VsPoseTimeline as peer visuals.
 // Remote presence alone never activates this mode or spawns a second camera.
 const sample=state.peerTimeline?.sample?.(now);
 if(!sample||!valid3(sample.p))throw Error("multiplayer spectator needs existing VsPoseTimeline sample");
 const p=xyz(sample.p),q=q4(sample.q),forward=rotateByQuaternion([-1,0,0],q);
 const eye=add(add(p,forward,-5),[0,0,2]);
 return {mode,camera:camera(eye,add(p,forward,2),{fovDeg:72,near:.1,far:5000})};
}

// Read the ACTUAL existing product surfaces lazily. This is a pure state view
// used only by the native entrypoint; it never starts legacy Three graphics,
// changes input ownership or initializes additional simulation/GL contexts.
export function nativeLiveGameplayState(scope=globalThis,{spectate=()=>false}={}){
 if(!scope||typeof scope!=="object"||typeof spectate!=="function")
  throw Error("native live mode binding needs existing game runtime");
 return Object.freeze({
  get mode(){return spectate()?"multiplayer":"auto";},
  get walk(){return scope.__arondightWalkMode??null;},
  get car(){return scope.__arondightVehicleDrive??null;},
  get jet(){return scope.__jetMode??null;},
  get peerTimeline(){return scope.__arondightRealWorld?.vsPeerTimeline??null;},
  get look(){const b=scope.__arondightRealWorld;
   return {yawDeg:b?.lookYawDeg??0,pitchDeg:b?.lookPitchDeg??0};},
  get adsZoom(){return scope.__arondightAds?.zoom??1;}
 });
}
