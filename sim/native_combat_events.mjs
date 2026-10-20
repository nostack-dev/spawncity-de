// Native-only visual event bridge for real SpawnCity combat events.
// Uses the ONE NativeWorldPresenter/WebGL2 context; Box3D owns hit/damage.
// Event contracts from gameplay_final_runtime_v2.mjs:
//   arondight:weapon-fired   {weapon,intensity,source,mode}
//   arondight:foot-tracer    {start:[x,y,z],end:[x,y,z],weapon,hand}
//   arondight:world-explosion {position:[x,y,z],radiusM,maxDamage,kind}
export const NATIVE_COMBAT_BRIDGE_VERSION="native-combat-runtime-events-v1";
const finite3=v=>(Array.isArray(v)||v instanceof Float32Array)&&v.length===3&&Array.from(v).every(Number.isFinite);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class NativeCombatEvents{
 constructor(world,{target=typeof window!=="undefined"?window:null,clock=()=>performance.now(),onError=null}={}){
  if(typeof world?.emitEffect!=="function")throw Error("combat FX requires the single native WebGL2 presenter");
  if(target&&(!target.addEventListener||!target.removeEventListener))throw Error("invalid event target");
  if(typeof clock!=="function")throw Error("combat clock is required");
  this.world=world;this.target=target;this.clock=clock;this.onError=onError;
  this.connected=false;this.disposed=false;this.received=0;this.rejected=0;this.lastMuzzleAt=-Infinity;
  this.listeners=new Map([
   ["arondight:weapon-fired",event=>this.handle(()=>this.weapon(event?.detail))],
   ["arondight:foot-tracer",event=>this.handle(()=>this.tracer(event?.detail))],
   ["arondight:world-explosion",event=>this.handle(()=>this.explosion(event?.detail))]
  ]);
 }
 handle(fn){
  if(this.disposed)return;
  try{if(fn()===false)this.rejected++;else this.received++;}
  catch(error){this.rejected++;this.onError?.(error);}
 }
 connect(){
  if(this.disposed)throw Error("combat event bridge disposed");
  if(this.connected||!this.target)return false;
  for(const [name,listener]of this.listeners)this.target.addEventListener(name,listener);
  this.connected=true;return true;
 }
 weapon(detail){
  if(typeof detail?.weapon!=="string"||!["foot","drone","vehicle"].includes(detail.mode))return false;
  const camera=this.world.camera;
  if(!finite3(camera?.eye)||!finite3(camera?.target))return false;
  const now=this.clock();
  if(!Number.isFinite(now))return false;
  if(now-this.lastMuzzleAt<25)return true;
  this.lastMuzzleAt=now;
  const d=camera.target.map((v,i)=>v-camera.eye[i]),norm=Math.hypot(...d);
  if(norm<1e-6)return false;
  const position=camera.eye.map((v,i)=>v+d[i]/norm*.45);
  const intensity=clamp(Number(detail.intensity)||.2,0,.8);
  this.world.emitEffect({kind:"muzzle",position,lifeMs:90,size:.16+intensity*.36,startMs:now});
  return true;
 }
 tracer(detail){
  if(!finite3(detail?.start)||!finite3(detail?.end))return false;
  const d=detail.end.map((v,i)=>v-detail.start[i]),distance=Math.hypot(...d);
  if(!(distance>=.03&&distance<=2500))return false;
  const now=this.clock();
  if(!Number.isFinite(now))return false;
  const speed=240;
  this.world.emitEffect({kind:"tracer",position:[...detail.start],
   velocity:d.map(v=>v/distance*speed),size:.12,lifeMs:clamp(distance/speed*1000,35,2500),startMs:now});
  return true;
 }
 explosion(detail){
  if(!finite3(detail?.position))return false;
  const now=this.clock();
  if(!Number.isFinite(now))return false;
  const radius=clamp(Number(detail.radiusM)||8,1,35),position=[...detail.position];
  this.world.emitEffect({kind:"blast",position,lifeMs:850,size:radius*.33,startMs:now});
  this.world.emitEffect({kind:"smoke",position,velocity:[0,0,1.7],lifeMs:1900,size:radius*.2,startMs:now});
  return true;
 }
 disconnect(){
  if(!this.connected)return false;
  for(const [name,listener]of this.listeners)this.target.removeEventListener(name,listener);
  this.connected=false;return true;
 }
 dispose(){if(this.disposed)return;this.disconnect();this.listeners.clear();this.disposed=true;}
}
