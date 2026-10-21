// Production sandbox_game.mjs on the native engine: the chaos loop.
//  * CHAOS earns SCORE (takedowns, wrecked cars, police drones, drifting,
//    escaping); events close together build the COMBO multiplier (FLOW meter)
//    with the same pop texts, HUD and CSS.
//  * Every WANTED star sends foot enemies on top of the police drones:
//    COP (pistol), SWAT (rifle bursts), HEAVY (rockets, real explosions).
//    Same types, budgets, spawn interval, ranges, accuracy, damage and
//    scoring; line of sight is a Box3D ray against the static world.
// The enemies are drawn as native instanced meshes built from the same
// primitives as production (cylinder body / legs, sphere head, neon stripe
// ring and visor, gun or rocket tube).
import {getSharedCombatAudioContext,playCombatAudio} from "./combat_audio_bank.mjs";
import {AUDIO_SETTINGS_EVENT,loadAudioSettings,normalizeAudioSettings} from "./audio_settings.mjs";
import {addTrauma} from "./camera_shake.mjs";
import {worldOption,WORLD_OPTIONS_EVENT} from "./world_options.mjs";
import {syncInstanced} from "./native_instanced.mjs";

export const SANDBOX_GAME_VERSION="sandbox-chaos-loop-v1-native";
const TYPES={
  cop:  {hp:3, speed:3.6,range:24,shotMs:900, burst:1,dmg:5, acc:.62,color:0x2f6bff,stripe:0x29e6ff,score:250,scale:1},
  swat: {hp:7, speed:2.9,range:32,shotMs:1700,burst:3,dmg:4, acc:.5, color:0x1c2030,stripe:0xffd23f,score:450,scale:1.08},
  heavy:{hp:14,speed:2.1,range:48,shotMs:3600,burst:1,dmg:0, acc:.0, color:0x7a1430,stripe:0xffb347,score:900,scale:1.22},
};
const BUDGET=[0,1,2,4,6,8],MAX_ENEMIES=8,SPAWN_MS=6000,COMBO_MS=3200;
let game=null,installed=false,enemies=[],serial=0,lastSpawn=0,score=0,combo=1,comboUntil=0,flow=0,lastFrame=performance.now(),noWantedSince=0,lastStars=0,lastDestructHits=0,driftScore=0;
let settings=normalizeAudioSettings(loadAudioSettings()),hud=null,scoreEl=null,comboEl=null,flowEl=null,popLayer=null;
const droneSeen=new Map();
const wanted=()=>globalThis.__arondightWantedSystem||null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const rand=(a,b)=>a+Math.random()*(b-a);
const ground=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
const dist3=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

// ------------------------------------------------------------------ audio
function sfx(kind,{gain=1,rate=1,at=null}={}){
  if(settings.soundEnabled===false)return;let att=1;const e=game?.world?.camera?.eye;if(at&&e)att=clamp(1-Math.hypot(e[0]-at.x,e[1]-at.y,e[2]-at.z)/140,.05,1);
  const ctx=getSharedCombatAudioContext();if(ctx)playCombatAudio(ctx,kind,{gain:gain*att*(Number(settings.fxVolume)||70)/100,playbackRate:rate,minIntervalMs:28});
}

