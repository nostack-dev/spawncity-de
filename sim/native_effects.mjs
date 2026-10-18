// Visual-only native WebGL2 weapon/impact particles. Box3D remains authoritative
// for damage and collision; these quads NEVER create a fake physics world,
// Three.js scene, second context, or graphics fallback.
import {fromTRS} from "./native_render_math.mjs";
export const NATIVE_FX_VERSION="native-webgl2-effects-v1";
const ID="fx/particles";
const QUAD=new Float32Array([-0.5,0,-0.5,0.5,0,-0.5,0.5,0,0.5,-0.5,0,-0.5,0.5,0,0.5,-0.5,0,0.5]);
const NORMALS=new Float32Array(18);for(let i=1;i<NORMALS.length;i+=3)NORMALS[i]=-1;
const COLORS=new Float32Array(18).fill(1);
const PALETTES={muzzle:[1,.77,.26,1],spark:[1,.55,.16,1],smoke:[.48,.50,.54,.58],blast:[1,.31,.10,.92],tracer:[1,.88,.41,.95]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const vec3=(v,name)=>{if(!v||v.length!==3||Array.from(v).some(x=>!Number.isFinite(x)))throw Error("invalid "+name);return Array.from(v);};
export class NativeEffects{
 constructor(renderer,{maxParticles=256}={}){
  if(!renderer?.upsert||!renderer?.updateInstances||!renderer?.remove)throw Error("effects require one native WebGL2 renderer");
  if(!Number.isInteger(maxParticles)||maxParticles<1||maxParticles>4096)throw Error("invalid visual particle budget");
  this.renderer=renderer;this.maxParticles=maxParticles;this.active=[];this.created=false;this.disposed=false;
  this.serial=0;this.lastTick=null;
  this.stats={active:0,dropped:0,uploaded:0,expired:0};
 }
 emit({kind="spark",position,velocity=[0,0,0],color=null,lifeMs=350,size=.35,gravity=0,startMs=performance.now()}={}){
  if(this.disposed)throw Error("native effects disposed");
  if(!Object.hasOwn(PALETTES,kind))throw Error("invalid visual effect kind");
  const p=vec3(position,"particle position"),v=vec3(velocity,"particle velocity");
  const rgba=color??PALETTES[kind];
  if(rgba.length!==4||Array.from(rgba).some(x=>!Number.isFinite(x)||x<0||x>1))
   throw Error("invalid RGBA color");
  if(!(lifeMs>=16&&lifeMs<=10000)||!(size>0&&size<200)||!Number.isFinite(gravity)||!Number.isFinite(startMs))
   throw Error("invalid visual effect parameters");
  if(this.active.length>=this.maxParticles){this.stats.dropped++;return null;}
  const effect={id:++this.serial,kind,position:p,velocity:v,color:Array.from(rgba),lifeMs,size,gravity,startMs};
  this.active.push(effect);return effect.id;
 }
 tick(now=performance.now(),cameraEye=[0,-10,4]){
  if(this.disposed)throw Error("native effects disposed");
  if(!Number.isFinite(now))throw Error("invalid FX timestamp");
  const eye=vec3(cameraEye,"camera eye");
  // Never allow simulation time to run backwards: that would resurrect faded
  // effects after a PWA pause/resume or performance clock discontinuity.
  now=Math.max(now,this.lastTick??-Infinity);this.lastTick=now;
  const before=this.active.length;
  this.active=this.active.filter(p=>now-p.startMs<p.lifeMs);
  const expired=before-this.active.length;
  if(!this.active.length){
   if(this.created){this.renderer.remove(ID);this.created=false;}
   this.stats={...this.stats,active:0,expired:this.stats.expired+expired,uploaded:0};
   return {...this.stats};
  }
  // Transparent billboards require back-to-front order in the *same* batch.
  const sampled=this.active.map(p=>{
   const age=Math.max(0,now-p.startMs)/1000,f=clamp(age*1000/p.lifeMs,0,1);
   const position=[p.position[0]+p.velocity[0]*age,p.position[1]+p.velocity[1]*age,
    p.position[2]+p.velocity[2]*age-.5*p.gravity*age*age];
   const dist=Math.hypot(...position.map((x,i)=>x-eye[i]));
   return {p,position,f,dist};
  }).sort((a,b)=>b.dist-a.dist||a.p.id-b.p.id);
  const transforms=new Float32Array(sampled.length*16),tints=new Float32Array(sampled.length*4);
  for(let i=0;i<sampled.length;i++){
   const {p,position,f}=sampled[i];
   const dx=eye[0]-position[0],dy=eye[1]-position[1];
   const yaw=Math.atan2(dx,-dy),radius=p.size*(p.kind==="smoke"?1+1.5*f:p.kind==="blast"?1+2*f:1);
   transforms.set(fromTRS(position,[0,0,Math.sin(yaw*.5),Math.cos(yaw*.5)],[radius,radius,radius]),i*16);
   const fade=(1-f)*(p.kind==="muzzle"?1-f*.5:1);
   tints.set([p.color[0],p.color[1],p.color[2],p.color[3]*fade],i*4);
  }
  const instances={transforms,tints};
  if(this.created)this.renderer.updateInstances(ID,instances);
  else{
   this.renderer.upsert(ID,{positions:QUAD,normals:NORMALS,colors:COLORS,instances,
    material:{color:[1,1,1,1],alphaMode:"blend",doubleSided:true,unlit:true,castShadow:false,frustumCulled:false}});
   this.created=true;
  }
  this.stats={...this.stats,active:sampled.length,uploaded:sampled.length,expired:this.stats.expired+expired};
  return {...this.stats};
 }
 clear(){this.active.length=0;if(this.created)this.renderer.remove(ID);this.created=false;this.lastTick=null;}
 dispose(){if(this.disposed)return;this.clear();this.disposed=true;}
}
