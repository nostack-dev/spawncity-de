// Live foot shots from gameplay_final_runtime_v2 and the pistol damage table.
// Glock and the sniper go through three bodies. A person takes the round six
// times, a vehicle once. The sniper's damage waits for the bullet (850 m/s).
// Fists and the knife are swings, not bullets. No Three.js.
import {announceHeadshot} from "./headshot_feedback.mjs";
import {bulletImpulse} from "./ballistics.mjs";
import {nativePeople,applyPersonDamage,nativeTraffic,applyVehicleShot} from "./native_city_life.mjs";
import {liveNativeCops,applyCopDamage,scanReadyCruisers,applyCruiserDamage} from "./native_police_ground.mjs";
import {liveNativeSandboxEnemies,damageNativeSandboxEnemy} from "./native_sandbox.mjs";
import {nativeBulletImpact} from "./native_world_impacts.mjs";
import {hitNativeAnimals,shootNativeAnimal} from "./native_animals.mjs";
import {listNativeThreats,applyThreatDamage} from "./native_threats.mjs";
import {applyCowDamage} from "./native_world_life.mjs";
import {markNativeImpact} from "./native_world_life.mjs";
import {markFacade} from "./native_session.mjs";
import {addGlassCrack,addWallSoot,addWallBreach} from "./native_combat.mjs";

export const NATIVE_FOOT_FIRE_VERSION="glock-pierce-sniper-tof-melee-v1";
export const GLOCK_MIN_MS=110,GLOCK_HOLD_MS=170,GLOCK_RANGE_M=240,GLOCK_PIERCE=3;
export const SNIPER_BOLT_MS=1150,SNIPER_RANGE_M=1500,SNIPER_TRACER_MPS=850,SNIPER_PIERCE=3;
export const SNIPER_CAR_FRACTION=.34,SNIPER_ENGINE_FRACTION=.45;
export const SMG_RANGE_M=180,PERSON_SHOT=34,COP_SHOT=25,BODY_SHOT=34,DRONE_SHOT=34;
export const CAR_SHOT=30,BUS_SHOT=26,CAR_HP=180,BUS_HP=320;
export const FIST_RECOVER_MS=[300,250],COMBO_MS=430,PUNCH_REACH_M=1.8,PUNCH_NS=[40,26],PUNCH_DMG=[24,16];
export const KNIFE_RECOVER_MS=380,KNIFE_REACH_M=1.6,KNIFE_DMG=45,KNIFE_STRIKE_MS=130;
export const TRACER_MPS=240;
const PIERCE_STEP_M=.6,HEAD_HEIGHT_M=1.75;

