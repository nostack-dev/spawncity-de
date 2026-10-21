// Gangsters, military response, zombie nights and enterable buildings.
// Rules and numbers are the live ones. Prod is untouched.
import {ORIGINAL_HUMAN} from "./native_actor_meshes.mjs";
import {ORIGINAL_JET} from "./native_actor_meshes.mjs";
import {fromTRS} from "./native_render_math.mjs";
import {armsOf,temperOf} from "./pedestrian_agents.mjs";

const GUN=10,KNIFE=8;
const TRIGGER_HEAT=36,SQUAD=4,MAX_SOLDIERS=8,SOLDIER_HP=100;
const CAP=28,Z_HP=100,MELEE=11,MELEE_MS=1150,SPAWN_MIN=34,SPAWN_MAX=70,HIT_PTS=10,KILL_PTS=60;
const yawQuat=y=>[0,0,Math.sin(y*.5),Math.cos(y*.5)];
let soldiers=[],zombies=[],round=0,points=0,lastMelee=0,lastGang=0,drawn={},threatSeq=0;
function heat(){return Number(globalThis.__arondightWantedSystem?.state?.heat)||0;}
// Zombie nights follow the game's day / night cycle (production zombie_nights).
function night(){const dn=globalThis.__dayNight?.state;if(dn)return Boolean(dn.isNight);const h=new Date().getHours();return h<6||h>=21;}
function zombiesOn(){return globalThis.__arondightWorldOptions?.get?.("zombies")!==false&&night();}
function player(){const p=globalThis.__arondightWalkMode?.position;return p?[p.x,p.y,p.z||1]:[0,0,2];}
function paint(renderer,id,geo,data){
  if(!data.length){if(drawn[id]){renderer.remove(id);drawn[id]=false;}return;}
  const transforms=new Float32Array(data);
  if(drawn[id])renderer.updateInstances(id,{transforms});
  else{renderer.upsert(id,{...geo,instances:{transforms},material:{doubleSided:true,castShadow:false}});drawn[id]=true;}
}
export function installNativeThreats(){
  globalThis.__arondightGangsters={version:"street-gangsters-v1"};
}
export function tickNativeThreats(game,now=performance.now()){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const p=player();
  const people=globalThis.__arondightProceduralPopulation?.people?.()||[];
  if(now-lastGang>900){
    for(const a of people){
      if(!a.alive||temperOf(a)!=="aggressive")continue;
      const d=Math.hypot(a.x-p[0],a.y-p[1]);
      if(d>16)continue;
      if(armsOf(a)==="gun"){globalThis.__arondightPlayerDamageModel?.damage?.(GUN,"gun:pedestrian");lastGang=now;break;}
      if(armsOf(a)==="knife"&&d<2.2){globalThis.__arondightPlayerDamageModel?.damage?.(KNIFE,"knife:pedestrian");lastGang=now;break;}
    }
  }
  // The army is native_military.mjs (production military_response).
  if(false&&heat()>=TRIGGER_HEAT&&soldiers.filter(s=>s.hp>0).length<MAX_SOLDIERS){
    const n=Math.min(SQUAD,MAX_SOLDIERS-soldiers.filter(s=>s.hp>0).length);
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,r=60+Math.random()*40;
      soldiers.push({id:`soldier-${++threatSeq}`,kind:"soldier",x:p[0]+Math.cos(a)*r,y:p[1]+Math.sin(a)*r,yaw:a,hp:SOLDIER_HP});
    }
  }
  if(heat()<12)soldiers=soldiers.filter(s=>Math.hypot(s.x-p[0],s.y-p[1])<80);
  const soldierData=[];
  for(const s of soldiers){
    if(s.hp<=0)continue;
    const dx=p[0]-s.x,dy=p[1]-s.y,d=Math.hypot(dx,dy)||1;
    if(d>8){s.x+=dx/d*3.2/60;s.y+=dy/d*3.2/60;}
    s.yaw=Math.atan2(dy,dx);
    if(d<22&&Math.random()<.02)globalThis.__arondightPlayerDamageModel?.damage?.(12,"gun:military");
    soldierData.push(...fromTRS([s.x,s.y,0],yawQuat(s.yaw),[1,1,1]));
  }
  // Zombie nights are native_zombies.mjs (production zombie_nights).
  if(false&&zombiesOn()){
    if(!zombies.some(z=>z.hp>0)&&now> (tickNativeThreats.next||0)){
      round++;const n=Math.min(CAP,4+round*2);
      for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,r=SPAWN_MIN+Math.random()*(SPAWN_MAX-SPAWN_MIN);zombies.push({id:`zombie-${++threatSeq}`,kind:"zombie",x:p[0]+Math.cos(a)*r,y:p[1]+Math.sin(a)*r,hp:Z_HP});}
      tickNativeThreats.next=now+20000;
    }
  }else zombies=[];
  const zombieData=[];
  for(const z of zombies){
    if(z.hp<=0)continue;
    const dx=p[0]-z.x,dy=p[1]-z.y,d=Math.hypot(dx,dy)||1;
    z.x+=dx/d*1.4/60;z.y+=dy/d*1.4/60;
    if(d<1.4&&now-lastMelee>MELEE_MS){globalThis.__arondightPlayerDamageModel?.damage?.(MELEE,"zombie");lastMelee=now;}
    zombieData.push(...fromTRS([z.x,z.y,0],yawQuat(Math.atan2(dy,dx)),[1,1,1]));
  }
  paint(renderer,"threat/soldiers",ORIGINAL_HUMAN,soldierData);
  paint(renderer,"threat/zombies",ORIGINAL_HUMAN,zombieData);
}
export function listNativeThreats(){
  const out=[];
  for(const s of soldiers)if(s.hp>0)out.push(s);
  for(const z of zombies)if(z.hp>0)out.push(z);
  return out;
}
export function applyThreatDamage(id,amount){
  const soldier=soldiers.find(e=>e.id===id);
  const zombie=!soldier&&zombies.find(e=>e.id===id);
  const actor=soldier||zombie;
  if(!actor||actor.hp<=0||!(amount>0))return null;
  actor.hp-=amount;
  if(zombie)points+=actor.hp<=0?KILL_PTS:HIT_PTS;
  return {hp:actor.hp,dead:actor.hp<=0,kind:actor.kind};
}
export function hitNativeThreats(origin,dir,range){
  const lists=[{arr:soldiers,kind:"soldier"},{arr:zombies,kind:"zombie"}];
  let best=null,bestT=range;
  for(const {arr,kind} of lists)for(const e of arr){
    if(e.hp<=0)continue;
    const ox=e.x-origin[0],oy=e.y-origin[1],oz=1.1-origin[2];
    const t=ox*dir[0]+oy*dir[1]+oz*dir[2];
    if(t<0||t>bestT)continue;
    const px=origin[0]+dir[0]*t-e.x,py=origin[1]+dir[1]*t-e.y,pz=origin[2]+dir[2]*t-1.1;
    if(px*px+py*py+pz*pz<.4*.4){best={e,kind};bestT=t;}
  }
  if(!best)return null;
  best.e.hp-=34;
  if(best.kind==="zombie"){points+=best.e.hp<=0?KILL_PTS:HIT_PTS;}
  return {point:[origin[0]+dir[0]*bestT,origin[1]+dir[1]*bestT,origin[2]+dir[2]*bestT]};
}
export function blastNativeThreats(center,radius,maxDamage,falloff,exposure){
  let hit=0;
  for(const group of [soldiers,zombies])for(const actor of group){
    if(actor.hp<=0)continue;
    const dist=Math.hypot(actor.x-center[0],actor.y-center[1],1.1-(center[2]||0));
    if(dist>=radius)continue;
    const amount=maxDamage*falloff(dist)*(exposure?.(actor.x,actor.y,1.1)??1);
    if(amount<=2)continue;
    actor.hp-=amount;
    if(group===zombies)points+=actor.hp<=0?KILL_PTS:HIT_PTS;
    hit++;
  }
  return hit;
}