// ------------------------------------------------------------------ HUD (production markup and CSS)
function ensureHud(){
  const view=document.getElementById("viewport");if(!view)return false;if(hud?.isConnected)return true;
  hud=document.createElement("div");hud.id="sandboxHud";hud.setAttribute("aria-live","polite");
  hud.innerHTML='<div class="sb-flow"><span>FLOW</span><i><b></b></i><em>x1</em></div><div class="sb-score">0</div><div class="sb-pops"></div>';
  view.appendChild(hud);scoreEl=hud.querySelector(".sb-score");comboEl=hud.querySelector(".sb-flow em");flowEl=hud.querySelector(".sb-flow b");popLayer=hud.querySelector(".sb-pops");
  if(document.querySelector("style[data-sandbox-hud]"))return true;
  const style=document.createElement("style");style.dataset.sandboxHud=SANDBOX_GAME_VERSION;style.textContent=`
#sandboxHud{position:absolute;inset:0;z-index:9;pointer-events:none;font-family:"Inter",system-ui,-apple-system,sans-serif}
#sandboxHud .sb-score{position:absolute;left:max(14px,var(--solo-safe-left,env(safe-area-inset-left)));top:calc(max(8px,var(--solo-safe-top,env(safe-area-inset-top))) + 82px);font-weight:700;font-size:clamp(17px,2.6vw,24px);letter-spacing:.08em;color:#f2f4f7;text-shadow:0 1px 3px rgba(0,0,0,.7)}
#sandboxHud .sb-flow{position:absolute;left:max(14px,var(--solo-safe-left,env(safe-area-inset-left)));top:calc(max(8px,var(--solo-safe-top,env(safe-area-inset-top))) + 112px);display:flex;align-items:center;gap:6px;color:#f2f4f7;font-weight:600;font-size:10px;letter-spacing:.18em;text-shadow:0 1px 2px rgba(0,0,0,.6)}
#sandboxHud .sb-flow i{display:block;width:70px;height:4px;border-radius:2px;background:rgba(10,13,18,.5);overflow:hidden;box-shadow:none}
#sandboxHud .sb-flow b{display:block;height:100%;width:0;background:#f5b301;transition:width .15s linear}
#sandboxHud .sb-flow em{font-style:italic;color:#f5b301;font-style:normal;text-shadow:0 1px 2px rgba(0,0,0,.6);min-width:2.2em}
#sandboxHud .sb-pops{position:absolute;left:0;right:0;top:40%;display:flex;flex-direction:column;align-items:center;gap:4px}
#sandboxHud .sb-pop{font-weight:700;font-size:clamp(15px,2.6vw,24px);letter-spacing:.16em;animation:sbPop 1.5s ease-out forwards;white-space:nowrap}
#sandboxHud .sb-pop.pink{color:#f2f4f7;text-shadow:0 1px 4px rgba(0,0,0,.7)}
#sandboxHud .sb-pop.cyan{color:#9fd3ff;text-shadow:0 1px 4px rgba(0,0,0,.7)}
#sandboxHud .sb-pop.red{color:#ff6a5a;text-shadow:0 1px 4px rgba(0,0,0,.7)}
#sandboxHud .sb-pop.gold{color:#f5b301;text-shadow:0 1px 4px rgba(0,0,0,.7)}
body.solo-flight.vs-multiplayer #sandboxHud .sb-score,
body.solo-flight.vs-multiplayer #sandboxHud .sb-flow{display:none!important}
@media(max-width:380px) and (orientation:portrait){
  body.solo-flight #sandboxHud .sb-flow{
    top:calc(max(8px,var(--solo-safe-top,env(safe-area-inset-top))) + 104px)
  }
}
@media(max-height:340px) and (pointer:coarse){
  body.solo-flight #sandboxHud .sb-score,
  body.solo-flight #sandboxHud .sb-flow{display:none!important}
}
@keyframes sbPop{0%{opacity:0;transform:scale(1.25)}10%{opacity:1;transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:translateY(-14px)}}`;
  document.head.appendChild(style);return true;
}
function pop(text,color="pink"){if(!ensureHud())return;const key=String(text).replace(/\s+x\d+$/,"");for(const old of popLayer.children)if(old.dataset.key===key){old.textContent=text;old.style.animation="none";void old.offsetWidth;old.style.animation="";clearTimeout(old._t);old._t=setTimeout(()=>old.remove(),1550);return;}const el=document.createElement("div");el.dataset.key=key;el.className=`sb-pop ${color}`;el.textContent=text;popLayer.appendChild(el);while(popLayer.children.length>3)popLayer.firstChild.remove();el._t=setTimeout(()=>el.remove(),1550);}
export function award(points,label,color){
  const now=performance.now();if(now<comboUntil)combo=Math.min(8,combo+1);else combo=1;comboUntil=now+COMBO_MS;flow=Math.min(1,flow+.18);
  const gained=Math.round(points*combo);score+=gained;if(label)pop(combo>1?`${label}  x${combo}`:label,color);renderHud(true);
  const v=document.getElementById("viewport");if(v){v.dataset.sandboxScore=String(score);v.dataset.sandboxCombo=String(combo);}return gained;
}
let shownScore=-1;
function renderHud(force=false){if(!ensureHud())return;if(force||shownScore!==score){shownScore=score;scoreEl.textContent=score.toLocaleString("de-DE");}comboEl.textContent=`x${combo}`;flowEl.style.width=`${Math.round(flow*100)}%`;}

