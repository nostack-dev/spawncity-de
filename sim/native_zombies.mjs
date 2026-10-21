// Production zombie_nights.mjs (CoD Zombies in the open sandbox) on the native
// engine. When night falls the dead rise in rounds around the player (out of
// view) and shamble, from round 3 more and more of them sprint, after him;
// melee claws, groans, points for every hit and kill, the round / points HUD
// and banners, the rounds' pacing and the collapse at dawn are production's.
// The walls of the city are respected (wall-following around buildings).
// Barricaded doors need the walkable interiors, which the native page does
// not have yet: the dead fight the player in the street.
import {wantedPointInRing} from "./wanted_system_logic.mjs";
import {getSharedCombatAudioContext,playCombatAudio} from "./combat_audio_bank.mjs";
import {worldOption,WORLD_OPTIONS_EVENT} from "./world_options.mjs";
import {ORIGINAL_HUMAN} from "./native_actor_meshes.mjs";
import {spawnNativeRagdoll} from "./native_ragdoll.mjs";
import {syncInstanced,packMatrices} from "./native_instanced.mjs";
export const ZOMBIE_NIGHTS_VERSION="cod-zombie-nights-v1-native";
const CAP=28,HP0=100,HIT_DMG=34,MELEE_DMG=11,MELEE_MS=1150,HIT_PTS=10,KILL_PTS=60,SPAWN_MIN=34,SPAWN_MAX=70,REPAIR_COST=10;
const ZSKIN=[[.54,.6,.47],[.49,.55,.44],[.58,.63,.51],[.44,.49,.4]];
let game=null,installed=false,zombies=[],active=false,round=0,toSpawn=0,nextSpawn=0,roundBreakUntil=0,points=0,lastFrame=performance.now(),serial=0,zombiesEnabled=worldOption("zombies"),lastUi=0,drawn=false;
const viewport=()=>document.getElementById("viewport");
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),angleTo=(a,b)=>{let d=b-a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
const ground=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
function playerTarget(){if(!game||game.mode==="drone"||game.mode==="jet")return null;const id=game.mode==="car"?"player-car":"player-foot",p=game.rigids?.pose?.(id)?.position,m=globalThis.__arondightPlayerDamageModel;if(!p||m?.dead)return null;return {kind:"player",position:{x:p[0],y:p[1],z:p[2]+.71},model:m};}
function prisms(){return game?.gameplayState?.carObstacleSnapshot?.prisms||[];}
function insideBuilding(x,y){for(const pr of prisms()){const pts=pr.points;if(!pts||pts.length<3||(Number(pr.base)||0)>1.9)continue;if(Math.abs(x-pts[0][0])>120||Math.abs(y-pts[0][1])>120)continue;if(wantedPointInRing(x,y,pts))return true;}return false;}
const isNight=()=>Boolean(globalThis.__dayNight?.state?.isNight);
function unseen(x,y){const cam=game?.world?.camera;if(!cam?.eye)return true;const e=cam.eye,d=[x-e[0],y-e[1]],dl=Math.hypot(...d),f=[cam.target[0]-e[0],cam.target[1]-e[1]],fl=Math.hypot(...f)||1;return (d[0]*f[0]+d[1]*f[1])/(dl*fl||1)<Math.cos(Math.min(1.4,(Number(cam.fov)||1.2)*.75));}
// ------------------------------------------------------------ HUD (production markup and CSS)
function hud(){
  let h=document.getElementById("zombieHud");if(h)return h;const view=viewport();if(!view)return null;h=document.createElement("div");h.id="zombieHud";h.innerHTML=`<div class="zh-round"></div><div class="zh-points"></div><div class="zh-banner"></div><button id="zombieRepair" type="button">REPAIR · ${REPAIR_COST}</button>`;view.appendChild(h);
  const st=document.createElement("style");st.dataset.zombieHud="v1";st.textContent=`#zombieHud{position:absolute;inset:0;pointer-events:none;z-index:19;font-family:Inter,system-ui,sans-serif;color:#fff}#zombieHud[hidden]{display:none}#zombieHud .zh-round{position:absolute;left:max(14px,var(--solo-safe-left,env(safe-area-inset-left)));bottom:calc(max(16px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + min(25vw,148px) + 90px);font:900 34px/1 "Barlow Condensed",Inter,sans-serif;color:#b3121b;text-shadow:0 2px 0 #000,0 0 12px #f004;letter-spacing:.04em}#zombieHud .zh-points{position:absolute;right:max(14px,var(--solo-safe-right,env(safe-area-inset-right)));bottom:calc(max(16px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + min(25vw,148px) + 96px);font:800 20px/1 Inter,sans-serif;color:#f4d27a;text-shadow:0 2px 0 #000}#zombieHud .zh-banner{position:absolute;left:50%;top:22%;transform:translateX(-50%);font:900 28px/1.1 "Barlow Condensed",Inter,sans-serif;letter-spacing:.12em;color:#e8e2d0;text-shadow:0 2px 6px #000;opacity:0;transition:opacity .6s;text-align:center;white-space:nowrap}#zombieHud .zh-banner[data-on="1"]{opacity:1}#zombieRepair{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(max(14px,var(--solo-safe-bottom,env(safe-area-inset-bottom))) + 120px);height:44px;padding:0 18px;border-radius:12px;border:2px solid #f4d27a;background:#1a1408e0;color:#f4d27a;font:900 14px/1 Inter,sans-serif;letter-spacing:.08em;pointer-events:auto;display:none}#zombieRepair[data-show="1"]{display:block}`;
  document.head.appendChild(st);return h;
}
let bannerTimer=0;function banner(text,ms=3200){const h=hud();if(!h)return;const b=h.querySelector(".zh-banner");b.textContent=text;b.dataset.on="1";clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>{b.dataset.on="0";},ms);}
function renderHud(){const h=hud();if(!h)return;const show=active||points>0;if(h.hidden===show)h.hidden=!show;h.querySelector(".zh-round").textContent=active?"I".repeat(Math.min(5,round))+(round>5?` ${round}`:""):"";h.querySelector(".zh-points").textContent=`${points}`;}
let lastGroan=0;function groan(z,now){if(now-lastGroan<900)return;const pl=playerTarget()?.position;if(!pl)return;const d=Math.hypot(pl.x-z.x,pl.y-z.y);if(d>30)return;lastGroan=now;try{const c=getSharedCombatAudioContext();if(c?.state==="running")playCombatAudio(c,"scream",{gain:clamp(.25/(1+d*.12),.02,.22),playbackRate:.42+Math.random()*.12,minIntervalMs:400});}catch{}}
// ------------------------------------------------------------ zombies
function spawnOne(player,now){
  for(let k=0;k<14;k++){const a=Math.random()*Math.PI*2,r=SPAWN_MIN+Math.random()*(SPAWN_MAX-SPAWN_MIN),x=player.position.x+Math.cos(a)*r,y=player.position.y+Math.sin(a)*r;if(insideBuilding(x,y))continue;if(!unseen(x,y))continue;
    const fast=round>=3&&Math.random()<Math.min(.55,.12*(round-2));if(zombies.length>=CAP)return false;
    zombies.push({id:`z${(++serial).toString(36)}`,skin:serial%4,x,y,z:ground(x,y),yaw:Math.atan2(player.position.y-y,player.position.x-x),hp:HP0+round*12,speed:fast?3+Math.random()*1.1:.85+Math.random()*.7+round*.06,state:"chase",nextHit:0,born:now,sp:0,phase:Math.random()});return true;}
  return false;
}
function moveToward(z,tx,ty,dt){
  const dx=tx-z.x,dy=ty-z.y,d=Math.hypot(dx,dy);if(d<.05){z.sp=0;return d;}const step=Math.min(d,z.speed*dt);let ang=Math.atan2(dy,dx);
  const free=a=>{const nx=z.x+Math.cos(a)*Math.max(step,.35),ny=z.y+Math.sin(a)*Math.max(step,.35);return !insideBuilding(nx,ny);};
  let ok=false;if(free(ang)&&(!z.side||free(ang+z.side*.35))){ok=true;if(z.side&&(z.freeSince||=performance.now())&&performance.now()-z.freeSince>600){z.side=0;}}
  else{z.freeSince=0;z.side||=(Math.random()<.5?1:-1);for(let pass=0;pass<2&&!ok;pass++){for(let k=1;k<=9;k++){const a=ang+z.side*k*.35;if(free(a)){ang=a;ok=true;break;}}if(!ok)z.side=-z.side;}}
  if(ok){z.x+=Math.cos(ang)*step;z.y+=Math.sin(ang)*step;}z.sp=ok?step/Math.max(dt,1e-3):0;z.z=ground(z.x,z.y);
  z.yaw+=angleTo(z.yaw,ang)*Math.min(1,dt*8);return d;
}
function stepZombie(z,player,now,dt){
  const px=player.position.x,py=player.position.y;moveToward(z,px,py,dt);z.state="chase";
  const dd=Math.hypot(px-z.x,py-z.y),dz=Math.abs(((player.position.z||1.68)-1.68)-z.z);
  if(dd<1.35&&dz<1.3){z.state="attack";if(now>=z.nextHit){z.nextHit=now+MELEE_MS;z.swing=now;player.model?.damage?.(MELEE_DMG,"zombie");window.dispatchEvent(new CustomEvent("arondight:combat-damage",{detail:{damage:MELEE_DMG,source:"zombie",target:"player"}}));}}
  if(Math.random()<dt*.25)groan(z,now);
}
function killZombie(z,dir=null,award=true,{silent=false}={}){
  const i=zombies.indexOf(z);if(i<0)return;zombies.splice(i,1);if(award)points+=KILL_PTS;if(silent)return;
  try{spawnNativeRagdoll({position:[z.x,z.y,z.z+.05],yaw:z.yaw-Math.PI/2,impulse:dir?[dir[0]*2.4,dir[1]*2.4,1.6]:[0,0,.8],seed:z.id,id:z.id});}catch{}
}
export function hitNativeZombies(origin,dir,range){
  let best=null;for(const z of zombies){const ox=z.x-origin[0],oy=z.y-origin[1],oz=z.z+1-origin[2],t=ox*dir[0]+oy*dir[1]+oz*dir[2];if(t<=0||t>range||(best&&t>best.t))continue;
    const px=origin[0]+dir[0]*t-z.x,py=origin[1]+dir[1]*t-z.y,h=origin[2]+dir[2]*t-z.z;if(px*px+py*py<.32*.32&&h>0&&h<1.9)best={z,t};}
  return best?{kind:"zombie-night",id:best.z.id,t:best.t,point:[origin[0]+dir[0]*best.t,origin[1]+dir[1]*best.t,origin[2]+dir[2]*best.t]}:null;
}
export function shootNativeZombie(id,dir=[0,0,0]){const z=zombies.find(q=>q.id===id);if(!z)return false;window.dispatchEvent(new CustomEvent("arondight:combat-hit-confirm",{detail:{police:true,damage:HIT_DMG,zombie:true}}));
  z.hp-=HIT_DMG;points+=HIT_PTS;if(z.hp<=0)killZombie(z,[dir[0],dir[1]]);return true;}
