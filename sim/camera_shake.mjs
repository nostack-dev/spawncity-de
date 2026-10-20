// One consistent camera-shake model for every mode (drone FPV/chase, on
// foot, driving): "trauma" in [0,1] is added by events and decays over
// time; the visible shake is trauma² so small hits stay subtle and big ones
// punch. Offsets are smooth multi-frequency noise applied right before the
// frame is rendered (pre-render hook) — the camera providers rebuild the
// camera pose every frame and the bridge restores it after rendering, so
// nothing accumulates and no provider has to know about shaking.
//
// Sources:
//  * weapon fire — drone gun / missiles (on foot and in cars the weapon
//    recoil already lives in those cameras; those add only a little trauma
//    so sustained full-auto builds a steady rumble),
//  * every explosion (world-explosion), scaled by distance and size,
//  * the big bomb's shock wave arrival,
//  * hard physics impacts of the player's car / drone.

export const CAMERA_SHAKE_VERSION="trauma-noise-all-modes-v1";
const DECAY_PER_S=1.35,MAX_ANGLE_RAD=.055,MAX_OFFSET_M=.09,FREQ=19;
let trauma=0,lastNow=performance.now(),installed=false,seed=Math.random()*100;

const bridge=()=>globalThis.__arondightRealWorld||null;
const walk=()=>globalThis.__arondightWalkMode||null;
const drive=()=>globalThis.__arondightVehicleDrive||null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
function mode(){if(drive()?.active)return"vehicle";return walk()?.mode==="foot"?"foot":"drone";}
export function addTrauma(amount,cap=1){trauma=Math.max(trauma,Math.min(cap,trauma+Math.max(0,Number(amount)||0)));}
function listener(){const c=bridge()?.threeCamera;return c?c.position:null;}

