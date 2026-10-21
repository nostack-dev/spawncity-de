// Production flak_battery.mjs on the native engine.
// FLAK: now and then a stationary anti-aircraft gun stands somewhere in the city — a four-barrel
// 20 mm mount behind sandbags. It only cares about things in the air: your drone or your jet within
// ~1.1 km and in sight. Then it hoses the sky — four barrels, ~30 rounds a second, tracers every
// round, airbursts around you — with a hard, cracking, thumping sound. Bursts close to you hurt
// (drone and jet take damage); a blast or a sniper round or two put the gun out for good.
//
// Placement is anchored to the real map (700 m geo cells, a hash decides whether a cell has a gun and
// where), so every player finds the same guns. Each client's guns shoot at its own aircraft.
// Same constants, placement hash, lead / traverse / burst rules, model (production primitives),
// synthesized sound and damage; world option "flak".
import {getSharedCombatAudioContext} from "./combat_audio_bank.mjs";
import {loadAudioSettings,AUDIO_SETTINGS_EVENT} from "./audio_settings.mjs";
import {worldOption,WORLD_OPTIONS_EVENT} from "./world_options.mjs";
import {wantedPointInRing} from "./wanted_system_logic.mjs";
import {syncInstanced,packMatrices} from "./native_instanced.mjs";
import {G,addMesh,finish,boxP,cylP,sphP,capP,hex,T,S,RX,RY,RZ,EULER,mul} from "./native_primitives.mjs";

export const FLAK_VERSION="flak-quad-20mm-v1";
export const FLAK_CONSTANTS=Object.freeze({CELL_M:700,CHANCE:.32,RANGE_M:1100,MIN_AGL_M:18,MUZZLE_MPS:900,ROUNDS_PER_S:30,BURST_ON_S:2.6,BURST_OFF_S:1.7,SPREAD:.012,BURST_R:7,TRACER_POOL:180,PUFF_POOL:60,HP:60});
const {CELL_M,CHANCE,RANGE_M,MIN_AGL_M,MUZZLE_MPS,ROUNDS_PER_S,BURST_ON_S,BURST_OFF_S,SPREAD,BURST_R,TRACER_POOL,PUFF_POOL,HP}=FLAK_CONSTANTS;
const JET_HP_MAX=400; // native_jet_hud / production jet_mode HP_MAX
const rigid=()=>game?.rigids||null,viewport=()=>typeof document==="undefined"?null:document.getElementById("viewport"),bridge=()=>globalThis.__nativeWorldBridge||null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const v3=(x=0,y=0,z=0)=>({x,y,z}),len3=v=>Math.hypot(v.x,v.y,v.z),dist3=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function hash(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
export function rand(seed,i){let x=(seed^Math.imul(i+1,0x9e3779b1))>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d)>>>0;x^=x>>>15;x=Math.imul(x,0x846ca68b)>>>0;x^=x>>>16;return(x>>>0)/4294967296;}
const groundHeightAt=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
// the same local tangent projection as the native OSM projector (production metersToLngLat)
const EARTH=6378137,RAD=Math.PI/180;
function geoMode(){const b=bridge();return Boolean(b?.active&&Number.isFinite(b.originLon)&&Number.isFinite(b.originLat));}
function unprojectMeters(x,y){const b=bridge(),cos=Math.max(.01,Math.cos(b.originLat*RAD));return [b.originLon+x/(RAD*EARTH*cos),b.originLat+y/(RAD*EARTH)];}
function projectLngLat(lon,lat){const b=bridge();if(typeof b?.projectLngLat==="function")return b.projectLngLat(lon,lat);const cos=Math.max(.01,Math.cos(b.originLat*RAD));return [(lon-b.originLon)*RAD*EARTH*cos,(lat-b.originLat)*RAD*EARTH];}
export function cellOf(x,y){if(!geoMode())return{cx:Math.floor(x/CELL_M),cy:Math.floor(y/CELL_M),lat:0,geo:false};const[lon,lat]=unprojectMeters(x,y),m=111320;return{cx:Math.floor(lon*m*Math.cos(lat*Math.PI/180)/CELL_M),cy:Math.floor(lat*m/CELL_M),lat,geo:true};}
function cellPoint(c,u,v){if(!c.geo)return[(c.cx+u)*CELL_M,(c.cy+v)*CELL_M];const m=111320,lonM=m*Math.cos(c.lat*Math.PI/180);return projectLngLat((c.cx+u)*CELL_M/lonM,(c.cy+v)*CELL_M/m);}
function buildingAt(x,y){for(const pr of game?.gameplayState?.carObstacleSnapshot?.prisms||[]){const pts=pr.points;if(!pts||pts.length<3||Math.abs(x-pts[0][0])>120||Math.abs(y-pts[0][1])>120)continue;if(wantedPointInRing(x,y,pts))return true;}return false;}
function openGround(x,y){if(buildingAt(x,y))return null;const g=groundHeightAt(x,y),R=rigid();if(!R?.raycast)return g;let hit=null;try{hit=R.raycast([x,y,g+60],[.0003,.0002,-1],80,{categoryBits:8n,maskBits:1n});}catch{}if(hit&&hit.point[2]>g+.4)return null;for(const[dx,dy]of[[3,0],[-3,0],[0,3],[0,-3]])if(buildingAt(x+dx,y+dy))return null;return g;}

