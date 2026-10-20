// Native wanted. Same heat, stars, counts and delays as wanted_system_logic.
// Police drones are native instances of the live drone mesh. Prod is not touched.
import {ORIGINAL_DRONE} from "./native_actor_meshes.mjs";
import {fromTRS} from "./native_render_math.mjs";
import {
  WANTED_EMP_COOLDOWN_MS,WANTED_EMP_RANGE_M,wantedCrimeSeverity,wantedDetectionRadiusM,
  wantedEscapeDurationMs,wantedPoliceCount,wantedPoliceEngageDelayMs,wantedPoliceArrivalDelayMs,
  wantedPoliceShotIntervalMs,wantedSearchState,wantedStarsForHeat
} from "./wanted_system_logic.mjs";

const CRIME_MEMORY_MS=12000;
const seen=new Map();
let heat=0,stars=0,phase="clear",lastCrimeAt=-Infinity,lastContactAt=-Infinity;
let hud=null,empButton=null,drones=[],seq=0,empReadyAt=-Infinity;
const quat=[0,0,0,1];

function view(){return document.getElementById("viewport");}
function player(){
  const w=globalThis.__arondightWalkMode,p=w?.position;
  if(w?.mode==="foot"&&p)return [p.x,p.y,p.z||1];
  const pose=globalThis.__arondightNativeGame?.flight?.position?.();
  return pose?[pose[0],pose[1],pose[2]]:null;
}
function remember(id,now){
  if(!id)return true;
  const prev=seen.get(id);if(prev&&now-prev<CRIME_MEMORY_MS)return false;
  seen.set(id,now);if(seen.size>80)seen.delete(seen.keys().next().value);return true;
}
function renderHud(){
  if(!hud)return;
  const on=stars>0;
  hud.hidden=!on;hud.dataset.phase=phase;
  hud.querySelectorAll(".wanted-stars i").forEach((el,i)=>el.classList.toggle("hot",i<stars));
  const small=hud.querySelector("small");
  if(small)small.textContent=phase==="pursuit"?"POLICE DRONES INBOUND":phase==="searching"?"POLICE SEARCHING":phase==="escaped"?"ESCAPED":"WANTED";
  if(empButton){empButton.hidden=!on;empButton.dataset.state=performance.now()>=empReadyAt?"ready":"cooldown";}
  const v=view();if(v){v.dataset.wantedStars=String(stars);v.dataset.wantedHeat=String(heat);v.dataset.wantedPhase=phase;}
}
function reportCrime(detail={}){
  if(detail.remote===true||detail.network===false)return false;
  const kind=String(detail.kind||"gunfire");
  const severity=Number.isFinite(detail.severity)?Math.max(0,Math.min(5,Math.floor(detail.severity))):wantedCrimeSeverity(kind);
  const now=performance.now();
  if(severity<=0||!remember(detail.id,now))return false;
  heat=Math.min(99,heat+severity);stars=wantedStarsForHeat(heat);lastCrimeAt=now;
  if(stars>0){phase="pursuit";lastContactAt=now;ensureDrones(now);}
  renderHud();return true;
}
function clearWanted(reason="escaped"){
  heat=0;stars=0;phase=reason==="escaped"?"escaped":"clear";lastCrimeAt=-Infinity;lastContactAt=-Infinity;
  for(const d of drones)d.active=false;
  renderHud();
  if(reason==="escaped")setTimeout(()=>{if(stars===0){phase="clear";renderHud();}},2100);
}
function ensureDrones(now){
  const n=wantedPoliceCount(stars);
  while(drones.length<n)drones.push({index:drones.length,active:false,pos:[0,0,8],engageAt:0,nextShotAt:0});
  const p=player()||[0,0,1],ring=wantedDetectionRadiusM(stars);
  drones.forEach((d,i)=>{
    if(i>=n){d.active=false;return;}
    if(d.active)return;
    const a=i/n*Math.PI*2,r=ring*.7;
    d.active=true;d.pos=[p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r,p[2]+6+i];
    d.engageAt=now+wantedPoliceArrivalDelayMs(stars)+wantedPoliceEngageDelayMs(stars);
  });
}
function triggerEmp(){
  const now=performance.now();if(now<empReadyAt||stars<=0)return false;
  const p=player();if(!p)return false;
  let n=0;
  for(const d of drones)if(d.active&&Math.hypot(d.pos[0]-p[0],d.pos[1]-p[1],d.pos[2]-p[2])<=WANTED_EMP_RANGE_M){d.active=false;n++;}
  empReadyAt=now+WANTED_EMP_COOLDOWN_MS;renderHud();return n;
}
function paint(game){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const data=[];
  for(const d of drones)if(d.active)data.push(...fromTRS(d.pos,quat,[1.1,1.1,1.1]));
  const id="wanted/police";
  if(!data.length){if(paint.drawn){renderer.remove(id);paint.drawn=false;}return;}
  const transforms=new Float32Array(data);
  if(!paint.drawn){renderer.upsert(id,{...ORIGINAL_DRONE,instances:{transforms},material:{color:[.95,.97,1,1],doubleSided:true}});paint.drawn=true;}
  else renderer.updateInstances(id,{transforms});
}
function step(now){
  if(stars<=0)return;
  const p=player();if(!p)return;
  const search=wantedSearchState({stars,seesPlayer:true,now,lastContactAt});
  phase=search||"pursuit";lastContactAt=now;
  if(now-lastCrimeAt>wantedEscapeDurationMs(stars)){clearWanted("escaped");return;}
  const interval=wantedPoliceShotIntervalMs(stars);
  for(const d of drones)if(d.active){
    const dx=p[0]-d.pos[0],dy=p[1]-d.pos[1],dz=(p[2]+2)-d.pos[2],len=Math.hypot(dx,dy,dz)||1;
    d.pos[0]+=dx/len*12/60;d.pos[1]+=dy/len*12/60;d.pos[2]+=dz/len*8/60;
    if(now>=d.engageAt&&now>=d.nextShotAt){d.nextShotAt=now+interval;globalThis.__arondightPlayerDamageModel?.damage?.(4);}
  }
}
function installHud(){
  const v=view();if(!v||hud)return;
  hud=document.createElement("div");hud.id="wantedHud";hud.hidden=true;hud.setAttribute("role","status");
  hud.innerHTML='<div class="wanted-stars" aria-hidden="true"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div><strong>WANTED</strong><small>POLICE DRONES INBOUND</small>';
  v.appendChild(hud);
  empButton=document.createElement("button");empButton.id="wantedEmpButton";empButton.type="button";empButton.hidden=true;
  empButton.innerHTML=`<strong>EMP</strong><small>${WANTED_EMP_RANGE_M} m</small>`;
  empButton.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();triggerEmp();});
  v.appendChild(empButton);
  const style=document.createElement("style");style.dataset.wantedPolice="native-v1";
  style.textContent=`#wantedHud{display:none;position:absolute;z-index:17;left:50%;top:max(52px,env(safe-area-inset-top));transform:translateX(-50%);min-width:190px;padding:7px 12px 8px;border:1px solid #5ab8ff66;border-radius:10px;background:#07111aee;color:#fff;text-align:center;pointer-events:none;font-family:system-ui,sans-serif}body.solo-flight #wantedHud:not([hidden]){display:block}.wanted-stars i{color:#39424c;font:900 20px/1 system-ui;font-style:normal;margin:0 1px}.wanted-stars i.hot{color:#ffd34f}#wantedHud strong{display:block;font:950 9px/1 system-ui;letter-spacing:.18em}#wantedHud small{display:block;margin-top:4px;font:850 8px/1 system-ui;color:#8ed6ff}#wantedEmpButton{position:absolute;z-index:18;right:max(12px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));border:1px solid #7ecbff;background:#123049;color:#e7f4ff;border-radius:12px;padding:8px 12px;font:800 12px system-ui}`;
  document.head.appendChild(style);
}
export function installNativeWanted(game){
  if(installNativeWanted.installed)return globalThis.__arondightWantedSystem;
  installNativeWanted.installed=true;
  installHud();
  const api={reportCrime,clear:clearWanted,triggerEmp,get state(){return {heat,stars,phase,policeActive:drones.filter(d=>d.active).length,lastCrimeAt,lastContactAt,empReadyAt};},get drones(){return drones.slice();}};
  globalThis.__arondightWantedSystem=api;
  addEventListener("arondight:weapon-fired",()=>reportCrime({id:`gunfire-${++seq}-${Math.round(performance.now())}`,kind:"gunfire",severity:1}));
  addEventListener("click",e=>{if(e.target instanceof Element&&e.target.closest("#soloReset,#reset"))clearWanted("reset");},{capture:true});
  const loop=now=>{try{step(now);paint(game);}catch{}requestAnimationFrame(loop);};
  requestAnimationFrame(loop);
  return api;
}
