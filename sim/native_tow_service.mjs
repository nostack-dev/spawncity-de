// Production tow_service.mjs on the native engine.
// Breakdown service (ADAC-style). Traffic that is stuck — flipped, wedged,
// off its road, not moving although it should — is not teleported away: a
// yellow tow truck is dispatched from a depot on the real road network
// (A* over the roads, pure-pursuit driving on the same Box3D vehicle physics
// as all traffic), drives up, hooks the car, tows it back to its own lane on
// its own route, sets it down upright and leaves for the depot again. The
// car then simply carries on with its route. Nothing appears or vanishes in
// view: the truck enters and leaves the scene far away.
// Same constants, rules, truck model (production primitives on the original
// car body), amber light bar and light, damage (110 HP, rounds and blasts,
// burns out like the traffic) and viewport telemetry.
import {wantedLineBlockedByPrisms,wantedPointInRing} from "./wanted_system_logic.mjs";
import {ORIGINAL_SEDAN,ORIGINAL_WHEEL} from "./native_original_vehicles.mjs";
import {syncInstanced,packMatrices} from "./native_instanced.mjs";
import {spawnNativeCarDebris} from "./native_car_debris.mjs";
import {G,addMesh,finish,boxP,hex,T,RY,mul,quatMatrix} from "./native_primitives.mjs";

export const TOW_SERVICE_VERSION="tow-truck-dispatch-v1";
export const TOW_CONSTANTS=Object.freeze({MAX_TRUCKS:2,FLIP_S:2.5,STUCK_S:9,OFFROAD_S:7,OFFROAD_M:9,SPAWN_MIN:170,SPAWN_MAX:320,HOOK_M:7.5,HOOK_MS:1800,TOW_SPEED:9,DRIVE_SPEED:14,GIVE_UP_MS:70000,TRUCK_HP:110});
const {MAX_TRUCKS,FLIP_S,STUCK_S,OFFROAD_S,OFFROAD_M,SPAWN_MIN,SPAWN_MAX,HOOK_M,HOOK_MS,TOW_SPEED,DRIVE_SPEED,GIVE_UP_MS,TRUCK_HP}=TOW_CONSTANTS;
let game=null,installed=false,trucks=[],serial=0,graph=null,graphAt=-Infinity,lastScan=0;const watch=new Map();
const physics=()=>game?.rigids||null,pop=()=>globalThis.__arondightProceduralPopulation||null,viewport=()=>typeof document==="undefined"?null:document.getElementById("viewport");
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),angleTo=(a,b)=>{let d=b-a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
const groundHeightAt=(x,y)=>{try{const h=Number(game?.world?.terrain?.heightAt?.(x,y));return Number.isFinite(h)?h:0;}catch{return 0;}};
function prisms(){return game?.gameplayState?.carObstacleSnapshot?.prisms||[];}

// ------------------------------------------------------------ road network
function roadGraph(now){if(graph&&now-graphAt<5000)return graph;const routes=pop()?.roads?.()||[];graphAt=now;const nodes=new Map(),key=(x,y)=>`${Math.round(x/2)},${Math.round(y/2)}`,node=(x,y)=>{const k=key(x,y);let n=nodes.get(k);if(!n){n={x,y,adj:[]};nodes.set(k,n);}return n;};
  for(const r of routes)for(const s of r.segments||[]){const a=node(s.a[0],s.a[1]),b=node(s.a[0]+s.dx,s.a[1]+s.dy);if(a===b)continue;a.adj.push([b,s.d]);b.adj.push([a,s.d]);}graph={nodes:[...nodes.values()]};return graph;}
function nearestNode(g,x,y){let best=null,bd=Infinity;for(const n of g.nodes){const d=(n.x-x)**2+(n.y-y)**2;if(d<bd){bd=d;best=n;}}return best;}
export function findPath(g,sx,sy,tx,ty){const a=nearestNode(g,sx,sy),b=nearestNode(g,tx,ty);if(!a||!b)return null;if(a===b)return[{x:sx,y:sy},{x:tx,y:ty}];
  const open=[a],inOpen=new Set([a]),gs=new Map([[a,0]]),from=new Map(),h=n=>Math.hypot(n.x-b.x,n.y-b.y),fs=new Map([[a,h(a)]]),closed=new Set();let it=0;
  while(open.length&&it++<5000){let bi=0;for(let i=1;i<open.length;i++)if(fs.get(open[i])<fs.get(open[bi]))bi=i;const cur=open[bi];open[bi]=open[open.length-1];open.pop();inOpen.delete(cur);if(cur===b)break;closed.add(cur);
    for(const[n,w]of cur.adj){if(closed.has(n))continue;const g2=gs.get(cur)+w;if(g2<(gs.get(n)??Infinity)){gs.set(n,g2);fs.set(n,g2+h(n));from.set(n,cur);if(!inOpen.has(n)){open.push(n);inOpen.add(n);}}}}
  if(!from.has(b))return null;const path=[{x:tx,y:ty}];for(let n=b;n;n=from.get(n))path.unshift({x:n.x,y:n.y});return path;}
function pursuitPoint(path,x,y,look){let bi=0,bt=0,bd=Infinity;for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1e-6,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/l2,0,1),px=a.x+dx*t,py=a.y+dy*t,d=Math.hypot(x-px,y-py);if(d<bd){bd=d;bi=i;bt=t;}}
  if(path.length<2)return path[0];let i=bi,t=bt,left=look;while(i<path.length-1){const a=path[i],b=path[i+1],l=Math.hypot(b.x-a.x,b.y-a.y)||1e-6,rest=(1-t)*l;if(rest>=left){const tt=t+left/l;return{x:a.x+(b.x-a.x)*tt,y:a.y+(b.y-a.y)*tt};}left-=rest;i++;t=0;}return path.at(-1);}