const add=(a,b,s=1)=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
const view=()=>typeof document==="undefined"?null:document.getElementById("viewport");
function setData(key,value){const v=view();if(v)v.dataset[key]=String(value);}
export function tracerDelayMs(distance,mps=SNIPER_TRACER_MPS){return Math.max(0,Number(distance)||0)/mps*1000;}
export function isHeadShot(z,height=HEAD_HEIGHT_M){
  const h=Number(height)||0;
  if(h<1.2||h>2.6||!Number.isFinite(z))return false;
  const band=Math.max(.21,Math.min(.3,h*.14));
  return z>=h-band;
}
export function punchDamage(hand,combo){const h=hand===1?1:0;return Math.round(PUNCH_DMG[h]*(combo?1.35:1));}
export function punchMomentum(hand,combo){const h=hand===1?1:0;return PUNCH_NS[h]*(combo?1.2:1);}
export function vehicleShotDamage(kind,engine,weapon){
  const max=kind==="bus"?BUS_HP:CAR_HP;
  if(weapon==="sniper"&&kind==="cruiser")return CAR_SHOT*4;
  if(weapon==="sniper")return Math.max(1,Math.round(max*Math.min(1,engine?SNIPER_ENGINE_FRACTION:SNIPER_CAR_FRACTION)));
  return kind==="bus"?BUS_SHOT:CAR_SHOT;
}
function raySphere(origin,dir,center,radius,maxT){
  const ox=center[0]-origin[0],oy=center[1]-origin[1],oz=center[2]-origin[2];
  const t=ox*dir[0]+oy*dir[1]+oz*dir[2];
  if(t<0||t>maxT)return null;
  const px=origin[0]+dir[0]*t-center[0],py=origin[1]+dir[1]*t-center[1],pz=origin[2]+dir[2]*t-center[2];
  if(px*px+py*py+pz*pz>radius*radius)return null;
  return t;
}
function edgeT(ax,ay,bx,by,cx,cy,dx,dy){
  const rx=bx-ax,ry=by-ay,sx=dx-cx,sy=dy-cy,den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-9)return null;
  const qx=cx-ax,qy=cy-ay,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  return t>=0&&t<=1&&u>=0&&u<=1?t:null;
}
function pointInRing(x,y,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j],ax=Number(a?.[0]),ay=Number(a?.[1]),bx=Number(b?.[0]),by=Number(b?.[1]);
    if(!Number.isFinite(ax+ay+bx+by))continue;
    const crosses=(ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/((by-ay)||1e-12)+ax;
    if(crosses)inside=!inside;
  }
  return inside;
}
export function firstPrismMeters(prisms,origin,dir,range){
  let best=null;
  const x0=origin[0],y0=origin[1],z0=origin[2],x1=x0+dir[0]*range,y1=y0+dir[1]*range,z1=z0+dir[2]*range;
  for(const prism of prisms||[]){
    const ring=prism?.points;
    if(!Array.isArray(ring)||ring.length<3)continue;
    const base=Number(prism.base)||0,top=Number(prism.top)||0;
    let hitT=null,hitEdge=null;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      const t=edgeT(x0,y0,x1,y1,Number(a?.[0]),Number(a?.[1]),Number(b?.[0]),Number(b?.[1]));
      if(t===null||t<=.001||t>1)continue;
      const z=z0+(z1-z0)*t;
      if(z<base-.08||z>top+.12)continue;
      if(hitT===null||t<hitT){hitT=t;hitEdge=[Number(a[0]),Number(a[1]),Number(b[0]),Number(b[1])];}
    }
    if(hitT===null)continue;
    const dist=hitT*range;
    if(!best||dist<best.t){
      // wall normal (facing the shooter) and the facade coordinates of the hit
      const [ax,ay,bx,by]=hitEdge,ex=bx-ax,ey=by-ay,el=Math.hypot(ex,ey)||1;let nx=ey/el,ny=-ex/el;if(nx*dir[0]+ny*dir[1]>0){nx=-nx;ny=-ny;}
      const point=[x0+dir[0]*dist,y0+dir[1]*dist,z0+dir[2]*dist];
      best={t:dist,point,kind:"wall",normal:[nx,ny,0],surface:"building",wallU:Math.hypot(point[0]-ax,point[1]-ay),wallV:point[2]-base};
    }
  }
  return best;
}
function nearest(list){let best=null;for(const hit of list)if(hit&&(best===null||hit.t<best.t))best=hit;return best;}
export function gatherActors(origin,dir,range){
  const hits=[];
  const push=(t,hit)=>{if(t===null||t===undefined)return;hits.push({...hit,t,point:add(origin,dir,t)});};
  for(const person of nativePeople()){
    if(!person?.alive||person.knocked)continue;
    push(raySphere(origin,dir,[person.x,person.y,1.1],.45,range),{key:`person:${person.id}`,kind:"person",id:person.id});
  }
  for(const cop of liveNativeCops()){
    push(raySphere(origin,dir,[cop.x,cop.y,1.1],.4,range),{key:`cop:${cop.id||`${cop.x.toFixed(1)}:${cop.i}`}`,kind:"cop",cop});
  }
  for(const actor of listNativeThreats()){
    push(raySphere(origin,dir,[actor.x,actor.y,1.1],.4,range),{key:`threat:${actor.id}`,kind:actor.kind,id:actor.id});
  }
  {const an=hitNativeAnimals(origin,dir,range);if(an)hits.push({...an,key:`animal:${an.index}`});}
  // production sandbox enemies (COP / SWAT / HEAVY)
  for(const e of liveNativeSandboxEnemies()){
    push(raySphere(origin,dir,[e.x,e.y,e.z+1.1*e.t.scale],.45*e.t.scale,range),{key:`enemy:${e.id}`,kind:"enemy",id:e.id});
  }
  for(const cow of globalThis.__arondightCows?.list?.()||[]){
    if(cow.dead||cow.hidden||!cow.id)continue;
    push(raySphere(origin,dir,[cow.x,cow.y,.8],.7,range),{key:`cow:${cow.id}`,kind:"cow",id:cow.id});
  }
  for(const drone of globalThis.__arondightWantedSystem?.drones||[]){
    if(!drone?.active)continue;
    push(raySphere(origin,dir,drone.pos,.9,range),{key:`drone:${drone.index}`,kind:"drone",drone});
  }
  for(const car of nativeTraffic()){
    const radius=car.bus?2.4:1.6;
    const t=raySphere(origin,dir,[car.x,car.y,.7],radius,range);
    if(t===null)continue;
    const point=add(origin,dir,t);
    const fx=Math.cos(car.yaw),fy=Math.sin(car.yaw);
    const along=(point[0]-car.x)*fx+(point[1]-car.y)*fy;
    hits.push({key:`car:${car.id}`,kind:car.bus?"bus":"car",id:car.id,t,point,engine:along>=(car.bus?2.1:.85)});
  }
  for(const cruiser of scanReadyCruisers()){
    const t=raySphere(origin,dir,[cruiser.x,cruiser.y,.7],1.8,range);
    if(t===null)continue;
    const point=add(origin,dir,t);
    const fx=Math.cos(cruiser.yaw||0),fy=Math.sin(cruiser.yaw||0);
    hits.push({key:cruiser.key,kind:"cruiser",t,point,engine:(point[0]-cruiser.x)*fx+(point[1]-cruiser.y)*fy>=.85,unit:cruiser.unit});
  }
  hits.sort((a,b)=>a.t-b.t);
  return hits;
}
export function marchRay({origin,direction,range,maxBodies,gather,wallAt}){
  const dir=direction;
  let cursor=origin.slice(),remaining=range,pierced=0,travel=0;
  const struck=new Set(),landed=[];
  while(pierced<maxBodies&&remaining>1){
    const actors=(gather(cursor,dir,remaining)||[]).filter(hit=>hit&&!struck.has(hit.key));
    const actor=nearest(actors);
    const wall=wallAt?wallAt(cursor,dir,remaining):null;
    if(actor&&(wall===null||wall===undefined||actor.t+1e-4<wall.t)){
      struck.add(actor.key);
      landed.push({...actor,muzzle:travel+actor.t});
      const step=actor.t+PIERCE_STEP_M;
      cursor=add(cursor,dir,step);remaining-=step;travel+=step;pierced++;
      continue;
    }
    if(wall){landed.push({...wall,kind:wall.kind||"wall",stop:true,muzzle:travel+wall.t});break;}
    break;
  }
  const last=landed.at(-1);
  const end=last?.point||add(origin,dir,Math.min(range,400));
  return {hits:landed,end,pierced};
}
function coneHit(dir,reach){
  const w=globalThis.__arondightWalkMode,p=w?.position;
  if(!p)return null;
  let fx=dir[0],fy=dir[1],fl=Math.hypot(fx,fy);
  if(fl<1e-4)return null;
  fx/=fl;fy/=fl;
  let best=null,bd=Infinity;
  const consider=(x,y,make,extra=0)=>{
    const dx=x-p.x,dy=y-p.y,d=Math.hypot(dx,dy);
    if(d>reach+extra||d<.05)return;
    if((dx*fx+dy*fy)/d<.76)return;
    if(d<bd){bd=d;best=make(d);}
  };
  for(const a of nativePeople())if(a.alive&&!a.knocked)consider(a.x,a.y,()=>({kind:"person",id:a.id}),.35);
  for(const c of globalThis.__arondightCows?.list?.()||[])if(!c.dead&&!c.hidden&&c.id)consider(c.x,c.y,()=>({kind:"cow",id:c.id}),.8);
  for(const cop of liveNativeCops())consider(cop.x,cop.y,()=>({kind:"cop",cop}),.35);
  for(const e of liveNativeSandboxEnemies())consider(e.x,e.y,()=>({kind:"enemy",id:e.id}),.35);
  return best;
}
function wound(hit,weapon,dir){
  const head=!/car|bus|cruiser|cow|drone/.test(hit.kind)&&isHeadShot(hit.point?.[2]);
  const times=/car|bus|cruiser/.test(hit.kind)?1:(weapon==="glock"||weapon==="sniper"?6:1);
  if(hit.kind==="person"){
    const result=applyPersonDamage(hit.id,{times,each:PERSON_SHOT,head,dir});
    if(head&&result)announceHeadshot({weapon,target:"person"});
    return result;
  }
  if(hit.kind==="cop")return applyCopDamage(hit.cop,head?100:COP_SHOT*times);
  if(hit.kind==="enemy")return damageNativeSandboxEnemy(hit.id,1)?{hit:true}:null;
  if(hit.kind==="animal")return shootNativeAnimal(hit.index,dir)?{hit:true}:null;
  if(hit.kind==="soldier"||hit.kind==="zombie"){
    const result=applyThreatDamage(hit.id,head?100:BODY_SHOT*times);
    if(head&&result)announceHeadshot({weapon,target:hit.kind});
    return result;
  }
  if(hit.kind==="cow")return applyCowDamage(hit.id,BODY_SHOT*times);
  if(hit.kind==="drone"&&hit.drone){
    hit.drone.hp=(hit.drone.hp??100)-DRONE_SHOT*times;
    if(hit.drone.hp<=0)hit.drone.active=false;
    return {hp:hit.drone.hp};
  }
  if(hit.kind==="car"||hit.kind==="bus")return applyVehicleShot(hit.id,vehicleShotDamage(hit.kind,hit.engine,weapon));
  if(hit.kind==="cruiser")return applyCruiserDamage(hit.unit,vehicleShotDamage("cruiser",hit.engine,weapon));
  return null;
}
function markWall(hit,ray){
  if(!hit?.point)return;
  nativeBulletImpact(ray,hit);
}