// ------------------------------------------------------------------ meshes (production primitives)
const hex=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
function geoBuf(){return {p:[],n:[],c:[]};}
function tri(b,v,nrm,col){for(let i=0;i<3;i++){b.p.push(...v[i]);b.n.push(...nrm[i]);b.c.push(...col);}}
// cylinder along Z, centred at (cx,cy,cz)
function cylinder(b,[cx,cy,cz],rTop,rBot,h,seg,col){
  const z0=cz-h/2,z1=cz+h/2,slope=(rBot-rTop)/h;
  for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
    const n0=[c0,s0,slope],n1=[c1,s1,slope];
    const A=[cx+c0*rBot,cy+s0*rBot,z0],B=[cx+c1*rBot,cy+s1*rBot,z0],C=[cx+c1*rTop,cy+s1*rTop,z1],D=[cx+c0*rTop,cy+s0*rTop,z1];
    tri(b,[A,B,C],[n0,n1,n1],col);tri(b,[A,C,D],[n0,n1,n0],col);
    tri(b,[[cx,cy,z1],D,C],[[0,0,1],[0,0,1],[0,0,1]],col);tri(b,[[cx,cy,z0],B,A],[[0,0,-1],[0,0,-1],[0,0,-1]],col);}
}
function sphere(b,[cx,cy,cz],r,ws,hs,col){
  const pt=(i,j)=>{const th=j/hs*Math.PI,ph=i/ws*Math.PI*2;const n=[Math.sin(th)*Math.cos(ph),Math.sin(th)*Math.sin(ph),Math.cos(th)];return [[cx+n[0]*r,cy+n[1]*r,cz+n[2]*r],n];};
  for(let j=0;j<hs;j++)for(let i=0;i<ws;i++){const a=pt(i,j),bb=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);
    tri(b,[a[0],d[0],c[0]],[a[1],d[1],c[1]],col);tri(b,[a[0],c[0],bb[0]],[a[1],c[1],bb[1]],col);}
}
function box(b,[cx,cy,cz],[sx,sy,sz],col){
  const x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2;
  const F=[[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],[[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0],[0,0,-1]],
    [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]],[[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[0,1,0]],
    [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0]],[[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[-1,0,0]]];
  for(const [a,b2,c,d,n] of F){tri(b,[a,b2,c],[n,n,n],col);tri(b,[a,c,d],[n,n,n],col);}
}
function torus(b,[cx,cy,cz],R,r,rs,ts,col){
  const pt=(i,j)=>{const u=i/ts*Math.PI*2,v=j/rs*Math.PI*2,cu=Math.cos(u),su=Math.sin(u),cv=Math.cos(v),sv=Math.sin(v);return [[cx+(R+r*cv)*cu,cy+(R+r*cv)*su,cz+r*sv],[cv*cu,cv*su,sv]];};
  for(let i=0;i<ts;i++)for(let j=0;j<rs;j++){const a=pt(i,j),bb=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);tri(b,[a[0],bb[0],c[0]],[a[1],bb[1],c[1]],col);tri(b,[a[0],c[0],d[0]],[a[1],c[1],d[1]],col);}
}
const f32=b=>({positions:new Float32Array(b.p),normals:new Float32Array(b.n),colors:new Float32Array(b.c)});
const GEO={};
function enemyGeometry(type){
  if(GEO[type])return GEO[type];const t=TYPES[type],lit=geoBuf(),neon=geoBuf();
  cylinder(lit,[0,0,.4],.22,.18,.8,8,hex(0x14121f));
  cylinder(lit,[0,0,1.15],.28,.34,1.15,8,hex(t.color));
  torus(neon,[0,0,1.42],.31,.035,6,16,hex(t.stripe));
  sphere(lit,[0,0,1.92],.2,10,8,hex(type==="swat"?0x101018:0xe0b394));
  box(neon,[.17,0,1.95],[.06,.26,.1],hex(t.stripe));
  if(type==="heavy")cylinder(lit,[.36,-.18,1.62],.13,.13,1.1,10,hex(0x1a1a22));
  else box(lit,[.36,-.18,1.3],[.62,.1,.1],hex(0x1a1a22));
  return GEO[type]={lit:f32(lit),neon:f32(neon)};
}
let ROCKET_GEO=null,drawn=new Set();
function rocketGeometry(){if(ROCKET_GEO)return ROCKET_GEO;const b=geoBuf();sphere(b,[0,0,0],.22,8,6,hex(0xffb347));return ROCKET_GEO=f32(b);}
// root matrix: Three Euler XYZ (0, tilt, yaw) — tilt around world Y after the yaw, then uniform scale
function rootMatrix(x,y,z,yaw,tilt,s){
  const cz=Math.cos(yaw),sz=Math.sin(yaw),cy=Math.cos(tilt),sy=Math.sin(tilt);
  // Ry*Rz columns
  const c0=[cy*cz,sz,-sy*cz],c1=[-cy*sz,cz,sy*sz],c2=[sy,0,cy];
  return [c0[0]*s,c0[1]*s,c0[2]*s,0,c1[0]*s,c1[1]*s,c1[2]*s,0,c2[0]*s,c2[1]*s,c2[2]*s,0,x,y,z,1];
}
function draw(){
  const r=game?.world?.renderer;if(!r?.upsert)return;
  const want=new Set();
  for(const type of Object.keys(TYPES)){
    const list=enemies.filter(e=>e.type===type);
    for(const part of ["lit","neon"]){const id=`sandbox/${type}/${part}`,geo=enemyGeometry(type)[part];
      if(!list.length){if(drawn.has(id)){syncInstanced(r,id,geo,null);drawn.delete(id);}continue;}
      const tr=new Float32Array(list.length*16);list.forEach((e,i)=>tr.set(rootMatrix(e.x,e.y,e.z,e.yaw,e.tilt||0,e.t.scale),i*16));
      try{syncInstanced(r,id,geo,tr,{material:part==="neon"?{unlit:true,castShadow:false}:{castShadow:true,roughness:.8}});drawn.add(id);}catch(err){console.warn("sandbox draw",err);}
    }
  }
  const rid="sandbox/rockets";
  if(rockets.length){const tr=new Float32Array(rockets.length*16);rockets.forEach((k,i)=>tr.set([1,0,0,0,0,1,0,0,0,0,1,0,k.p.x,k.p.y,k.p.z,1],i*16));syncInstanced(r,rid,rocketGeometry(),tr,{material:{unlit:true,castShadow:false}});drawn.add(rid);}
  else if(drawn.has(rid)){syncInstanced(r,rid,rocketGeometry(),null);drawn.delete(rid);}
  drawTracers(r);
}