let game=null,installed=false,settings=loadAudioSettings(),enabled=true;
const guns=new Map(),tracers=[],puffs=[];let tracerCursor=0,puffCursor=0,lastScan=-Infinity,lastFrame=0,lastTarget=null,targetVel=v3();

// ------------------------------------------------------------ the gun (production primitives)
const OLIVE=hex(0x4b5338),STEEL=hex(0x2a2d2f),SAND=hex(0xb59c6b);
// fixed part in the gun frame: sandbag ring (two layers, a gap at the back) and the base ring
const GUN_BASE=(()=>{const b=G(),bag=capP(.28,.7,6);for(let i=0;i<14;i++){const a=i/14*Math.PI*2;if(i===3||i===4)continue;
  addMesh(b,bag,mul(T(Math.cos(a)*2.6,Math.sin(a)*2.6,.3),EULER(Math.PI/2,0,a+Math.PI/2)),SAND);addMesh(b,bag,mul(T(Math.cos(a)*2.6,Math.sin(a)*2.6,.78),EULER(Math.PI/2,0,a+Math.PI/2+.2)),SAND);}
  addMesh(b,cylP(1.1,1.3,.35,16),mul(T(0,0,.18),RX(Math.PI/2)),OLIVE);return finish(b);})();
// traverse part (yaw group, origin z .35): pedestal, seat, shield
const GUN_YAW=(()=>{const b=G();addMesh(b,boxP(1.2,1.4,.8),T(0,0,.45),OLIVE);addMesh(b,boxP(.4,.5,.12),T(-.5,0,.95),STEEL);addMesh(b,boxP(.08,1.9,1.1),T(.55,0,1.25),OLIVE);return finish(b);})();
// elevating part (pitch group at .1,0,1.15 in the yaw group): cradle, four barrels with muzzle brakes, magazines
const BARRELS=[[-.28,.17],[.28,.17],[-.28,-.17],[.28,-.17]];
const GUN_PITCH=(()=>{const b=G();addMesh(b,boxP(1.0,.9,.5),T(0,0,0),STEEL);for(const[y,z]of BARRELS){addMesh(b,cylP(.045,.055,2.3,10),mul(T(1.4,y,z),RZ(Math.PI/2)),STEEL);addMesh(b,cylP(.075,.075,.22,10),mul(T(2.55,y,z),RZ(Math.PI/2)),STEEL);addMesh(b,boxP(.25,.08,.3),T(.2,y,z+(z>0?.28:-.28)),OLIVE);}return finish(b);})();
const FLASH=(()=>{const b=G();addMesh(b,sphP(.35,8,6),T(0,0,0),[1,1,1]);return finish(b);})();
const TRACER=(()=>{const b=G();addMesh(b,cylP(.06,.06,1,5),RX(Math.PI/2),[1,1,1]);return finish(b);})();
const PUFF=(()=>{const b=G();addMesh(b,sphP(1,10,6),T(0,0,0),[1,1,1]);return finish(b);})();
function gunFrames(gun){const model=mul(T(gun.x,gun.y,gun.z),RZ(gun.rotZ)),yaw=mul(model,mul(T(0,0,.35),RZ(gun.yaw-gun.rotZ))),pitch=mul(yaw,mul(T(.1,0,1.15),RY(gun.dead?.35:-gun.pitch)));return {model,yaw,pitch};}
const apply=(m,p)=>({x:m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],y:m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],z:m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]});
function muzzleWorld(gun,i){const [y,z]=BARRELS[i];return apply(gunFrames(gun).pitch,[2.7,y,z]);}

