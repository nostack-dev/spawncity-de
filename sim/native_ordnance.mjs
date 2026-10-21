// Live grenade, rocket and missile ballistics from gameplay_final_runtime_v2.
// Numbers are the production ones. Motion is plain vectors. Hits are Box3D.
// The blast is the live smoothstep plus building-prism occlusion, then the
// same Box3D pressure impulse the rigid world already owns.
import {wantedLineBlockedByPrisms} from "./wanted_system_logic.mjs";
import {blastNativeCity} from "./native_city_life.mjs";
import {blastNativeCops} from "./native_police_ground.mjs";
import {blastNativeThreats} from "./native_threats.mjs";
import {blastNativeCows} from "./native_world_life.mjs";
import {blastNativeWanted} from "./native_wanted.mjs";
import {spawnNativeCarDebris} from "./native_car_debris.mjs";

export const NATIVE_ORDNANCE_VERSION="live-grenade-rocket-missile-blast-v1";

const BLAST_RADIUS_M=8,BLAST_MAX_DAMAGE=100,BLAST_OCCLUDED_SCALE=.18;
const MISSILE_TTL_MS=4200;
const GRENADE_TTL_MS=5600,GRENADE_FUSE_MS=2800,GRENADE_COOLDOWN_MS=760;
const GRENADE_SPEED_MPS=40,GRENADE_GRAVITY_MPS2=9.81,GRENADE_RESTITUTION=.58,GRENADE_SURFACE_DAMPING=.88;
const GRENADE_MAX_BOUNCES=7,GRENADE_RADIUS_M=.039*1.35,GRENADE_FLOOR_NORMAL_Z=.58;
const GRENADE_BLAST_RADIUS_M=8.5,GRENADE_MAX_DAMAGE=125,GRENADE_SHOT_HIT_M=.35;
const ROCKET_BLAST_RADIUS_M=9.5,ROCKET_MAX_DAMAGE=160;
const ROCKET_FOOT_SPEED_MPS=40,ROCKET_FOOT_LAUNCH_MPS=22,ROCKET_FOOT_ACCEL_MPS2=55;
const ROCKET_FOOT_COOLDOWN_MS=900,ROCKET_TURN_RAD_S=2.8,ROCKET_LASER_RANGE_M=420,ROCKET_FOOT_TTL_MS=9000;
// Production jet_mode.mjs ordnance: rocket 260 m/s over the jet's speed, 8 m /
// 120 blast, 2.4 s recharge; bombs fall with drag and blast 17 m / 170.
const JET_ROCKET_MPS=260,JET_ROCKET_LIFE_MS=5000,JET_ROCKET_RECHARGE_MS=2400,JET_ROCKET_BLAST_M=8,JET_ROCKET_DAMAGE=120,JET_BOMB_GAP_MS=450,JET_BOMB_BLAST_M=17,JET_BOMB_DAMAGE=170;
const ROCKET_SALVO=4,ROCKET_GAP_MS=90,ROCKET_COOLDOWN_MS=520,ROCKET_BLAST_M=5,ROCKET_DAMAGE=70;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const add=(a,b,s=1)=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
const scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=a=>Math.hypot(a[0],a[1],a[2]);
export function unit(v){const l=len(v);return l<1e-6?[0,1,0]:[v[0]/l,v[1]/l,v[2]/l];}
export function blastFalloff(distance,radius){const x=clamp(1-distance/Math.max(.1,radius),0,1);return x*x*(3-2*x);}
export function tntKgFromRadius(radius){return Math.pow(Math.max(1,Number(radius)||BLAST_RADIUS_M)/5.5,3);}
export function bounceVelocity(vel,normal,{restitution=GRENADE_RESTITUTION,damping=GRENADE_SURFACE_DAMPING}={}){
  let n=unit(normal);if(dot(vel,n)>0)n=scale(n,-1);
  const vn=dot(vel,n);let out=vel.slice();
  if(vn<0)out=add(out,n,-(1+restitution)*vn);
  return scale(out,damping);
}
export function steerDirection(dir,desired,maxTurn){
  const a=unit(dir),b=unit(desired),c=clamp(dot(a,b),-1,1),angle=Math.acos(c);
  if(angle<1e-4||maxTurn>=angle)return b;
  const t=maxTurn/angle,s=Math.sin(angle),s0=Math.sin((1-t)*angle)/s,s1=Math.sin(t*angle)/s;
  return unit([a[0]*s0+b[0]*s1,a[1]*s0+b[1]*s1,a[2]*s0+b[2]*s1]);
}

