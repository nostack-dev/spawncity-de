// Original world minimap: round, north-up, neon ground, OSM features.
// Colors and sizes are the live ones from real_world_bootstrap.
const GROUND="#2a3026",ROAD="#b9b9b4",WATER="#2f5f86",GREEN="#34482a",BUILD="#5b5e63",BUILD_EDGE="#7b7e83";
const EARTH=6378137;
const toMeters=(lon0,lat0,lon,lat)=>[(lon-lon0)*Math.PI/180*EARTH*Math.max(.01,Math.cos(lat0*Math.PI/180)),(lat-lat0)*Math.PI/180*EARTH];
let features=[],origin=null,hud,canvas,ctx,last=0;
function player(){
  const flight=globalThis.__arondightNativeGame?.flight?.position?.();
  const p=globalThis.__arondightWalkMode?.position;
  return flight||(p?[p.x,p.y,1]:[0,0,2]);
}
function featureRing(feature){
  const geometry=feature?.geometry||feature;
  const coords=geometry?.coordinates;
  if(!Array.isArray(coords)||!coords.length)return null;
  // Polygon: coordinates[0] is the outer ring. LineString: coordinates is the ring.
  if(geometry?.type==="Polygon"||Array.isArray(coords[0]?.[0]))return coords[0];
  if(Array.isArray(coords[0]))return coords;
  return null;
}
function ring(coords,kind){
  if(!origin||!Array.isArray(coords))return null;
  const path=[];
  for(const p of coords){
    if(!Array.isArray(p)||p.length<2)continue;
    const m=toMeters(origin.lon,origin.lat,Number(p[0]),Number(p[1]));
    if(m.every(Number.isFinite))path.push(m);
  }
  return path.length>=2?{kind,path}:null;
}
export function installNativeHudMap(game,snapshot){
  origin=snapshot?.origin||null;
  features=[];
  for(const b of snapshot?.buildings||[]){
    const outer=b.geometry?.coordinates?.[0];
    const item=ring(outer,"building");if(item)features.push(item);
  }
  for(const r of snapshot?.roads||[]){
    const line=r.geometry?.coordinates||(r.a&&r.b?[r.a,r.b]:null);
    const item=ring(line,"road");if(item)features.push(item);
  }
  for(const w of snapshot?.water||[]){
    const item=ring(featureRing(w),"water");if(item)features.push(item);
  }
  for(const g of snapshot?.green||snapshot?.meadows||snapshot?.pastures||[]){
    const item=ring(featureRing(g),"green");if(item)features.push(item);
  }
  hud=document.createElement("div");
  hud.id="worldLookHud";
  hud.setAttribute("aria-label","Orthographic top-down north-up WORLD minimap");
  hud.innerHTML='<div class="world-look-title"><span data-world-minimap-title>MINIMAP · N↑ · TOP</span><span data-world-look-readout>SNAP</span></div><div class="world-look-stage"><canvas class="world-mini-canvas" width="196" height="172" aria-label="Orthographic top-down north-up WORLD mini map"></canvas></div><b class="world-look-cardinal world-look-n">N</b><b class="world-look-cardinal world-look-e">E</b><b class="world-look-cardinal world-look-s">S</b><b class="world-look-cardinal world-look-w">W</b>';
  const style=document.createElement("style");
  style.textContent=`#worldLookHud{position:fixed;z-index:8;right:max(10px,env(safe-area-inset-right));top:max(48px,calc(env(safe-area-inset-top) + 42px));width:116px;height:116px;border:1px solid rgba(255,255,255,.16);border-radius:6px;background:rgba(10,13,18,.56);box-shadow:0 1px 2px rgba(0,0,0,.45);overflow:hidden;color:#fff}
  #worldLookHud .world-look-title{position:absolute;left:7px;right:7px;top:5px;z-index:3;display:flex;justify-content:space-between;font:600 7px/1.1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#fff}
  #worldLookHud .world-look-stage{position:absolute;left:9px;right:9px;top:22px;bottom:8px;border-radius:50%;overflow:hidden;border:1px solid rgba(255,255,255,.5);background:#2a3026}
  #worldLookHud .world-mini-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
  #worldLookHud .world-look-cardinal{position:absolute;font:600 7px Inter,system-ui,sans-serif;color:#f2f4f7;opacity:.9}
  .world-look-n{top:22px;left:53px}.world-look-e{top:62px;right:12px}.world-look-s{bottom:9px;left:54px}.world-look-w{top:62px;left:12px}`;
  document.head.append(style);document.body.append(hud);
  canvas=hud.querySelector(".world-mini-canvas");
  ctx=canvas.getContext("2d");
  globalThis.__arondightNativeGame=game;
}
export function setNativeHudSources(){}
export function tickNativeHudMap(game){
  if(!ctx)return;
  const now=performance.now();if(now-last<80)return;last=now;
  const p=player(),mode=game?.mode||"drone";
  const w=canvas.width,h=canvas.height;
  const radius=Math.max(42,Math.min(190,55+(mode==="drone"?Math.max(0,p[2]||0):0)*2));
  const scale=w/(radius*2),baseY=h*.5;
  const project=(x,y)=>[w/2+(x-p[0])*scale,baseY-(y-p[1])*scale];
  ctx.fillStyle=GROUND;ctx.fillRect(0,0,w,h);
  ctx.lineWidth=1;
  for(let v=-Math.ceil(radius/20)*20;v<=radius;v+=20){
    ctx.strokeStyle=v===0?"rgba(255,255,255,.3)":"rgba(255,255,255,.1)";
    const a=project(p[0]+v,p[1]-radius),b=project(p[0]+v,p[1]+radius);
    const c=project(p[0]-radius,p[1]+v),d=project(p[0]+radius,p[1]+v);
    ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.moveTo(...c);ctx.lineTo(...d);ctx.stroke();
  }
  for(const f of features){
    const pts=f.path.map(([x,y])=>project(x,y));
    if(f.kind==="road"){ctx.strokeStyle=ROAD;ctx.lineWidth=2;ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(...q):ctx.moveTo(...q));ctx.stroke();continue;}
    if(f.kind==="water"){ctx.fillStyle=WATER;ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(...q):ctx.moveTo(...q));ctx.closePath();ctx.fill();continue;}
    if(f.kind==="green"){ctx.fillStyle=GREEN;ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(...q):ctx.moveTo(...q));ctx.closePath();ctx.fill();continue;}
    ctx.fillStyle=BUILD;ctx.strokeStyle=BUILD_EDGE;ctx.lineWidth=1;ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(...q):ctx.moveTo(...q));ctx.closePath();ctx.fill();ctx.stroke();
  }
  const yaw=globalThis.__arondightWalkMode?.yaw||0;
  ctx.save();ctx.translate(w/2,baseY);ctx.rotate(-yaw);
  ctx.fillStyle="#f5b301";ctx.strokeStyle="#111";ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.restore();
  const title=hud.querySelector("[data-world-minimap-title]");
  if(title)title.textContent="MINIMAP · N↑ · TOP";
  const readout=hud.querySelector("[data-world-look-readout]");
  if(readout)readout.textContent=mode==="drone"?`${Math.round(p[2]||0)}m`:"SNAP";
}