// ------------------------------------------------------------ placement
function listener(){const e=game?.world?.camera?.eye;return e?{x:e[0],y:e[1],z:e[2]}:null;}
function scan(now){if(now-lastScan<1500)return;lastScan=now;const at=listener();if(!at)return;const c=cellOf(at.x,at.y),want=new Set();
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const cell={...c,cx:c.cx+dx,cy:c.cy+dy},key=`${c.geo?"g":"l"}${cell.cx}:${cell.cy}`,seed=hash(`flak:${key}`);if(rand(seed,0)>CHANCE)continue;want.add(key);if(guns.has(key))continue;
    let spot=null;for(let t=0;t<10&&!spot;t++){const[x,y]=cellPoint(cell,.15+.7*rand(seed,1+t*2),.15+.7*rand(seed,2+t*2)),g=openGround(x,y);if(g!=null)spot={x,y,z:g};}
    if(!spot)continue;const rotZ=rand(seed,40)*Math.PI*2;guns.set(key,{key,x:spot.x,y:spot.y,z:spot.z,rotZ,hp:HP,dead:false,yaw:rotZ,pitch:.2,burstT:rand(seed,41)*3,nextShot:0,barrel:0,flashAt:0});}
  for(const key of [...guns.keys()])if(!want.has(key))guns.delete(key);
  const v=viewport();if(v)v.dataset.flakGuns=String(guns.size);}
// the aircraft the guns look for: your jet, else your drone in flight
function target(){if(!game)return null;
  if(game.mode==="jet"){const p=rigid()?.pose?.("player-jet")?.position;if(p&&Number.isFinite(p[0]))return{kind:"jet",p:v3(p[0],p[1],p[2])};return null;}
  if(game.mode!=="drone"||globalThis.__arondightDroneDamageModel?.destroyed)return null;const p=game.flight?.position?.();if(!p||!Number.isFinite(p[0]))return null;return{kind:"drone",p:v3(p[0],p[1],p[2])};}
function lineOfSight(from,to){const R=rigid();if(!R?.raycast)return true;const d=v3(to.x-from.x,to.y-from.y,to.z-from.z),len=len3(d);if(len<1)return true;let hit=null;try{hit=R.raycast([from.x,from.y,from.z],[d.x/len,d.y/len,d.z/len],len-2,{categoryBits:8n,maskBits:1n});}catch{}return!hit;}

// ------------------------------------------------------------ sound (production synth)
function audioShot(gun,dist){if(!settings.soundEnabled)return;const ctx=getSharedCombatAudioContext();if(!ctx||ctx.state!=="running")return;const level=clamp((Number(settings.fxVolume)||70)/72,0,1.4)*clamp(1.4/(1+dist/90),0,1.2);if(level<.01)return;const t=ctx.currentTime;
  const out=ctx.createGain();out.gain.value=level*.55;out.connect(ctx.destination);
  // thump: a falling sine kick
  const o=ctx.createOscillator(),og=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(38,t+.11);og.gain.setValueAtTime(1,t);og.gain.exponentialRampToValueAtTime(.001,t+.16);o.connect(og).connect(out);o.start(t);o.stop(t+.18);
  // crack: short filtered noise, duller far away
  const n=ctx.createBufferSource(),buf=audioShot.buf||(audioShot.buf=(()=>{const b=ctx.createBuffer(1,ctx.sampleRate*.12|0,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*.18));return b;})());n.buffer=buf;const f=ctx.createBiquadFilter();f.type="lowpass";f.frequency.value=clamp(9000-dist*7,900,9000);const ng=ctx.createGain();ng.gain.value=.9;n.connect(f).connect(ng).connect(out);n.start(t);}