function onExplosion(e){const d=e?.detail||{},pos=d.position,x=Array.isArray(pos)?+pos[0]:+pos?.x,y=Array.isArray(pos)?+pos[1]:+pos?.y;if(!Number.isFinite(x))return;const r=d.kind==="nuke"?600:Math.max(3,Math.min(40,Number(d.radiusM)||6));
  for(const z of [...zombies]){const dd=Math.hypot(z.x-x,z.y-y);if(dd<r){z.hp-=d.kind==="nuke"?999:220*(1-dd/r)+30;if(z.hp<=0)killZombie(z,[(z.x-x)/(dd||1),(z.y-y)/(dd||1)]);}}}
function startNight(now){active=true;round=0;nextRound(now);banner("DIE NACHT BRICHT HEREIN",3600);}
function nextRound(now){round++;toSpawn=6+round*4;nextSpawn=now+1800;roundBreakUntil=0;banner(`RUNDE ${round}`,2600);}
function endNight(){active=false;for(const z of [...zombies].slice(0,8))killZombie(z,null,false);zombies=[];if(round)banner(`MORGENGRAUEN — ${round} ${round===1?"RUNDE":"RUNDEN"} ÜBERLEBT`,4200);round=0;toSpawn=0;}
function removeAllZombies(){zombies=[];active=false;round=0;toSpawn=0;roundBreakUntil=0;}
// ------------------------------------------------------------ draw: the soldier figure, rotted skin tint, the zombie lean
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
const T=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1],RZ=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];},RY=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];};
function draw(now){
  const r=game?.world?.renderer;if(!r?.upsert)return;
  if(!zombies.length){if(drawn){syncInstanced(r,"zombies/body",ORIGINAL_HUMAN,null);drawn=false;}return;}
  const m=[],t=[];for(const z of zombies){const sway=Math.sin((now/1000)*(1.6+z.speed)+z.phase*6.28)*.08,lean=.18+(z.swing&&now-z.swing<300?.25:0);
    m.push(mul(T(z.x,z.y,z.z),mul(RZ(z.yaw),mul(RY(lean),RZ(sway)))));t.push(...ZSKIN[z.skin],1);}
  syncInstanced(r,"zombies/body",ORIGINAL_HUMAN,packMatrices(m),{tints:new Float32Array(t),material:{roughness:.9}});drawn=true;
}
export function tickNativeZombies(now=performance.now()){
  if(!game)return;const dt=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(!zombiesEnabled){if(active||zombies.length)removeAllZombies();if(now-lastUi>200){lastUi=now;renderHud();}draw(now);return;}
  const night=isNight()||Boolean(globalThis.__zombieForce);if(night&&!active)startNight(now);else if(!night&&active)endNight();
  const player=playerTarget();
  if(active&&player){
    if(toSpawn>0&&now>=nextSpawn&&zombies.length<CAP){if(spawnOne(player,now))toSpawn--;nextSpawn=now+Math.max(350,1100-round*60);}
    if(toSpawn<=0&&!zombies.length){if(!roundBreakUntil){roundBreakUntil=now+9000;banner(`RUNDE ${round} ÜBERSTANDEN`,2400);}else if(now>roundBreakUntil)nextRound(now);}
    for(const z of zombies)stepZombie(z,player,now,dt);
    for(const z of [...zombies]){const d=Math.hypot(player.position.x-z.x,player.position.y-z.y);if(d>140&&unseen(z.x,z.y)){killZombie(z,null,false,{silent:true});toSpawn++;}}
  }
  draw(now);
  if(now-lastUi>200){lastUi=now;renderHud();const v=viewport();if(v)v.dataset.zombies=`${active?"night":"day"}/r${round}/${zombies.length}z/${points}p`;}
}
export function installNativeZombies(runtime){
  game=runtime;if(installed||typeof window==="undefined")return;installed=true;
  addEventListener("arondight:world-explosion",onExplosion);
  addEventListener(WORLD_OPTIONS_EVENT,()=>{const on=worldOption("zombies");if(on===zombiesEnabled)return;zombiesEnabled=on;if(!on)removeAllZombies();});
  addEventListener("arondight:world-reset",()=>{zombies=[];points=0;if(active){round=0;nextRound(performance.now());}});
  globalThis.__zombies={get active(){return active;},get round(){return round;},get points(){return points;},get list(){return zombies;},force(on=true){globalThis.__zombieForce=on;},version:ZOMBIE_NIGHTS_VERSION};
}
