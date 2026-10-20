// Live shot picture on the native page.
// Tracer: cylinder radius .012, colour #ffd36a, 72 ms, same as flight_fire_fx.
// Muzzle: 70 ms, colour #ffd36b, same as the walk flash.
// Screen impact and the fire-shot counters are the live ones.
import {fromTRS} from "./native_render_math.mjs";

const TRACER_MS=72,MUZZLE_MS=70,TRACER_RADIUS=.012;
const ID_TRACER="fx/tracers",ID_MUZZLE="fx/muzzle";
const shots=[];
let cursor=0,styleReady=false,impacts=null;
const unit=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function quatFromY(dir){
  const d=unit(dir),c=d[1];
  if(c>.999)return [0,0,0,1];
  if(c<-.999)return [1,0,0,0];
  const axis=unit(cross([0,1,0],d)),s=Math.sqrt((1+c)*2);
  return [axis[0]/s,axis[1]/s,axis[2]/s,s*.5];
}
function cylinder(){
  const seg=6,p=[],n=[],c=[];
  for(let i=0;i<seg;i++){
    const a=i/seg*Math.PI*2,b=(i+1)/seg*Math.PI*2,x0=Math.cos(a),z0=Math.sin(a),x1=Math.cos(b),z1=Math.sin(b);
    const v=[[x0,-.5,z0],[x1,-.5,z1],[x1,.5,z1],[x0,-.5,z0],[x1,.5,z1],[x0,.5,z0]];
    for(const q of v){p.push(...q);n.push(q[0],0,q[2]);c.push(1,.83,.42);}
  }
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
function sphere(){
  const p=[],n=[],c=[];
  const add=(a,b,d)=>{for(const q of [a,b,d]){p.push(...q);n.push(...unit(q));c.push(1,.83,.42);}};
  add([0,.04,0],[.04,-.02,0],[-.02,-.02,.03]);
  add([0,.04,0],[-.02,-.02,.03],[-.02,-.02,-.03]);
  add([0,.04,0],[-.02,-.02,-.03],[.04,-.02,0]);
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
const TRACER_GEO=cylinder(),MUZZLE_GEO=sphere();
function ensureScreen(){
  if(styleReady||typeof document==="undefined")return;
  styleReady=true;
  const style=document.createElement("style");
  style.dataset.nativeFireFx="live-v1";
  style.textContent=`.flight-fire-impact{position:absolute;z-index:11;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;border-radius:50%;border:1px solid #fff7c2;background:radial-gradient(circle,#fff9be 0 16%,#ffbf55 22%,#ff6d35aa 42%,transparent 68%);box-shadow:0 0 12px #ffb14a;pointer-events:none;display:none}.flight-fire-impact.active{display:block;animation:flightImpactFade .26s ease-out forwards}@keyframes flightImpactFade{to{opacity:0;transform:scale(1.6)}}`;
  document.head.appendChild(style);
  const view=document.getElementById("viewport");
  impacts=Array.from({length:8},()=>{const el=document.createElement("i");el.className="flight-fire-impact";el.addEventListener("animationend",()=>el.classList.remove("active"));view?.appendChild(el);return el;});
}
function screenImpact(x,y){
  ensureScreen();if(!impacts?.length)return;
  const el=impacts[cursor++%impacts.length];
  el.classList.remove("active");el.style.left=`${x}px`;el.style.top=`${y}px`;void el.offsetWidth;el.classList.add("active");
}
function markShot(mode,weapon){
  const view=document.getElementById("viewport");if(!view)return;
  view.dataset.fireShots=String((Number(view.dataset.fireShots)||0)+1);
  view.dataset.fireWeapon=String(weapon||"");
  view.dataset.fireMode=String(mode||"");
  if(mode==="foot")view.dataset.walkEnhancedShots=String((Number(view.dataset.walkEnhancedShots)||0)+1);
}
export function nativeFireShot(game,{from,to,mode,weapon,clientX,clientY}={}){
  if(!from||!to)return;
  const now=performance.now();
  shots.push({from:[...from],to:[...to],born:now});
  if(shots.length>24)shots.shift();
  const view=document.getElementById("viewport");
  const x=Number.isFinite(clientX)?clientX-(view?.getBoundingClientRect().left||0):(view?.clientWidth||0)/2;
  const y=Number.isFinite(clientY)?clientY-(view?.getBoundingClientRect().top||0):(view?.clientHeight||0)/2;
  screenImpact(x,y);markShot(mode,weapon);
}
export function tickNativeFireFx(game,now=performance.now()){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const live=shots.filter(s=>now-s.born<TRACER_MS);
  shots.length=0;shots.push(...live);
  if(!live.length){if(tickNativeFireFx.drawn){renderer.remove(ID_TRACER);renderer.remove(ID_MUZZLE);tickNativeFireFx.drawn=false;}return;}
  const beams=[],flashes=[];
  for(const s of live){
    const dir=[s.to[0]-s.from[0],s.to[1]-s.from[1],s.to[2]-s.from[2]];
    const len=Math.min(18,Math.hypot(...dir));if(len<.02)continue;
    const mid=[s.from[0]+dir[0]*.5,s.from[1]+dir[1]*.5,s.from[2]+dir[2]*.5];
    beams.push(...fromTRS(mid,quatFromY(dir),[TRACER_RADIUS,len,TRACER_RADIUS]));
    const age=(now-s.born)/MUZZLE_MS;
    if(age<1)flashes.push(...fromTRS(s.from,quatFromY(dir),[.08*(1-age*.4),.08,.08]));
  }
  const up=(id,geo,data,key)=>{
    if(!data.length){if(tickNativeFireFx[key]){renderer.remove(id);tickNativeFireFx[key]=false;}return;}
    const transforms=new Float32Array(data);
    if(!tickNativeFireFx[key]){renderer.upsert(id,{...geo,instances:{transforms},material:{color:[1,.83,.42,1],unlit:true,doubleSided:true,alphaMode:"blend",castShadow:false,frustumCulled:false}});tickNativeFireFx[key]=true;}
    else renderer.updateInstances(id,{transforms});
  };
  up(ID_TRACER,TRACER_GEO,beams,"tracer");
  up(ID_MUZZLE,MUZZLE_GEO,flashes,"muzzle");
  tickNativeFireFx.drawn=true;
}
