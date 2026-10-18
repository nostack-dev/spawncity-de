// Dynamic lighting requests for the exclusive WebGL2 world renderer.
// Mirrors the public requestLight(position,{color,intensity,distance}) API of
// sim/dynamic_lights.mjs without importing or instantiating any Three object.
// Physics/input/gameplay own the source positions. Rendering owns GPU upload.
export const NATIVE_POINT_LIGHTS_VERSION="native-point-lights-v1";
export const NATIVE_LIGHT_BUDGET=6;
const pos=p=>Array.isArray(p)||ArrayBuffer.isView(p)?[p[0],p[1],p[2]]:[p?.x,p?.y,p?.z];
const finite3=p=>p.length===3&&p.every(Number.isFinite);
function rgb(color){
 if(Number.isInteger(color)&&color>=0&&color<=0xffffff)
  return [(color>>16&255)/255,(color>>8&255)/255,(color&255)/255];
 if(Array.isArray(color)&&finite3(color)&&color.every(x=>x>=0&&x<=1))return color.slice();
 throw Error("native light must have hexadecimal RGB or linear 0..1 RGB");
}
export class NativePointLightPool{
 constructor({maxLights=NATIVE_LIGHT_BUDGET,maxRequests=64}={}){
  if(!Number.isInteger(maxLights)||maxLights<1||maxLights>NATIVE_LIGHT_BUDGET
    ||!Number.isInteger(maxRequests)||maxRequests<maxLights||maxRequests>256)
   throw Error("native point light budget invalid");
  this.maxLights=maxLights;this.maxRequests=maxRequests;
  this.requests=[];this.frame=0;
  this.posRange=new Float32Array(NATIVE_LIGHT_BUDGET*4);
  this.colorIntensity=new Float32Array(NATIVE_LIGHT_BUDGET*4);
 }
 request(position,{color=0xffffff,intensity=10,distance=30}={}){
  const p=pos(position);
  if(!finite3(p)||!(Number.isFinite(intensity)&&intensity>0)
    ||!(Number.isFinite(distance)&&distance>0)||this.requests.length>=this.maxRequests)return false;
  this.requests.push({p,color:rgb(color),intensity:Math.min(100,intensity),distance:Math.min(1000,distance)});
  return true;
 }
 resolve(eye){
  if(!finite3(eye))throw Error("native point lights need valid live camera eye");
  const sorted=this.requests
   .map((r,index)=>({...r,index,score:r.intensity/(1+Math.hypot(...r.p.map((v,i)=>v-eye[i]))/Math.max(4,r.distance))}))
   .sort((a,b)=>b.score-a.score||a.index-b.index)
   .slice(0,this.maxLights);
  this.posRange.fill(0);this.colorIntensity.fill(0);
  for(let i=0;i<sorted.length;i++){
   const r=sorted[i],offset=i*4;
   this.posRange.set([...r.p,r.distance],offset);
   this.colorIntensity.set([...r.color,r.intensity],offset);
  }
  this.requests.length=0;this.frame++;
  return {count:sorted.length,posRange:this.posRange,colorIntensity:this.colorIntensity};
 }
 clear(){this.requests.length=0;this.posRange.fill(0);this.colorIntensity.fill(0);}
}