function audioBurst(at,dist){if(!settings.soundEnabled)return;const ctx=getSharedCombatAudioContext();if(!ctx||ctx.state!=="running")return;const level=clamp((Number(settings.fxVolume)||70)/72,0,1.4)*clamp(1/(1+dist/60),0,1);if(level<.02)return;const t=ctx.currentTime+dist/343;const o=ctx.createOscillator(),g=ctx.createGain();o.type="triangle";o.frequency.setValueAtTime(70,t);o.frequency.exponentialRampToValueAtTime(30,t+.25);g.gain.setValueAtTime(level*.6,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+.32);}

// ------------------------------------------------------------ fire, airbursts, damage
// jet damage: production jet_mode damageOwn(amount,"flak"); the native jet keeps its HP on gameplayState.jet (native_jet_hud)
export function damageNativeJet(amount,source="flak"){const J=globalThis.__jetMode;if(typeof J?.damageOwn==="function"){J.damageOwn(amount,source);return true;}
  const st=game?.gameplayState?.jet;if(!st||!(amount>0))return false;const hp=Number.isFinite(Number(st.hp))?Number(st.hp):JET_HP_MAX;st.hp=Math.max(0,hp-amount);st.lastHitBy=source;return true;}
function fire(gun,aim,now,dist){const mz=muzzleWorld(gun,gun.barrel++%4);let dir=v3(aim.x-mz.x,aim.y-mz.y,aim.z-mz.z);let l=len3(dir)||1;dir=v3(dir.x/l,dir.y/l,dir.z/l);dir.x+=(Math.random()-.5)*SPREAD*2;dir.y+=(Math.random()-.5)*SPREAD*2;dir.z+=(Math.random()-.5)*SPREAD*2;l=len3(dir)||1;
  const fuse=clamp(dist3(mz,aim)/MUZZLE_MPS+(Math.random()-.5)*.06,.05,1.6);const i=tracerCursor++%TRACER_POOL;const tr=tracers[i]||(tracers[i]={p:v3(),v:v3(),until:0});tr.p=v3(mz.x,mz.y,mz.z);tr.v=v3(dir.x/l*MUZZLE_MPS,dir.y/l*MUZZLE_MPS,dir.z/l*MUZZLE_MPS);tr.until=now+fuse*1000;tr.live=true;
  gun.flashAt=now;gun.flash=true;audioShot(gun,dist);}
function burst(p,now){const i=puffCursor++%PUFF_POOL;const pf=puffs[i]||(puffs[i]={p:v3(),born:0});pf.p=v3(p.x,p.y,p.z);pf.born=now;pf.live=true;
  const L=listener();if(L)audioBurst(p,dist3(L,p));
  const Tg=target();if(!Tg)return;const d=dist3(Tg.p,p);if(d>BURST_R)return;const dmg=Math.round(14*(1-d/BURST_R)+2);
  if(Tg.kind==="jet")damageNativeJet(dmg,"flak");else globalThis.__arondightDroneDamageModel?.damage?.(dmg,"flak");const v=viewport();if(v)v.dataset.flakHits=String((Number(v.dataset.flakHits)||0)+1);}