// ------------------------------------------------------------------ world queries
function prisms(){return game?.gameplayState?.carObstacleSnapshot?.prisms||[];}
function insideBuilding(x,y){
  for(const p of prisms()){const pts=p.points;if(!pts||pts.length<3||p.leveled)continue;
    let bb=p.__bb;if(!bb){bb=[Infinity,Infinity,-Infinity,-Infinity];for(const q of pts){bb[0]=Math.min(bb[0],+q[0]);bb[1]=Math.min(bb[1],+q[1]);bb[2]=Math.max(bb[2],+q[0]);bb[3]=Math.max(bb[3],+q[1]);}try{p.__bb=bb;}catch{}}
    if(x<bb[0]||x>bb[2]||y<bb[1]||y>bb[3])continue;
    let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=+pts[i][0],yi=+pts[i][1],xj=+pts[j][0],yj=+pts[j][1];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi)inside=!inside;}if(inside)return true;}
  return false;
}
function target(){
  if(!game)return null;const mode=game.mode,rig=game.rigids;
  if(mode==="drone"){const p=game.flight?.position?.(),m=globalThis.__arondightDroneDamageModel;if(!p||m?.destroyed)return null;return {kind:"drone",position:{x:p[0],y:p[1],z:p[2]},model:m,speedMps:0};}
  const id=mode==="car"?"player-car":mode==="jet"?"player-jet":"player-foot",p=rig?.pose?.(id)?.position;if(!p)return null;
  const m=globalThis.__arondightPlayerDamageModel;if(m?.dead)return null;
  return {kind:"player",position:{x:p[0],y:p[1],z:p[2]+(mode==="foot"?.5:.6)},model:m,speedMps:mode==="car"?Math.abs(Number(game.gameplayState?.car?.speedMps)||0):0};
}
function typeAllowed(type){return type==="heavy"?worldOption("military"):worldOption("police");}
function dropDisallowed(){enemies=enemies.filter(e=>typeAllowed(e.type));}
// production __spawnVisibilityGuard: arrive where nobody sees it (out of view or behind a building)
function unseen(x,y,z){
  const cam=game?.world?.camera;if(!cam?.eye)return true;const e=cam.eye,f=[cam.target[0]-e[0],cam.target[1]-e[1],cam.target[2]-e[2]],fl=Math.hypot(...f)||1;
  const d=[x-e[0],y-e[1],z+1.1-e[2]],dl=Math.hypot(...d)||1;const cos=(d[0]*f[0]+d[1]*f[1]+d[2]*f[2])/(dl*fl);
  if(cos<Math.cos(Math.min(1.4,(Number(cam.fov)||1.2)*.75)))return true;
  return !lineOfSight({x:e[0],y:e[1],z:e[2]},{x,y,z:z+1.1});
}
function spawnEnemy(type,center){
  if(!typeAllowed(type))return null;
  for(let attempt=0;attempt<10;attempt++){const a=Math.random()*Math.PI*2,d=rand(55,85),x=center.x+Math.cos(a)*d,y=center.y+Math.sin(a)*d;if(insideBuilding(x,y))continue;const z=ground(x,y);if(!unseen(x,y,z))continue;
    const t=TYPES[type],e={id:`enemy-${++serial}`,type,t,x,y,z,hp:t.hp,state:"approach",yaw:0,tilt:0,nextShot:performance.now()+rand(900,1800),burstLeft:0,deadAt:0,strafe:Math.random()<.5?-1:1,stuck:0};
    enemies.push(e);return e;}
  return null;
}
function lineOfSight(from,to){const rb=game?.rigids;if(!rb?.raycast)return true;const d=[to.x-from.x,to.y-from.y,to.z-from.z],len=Math.hypot(...d);if(len<1)return true;try{const hit=rb.raycast([from.x,from.y,from.z],d.map(v=>v/len),len-1.2);return!hit||hit.kind!=="terrain";}catch{return true;}}