function ground(game,x,y){const h=game.world?.terrain?.heightAt?.(x,y);return Number.isFinite(h)?h:0;}
function dead(){return Boolean(globalThis.__arondightPlayerDamageModel?.dead);}
function view(){return typeof document==="undefined"?null:document.getElementById("viewport");}
function setData(key,value){const v=view();if(v)v.dataset[key]=String(value);}

export function createNativeOrdnance(game,{aim,footWeapon=()=>"smg",droneWeapon=()=>"gun"}={}){
  const rounds=[];
  // rockets / missiles in flight light what they pass (native_scene_lighting)
  globalThis.__nativeOrdnanceRounds=()=>rounds.filter(r=>r.kind!=="grenade"&&r.kind!=="bomb"&&Array.isArray(r.pos)).map(r=>r.pos);
  let lastGrenade=-Infinity,lastRocket=-Infinity,lastMissile=-Infinity,secondaryLeft=4,lastJetRocket=-Infinity,lastJetBomb=-Infinity,jetRocketSide=1;
  function cast(origin,direction,distance){
    const hit=game.rigids?.raycast?.(origin,direction,distance);
    return hit?.point?hit:null;
  }
  function laser(){
    if(game.mode!=="foot"||footWeapon()!=="rocket")return null;
    const ray=aim?.();if(!ray)return null;
    const hit=cast(ray.origin,ray.direction,ROCKET_LASER_RANGE_M);
    return {active:true,point:hit?.point||add(ray.origin,unit(ray.direction),ROCKET_LASER_RANGE_M)};
  }
  function exposure(center,x,y,z){
    const prisms=game.rigids?.buildingSnapshot?.prisms||[];
    if(!prisms.length)return 1;
    return wantedLineBlockedByPrisms({x:center[0],y:center[1],z:center[2]+.12},{x,y,z},prisms)?BLAST_OCCLUDED_SCALE:1;
  }
  function dispatch(position,detail){
    if(!detail.secondary)secondaryLeft=4;
    const payload={position:[...position],radiusM:BLAST_RADIUS_M,maxDamage:BLAST_MAX_DAMAGE,kind:"missile",...detail};
    if(payload.kind==="car")spawnNativeCarDebris({position:payload.position,yaw:payload.yaw,velocity:payload.velocity,color:payload.color,id:payload.id,seed:payload.seed||payload.id});
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("arondight:world-explosion",{detail:payload}));
    apply(position,payload);
  }
  function apply(position,detail){
    if(detail.kind==="nuke")return;
    const radius=clamp(detail.radiusM??BLAST_RADIUS_M,2,18);
    const maxDamage=clamp(detail.maxDamage??BLAST_MAX_DAMAGE,10,160);
    const tntKg=Number.isFinite(Number(detail.tntKg))?Number(detail.tntKg):tntKgFromRadius(radius);
    let occluded=0;
    const exposureFn=(x,y,z)=>{const e=exposure(position,x,y,z);if(e<1)occluded++;return e;};
    const impulses=Number(game.rigids?.blast?.([position[0],position[1],position[2]],{tntKg,exposure:exposureFn}))||0;
    const actor={foot:"player-foot",car:"player-car",jet:"player-jet"}[game.mode];
    const self=actor?game.rigids.pose(actor)?.position:game.flight?.position?.();
    if(self){
      const dist=Math.hypot(self[0]-position[0],self[1]-position[1],self[2]-position[2]);
      if(dist<radius){
        const e=exposureFn(self[0],self[1],self[2]);
        let amount=maxDamage*blastFalloff(dist,radius)*e;
        if(detail.droneMissile)amount=Math.min(amount,Number(detail.playerDamageCap)||18);
        if(amount>2){
          if(game.mode==="drone")globalThis.__arondightDroneDamageModel?.damage?.(amount,`explosion:${detail.kind||"world"}`);
          else globalThis.__arondightPlayerDamageModel?.damage?.(amount,`explosion:${detail.kind||"world"}`);
        }
      }
    }
    const fall=(dist)=>blastFalloff(dist,radius);
    const city=blastNativeCity(position,radius,fall,exposureFn)||{cars:[]};
    blastNativeCops(position,radius,fall,exposureFn);
    blastNativeThreats(position,radius,maxDamage,fall,exposureFn);
    blastNativeCows(position,radius,maxDamage,fall,exposureFn);
    blastNativeWanted(position,radius,maxDamage,fall,exposureFn);
    if(!detail.secondary){
      for(const car of city.cars||[]){
        if(secondaryLeft<=0)break;
        secondaryLeft--;
        const at=[car.x,car.y,car.z||.6];
        setTimeout(()=>dispatch(at,{kind:"car",radiusM:BLAST_RADIUS_M,maxDamage:BLAST_MAX_DAMAGE,secondary:true,id:car.id||"car",yaw:car.yaw||0,velocity:[car.vx||0,car.vy||0,0],seed:car.id||"car"}),40);
      }
    }
    setData("explosionPhysics","box3d-radial-impulse+damage-falloff-v2");
    setData("explosionRadiusM",radius.toFixed(1));
    setData("explosionLastImpulses",impulses);
    setData("explosionOccludedTargets",occluded);
    setData("explosionDamageFalloff","smoothstep-radial-v2");
    setData("explosionOcclusion","building-prism-los-v2");
  }
  function detonate(index,reason){
    const round=rounds[index];if(!round)return false;
    const at=round.pos.slice();
    rounds.splice(index,1);
    if(round.kind==="jet-rocket"){
      dispatch(at,{kind:"jet-rocket",radiusM:JET_ROCKET_BLAST_M,maxDamage:JET_ROCKET_DAMAGE,source:"jet-rocket",impactReason:reason});
    }else if(round.kind==="bomb"){
      dispatch(at,{kind:"airstrike",radiusM:JET_BOMB_BLAST_M,maxDamage:JET_BOMB_DAMAGE,source:"jet-bomb",impactReason:reason});
    }else if(round.kind==="missile"){
      dispatch(at,{kind:"missile",radiusM:ROCKET_BLAST_M,maxDamage:ROCKET_DAMAGE,droneMissile:true,playerDamageCap:round.guided?28:18,source:round.source||"missile",targeted:Boolean(round.targetId)});
    }else if(round.kind==="rocket"){
      dispatch(at,{kind:"rocket",radiusM:ROCKET_BLAST_RADIUS_M,maxDamage:ROCKET_MAX_DAMAGE,source:"rocket",impactReason:reason});
    }else{
      dispatch(at,{kind:"grenade",radiusM:GRENADE_BLAST_RADIUS_M,maxDamage:GRENADE_MAX_DAMAGE,source:round.source||"foot-grenade",impactReason:reason});
    }
    setData("walkGrenadeLastDetonation",reason);
    return true;
  }
  function soft(p){
    for(const lamp of globalThis.__streetLamps?.lamps?.()||[]){
      if(lamp.state===2)continue;
      if(Math.abs(lamp.x-p[0])<.35&&Math.abs(lamp.y-p[1])<.35&&p[2]>lamp.z&&p[2]<lamp.z+6.4)return true;
      if(Math.abs((lamp.hx??lamp.x)-p[0])<.45&&Math.abs((lamp.hy??lamp.y)-p[1])<.45&&Math.abs(lamp.z+6-p[2])<.4)return true;
    }
    for(const cow of globalThis.__arondightCows?.list?.()||[]){
      if(cow.dead||cow.hidden)continue;
      if((p[0]-cow.x)**2+(p[1]-cow.y)**2<1.1&&p[2]<ground(game,cow.x,cow.y)+1.7)return true;
    }
    for(const person of globalThis.__arondightProceduralPopulation?.people?.()||[]){
      if(!person.alive||person.knocked)continue;
      if((p[0]-person.x)**2+(p[1]-person.y)**2<.7&&p[2]<2.2)return true;
    }
    return false;
  }
  function impactMode(hit){
    const kind=String(hit?.kind||"").toLowerCase();
    if(/person|human|animal|cow|ped/.test(kind))return "organic";
    if(/car|bus|drone|vehicle/.test(kind))return "target";
    return Number(hit?.normal?.[2])>=GRENADE_FLOOR_NORMAL_Z?"floor":"wall";
  }
  function bounce(round,point,normal,now){
    let n=unit(normal);
    if(dot(round.vel,n)>0)n=scale(n,-1);
    round.vel=bounceVelocity(round.vel,n);
    round.bounces=Math.min(GRENADE_MAX_BOUNCES,round.bounces+1);
    round.resting=false;round.nextCollisionAt=now+36;
    round.pos=add(point,n,GRENADE_RADIUS_M+.014);
    const speed=len(round.vel);
    if(speed>.05)round.pos=add(round.pos,unit(round.vel),.02);
    if(round.bounces>=GRENADE_MAX_BOUNCES&&speed<2.8)round.vel=scale(round.vel,.38);
    setData("walkGrenadeBounces",round.bounces);
    setData("walkGrenadeBouncePhysics","spring-floor-only+impact-fuse-v3");
  }
  function push(round){rounds.push(round);return true;}
  function launchFoot(mode,now=performance.now()){
    if(game.mode!=="foot"||dead())return false;
    if(mode==="grenade"){
      if(rounds.some(round=>(round.kind==="grenade"&&!round.hand)||round.kind==="rocket")){
        for(let i=rounds.length-1;i>=0;i--){
          const round=rounds[i];
          if((round.kind==="grenade"&&!round.hand)||round.kind==="rocket")detonate(i,"remote");
        }
        lastGrenade=now-GRENADE_COOLDOWN_MS*.5;
        setData("walkGrenadeRemoteDetonations",(Number(view()?.dataset.walkGrenadeRemoteDetonations)||0)+1);
        return "remote";
      }
      if(now-lastGrenade<GRENADE_COOLDOWN_MS)return false;
      const ray=aim?.();if(!ray)return false;
      lastGrenade=now;
      const dir=unit(ray.direction);
      push({kind:"grenade",mesh:"grenade",pos:add(ray.origin,dir,.1),vel:scale(dir,GRENADE_SPEED_MPS),born:now,fuseAt:now+GRENADE_FUSE_MS,bounces:0,nextCollisionAt:0,resting:false,guided:false,source:"foot-screen"});
      setData("walkGrenadeLaunches",(Number(view()?.dataset.walkGrenadeLaunches)||0)+1);
      setData("walkGrenadeBallistics","spring-orb-floor-bounce+impact-fuse-v3");
      setData("walkGrenadeFuseMs",GRENADE_FUSE_MS);
      setData("walkGrenadeProjectileSpeedMps",GRENADE_SPEED_MPS);
      return true;
    }
    if(mode!=="rocket")return false;
    if(now-lastRocket<ROCKET_FOOT_COOLDOWN_MS)return false;
    const ray=aim?.();if(!ray)return false;
    for(const round of rounds)if(round.kind==="rocket")round.guided=false;
    lastRocket=now;
    const dir=unit(ray.direction);
    push({kind:"rocket",mesh:"missile",pos:add(ray.origin,dir,.25),vel:scale(dir,ROCKET_FOOT_LAUNCH_MPS),born:now,fuseAt:now+ROCKET_FOOT_TTL_MS,bounces:0,nextCollisionAt:0,resting:false,guided:true,source:"rocket",smokeAt:0});
    setData("walkRocketLaunches",(Number(view()?.dataset.walkRocketLaunches)||0)+1);
    return true;
  }
  function throwHand({origin,velocity,fuseAt,source="hand-grenade"}={}){
    if(!Array.isArray(origin)||!Array.isArray(velocity))return false;
    const now=performance.now();
    push({kind:"grenade",mesh:"grenade",pos:origin.slice(),vel:velocity.slice(),born:now,fuseAt:Number(fuseAt)||now+4000,bounces:0,nextCollisionAt:now+60,resting:false,guided:false,hand:true,source});
    return true;
  }
  function explodeAt(position,source="hand-grenade"){
    if(!Array.isArray(position))return false;
    dispatch(position.slice(),{kind:"grenade",radiusM:GRENADE_BLAST_RADIUS_M,maxDamage:GRENADE_MAX_DAMAGE,source,impactReason:"fuse"});
    return true;
  }
  function explodeCar(position,meta={}){
    if(!Array.isArray(position))return false;
    dispatch(position.slice(),{kind:"car",radiusM:BLAST_RADIUS_M,maxDamage:BLAST_MAX_DAMAGE,source:"car",yaw:meta.yaw||0,velocity:meta.velocity||[0,0,0],color:meta.color??0x777777,id:meta.id||"",seed:meta.seed||meta.id||""});
    return true;
  }
  function launchDrone(mode,now=performance.now(),slot=0){
    if(game.mode!=="drone"||globalThis.__arondightDroneDamageModel?.destroyed)return false;
    if(!["missile","guided"].includes(mode))return false;
    if(slot===0&&now-lastMissile<ROCKET_COOLDOWN_MS)return false;
    const ray=aim?.();if(!ray)return false;
    if(slot===0)lastMissile=now;
    const guided=mode==="guided";
    const hit=cast(ray.origin,ray.direction,220);
    const target=hit?.point?hit.point.slice():add(ray.origin,unit(ray.direction),105);
    if(!guided&&slot){const spread=1.2+Math.hypot(target[0]-ray.origin[0],target[1]-ray.origin[1],target[2]-ray.origin[2])*.02;target[0]+=(Math.random()-.5)*spread;target[1]+=(Math.random()-.5)*spread;}
    const dir=unit(ray.direction);
    push({kind:"missile",mesh:guided?"guided":"missile",pos:add(ray.origin,dir,.28),vel:scale(dir,34),born:now,fuseAt:now+MISSILE_TTL_MS,target,targetId:guided?hit?.id||null:null,guided,source:"pointer",bounces:0,resting:false});
    setData("droneMissiles",(Number(view()?.dataset.droneMissiles)||0)+1);
    setData("droneMissileGuidance",guided?"lock-on-steering+path-collision-v3":"screen-target-homing+path-collision-v2");
    if(slot===0&&!guided)for(let k=1;k<ROCKET_SALVO;k++)setTimeout(()=>launchDrone(mode,performance.now(),k),k*ROCKET_GAP_MS);
    return true;
  }
  function shotLine(from,to){
    if(!rounds.length||!from||!to)return false;
    const dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2],L2=dx*dx+dy*dy+dz*dz;
    if(L2<1e-6)return false;
    let best=-1,bt=2;
    for(let i=0;i<rounds.length;i++){
      const p=rounds[i].pos,t=clamp(((p[0]-from[0])*dx+(p[1]-from[1])*dy+(p[2]-from[2])*dz)/L2,0,1);
      const qx=from[0]+dx*t-p[0],qy=from[1]+dy*t-p[1],qz=from[2]+dz*t-p[2];
      if(qx*qx+qy*qy+qz*qz<=GRENADE_SHOT_HIT_M*GRENADE_SHOT_HIT_M&&t<bt){bt=t;best=i;}
    }
    if(best<0)return false;
    detonate(best,"shot");
    setData("walkGrenadeShotDetonations",(Number(view()?.dataset.walkGrenadeShotDetonations)||0)+1);
    return true;
  }
  function stepJetRound(round,index,now,dt){
    if(round.kind==="jet-rocket"&&now-round.born>JET_ROCKET_LIFE_MS)return detonate(index,"ttl");
    if(round.kind==="bomb"&&now-round.born>30000)return detonate(index,"ttl");
    const prev=round.pos.slice();
    round.vel[2]-=(round.kind==="bomb"?9.81:9.81*.15)*dt;
    if(round.kind==="bomb"){const k=1-.04*dt;round.vel=scale(round.vel,k);}
    round.pos=add(round.pos,round.vel,dt);
    const step=len(add(round.pos,prev,-1));
    const hit=step>.01?cast(prev,unit(round.vel),step+.3):null;
    if(hit?.point){round.pos=hit.point.slice();return detonate(index,"impact");}
    const gz=ground(game,round.pos[0],round.pos[1]);
    if(round.pos[2]<=gz+.2){round.pos[2]=Math.max(round.pos[2],gz);return detonate(index,"ground");}
    return false;
  }
  function launchJet(kind,now=performance.now()){
    if(game.mode!=="jet")return false;
    const af=game.jetAirframe;if(af&&af.contacts>0)return false;
    const pose=game.rigids.pose("player-jet");if(!pose?.position)return false;
    const q=pose.rotation||[0,0,0,1];
    const rot=v=>{const [x,y,z,w]=q,ix=w*v[0]+y*v[2]-z*v[1],iy=w*v[1]+z*v[0]-x*v[2],iz=w*v[2]+x*v[1]-y*v[0],iw=-x*v[0]-y*v[1]-z*v[2];return [ix*w+iw*-x+iy*-z-iz*-y,iy*w+iw*-y+iz*-x-ix*-z,iz*w+iw*-z+ix*-y-iy*-x];};
    const fwd=rot([0,1,0]),right=rot([1,0,0]),up=rot([0,0,1]),vel=pose.velocity||[0,0,0];
    if(kind==="rocket"){
      if(now-lastJetRocket<JET_ROCKET_RECHARGE_MS)return false;lastJetRocket=now;jetRocketSide=-jetRocketSide;
      const pos=add(add(add(pose.position,right,jetRocketSide*3.2),fwd,2),up,-.6);
      return push({kind:"jet-rocket",mesh:"jetRocket",pos,vel:add(vel,fwd,JET_ROCKET_MPS),born:now,fuseAt:Infinity,source:"jet"});
    }
    if(kind==="bomb"){
      if(now-lastJetBomb<JET_BOMB_GAP_MS)return false;lastJetBomb=now;
      return push({kind:"bomb",mesh:"bomb",pos:add(pose.position,up,-1.6),vel:vel.slice(),born:now,fuseAt:Infinity,source:"jet"});
    }
    return false;
  }
  globalThis.__nativeJetOrdnance={launchJet,get rocketReadyInMs(){return Math.max(0,JET_ROCKET_RECHARGE_MS-(performance.now()-lastJetRocket));}};
  function stepOne(round,index,now,dt){
    if(round.kind==="jet-rocket"||round.kind==="bomb")return stepJetRound(round,index,now,dt);
    if(now>=round.fuseAt||now-round.born>(round.kind==="rocket"?ROCKET_FOOT_TTL_MS:round.kind==="missile"?MISSILE_TTL_MS:GRENADE_TTL_MS))return detonate(index,round.kind==="missile"?"ttl":"fuse");
    const substeps=Math.max(1,Math.min(4,Math.ceil(dt/.014))),stepDt=dt/substeps;
    for(let step=0;step<substeps;step++){
      if(round.kind==="missile"){
        if(round.targetId){const pose=game.rigids.pose(round.targetId);if(pose?.position)round.target=pose.position.slice();}
        const to=add(round.target,round.pos,-1),distance=len(to);
        if(distance<1.05)return detonate(index,"target");
        const desired=scale(unit(to),44),blend=1-Math.exp(-5.8*stepDt);
        round.vel=add(scale(round.vel,1-blend),desired,blend);
        const speed=len(round.vel),stepLen=Math.max(.01,speed*stepDt),dir=unit(round.vel);
        const hit=cast(round.pos,dir,stepLen+.14);
        if(hit&&hit.distanceM<=stepLen+.1)return detonate(index,"path");
        round.pos=add(round.pos,round.vel,stepDt);
        continue;
      }
      if(round.kind==="rocket"){
        const sight=laser();
        if(round.guided&&!sight?.active)round.guided=false;
        if(!round.guided)round.vel[2]-=1.2*stepDt;
        let dir=unit(round.vel);
        if(round.guided&&sight)dir=steerDirection(dir,add(sight.point,round.pos,-1),ROCKET_TURN_RAD_S*stepDt);
        const sp=Math.min(ROCKET_FOOT_SPEED_MPS,len(round.vel)+ROCKET_FOOT_ACCEL_MPS2*stepDt);
        round.vel=scale(dir,sp);
        const trav=sp*stepDt,hit=cast(round.pos,dir,trav+.2);
        if(now-round.smokeAt>25){round.smokeAt=now;game.world?.effects?.emit?.({kind:"smoke",position:round.pos,velocity:[0,0,.4],lifeMs:420,size:.22});}
        if(hit&&hit.distanceM<=trav+.2)return detonate(index,"rocket");
        if(soft(round.pos))return detonate(index,"organic");
        const next=add(round.pos,dir,trav);
        if(next[2]<=ground(game,next[0],next[1])+.08)return detonate(index,"floor");
        round.pos=next;
        continue;
      }
      if(round.resting){round.pos[2]=ground(game,round.pos[0],round.pos[1])+GRENADE_RADIUS_M;break;}
      round.vel[2]-=GRENADE_GRAVITY_MPS2*stepDt;
      let speed=len(round.vel);
      if(speed<.05){
        const gz=ground(game,round.pos[0],round.pos[1]);
        if(round.pos[2]>gz+GRENADE_RADIUS_M+.08)round.vel[2]=-1.15;
        else{round.pos[2]=gz+GRENADE_RADIUS_M;round.vel=[0,0,0];round.resting=true;break;}
        speed=len(round.vel);
      }
      const dir=unit(round.vel),travel=Math.max(.001,speed*stepDt);
      let hit=null;
      if(now>=round.nextCollisionAt)hit=cast(round.pos,dir,travel+GRENADE_RADIUS_M+.035);
      if(hit&&hit.distanceM<=travel+GRENADE_RADIUS_M+.018){
        const mode=impactMode(hit);
        if(round.hand||mode==="floor"){bounce(round,hit.point,hit.normal||[0,0,1],now);continue;}
        return detonate(index,mode);
      }
      if(!round.hand&&soft(round.pos))return detonate(index,"organic");
      const next=add(round.pos,dir,travel),gz=ground(game,next[0],next[1]),floorZ=gz+GRENADE_RADIUS_M;
      if(next[2]<=floorZ){
        next[2]=floorZ;
        const horizontal=Math.hypot(round.vel[0],round.vel[1]),down=Math.abs(round.vel[2]);
        if(round.bounces>=3&&down<1.15&&horizontal<1.35){round.pos=next;round.vel=[0,0,0];round.resting=true;break;}
        bounce(round,next,[0,0,1],now);
        continue;
      }
      round.pos=next;
    }
    return false;
  }
  return {
    get projectiles(){return rounds;},
    launchFoot,launchDrone,launchJet,shotLine,throwHand,explodeAt,explodeCar,
    tick(now=performance.now(),dt=1/60){
      for(let i=rounds.length-1;i>=0;i--)stepOne(rounds[i],i,now,dt);
      const n=rounds.filter(round=>round.kind==="grenade"||round.kind==="rocket").length;
      setData("walkGrenadesActive",n);
    }
  };
}
