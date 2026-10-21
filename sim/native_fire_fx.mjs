// Shot picture on the same path as ordnance and actors: world instances,
// opaque, fromTRS. Moving tracer from the live runtime: 240 m/s, 9 m tail.
import {fromTRS} from "./native_render_math.mjs";

const TAIL=9,HOLD_MS=130,FLASH_MS=70,TRACER_MPS=240;
const IDS={core:"fx/tracer-core",halo:"fx/tracer-halo",flash:"fx/muzzle",decal:"fx/decals"};
const shots=[];
const drawn={};
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
const GEO={
  core:tube(.02,[1,.96,.8]),
  halo:tube(.055,[1,.55,.15]),
  flash:tube(.07,[1,.82,.28]),
  decal:tube(.04,[.15,.12,.1])
};
const MATERIAL={color:[1,1,1,1],doubleSided:true,castShadow:false,frustumCulled:false};
function paint(renderer,key,data){
  const id=IDS[key];
  if(!data.length){if(drawn[key]){renderer.remove(id);drawn[key]=false;}return;}
  const transforms=new Float32Array(data);
  if(drawn[key])renderer.updateInstances(id,{transforms});
  else{renderer.upsert(id,{...GEO[key],instances:{transforms},material:MATERIAL});drawn[key]=true;}
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
export function nativeFireShot(game,{from,to,mode,weapon,speed}={}){
  if(!from||!to)return;
  const muzzle=nativeMuzzle(game)||from;
  const dir=[to[0]-muzzle[0],to[1]-muzzle[1],to[2]-muzzle[2]];
  const distance=Math.hypot(...dir);if(distance<.03)return;
  shots.push({start:muzzle,dir:unit(dir),distance,speed:Number(speed)>0?Number(speed):TRACER_MPS,born:performance.now(),end:to});
  if(shots.length>24)shots.shift();
  globalThis.__nativeLastShotAt=performance.now();
  const view=document.getElementById("viewport");
  if(view){view.dataset.fireShots=String((Number(view.dataset.fireShots)||0)+1);view.dataset.walkShotVisibility="moving-bullet-segment+phosphor-halo-v2";view.dataset.fireWeapon=String(weapon||"");view.dataset.fireMode=String(mode||"");}
}
export function tickNativeFireFx(game,now=performance.now()){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const core=[],halo=[],flash=[],decals=[];
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i],elapsed=Math.max(0,(now-s.born)/1000);
    const head=Math.min(s.distance,elapsed*s.speed);
    const arrived=now-s.born-s.distance/s.speed*1000;
    const tail=Math.max(0,head-TAIL);
    if(head>=s.distance&&arrived>=HOLD_MS){shots.splice(i,1);continue;}
    const seg=Math.max(.2,head-tail);
    const mid=[s.start[0]+s.dir[0]*(tail+seg*.5),s.start[1]+s.dir[1]*(tail+seg*.5),s.start[2]+s.dir[2]*(tail+seg*.5)];
    const q=quatFromY(s.dir);
    core.push(...fromTRS(mid,q,[1,seg,1]));
    halo.push(...fromTRS(mid,q,[1,seg,1]));
    if(head>=s.distance&&!s.decal){s.decal=true;}
    if(s.decal)decals.push(...fromTRS(s.end,q,[1,.04,1]));
    if(now-s.born<FLASH_MS){
      const muzzle=nativeMuzzle(game)||s.start;
      flash.push(...fromTRS(muzzle,q,[1,.25,1]));
    }
  }
  paint(renderer,"core",core);
  paint(renderer,"halo",halo);
  paint(renderer,"flash",flash);
  paint(renderer,"decal",decals);
}