// ------------------------------------------------------------------ tracers (24 additive segments, 90 ms)
const TR=Array.from({length:24},()=>({life:0,a:null,b:null,c:null}));let trSlot=0,trShown=false;
function tracer(from,to,color){const s=TR[trSlot++%24];s.a=[from.x,from.y,from.z];s.b=[to.x,to.y,to.z];s.c=hex(color);s.life=.09;}
function stepTracers(dt){for(const s of TR)if(s.life>0)s.life-=dt;}
function drawTracers(r){
  const live=TR.filter(s=>s.life>0);
  if(!live.length){if(trShown){r.remove("sandbox/tracers");trShown=false;}return;}
  const b=geoBuf(),w=.035;
  for(const s of live){const d=[s.b[0]-s.a[0],s.b[1]-s.a[1],s.b[2]-s.a[2]],l=Math.hypot(...d)||1;let side=[-d[1]/l,d[0]/l,0];if(Math.hypot(...side)<.1)side=[1,0,0];
    for(const o of [side,[0,0,1]]){const a0=[s.a[0]+o[0]*w,s.a[1]+o[1]*w,s.a[2]+o[2]*w],a1=[s.a[0]-o[0]*w,s.a[1]-o[1]*w,s.a[2]-o[2]*w],b0=[s.b[0]+o[0]*w,s.b[1]+o[1]*w,s.b[2]+o[2]*w],b1=[s.b[0]-o[0]*w,s.b[1]-o[1]*w,s.b[2]-o[2]*w];
      const ca=s.c,cb=s.c.map(v=>v*.4),n=[0,0,1];
      for(const [v,c] of [[a0,ca],[a1,ca],[b1,cb],[a0,ca],[b1,cb],[b0,cb]]){b.p.push(...v);b.n.push(...n);b.c.push(...c);}}}
  r.upsert("sandbox/tracers",{...f32(b),material:{unlit:true,doubleSided:true,castShadow:false,alphaMode:"blend",color:[1,1,1,.9]}});trShown=true;
}

