// Native multiplayer drone presentation: consume the EXISTING VsPoseTimeline
// authoritative network samples. No duplicate simulation, no Three, no
// second WebGL canvas/context and no renderer fallback.
import {fromTRS,multiply4} from "./native_render_math.mjs";
import {nativeAirframeBodyGeometry,nativeAirframeRotorGeometry} from "./native_airframe_presentation.mjs";
export const NATIVE_PEER_VISUALS_VERSION="native-vs-pose-adapter-v1";
const BODY_ID="vs/airframe",ROTOR_ID="vs/rotors";
const finite=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class NativePeerVisuals{
 constructor(renderer,{timeline,connected=()=>true,mode=()=>"drone",span=.225,propD=.127}={}){
  if(!renderer?.upsert||!renderer?.updateInstances||!renderer?.remove)
   throw Error("native peer requires sole native scene renderer");
  if(typeof timeline?.sample!=="function"||typeof connected!=="function"||typeof mode!=="function")
   throw Error("native peer requires existing VsPoseTimeline and live multiplayer state");
  if(!(span>.05&&span<4&&propD>.02&&propD<2))throw Error("invalid peer drone dimensions");
  this.renderer=renderer;this.timeline=timeline;this.connected=connected;this.mode=mode;
  this.span=span;this.propD=propD;this.arm=span/(2*Math.SQRT2);
  this.live=false;this.disposed=false;this.phase=0;this.lastAt=null;
  this.bodyGeometry=nativeAirframeBodyGeometry(span);
  this.rotorGeometry=nativeAirframeRotorGeometry();
  this.stats={visible:false,mode:"hidden",ageMs:null};
 }
 hide(reason="hidden"){
  if(this.live){this.renderer.remove(BODY_ID);this.renderer.remove(ROTOR_ID);}
  this.live=false;this.lastAt=null;
  this.stats={visible:false,mode:reason,ageMs:null};
  return this.stats;
 }
 update(now=performance.now()){
  if(this.disposed)throw Error("native peer adapter disposed");
  const sample=this.timeline.sample(now);
  if(this.mode()!=="drone")return this.hide("peer-not-in-drone-mode");
  if(!sample||!finite(sample.p,3)||!finite(sample.q,4))
   return this.hide("no-valid-peer-pose");
  if(sample.stale&&!this.connected())return this.hide("peer-disconnected");
  const qn=Math.hypot(...sample.q);
  if(!(qn>1e-8))return this.hide("invalid-peer-quaternion");
  const quat=sample.q.map(v=>v/qn);
  const body=fromTRS(sample.p,quat);
  const dt=this.lastAt===null?0:clamp((now-this.lastAt)/1000,0,.1);
  this.lastAt=now;
  // Visual blades may spin locally. Translation/orientation are NEVER
  // extrapolated here: that remains exclusively VsPoseTimeline's job.
  this.phase=(this.phase+dt*85)%(2*Math.PI);
  const rotors=new Float32Array(4*16),tints=new Float32Array(4*4);
  let index=0;
  for(const sx of[-1,1])for(const sy of[-1,1]){
   const angle=this.phase*(index%2?-1:1);
   const local=fromTRS([sx*this.arm,sy*this.arm,0],
      [0,0,Math.sin(angle/2),Math.cos(angle/2)],[this.propD/.11,this.propD/.11,1]);
   rotors.set(multiply4(body,local),index*16);
   tints.set(index<2?[.4,.95,1,1]:[.8,.94,1,1],index*4);
   index++;
  }
  if(this.live){
   this.renderer.updateInstances(BODY_ID,{transforms:body});
   this.renderer.updateInstances(ROTOR_ID,{transforms:rotors,tints});
  }else{
   this.renderer.upsert(BODY_ID,{...this.bodyGeometry,instances:{transforms:body},
     material:{color:[.85,1,1,1],doubleSided:true}});
   this.renderer.upsert(ROTOR_ID,{...this.rotorGeometry,instances:{transforms:rotors,tints},
     material:{color:[1,1,1,1],doubleSided:true}});
   this.live=true;
  }
  this.stats={visible:true,mode:sample.stale?"stale-hold":"network-interpolated",
   ageMs:Number.isFinite(sample.ageMs)?sample.ageMs:null};
  return this.stats;
 }
 dispose(){
  if(this.disposed)return;
  this.hide("disposed");this.disposed=true;
 }
}