function insideBuilding(x,y){for(const pr of prisms()){const pts=pr.points;if(!pts||pts.length<3||Math.abs(x-pts[0][0])>120||Math.abs(y-pts[0][1])>120)continue;if(wantedPointInRing(x,y,pts))return true;}return false;}
function playerPos(){if(!game)return null;if(game.mode==="foot"){const p=physics()?.pose?.("player-foot")?.position;if(p)return {x:p[0],y:p[1],z:p[2]};}const e=game.world?.camera?.eye;return e?{x:e[0],y:e[1],z:e[2]}:null;}
// seen by the player right now? (the drawn camera's view cone, buildings in between hide it)
function inView(x,y){const z=groundHeightAt(x,y)+1.5,cam=game?.world?.camera;if(!cam?.eye||!cam?.target)return false;const e=cam.eye,d=[x-e[0],y-e[1],z-e[2]],dl=Math.hypot(...d),f=[cam.target[0]-e[0],cam.target[1]-e[1],cam.target[2]-e[2]],fl=Math.hypot(...f)||1;
  if((d[0]*f[0]+d[1]*f[1]+d[2]*f[2])/(dl*fl||1)<Math.cos(Math.min(1.4,(Number(cam.fov)||1.2)*.75)))return false;try{return !wantedLineBlockedByPrisms({x:e[0],y:e[1],z:e[2]},{x,y,z},prisms());}catch{return true;}}