export function createNativeFootFire(game,{aim,tracer,schedule=null}={}){
  const later=schedule||((fn,ms)=>setTimeout(fn,ms));
  const lastGlock=[-Infinity,-Infinity],lastFist=[-Infinity,-Infinity];
  let lastSniper=-Infinity,lastKnife=-Infinity,knifeSwing=0;
  function wallAt(origin,dir,range){
    const self={foot:"player-foot",car:"player-car",jet:"player-jet"}[game.mode]||"";
    const rigid=game.rigids?.raycast?.(origin,dir,range);
    let best=rigid&&rigid.id!==self?{t:rigid.distanceM,point:rigid.point,id:rigid.id,kind:rigid.kind||"rigid",normal:rigid.normal,surface:rigid.kind&&rigid.kind!=="terrain"?"vehicle":null}:null;
    const prism=firstPrismMeters(game.rigids?.buildingSnapshot?.prisms,origin,dir,range);
    if(prism&&(!best||prism.t<best.t))best=prism;
    return best;
  }
  function shoot(weapon,now,clientX,clientY){
    if(game.mode!=="foot"||globalThis.__arondightPlayerDamageModel?.dead)return false;
    let x=clientX,y=clientY;
    if(weapon==="sniper"&&globalThis.__arondightAds?.scoped){x=undefined;y=undefined;}
    const ray=aim?.(x,y);if(!ray)return false;
    const range=weapon==="sniper"?SNIPER_RANGE_M:weapon==="glock"?GLOCK_RANGE_M:SMG_RANGE_M;
    const bodies=weapon==="smg"?1:GLOCK_PIERCE;
    const marched=marchRay({origin:ray.origin,direction:ray.direction,range,maxBodies:bodies,gather:gatherActors,wallAt});
    const kind=weapon==="sniper"?".50bmg":"9mm";
    const delayOf=hit=>weapon==="sniper"?tracerDelayMs(hit.muzzle??hit.t):0;
    for(const hit of marched.hits){
      const wait=delayOf(hit);
      later(()=>{
        if(hit.stop){markWall(hit,ray);if(hit.id)game.rigids?.applyImpulse?.(hit.id,bulletImpulse(ray.direction,kind),{point:hit.point});return;}
        wound(hit,weapon,ray.direction);
        if(hit.point)nativeBulletImpact(ray,{point:hit.point,surface:/car|bus|cruiser|drone/.test(hit.kind)?"vehicle":"actor"});
      },wait);
    }
    const tail=marched.end;
    tracer?.(ray.origin,tail,game.mode,weapon,weapon==="sniper"?SNIPER_TRACER_MPS:TRACER_MPS);
    if(weapon==="glock"){
      setData("walkGlockShots",(Number(view()?.dataset.walkGlockShots)||0)+1);
      setData("walkGlockPierce",marched.pierced);
      setData("walkGlockRangeM",GLOCK_RANGE_M);
    }
    if(weapon==="sniper"){
      setData("walkSniperShots",(Number(view()?.dataset.walkSniperShots)||0)+1);
      setData("walkSniperTracerMps",SNIPER_TRACER_MPS);
      const car=marched.hits.find(hit=>hit.kind==="car"||hit.kind==="bus"||hit.kind==="cruiser");
      if(car)setData("walkSniperVehicleHit",`${car.kind}:${car.engine?"engine":"body"}`);
    }
    setData("walkWeapon",weapon);
    return true;
  }
  function meleeRay(clientX,clientY,reach){
    const ray=aim?.(clientX,clientY);if(!ray)return null;
    const hits=gatherActors(ray.origin,ray.direction,reach);
    const actor=hits.find(hit=>hit.t<=reach);
    const wall=wallAt(ray.origin,ray.direction,reach);
    if(actor&&(!wall||actor.t<wall.t))return {ray,hit:actor};
    return {ray,hit:null};
  }
  return {
    smg(now,clientX,clientY){return shoot("smg",now,clientX,clientY);},
    glock(now,clientX,clientY,hand=0,hold=false){
      const h=hand===1?1:0;
      if(now-lastGlock[h]<(hold?GLOCK_HOLD_MS:GLOCK_MIN_MS))return false;
      lastGlock[h]=now;
      const ok=shoot("glock",now,clientX,clientY);
      if(ok)setData("walkGlockLastHand",h);
      return ok;
    },
    sniper(now,clientX,clientY){
      if(now-lastSniper<SNIPER_BOLT_MS)return false;
      lastSniper=now;
      return shoot("sniper",now,clientX,clientY);
    },
    fists(now,clientX,clientY,hand=0){
      const h=hand===1?1:0;
      if(game.mode!=="foot"||globalThis.__arondightPlayerDamageModel?.dead)return false;
      if(now-lastFist[h]<FIST_RECOVER_MS[h])return false;
      const combo=now-lastFist[1-h]<COMBO_MS;
      lastFist[h]=now;
      const found=meleeRay(clientX,clientY,PUNCH_REACH_M+.4);
      if(!found)return false;
      const dmg=punchDamage(h,combo),ns=punchMomentum(h,combo),dir=found.ray.direction;
      let landed=found.hit&&found.hit.t<=PUNCH_REACH_M+.4?found.hit:null;
      if(!landed||landed.kind==="wall"){
        const sweep=coneHit(dir,1.25);
        if(!sweep){setData("walkPunch","air");setData("walkPunchCombo",combo?"1":"0");return true;}
        landed={...sweep,t:0,point:null};
      }
      if(landed.kind==="person")applyPersonDamage(landed.id,{melee:true,each:dmg,dir,momentumNs:ns});
      else if(landed.kind==="cow")applyCowDamage(landed.id,Math.round(dmg*.4));
      else if(landed.kind==="cop")applyCopDamage(landed.cop,dmg);
      else if(landed.kind==="enemy")damageNativeSandboxEnemy(landed.id,1);
      else if(landed.kind==="soldier"||landed.kind==="zombie")applyThreatDamage(landed.id,dmg);
      setData("walkPunch",`${landed.kind}@${Number(landed.t||0).toFixed(2)}`);
      setData("walkPunchHand",h?"left":"right");
      setData("walkPunchCombo",combo?"1":"0");
      setData("walkWeapon","fists");
      return true;
    },
    knife(now,clientX,clientY){
      if(game.mode!=="foot"||globalThis.__arondightPlayerDamageModel?.dead)return false;
      if(now-lastKnife<KNIFE_RECOVER_MS)return false;
      lastKnife=now;
      const swing=++knifeSwing;
      const pressed=aim?.(clientX,clientY);
      if(!pressed)return false;
      setData("walkKnifeHitTiming",`strike-frame-${KNIFE_STRIKE_MS}ms-v1`);
      setData("walkWeapon","knife");
      later(()=>{
        if(swing!==knifeSwing||game.mode!=="foot"||globalThis.__arondightPlayerDamageModel?.dead)return;
        const found=meleeRay(clientX,clientY,KNIFE_REACH_M+.3)||{ray:pressed,hit:null};
        let landed=found.hit&&found.hit.t<=KNIFE_REACH_M+.3?found.hit:null;
        const dir=(found.ray||pressed).direction;
        if(!landed){
          const sweep=coneHit(dir,1.2);
          if(!sweep){setData("walkKnife","air");return;}
          landed=sweep;
        }
        if(landed.kind==="person")applyPersonDamage(landed.id,{melee:true,each:KNIFE_DMG,dir,momentumNs:12});
        else if(landed.kind==="cow")applyCowDamage(landed.id,40);
        else if(landed.kind==="cop")applyCopDamage(landed.cop,KNIFE_DMG);
        else if(landed.kind==="enemy")damageNativeSandboxEnemy(landed.id,1);
        else if(landed.kind==="soldier"||landed.kind==="zombie")applyThreatDamage(landed.id,KNIFE_DMG);
        setData("walkKnife",`${landed.kind}@${Number(landed.t||0).toFixed(2)}`);
      },KNIFE_STRIKE_MS);
      return true;
    }
  };
}