// ------------------------------------------------------------------ rockets (HEAVY)
const rockets=[];
function fireRocket(from,to){const d=[to.x-from.x,to.y-from.y,to.z-from.z],l=Math.hypot(...d)||1;rockets.push({p:{...from},v:d.map(x=>x/l*26),life:l/26+.2});sfx("shot",{gain:.9,rate:.6,at:from});}
function stepRockets(dt){
  for(let i=rockets.length-1;i>=0;i--){const r=rockets[i];r.p.x+=r.v[0]*dt;r.p.y+=r.v[1]*dt;r.p.z+=r.v[2]*dt;r.life-=dt;const p=r.p,g=ground(p.x,p.y);
    const t=target();const near=t&&dist3(p,t.position)<1.6;
    if(r.life<=0||p.z<=g+.15||near||insideBuilding(p.x,p.y)){
      window.dispatchEvent(new CustomEvent("arondight:world-explosion",{detail:{position:[p.x,p.y,Math.max(g+.2,p.z)],radiusM:6,maxDamage:90,kind:"enemy-rocket",source:"sandbox-heavy"}}));
      if(t){const d=dist3(p,t.position);if(d<6)t.model?.damage?.(Math.round(38*(1-d/6))+6,"enemy:heavy-rocket");}
      sfx("explosion",{gain:1,at:p});rockets.splice(i,1);}}
}
function shoot(e,now){
  const t=target();if(!t)return;const from={x:e.x,y:e.y,z:e.z+1.45*e.t.scale},to={...t.position};
  if(!lineOfSight(from,to)){e.nextShot=now+500;return;}
  if(e.type==="heavy"){fireRocket(from,to);return;}
  const dist=dist3(from,to),moving=Number(t.speedMps)||0,p=clamp(e.t.acc-dist/90-moving*.02,.08,.85),hit=Math.random()<p;
  const miss=hit?to:{x:to.x+rand(-2.5,2.5),y:to.y+rand(-2.5,2.5),z:to.z+rand(-.6,1.2)};
  tracer(from,miss,e.type==="cop"?0xfff1a8:0xffb347);sfx("shot",{gain:.45,rate:e.type==="cop"?1.35:1.05,at:from});
  if(hit){t.model?.damage?.(e.t.dmg,`enemy:${e.type}`);addTrauma(.12);}
}
function killEnemy(e){
  if(e.state==="dead")return;e.state="dead";e.deadAt=performance.now();
  award(e.t.score,{cop:"TAKEDOWN!",swat:"SWAT DOWN!",heavy:"HEAVY DOWN!!"}[e.type]||"TAKEDOWN!",e.type==="heavy"?"gold":"pink");
  wanted()?.reportCrime?.({id:`${e.id}-kill`,kind:"police-kill",severity:1});sfx("hit",{gain:.8,at:{x:e.x,y:e.y,z:e.z}});
}
function damageEnemy(e,amount){if(e.state==="dead")return false;e.hp-=amount;e.hitFlash=performance.now();if(e.hp<=0)killEnemy(e);else if(e.state==="approach")e.nextShot=Math.min(e.nextShot,performance.now()+350);return true;}
// Shots from every native weapon test the enemies like production's
// registerWorldPopulationHit wrap: one hit = one point of damage.
export function hitNativeSandbox(origin,dir,range){
  let best=null,bestT=range;
  for(const e of enemies){if(e.state==="dead")continue;const s=e.t.scale,cz=e.z+1.1*s;
    const ox=e.x-origin[0],oy=e.y-origin[1],oz=cz-origin[2],t=ox*dir[0]+oy*dir[1]+oz*dir[2];if(t<0||t>bestT)continue;
    const px=origin[0]+dir[0]*t-e.x,py=origin[1]+dir[1]*t-e.y,pz=origin[2]+dir[2]*t-cz;
    if(px*px+py*py<(.38*s)**2&&Math.abs(pz)<1.05*s){best={e,t};bestT=t;}}
  return best?{kind:"enemy",id:best.e.id,t:best.t,point:[origin[0]+dir[0]*best.t,origin[1]+dir[1]*best.t,origin[2]+dir[2]*best.t]}:null;
}
export function damageNativeSandboxEnemy(id,amount=1){const e=enemies.find(x=>x.id===id);return e?damageEnemy(e,amount):false;}
export function liveNativeSandboxEnemies(){return enemies.filter(e=>e.state!=="dead");}
function onExplosion(event){
  const d=event?.detail||{};if(d.source==="sandbox-heavy")return;const p=d.position;const x=Array.isArray(p)?+p[0]:+p?.x,y=Array.isArray(p)?+p[1]:+p?.y;if(!Number.isFinite(x))return;const r=clamp(d.radiusM??6,2,400);
  for(const e of enemies){if(e.state==="dead")continue;const dist=Math.hypot(e.x-x,e.y-y);if(dist<r)damageEnemy(e,d.kind==="nuke"?999:Math.ceil(12*(1-dist/r))+1);}
}
function stepEnemy(e,dt,now,t){
  if(e.state==="dead"){const k=Math.min(1,(now-e.deadAt)/350);e.tilt=k*Math.PI/2*e.strafe;if(now-e.deadAt>4000)e.z-=dt*.6;return now-e.deadAt<6500;}
  if(!t)return true;const dx=t.position.x-e.x,dy=t.position.y-e.y,dist=Math.hypot(dx,dy);if(dist>300)return false;
  const want=Math.atan2(dy,dx);let move=0,side=0;
  if(e.state==="retreat"){move=-1;}
  else if(dist>e.t.range){move=1;}else if(dist<e.t.range*.45){move=-.6;}else{side=e.strafe*.5;if(Math.random()<dt*.25)e.strafe*=-1;}
  let heading=want;if(move<0)heading+=Math.PI;
  const spd=e.t.speed*(move?Math.abs(move):Math.abs(side));
  if(spd>0){let moved=false;const baseH=side&&!move?want+Math.PI/2*Math.sign(side):heading;for(const off of[0,.6,-.6,1.2,-1.2,1.8,-1.8]){const h=baseH+off*(e.strafe||1),nx=e.x+Math.cos(h)*spd*dt,ny=e.y+Math.sin(h)*spd*dt;if(!insideBuilding(nx,ny)){e.x=nx;e.y=ny;moved=true;break;}}if(!moved)e.stuck+=dt;else e.stuck=0;}
  e.z=ground(e.x,e.y);e.yaw=want;
  if(e.state!=="retreat"&&dist<e.t.range*1.15&&now>=e.nextShot){shoot(e,now);if(e.burstLeft>0){e.burstLeft--;e.nextShot=now+110;}else{e.burstLeft=e.t.burst-1;e.nextShot=now+e.t.shotMs*rand(.8,1.25);}}
  return true;
}
function chooseType(stars){const r=Math.random(),police=worldOption("police"),military=worldOption("military");if(military&&stars>=4&&(r<.22||!police)&&enemies.filter(e=>e.type==="heavy"&&e.state!=="dead").length<2)return"heavy";if(!police)return null;if(stars>=2&&r<.5)return"swat";return"cop";}