function update(now,dt){const Tg=target();let tv=null;if(Tg){if(lastTarget){targetVel=v3((Tg.p.x-lastTarget.x)/Math.max(.016,dt),(Tg.p.y-lastTarget.y)/Math.max(.016,dt),(Tg.p.z-lastTarget.z)/Math.max(.016,dt));if(len3(targetVel)>400)targetVel=v3();}lastTarget={...Tg.p};tv=targetVel;}else lastTarget=null;
  const L=listener();
  for(const gun of guns.values()){if(gun.flashAt&&now-gun.flashAt>45)gun.flash=false;if(gun.dead)continue;
    let engaged=false;if(Tg){const base=v3(gun.x,gun.y,gun.z+1.6),dist=dist3(base,Tg.p),agl=Tg.p.z-groundHeightAt(Tg.p.x,Tg.p.y);
      if(dist<RANGE_M&&agl>MIN_AGL_M&&(now-(gun.losAt||0)<400?gun.los:(gun.losAt=now,gun.los=lineOfSight(base,Tg.p)))){engaged=true;
        // lead: where the target will be when the round gets there
        const tof=dist/MUZZLE_MPS,vel=tv||targetVel,aim=v3(Tg.p.x+vel.x*tof,Tg.p.y+vel.y*tof,Tg.p.z+vel.z*tof);const dx=aim.x-gun.x,dy=aim.y-gun.y,wantYaw=Math.atan2(dy,dx),wantPitch=Math.atan2(aim.z-gun.z-1.6,Math.hypot(dx,dy));
        let dyaw=((wantYaw-gun.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;gun.yaw+=clamp(dyaw,-2.2*dt,2.2*dt);gun.pitch+=clamp(wantPitch-gun.pitch,-1.6*dt,1.6*dt);
        gun.burstT+=dt;const cyc=BURST_ON_S+BURST_OFF_S,phase=gun.burstT%cyc;
        if(phase<BURST_ON_S&&Math.abs(dyaw)<.15){const aimNow={...aim};while(gun.nextShot<=now){fire(gun,aimNow,now,L?Math.hypot(L.x-gun.x,L.y-gun.y,L.z-gun.z):300);gun.nextShot=Math.max(gun.nextShot+1000/ROUNDS_PER_S,now-50);}}}}
    if(!engaged){gun.nextShot=now;gun.pitch+=(.25-gun.pitch)*Math.min(1,dt*.5);}}
  // tracers: fly straight (900 m/s barely drops over 1.5 s), burst at the fuse
  for(const tr of tracers){if(!tr?.live)continue;if(now>=tr.until){tr.live=false;burst(tr.p,now);continue;}tr.p.x+=tr.v.x*dt;tr.p.y+=tr.v.y*dt;tr.p.z+=tr.v.z*dt;tr.v.z-=9.81*dt;}
  for(const pf of puffs){if(!pf?.live)continue;const a=(now-pf.born)/1000;if(a>2.4){pf.live=false;continue;}pf.p.z+=dt*.6;}}

// ------------------------------------------------------------ draw
function tracerMatrix(tr){const L=len3(tr.v)||1,z=[tr.v.x/L,tr.v.y/L,tr.v.z/L],ref=Math.abs(z[2])<.95?[0,0,1]:[1,0,0];let x=[ref[1]*z[2]-ref[2]*z[1],ref[2]*z[0]-ref[0]*z[2],ref[0]*z[1]-ref[1]*z[0]];const xl=Math.hypot(...x)||1;x=x.map(v=>v/xl);const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]],len=Math.min(14,L*.016);
  return [...x,0,...y,0,...z.map(v=>v*len),0,tr.p.x,tr.p.y,tr.p.z,1];}
function draw(now){const r=game?.world?.renderer;if(!r?.upsert)return;const base=[],yaw=[],pitch=[],tints=[],flashes=[];
  for(const gun of guns.values()){const f=gunFrames(gun),k=gun.dead?.35:1;base.push(f.model);yaw.push(f.yaw);pitch.push(f.pitch);tints.push(k,k,k,1);if(gun.flash&&!gun.dead)flashes.push(mul(f.pitch,mul(T(2.75,0,0),S(2.2,1.4,1.4))));}
  const tint=base.length?new Float32Array(tints):null;
  syncInstanced(r,"flak/base",GUN_BASE,base.length?packMatrices(base):null,{tints:tint,material:{roughness:.85,metalness:.15}});
  syncInstanced(r,"flak/yaw",GUN_YAW,yaw.length?packMatrices(yaw):null,{tints:tint,material:{roughness:.65,metalness:.4}});
  syncInstanced(r,"flak/pitch",GUN_PITCH,pitch.length?packMatrices(pitch):null,{tints:tint,material:{roughness:.5,metalness:.6}});
  syncInstanced(r,"flak/flash",FLASH,flashes.length?packMatrices(flashes):null,{material:{unlit:true,alphaMode:"blend",color:[...hex(0xffd27a),1],castShadow:false,frustumCulled:false}});
  const tm=[];for(const tr of tracers)if(tr?.live)tm.push(tracerMatrix(tr));
  syncInstanced(r,"flak/tracers",TRACER,tm.length?packMatrices(tm):null,{material:{unlit:true,alphaMode:"blend",color:[...hex(0xffb347),.95],castShadow:false,frustumCulled:false}});
  const pm=[];for(const pf of puffs){if(!pf?.live)continue;const a=(now-pf.born)/1000,s=1.2+a*2.2;pm.push(mul(T(pf.p.x,pf.p.y,pf.p.z),S(s,s,s)));}
  syncInstanced(r,"flak/puffs",PUFF,pm.length?packMatrices(pm):null,{material:{roughness:1,alphaMode:"blend",color:[...hex(0x24221f),.8],castShadow:false,frustumCulled:false}});}