// ------------------------------------------------------------ the truck (production primitives)
const C_DARK=hex(0x23262a),C_STEEL=hex(0x8a9096),TRUCK_PAINT=[...hex(0xf2b705),1];
// bed, boom and hook in the truck group frame (origin on the ground under the body centre)
const TRUCK_RIG=(()=>{const b=G();addMesh(b,boxP(1.5,1.5,.12),T(-.95,0,1.05),C_DARK);addMesh(b,boxP(1.9,.16,.16),mul(T(-1.35,0,1.45),RY(-.38)),C_STEEL);addMesh(b,boxP(.12,1.3,.1),T(-2.2,0,1.05),C_STEEL);return finish(b);})();
const AMBER_LAMP=(()=>{const b=G();addMesh(b,boxP(.22,.36,.1),T(0,0,0),[1,1,1]);return finish(b);})();
const AMBER_ON=[...hex(0xffa31a),1],AMBER_OFF=[...hex(0x3a2508),1];
function spawnTruck(job,now){const g=roadGraph(now),me=playerPos();if(!g.nodes.length)return null;
  // the depot: a road node far from the player (out of sight), not too far from the job
  const cands=g.nodes.filter(n=>{const dj=Math.hypot(n.x-job.x,n.y-job.y),dp=me?Math.hypot(n.x-me.x,n.y-me.y):999;return dj>SPAWN_MIN&&dj<SPAWN_MAX&&dp>140&&!insideBuilding(n.x,n.y)&&!inView(n.x,n.y);});
  const spot=cands.length?cands[(Math.random()*cands.length)|0]:null;if(!spot)return null;const path=findPath(g,spot.x,spot.y,job.x,job.y);if(!path)return null;
  const nxt=path.find(q=>Math.hypot(q.x-spot.x,q.y-spot.y)>3)||{x:job.x,y:job.y},yaw=Math.atan2(nxt.y-spot.y,nxt.x-spot.x),id=`tow-truck-${(++serial).toString(36)}`,z=groundHeightAt(spot.x,spot.y);
  let ok=null;try{ok=physics()?.addBody?.({id,kind:"car",position:[spot.x,spot.y,z+.62],yaw,halfExtents:[1.78,.82,.36],massKg:2600});}catch{ok=null;}if(!ok)return null;
  const t={id,job,state:"to-job",path,pathAt:now,depot:{x:spot.x,y:spot.y},born:now,pose:null,progress:null,recoverUntil:0,recoverStart:0,stuckSince:0};trucks.push(t);return t;}
function removeTruck(t){physics()?.removeBody?.(t.id);if(t.job?.towing){pop()?.towEnd?.(t.job.id,{});}if(t.job&&t.state!=="depot")watch.delete(t.job.id);}
function truckPose(t){const p=physics()?.pose?.(t.id);if(p)t.pose=p;return p;}
function lights(t,now){const p=t.pose;if(!p)return;const on=(Math.floor(now/260)%2)===0;t.lightOn=on;const me=playerPos();
  if(t.state!=="depot"||Math.hypot(p.position[0]-(me?.x||0),p.position[1]-(me?.y||0))<120){const off=Number(p.groundOffset)||.6;try{game?.world?.requestLight?.([p.position[0],p.position[1],p.position[2]-off+1.8],{color:0xffa31a,intensity:(on?5:2)*16/46,distance:16});}catch{}}}