// ------------------------------------------------------------------ chaos sources
function onWorldKill(event){const d=event?.detail||{};if(d.remote||d.network===false)return;const kind=String(d.kind||"");if(kind==="car"||kind==="bus")award(kind==="bus"?220:140,kind==="bus"?"BUS WRECKED!":"CAR WRECKED!","gold");else if(kind!=="police-drone")award(40,null);}
function trackSystems(now,dt){
  const W=wanted(),w=W?.state;if(w){
    // police drones shot down (production counts wanted.state.policeKills)
    let kills=0;for(const d of W.drones||[]){const was=droneSeen.get(d);if(was&&!d.active&&(Number(d.hp)||0)<=0)kills++;droneSeen.set(d,Boolean(d.active));}
    if(kills)award(300*kills,"COP DRONE DOWN!","cyan");
    const stars=Number(w.stars)||0;
    if(stars>lastStars&&stars>0)pop(`WANTED ${"★".repeat(stars)}`,"red");
    if(lastStars>0&&stars===0){award(400*lastStars,"ESCAPED!","cyan");}
    lastStars=stars;
  }
  const v=document.getElementById("viewport"),hits=Number(v?.dataset.worldDestructibleHits)||0;if(hits>lastDestructHits){award(150*(hits-lastDestructHits),hits-lastDestructHits>1?"DEMOLITION!":"SMASH!","gold");}lastDestructHits=hits;
  // drifting: steering hard at speed in the car
  const car=game?.gameplayState?.car,speed=Math.abs(Number(car?.speedMps)||0);
  if(game?.mode==="car"&&speed>9){const steer=Math.abs(Number(v?.dataset.vehicleDriveSteer)||Number(game?.carControls?.steer)||0);if(steer>.5){driftScore+=dt*60*(speed/12);flow=Math.min(1,flow+dt*.15);}else if(driftScore>60){award(Math.round(driftScore),"DRIFT!","cyan");driftScore=0;}else driftScore=0;}
  flow=Math.max(0,flow-dt*.06);if(now>comboUntil&&combo>1){combo=1;}
}

