// The live shot picture. Moving tracer from gameplay_final_runtime_v2:
// core .017, halo .06, 240 m/s, 9 m tail, 130 ms hold. Muzzle flash is the
// walk flash: 70 ms, #ffd36b, on the muzzle you see, not on the eye.
import {fromTRS} from "./native_render_math.mjs";

const SPEED=240,TAIL=9,HOLD_MS=130,FLASH_MS=70;
const ID_CORE="fx/tracer-core",ID_HALO="fx/tracer-halo",ID_FLASH="fx/muzzle",ID_DECAL="fx/decals";
const shots=[];
let cursor=0,impacts=null;
const unit=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function quatFromY(dir){
  const d=unit(dir),c=d[1];
  if(c>.999)return [0,0,0,1];
  if(c<-.999)return [1,0,0,0];
  const axis=unit(cross([0,1,0],d)),s=Math.sqrt((1+c)*2);
  return [axis[0]/s,axis[1]/s,axis[2]/s,s*.5];
}
function tube(r,color){
  const seg=8,p=[],n=[],c=[];
  for(let i=0;i<seg;i++){
    const a=i/seg*Math.PI*2,b=(i+1)/seg*Math.PI*2;
    const x0=Math.cos(a)*r,z0=Math.sin(a)*r,x1=Math.cos(b)*r,z1=Math.sin(b)*r;
    for(const q of [[x0,-.5,z0],[x1,-.5,z1],[x1,.5,z1],[x0,-.5,z0],[x1,.5,z1],[x0,.5,z0]]){
      p.push(...q);n.push(q[0],0,q[2]);c.push(...color);
    }
  }
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
function disc(){
  const p=[],n=[],c=[];
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2,b=(i+1)/8*Math.PI*2;
    for(const q of [[0,0,0],[Math.cos(a),Math.sin(a),0],[Math.cos(b),Math.sin(b),0]]){
      p.push(...q);n.push(0,0,1);c.push(.08,.08,.08);
    }
  }
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
const CORE=tube(.017,[1,.96,.88]),HALO=tube(.06,[1,.6,.24]),FLASH=tube(.045,[1,.83,.42]),DECAL=disc();
function ensureScreen(){
  if(impacts||typeof document==="undefined")return;
  const style=document.createElement("style");
  style.textContent=`.flight-fire-impact{position:absolute;z-index:11;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;border-radius:50%;border:1px solid #fff7c2;background:radial-gradient(circle,#fff9be 0 16%,#ffbf55 22%,#ff6d35aa 42%,transparent 68%);box-shadow:0 0 12px #ffb14a;pointer-events:none;display:none}.flight-fire-impact.active{display:block;animation:flightImpactFade .26s ease-out forwards}@keyframes flightImpactFade{to{opacity:0;transform:scale(1.6)}}`;
  document.head.appendChild(style);
  const view=document.getElementById("viewport");
  impacts=Array.from({length:8},()=>{const el=document.createElement("i");el.className="flight-fire-impact";el.addEventListener("animationend",()=>el.classList.remove("active"));view?.appendChild(el);return el;});
}
function screenImpact(){
  ensureScreen();if(!impacts?.length)return;
  const view=document.getElementById("viewport"),el=impacts[cursor++%impacts.length];
  el.classList.remove("active");
  el.style.left=`${(view?.clientWidth||0)/2}px`;el.style.top=`${(view?.clientHeight||0)/2}px`;
  void el.offsetWidth;el.classList.add("active");
}
export function nativeMuzzle(game){
  const cam=game?.world?.camera;if(!cam?.eye||!cam?.target)return null;
  const f=unit([cam.target[0]-cam.eye[0],cam.target[1]-cam.eye[1],cam.target[2]-cam.eye[2]]);
  const r=unit(cross(f,cam.up||[0,0,1])),u=cross(r,f);
  const hold=globalThis.__nativeViewmodelHold||{right:.2,down:.18,forward:.55};
  return [
    cam.eye[0]+r[0]*hold.right+u[0]*(-hold.down+.03)+f[0]*(hold.forward+.39),
    cam.eye[1]+r[1]*hold.right+u[1]*(-hold.down+.03)+f[1]*(hold.forward+.39),
    cam.eye[2]+r[2]*hold.right+u[2]*(-hold.down+.03)+f[2]*(hold.forward+.39)
  ];
}
export function nativeFireShot(game,{from,to,mode,weapon}={}){
  if(!from||!to)return;
  const muzzle=nativeMuzzle(game)||from;
  const dir=[to[0]-muzzle[0],to[1]-muzzle[1],to[2]-muzzle[2]];
  const distance=Math.hypot(...dir);if(distance<.03)return;
  shots.push({start:muzzle,dir:unit(dir),distance,speed:SPEED,born:performance.now(),end:to,mode,weapon});
  if(shots.length>24)shots.shift();
  globalThis.__nativeLastShotAt=performance.now();
  screenImpact();
  const view=document.getElementById("viewport");
  if(view){view.dataset.fireShots=String((Number(view.dataset.fireShots)||0)+1);view.dataset.walkShotVisibility="moving-bullet-segment+phosphor-halo-v2";view.dataset.fireWeapon=String(weapon||"");view.dataset.fireMode=String(mode||"");}
}
function paint(renderer,id,geo,data,key){
  if(!data.length){if(paint[key]){renderer.remove(id);paint[key]=false;}return;}
  const transforms=new Float32Array(data);
  if(!paint[key]){renderer.upsert(id,{...geo,instances:{transforms},material:{color:[1,1,1,1],unlit:true,doubleSided:true,alphaMode:"blend",castShadow:false,frustumCulled:false}});paint[key]=true;}
  else renderer.updateInstances(id,{transforms});
}
export function tickNativeFireFx(game,now=performance.now()){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const core=[],halo=[],flash=[],decals=[];
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i],elapsed=Math.max(0,(now-s.born)/1000);
    const head=Math.min(s.distance,elapsed*s.speed);
    const arrived=now-s.born-s.distance/s.speed*1000;
    const tail=Math.max(0,head-TAIL);
    const done=head>=s.distance&&arrived>=HOLD_MS;
    if(done){shots.splice(i,1);continue;}
    const seg=Math.max(.04,head-tail);
    const mid=[
      s.start[0]+s.dir[0]*(tail+seg*.5),
      s.start[1]+s.dir[1]*(tail+seg*.5),
      s.start[2]+s.dir[2]*(tail+seg*.5)
    ];
    const q=quatFromY(s.dir);
    core.push(...fromTRS(mid,q,[1,seg,1]));
    halo.push(...fromTRS(mid,q,[1,seg,1]));
    if(head>=s.distance&&!s.decal){s.decal=true;decals.push(...fromTRS(s.end,[0,0,0,1],[.12,.12,.12]));}
    if(now-s.born<FLASH_MS){
      const muzzle=nativeMuzzle(game)||s.start;
      const k=1-(now-s.born)/FLASH_MS;
      flash.push(...fromTRS(muzzle,q,[k,k*.4,k]));
    }
  }
  paint(renderer,ID_CORE,CORE,core,"core");
  paint(renderer,ID_HALO,HALO,halo,"halo");
  paint(renderer,ID_FLASH,FLASH,flash,"flash");
  if(decals.length)paint(renderer,ID_DECAL,DECAL,decals,"decal");
}