const speedOf=p=>p?Math.hypot(p.velocity[0],p.velocity[1]):0;
function driveTo(t,tx,ty,speed){physics()?.setDrive?.(t.id,null);physics()?.setTarget?.(t.id,{position:[tx,ty,0],yaw:0,speedMps:speed});}
function brake(t){physics()?.clearTarget?.(t.id);physics()?.setDrive?.(t.id,{pedal:0,steer:0,handbrake:true});}
// follow the path; back out with the wheel turned when wedged (the same driving as all physical traffic)
function follow(t,goal,speed,now){const p=t.pose;if(!p)return Infinity;const cx=p.position[0],cy=p.position[1],d=Math.hypot(goal.x-cx,goal.y-cy),sp=speedOf(p);
  if(!t.path||now-t.pathAt>2500){t.path=findPath(roadGraph(now),cx,cy,goal.x,goal.y)||[{x:cx,y:cy},goal];t.pathAt=now;}
  const tp=pursuitPoint(t.path,cx,cy,Math.max(7,sp*1.1)),herr=angleTo(p.yaw,Math.atan2(tp.y-cy,tp.x-cx));
  if(now<t.recoverUntil){if(Math.abs(herr)<.45&&now-t.recoverStart>500)t.recoverUntil=0;else{physics()?.clearTarget?.(t.id);physics()?.setDrive?.(t.id,{pedal:-.75,steer:-Math.sign(herr||1),handbrake:false,maxReverse:4});return d;}}
  if(sp<.7&&d>6){t.stuckSince||=now;if(now-t.stuckSince>2200){t.recoverStart=now;t.recoverUntil=now+1700;t.stuckSince=0;t.path=null;return d;}}else t.stuckSince=0;
  if(!t.progress||now-t.progress.t>4500){if(t.progress&&d>6&&Math.hypot(cx-t.progress.x,cy-t.progress.y)<5){t.recoverStart=now;t.recoverUntil=now+1600;t.path=null;t.progress={t:now,x:cx,y:cy};return d;}t.progress={t:now,x:cx,y:cy};}
  const far=pursuitPoint(t.path,cx,cy,Math.max(20,sp*2.2)),turn=Math.abs(angleTo(Math.atan2(tp.y-cy,tp.x-cx),Math.atan2(far.y-tp.y,far.x-tp.x)));
  driveTo(t,tp.x,tp.y,Math.min(speed,clamp(speed-turn/(Math.PI/2)*(speed-4),4,speed),d<20?Math.max(3,d*.5):speed));return d;}
// the towed car hangs behind on the boom: production sets its Box3D pose, native traffic takes the pose
function carryCar(id,pose){const api=pop();if(api?.towPose?.(id,{x:pose.position[0],y:pose.position[1],yaw:pose.yaw}))return true;return Boolean(physics()?.setPose?.(id,pose));}

// ------------------------------------------------------------ the job
function update(t,now){
  const p=truckPose(t);if(!p){removeTruck(t);return false;}lights(t,now);const job=t.job,api=pop();
  // the player got into the car the truck came for (or is holding it): the job is off, the car is his
  if(t.state!=="depot"&&(globalThis.__arondightVehicleDrive?.vehicleId===job.id||globalThis.__arondightGravityGun?.heldId===job.id)){if(job.towing){api?.towEnd?.(job.id,{});job.towing=false;}t.state="depot";t.path=null;t.leaveAt=now;const w=watch.get(job.id);if(w){w.dispatched=false;w.cooldownUntil=now+60000;}return true;}
  if(now-t.born>GIVE_UP_MS&&t.state!=="depot"){if(job.towing){const lp=api?.lanePose?.(job.id,0);api?.towEnd?.(job.id,lp||{});job.towing=false;}t.state="depot";t.path=null;}
  if(t.state==="to-job"){const car=api?.vehicles?.().find(v=>v.id===job.id);if(!car){t.state="depot";t.path=null;return true;}job.x=car.x;job.y=car.y;
    const d=follow(t,{x:car.x,y:car.y},DRIVE_SPEED,now);if(d<HOOK_M){brake(t);t.state="hook";t.hookAt=now;}return true;}
  if(t.state==="hook"){brake(t);if(now-t.hookAt>HOOK_MS){if(!api?.towBegin?.(job.id)){t.state="depot";t.path=null;return true;}job.towing=true;job.drop=api?.lanePose?.(job.id,30)||null;t.state="tow";t.path=null;}return true;}
  if(t.state==="tow"){// the car hangs behind on the boom, front wheels lifted
    const yaw=p.yaw,bx=p.position[0]-Math.cos(yaw)*5.1,by=p.position[1]-Math.sin(yaw)*5.1,gz=groundHeightAt(bx,by);carryCar(job.id,{position:[bx,by,gz+.62],yaw,velocity:[p.velocity[0],p.velocity[1],0]});
    const drop=job.drop||{x:p.position[0],y:p.position[1],yaw};const d=follow(t,{x:drop.x+Math.cos(drop.yaw)*5.5,y:drop.y+Math.sin(drop.yaw)*5.5},TOW_SPEED,now);
    if(d<4.5&&speedOf(p)<2.5){brake(t);api?.towEnd?.(job.id,{x:bx,y:by,yaw});job.towing=false;t.state="depot";t.path=null;t.leaveAt=now;{const w=watch.get(job.id);if(w){w.dispatched=false;w.flipSince=w.slowSince=w.offSince=0;w.cooldownUntil=now+60000;}}const v=viewport();if(v)v.dataset.towServiceJobsDone=String((Number(v.dataset.towServiceJobsDone)||0)+1);}return true;}
  if(t.state==="depot"){if(now-(t.leaveAt||0)<1200){brake(t);return true;}const me=playerPos(),gx=t.depot.x,gy=t.depot.y;const d=follow(t,{x:gx,y:gy},DRIVE_SPEED,now);
    const away=me?Math.hypot(p.position[0]-me.x,p.position[1]-me.y):999;if((d<12||away>200)&&!inView(p.position[0],p.position[1])){removeTruck(t);return false;}return true;}
  return true;}