function onWeapon(event){
  const d=event?.detail||{},w=String(d.weapon||""),m=String(d.mode||mode());
  // Full-auto builds up to a steady rumble (capped), heavy weapons punch.
  if(w==="smg"||w==="drone-gun"||w==="gun")addTrauma(m==="drone"?.07:.035,.42);
  else if(w==="missile"||w==="nuke")addTrauma(.28);
  else if(w==="grenade"||w==="rocket"||w==="guided"||w==="launcher")addTrauma(.2);
  else if(w==="sniper")addTrauma(.16,.6);
  else if(w==="glock")addTrauma(.3,.7);
  else addTrauma(clamp(d.intensity,0,.5)*.4,.6);
}
function onExplosion(event){
  const d=event?.detail||{},p=d.position,c=listener();if(!c)return;
  const x=Array.isArray(p)?+p[0]:+p?.x,y=Array.isArray(p)?+p[1]:+p?.y,z=Array.isArray(p)?+p[2]:+p?.z;if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const dist=Math.hypot(x-c.x,y-c.y,(Number.isFinite(z)?z:0)-c.z),radius=clamp(d.radiusM??6,1,400),reach=radius*9+30;if(dist>reach)return;
  const k=(1-dist/reach)**1.6,size=d.kind==="nuke"?1:clamp(radius/12,.25,.9);addTrauma(k*size);
}
function onImpact(event){
  const d=event?.detail||{},id=String(d.id||""),speed=Number(d.deltaVelocityMps)||0;
  const mine=(drive()?.active&&id===drive()?.vehicleId)||d.kind==="drone";if(!mine||speed<2.5)return;addTrauma(clamp((speed-2.5)/14,0,.7));
}
function noise(t,o){return Math.sin(t*1.0+o)*.5+Math.sin(t*2.31+o*1.7)*.3+Math.sin(t*4.17+o*2.3)*.2;}
const unit3=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];};
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function turn(v,axis,angle){
  const c=Math.cos(angle),s=Math.sin(angle),d=v[0]*axis[0]+v[1]*axis[1]+v[2]*axis[2],x=cross3(axis,v);
  return [v[0]*c+x[0]*s+axis[0]*d*(1-c),v[1]*c+x[1]*s+axis[1]*d*(1-c),v[2]*c+x[2]*s+axis[2]*d*(1-c)];
}
// Same trauma sample the Three hook used to bake into the camera, applied to
// the native eye/target/up. Zero trauma returns the camera unchanged.
export function shakeNativeCamera(camera,now=performance.now(),modeName="drone"){
  if(!camera?.eye||!camera?.target)return camera;
  const dt=clamp((now-lastNow)/1000,0,.1);lastNow=now;
  if(trauma<=0)return camera;
  trauma=Math.max(0,trauma-DECAY_PER_S*dt);const s=trauma*trauma;if(s<1e-4)return camera;
  const t=now/1000*FREQ,scale=modeName==="drone"?.85:1;
  const pitch=MAX_ANGLE_RAD*s*scale*noise(t,seed);
  const yaw=MAX_ANGLE_RAD*s*scale*noise(t,seed+11);
  const roll=MAX_ANGLE_RAD*.7*s*scale*noise(t,seed+23);
  const slide=MAX_OFFSET_M*s*scale*noise(t*.8,seed+37);
  const heave=MAX_OFFSET_M*s*scale*noise(t*.8,seed+51);
  let f=unit3([camera.target[0]-camera.eye[0],camera.target[1]-camera.eye[1],camera.target[2]-camera.eye[2]]);
  let u=unit3(camera.up||[0,0,1]);
  let r=cross3(f,u);if(Math.hypot(...r)<1e-6)r=[1,0,0];else r=unit3(r);
  u=unit3(cross3(r,f));
  f=unit3(turn(turn(f,r,pitch),u,yaw));
  u=unit3(turn(u,f,roll));
  const dist=Math.hypot(camera.target[0]-camera.eye[0],camera.target[1]-camera.eye[1],camera.target[2]-camera.eye[2])||1;
  const eye=[camera.eye[0]+r[0]*slide+u[0]*heave,camera.eye[1]+r[1]*slide+u[1]*heave,camera.eye[2]+r[2]*slide+u[2]*heave];
  return {...camera,eye,up:u,target:[eye[0]+f[0]*dist,eye[1]+f[1]*dist,eye[2]+f[2]*dist]};
}
function apply(scene,camera,now){
  const dt=clamp((now-lastNow)/1000,0,.1);lastNow=now;if(trauma<=0||!camera)return;
  trauma=Math.max(0,trauma-DECAY_PER_S*dt);const s=trauma*trauma;if(s<1e-4)return;
  const t=now/1000*FREQ,scale=mode()==="drone"?.85:1;
  camera.rotateX(MAX_ANGLE_RAD*s*scale*noise(t,seed));
  camera.rotateY(MAX_ANGLE_RAD*s*scale*noise(t,seed+11));
  camera.rotateZ(MAX_ANGLE_RAD*.7*s*scale*noise(t,seed+23));
  camera.translateX(MAX_OFFSET_M*s*scale*noise(t*.8,seed+37));camera.translateY(MAX_OFFSET_M*s*scale*noise(t*.8,seed+51));
  camera.updateMatrixWorld();
  const v=document.getElementById("viewport");if(v){const val=trauma.toFixed(2);if(v.dataset.cameraTrauma!==val)v.dataset.cameraTrauma=val;}
}
export function installCameraShake(){
  if(installed||typeof window==="undefined")return;installed=true;
  window.addEventListener("arondight:weapon-fired",onWeapon);
  window.addEventListener("arondight:world-explosion",onExplosion);
  window.addEventListener("arondight:world-physics-impact",onImpact);
  window.addEventListener("arondight:nuke-shockwave-arrival",e=>addTrauma(.55+.45*clamp(e?.detail?.strength,0,1)));
  window.addEventListener("arondight:world-reset",()=>{trauma=0;});
  const attach=()=>{const b=bridge();if(typeof b?.addPreRenderHook!=="function")return requestAnimationFrame(attach);b.addPreRenderHook(apply);const v=document.getElementById("viewport");if(v)v.dataset.cameraShake=CAMERA_SHAKE_VERSION;};attach();
}
installCameraShake();