// ------------------------------------------------------------------ loop
export function tickNativeSandbox(now=performance.now()){
  if(!game)return;const dt=clamp((now-lastFrame)/1000,0,.1);lastFrame=now;
  trackSystems(now,dt);renderHud();
  const w=wanted()?.state,stars=Number(w?.stars)||0,t=target();
  if(stars>0){noWantedSince=0;const alive=enemies.filter(e=>e.state!=="dead"&&e.state!=="retreat").length;if(t&&alive<Math.min(MAX_ENEMIES,BUDGET[Math.min(5,stars)])&&now-lastSpawn>SPAWN_MS){lastSpawn=now;const type=chooseType(stars);if(type)spawnEnemy(type,t.position);}}
  else{noWantedSince||=now;if(now-noWantedSince>2500)for(const e of enemies)if(e.state==="approach")e.state="retreat";}
  for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];let keep=stepEnemy(e,dt,now,t);if(e.state==="retreat"&&t&&Math.hypot(t.position.x-e.x,t.position.y-e.y)>120)keep=false;
    if(!keep&&e.state!=="dead"&&!unseen(e.x,e.y,e.z))keep=true;if(!keep)enemies.splice(i,1);}
  stepTracers(dt);stepRockets(dt);draw();
  const v=document.getElementById("viewport");if(v){const s=String(enemies.filter(e=>e.state!=="dead").length);if(v.dataset.sandboxEnemies!==s)v.dataset.sandboxEnemies=s;}
}
export function installNativeSandbox(runtime){
  game=runtime;if(installed||typeof window==="undefined")return;installed=true;
  window.addEventListener("arondight:world-explosion",onExplosion);
  window.addEventListener(WORLD_OPTIONS_EVENT,dropDisallowed);
  window.addEventListener("arondight:world-kill",onWorldKill);
  window.addEventListener("arondight:nuke-impact",e=>{if(!e?.detail?.remote)setTimeout(()=>award(2000,"MEGA BLAST!!!","gold"),900);});
  window.addEventListener(AUDIO_SETTINGS_EVENT,e=>{settings=normalizeAudioSettings(e?.detail||loadAudioSettings());});
  window.addEventListener("arondight:world-reset",()=>{enemies=[];rockets.length=0;score=0;combo=1;flow=0;renderHud(true);});
  const v=document.getElementById("viewport");if(v)v.dataset.sandboxGame=SANDBOX_GAME_VERSION;
  ensureHud();renderHud(true);
  globalThis.__spawnCitySandbox={award,pop,get score(){return score;},get enemies(){return enemies.map(e=>({id:e.id,type:e.type,hp:e.hp,state:e.state,x:e.x,y:e.y}));},spawn:(type="cop")=>{const t=target();return t?Boolean(spawnEnemy(TYPES[type]?type:"cop",t.position)):false;}};
}