// ------------------------------------------------------------ who needs help
function scan(now){const api=pop();if(!api?.vehicles)return;const list=api.vehicles(),seen=new Set();
  for(const v of list){seen.add(v.id);if(v.parked||v.driven||v.towed)continue;let w=watch.get(v.id);if(!w){w={id:v.id,flipSince:0,slowSince:0,offSince:0,dispatched:false};watch.set(v.id,w);}if(w.dispatched||now<(w.cooldownUntil||0))continue;
    w.flipSince=v.up<.5?(w.flipSince||now):0;w.slowSince=v.speed<.6&&v.hasRoute?(w.slowSince||now):0;w.offSince=v.offRoute>OFFROAD_M?(w.offSince||now):0;
    const flipped=w.flipSince&&now-w.flipSince>FLIP_S*1000,stuck=w.slowSince&&now-w.slowSince>STUCK_S*1000,off=w.offSince&&now-w.offSince>OFFROAD_S*1000;
    if((flipped||stuck||off)&&trucks.length<MAX_TRUCKS){const t=spawnTruck({id:v.id,x:v.x,y:v.y,reason:flipped?"flipped":off?"off-road":"stuck"},now);if(t){w.dispatched=true;const vp=viewport();if(vp){vp.dataset.towServiceDispatches=String((Number(vp.dataset.towServiceDispatches)||0)+1);vp.dataset.towServiceLast=t.job.reason;}}}}
  for(const id of watch.keys())if(!seen.has(id)&&!trucks.some(t=>t.job?.id===id))watch.delete(id);}

// ------------------------------------------------------------ draw
const BODY_OPTS={material:{doubleSided:true,castShadow:true,paint:true,roughness:.32,metalness:.28}};
function draw(now){const r=game?.world?.renderer;if(!r?.upsert)return;const bodies=[],tints=[],rigs=[],wheels=[],lamps=[],lampTints=[];
  for(const t of trucks){const p=t.pose;if(!p||t.dead)continue;const base=mul(T(...p.position),quatMatrix(p.rotation)),off=Number(p.groundOffset)||.6,grp=mul(base,T(0,0,-off));
    bodies.push(base);tints.push(...TRUCK_PAINT);rigs.push(grp);
    const on=t.lightOn??((Math.floor(now/260)%2)===0);for(const [y,lit] of [[.24,on],[-.24,!on]]){lamps.push(mul(grp,T(.2,y,1.55)));lampTints.push(...(lit?AMBER_ON:AMBER_OFF));}
    if(Array.isArray(p.wheels))for(const w of p.wheels){if(!w?.position||!w?.rotation)continue;const s=Math.max(.1,Math.min(1,Number(w.radius)||.34))/.34;wheels.push(mul(mul(T(...w.position),quatMatrix(w.rotation)),[s,0,0,0,0,s,0,0,0,0,s,0,0,0,0,1]));}}
  syncInstanced(r,"tow/body",ORIGINAL_SEDAN,bodies.length?packMatrices(bodies):null,{tints:bodies.length?new Float32Array(tints):null,...BODY_OPTS});
  syncInstanced(r,"tow/rig",TRUCK_RIG,rigs.length?packMatrices(rigs):null,{material:{roughness:.5,metalness:.6}});
  syncInstanced(r,"tow/wheels",ORIGINAL_WHEEL,wheels.length?packMatrices(wheels):null,{material:{roughness:.8}});
  syncInstanced(r,"tow/lamps",AMBER_LAMP,lamps.length?packMatrices(lamps):null,{tints:lamps.length?new Float32Array(lampTints):null,material:{unlit:true,castShadow:false}});}

