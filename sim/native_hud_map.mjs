// Live minimap and the live nuke shock. 180 m is full destruction.
import {fromTRS} from "./native_render_math.mjs";

const FULL_DESTROY_M=180;
const intensityAt=d=>Math.pow(FULL_DESTROY_M/Math.max(8,d),1.5);
let roads=[],peopleFn=()=>[],copsFn=()=>[],canvas,ctx,last=0,shock=null,debris=[];
function player(){
  const p=globalThis.__arondightWalkMode?.position;
  const flight=globalThis.__arondightNativeGame?.flight?.position?.();
  return flight||(p?[p.x,p.y,1]:[0,0,1]);
}
export function installNativeHudMap(game,snapshot){
  roads=(snapshot?.roads||[]).slice(0,400);
  canvas=document.createElement("canvas");
  canvas.id="minimap";canvas.width=180;canvas.height=180;
  canvas.style.cssText="position:fixed;top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));width:140px;height:140px;z-index:8;border:1px solid #ffffff33;border-radius:12px;background:#0b1218cc";
  document.body.append(canvas);
  ctx=canvas.getContext("2d");
  const nuke=document.createElement("button");
  nuke.type="button";nuke.id="nukeButton";nuke.textContent="NUKE";
  nuke.style.cssText="position:fixed;top:max(160px,calc(env(safe-area-inset-top) + 150px));right:max(10px,env(safe-area-inset-right));z-index:8;background:#6d2929;color:#fff;border:1px solid #ff8a6a;border-radius:10px;padding:8px 12px;font:800 12px system-ui";
  nuke.addEventListener("click",()=>fireNativeNuke(game));
  document.body.append(nuke);
  globalThis.__arondightNativeGame=game;
  globalThis.__arondightNukeShake={droneProtected:()=>shock&&performance.now()-shock.born<40000};
}
export function setNativeHudSources({people,cops}={}){
  if(people)peopleFn=people;if(cops)copsFn=cops;
}
export function fireNativeNuke(game,at=player()){
  const center=[at[0],at[1],0];
  shock={center,born:performance.now()};
  debris=Array.from({length:40},()=>{
    const a=Math.random()*Math.PI*2,r=Math.random()*FULL_DESTROY_M;
    return {x:center[0]+Math.cos(a)*r,y:center[1]+Math.sin(a)*r,z:Math.random()*8,vz:2+Math.random()*6};
  });
  for(const a of peopleFn()){
    const d=Math.hypot(a.x-center[0],a.y-center[1]);
    if(d<FULL_DESTROY_M){a.alive=false;a.knocked=true;}
  }
  for(const c of copsFn()){
    const d=Math.hypot((c.x??0)-center[0],(c.y??0)-center[1]);
    if(d<FULL_DESTROY_M)c.alive=false;
  }
  game?.world?.effects?.emit?.({kind:"blast",position:center,velocity:[0,0,4],lifeMs:900,size:18});
  if(typeof window!=="undefined"){
    window.dispatchEvent(new CustomEvent("arondight:nuke-launch",{detail:{position:center}}));
    window.dispatchEvent(new CustomEvent("arondight:nuke-impact",{detail:{position:center,radiusM:FULL_DESTROY_M}}));
  }
  return {center,radius:FULL_DESTROY_M,intensity:intensityAt(1)};
}
export function tickNativeHudMap(game){
  const now=performance.now();
  if(ctx&&now-last>80){
    last=now;
    const p=player(),span=220,s=canvas.width/span;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.translate(canvas.width/2,canvas.height/2);
    ctx.strokeStyle="#6d8294";ctx.lineWidth=1.4;
    for(const r of roads){
      const a=r.a||r.segments?.[0]?.a,b=r.b||r.segments?.[0]?.b;if(!a||!b)continue;
      ctx.beginPath();ctx.moveTo((a[0]-p[0])*s,(p[1]-a[1])*s);ctx.lineTo((b[0]-p[0])*s,(p[1]-b[1])*s);ctx.stroke();
    }
    ctx.fillStyle="#d7e4ef";
    for(const a of peopleFn())if(a.alive)ctx.fillRect((a.x-p[0])*s-1,(p[1]-a.y)*s-1,2,2);
    ctx.fillStyle="#ff5d4a";
    for(const c of copsFn())if(c.alive!==false)ctx.fillRect(((c.x??0)-p[0])*s-1.5,(p[1]-(c.y??0))*s-1.5,3,3);
    ctx.fillStyle="#ffb02e";ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
    if(shock){const age=(now-shock.born)/1000,rad=Math.min(FULL_DESTROY_M,age*240);ctx.strokeStyle="#ffb02e88";ctx.beginPath();ctx.arc((shock.center[0]-p[0])*s,(p[1]-shock.center[1])*s,rad*s,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  const renderer=game?.world?.renderer;if(!renderer?.upsert||!debris.length)return;
  for(const d of debris){d.z+=d.vz/60;d.vz-=9.8/60;if(d.z<0){d.z=0;d.vz=0;}}
  const data=debris.filter(d=>d.z>0||d.vz).slice(0,40).flatMap(d=>[...fromTRS([d.x,d.y,d.z],[0,0,0,1],[.4,.4,.4])]);
  if(data.length){
    const transforms=new Float32Array(data);
    renderer.upsert("nuke/debris",{positions:new Float32Array([-.2,-.2,0,.2,-.2,0,0,.2,.3]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),colors:new Float32Array([.45,.4,.32,.45,.4,.32,.45,.4,.32]),instances:{transforms},material:{doubleSided:true,castShadow:false}});
  }
}