// ------------------------------------------------------------ hits (player weapons) and blasts
function knockOut(gun){if(gun.dead)return;gun.dead=true;gun.flash=false;const v=viewport();if(v)v.dataset.flakDestroyed=String((Number(v.dataset.flakDestroyed)||0)+1);}
function onExplosion(e){const d=e?.detail||{},p=d.position;if(!Array.isArray(p))return;const R=Number(d.radiusM)||8;for(const gun of guns.values()){if(gun.dead)continue;const dist=Math.hypot(gun.x-p[0],gun.y-p[1],gun.z+1-p[2]);if(dist<R*.8){gun.hp-=(Number(d.maxDamage)||100)*(1-dist/R)*1.5;if(gun.hp<=0)knockOut(gun);}}}
// production: a round ending within 1.8 m of the gun (z + 1.2) hits it. Native rounds stop on it.
export function hitNativeFlak(origin,dir,range){let best=null;
  for(const gun of guns.values()){if(gun.dead)continue;const c=[gun.x,gun.y,gun.z+1.2],o=[origin[0]-c[0],origin[1]-c[1],origin[2]-c[2]],b=o[0]*dir[0]+o[1]*dir[1]+o[2]*dir[2],cc=o[0]*o[0]+o[1]*o[1]+o[2]*o[2]-1.8*1.8,disc=b*b-cc;if(disc<0)continue;const sq=Math.sqrt(disc);let t=-b-sq;if(t<0)t=-b+sq;if(t<0||t>range)continue;if(!best||t<best.t)best={t,gun};}
  return best?{kind:"flak",t:best.t,key:`flak:${best.gun.key}`,gun:best.gun,point:[origin[0]+dir[0]*best.t,origin[1]+dir[1]*best.t,origin[2]+dir[2]*best.t]}:null;}
export function shootNativeFlak(hit,weapon){const gun=hit?.gun;if(!gun||gun.dead)return false;gun.hp-=weapon==="sniper"?35:4;if(gun.hp<=0)knockOut(gun);return true;}

// ------------------------------------------------------------ loop
function clearGuns(){guns.clear();for(const tr of tracers)if(tr)tr.live=false;for(const pf of puffs)if(pf)pf.live=false;}
export function tickNativeFlak(now=performance.now()){
  if(!game)return;const dt=Math.min(.1,Math.max(0,(now-(lastFrame||now))/1000));lastFrame=now;
  if(!enabled){if(guns.size)clearGuns();draw(now);return;}
  try{scan(now);update(now,dt);}catch(err){console.warn("flak",err);}
  draw(now);}
export function nativeFlakGuns(){return [...guns.values()];}
export function installNativeFlak(runtime){
  game=runtime;enabled=worldOption("flak");if(installed||typeof window==="undefined")return;installed=true;
  addEventListener(AUDIO_SETTINGS_EVENT,e=>{settings={...settings,...(e?.detail||loadAudioSettings())};});
  addEventListener("arondight:world-explosion",onExplosion);
  addEventListener("arondight:world-reset",()=>clearGuns());
  addEventListener(WORLD_OPTIONS_EVENT,()=>{enabled=worldOption("flak");if(!enabled)clearGuns();});
  globalThis.__flak={version:FLAK_VERSION,get guns(){return[...guns.values()].map(g=>({key:g.key,x:g.x,y:g.y,dead:g.dead,hp:g.hp}));}};
}