// ------------------------------------------------------------ loop
export function tickNativeTowService(now=performance.now()){
  if(!game)return;
  if(now-lastScan>500){lastScan=now;try{scan(now);}catch(e){console.warn("tow scan",e);}}
  for(let i=trucks.length-1;i>=0;i--){if(trucks[i].dead){removeTruck(trucks[i]);trucks.splice(i,1);continue;}try{if(!update(trucks[i],now))trucks.splice(i,1);}catch(e){console.warn("tow truck",e);removeTruck(trucks[i]);trucks.splice(i,1);}}
  draw(now);
  const v=viewport();if(v)v.dataset.towService=`${trucks.length}t/${[...watch.values()].filter(w=>w.dispatched).length}j`;}

// The ADAC truck is a car like any other: blasts and enough rounds wreck it (it burns out like the
// traffic, the job it was on is dropped and a new truck can be sent later).
function damageTruck(t,amount){if(t.dead||!(amount>0))return;t.hp=(t.hp??TRUCK_HP)-amount;if(t.hp>0)return;t.dead=true;const p=t.pose||truckPose(t);const pos=p?.position||[0,0,0];
  try{spawnNativeCarDebris({position:[pos[0],pos[1],pos[2]+.3],yaw:p?.yaw||0,velocity:p?.velocity||[0,0,0],color:0xf2b705,seed:t.id,id:t.id});}catch{}
  const v=viewport();if(v)v.dataset.towTruckWrecked=String((Number(v.dataset.towTruckWrecked)||0)+1);}
function truckAt(x,y,z,r){let best=null,bd=r;for(const t of trucks){if(t.dead)continue;const p=t.pose?.position;if(!p)continue;const d=Math.hypot(p[0]-x,p[1]-y,(p[2]+.4)-z);if(d<bd){bd=d;best=t;}}return best?{t:best,d:bd}:null;}
function onExplosion(e){const d=e?.detail||{},p=d.position;if(!Array.isArray(p))return;const R=Number(d.radiusM)||8,M=Number(d.maxDamage)||100;for(const t of trucks){const q=t.pose?.position;if(!q||t.dead)continue;const dist=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);if(dist<R)damageTruck(t,M*1.3*(1-dist/R)**1.2);}}
const ROUND_DAMAGE={smg:5,glock:9,sniper:70};
function onTracer(e){const d=e?.detail||{},b=d.end;if(!Array.isArray(b))return;const hit=truckAt(b[0],b[1],b[2],2.3);if(hit)damageTruck(hit.t,ROUND_DAMAGE[d.weapon]??8);}
export function towServiceTrucks(){return trucks;}
export function installNativeTowService(runtime){
  game=runtime;if(installed||typeof window==="undefined")return;installed=true;
  globalThis.__towService={version:TOW_SERVICE_VERSION,get trucks(){return trucks.map(t=>({id:t.id,state:t.state,job:t.job?.id,reason:t.job?.reason}));},
    dispatch(id){const v=pop()?.vehicles?.().find(q=>q.id===id);return v?Boolean(spawnTruck({id,x:v.x,y:v.y,reason:"manual"},performance.now())):false;}};
  addEventListener("arondight:world-reset",()=>{for(const t of trucks)removeTruck(t);trucks=[];watch.clear();});
  addEventListener("arondight:world-explosion",onExplosion);addEventListener("arondight:foot-tracer",onTracer);
}
