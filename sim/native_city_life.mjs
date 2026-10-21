// The live city, on native. People are the original pedestrian_agents.
// Cars ride the original traffic routes. No invented crowd.
import {buildTrafficRoute} from "./world_traffic_routes.mjs";
import {createPedestrianNetwork,seedRouteAgents,stepAgent,frighten,provoke,projectOnRoute} from "./pedestrian_agents.mjs";
import {NativePedestrianVisuals} from "./native_pedestrian_visuals.mjs";
import {NativeStreetLamps} from "./native_street_lamps.mjs";
import {ORIGINAL_SEDAN} from "./native_original_vehicles.mjs";
import {fromTRS} from "./native_render_math.mjs";
import {NATIVE_DEMO_CITY} from "./native_osm_source.mjs";
import {isCriticalDamage,criticalDetonationAt,accelerateCriticalDetonation} from "./critical_damage_logic.mjs";
import {installNativeRagdoll,spawnNativeRagdoll,tickNativeRagdoll} from "./native_ragdoll.mjs";

const PERSON_CAP=100,CAR_CAP=42,BUS_CAP=8,CAR_SPEED=8;
let net=null,people=[],cars=[],visuals=null,lamps=null,last=0,drawnCars=false,routes=[],carBooms=[],carSmokeAt=0;
const yawQuat=y=>[0,0,Math.sin(y*.5),Math.cos(y*.5)];
function playerPos(){
  const w=globalThis.__arondightWalkMode,p=w?.position;
  if(p)return [p.x,p.y,p.z||1];
  const pose=globalThis.__arondightNativeGame?.flight?.position?.();
  return pose?[pose[0],pose[1],pose[2]]:[0,0,2];
}
export function installNativeCityLife(game,snapshot){
  installNativeRagdoll(game);
  const origin=snapshot?.origin||NATIVE_DEMO_CITY.origin;
  routes=[];
  for(const road of snapshot?.roads||[]){
    const path=road.geometry?.coordinates;
    const route=buildTrafficRoute(path,{originLon:origin.lon,originLat:origin.lat,roadClass:road.properties?.class||"road"});
    if(route)routes.push(route);
  }
  if(!routes.length)return {people:0,cars:0};
  net=createPedestrianNetwork();
  net.sync(routes);
  lamps=new NativeStreetLamps(game.world.renderer,{heightAt:()=>0});
  const lampRoads=routes.map(route=>({cls:route.roadClass,pts:route.points,w:6}));
  const lampCount=lamps.setRoads(lampRoads);
  people=[];
  for(const route of routes){
    if(people.length>=PERSON_CAP)break;
    people.push(...seedRouteAgents(route,{spacingM:14,cap:30,salt:"native"}));
  }
  people=people.slice(0,PERSON_CAP);
  cars=routes.slice(0,CAR_CAP).map((route,i)=>({
    id:`traffic-${i}`,route,s:(i+.3)/CAR_CAP*route.length,dir:i%2?1:-1,speed:CAR_SPEED*(.7+.4*(i%5)/5),bus:i<BUS_CAP,alive:true,hits:0,structure:i<BUS_CAP?4:3,
    hp:i<BUS_CAP?320:180,maxHp:i<BUS_CAP?320:180,criticalAt:0
  }));
  visuals=new NativePedestrianVisuals(game.world.renderer,{people:()=>people.filter(a=>a.alive&&!a.knocked).map(a=>({id:a.id,x:a.x,y:a.y,z:0,yaw:a.yaw}))},{maxPeople:PERSON_CAP});
  last=performance.now();
  globalThis.__streetLamps={lamps:()=>lamps?.points||[]};
  globalThis.__arondightProceduralPopulation={
    people:()=>people,
    roads:()=>routes,
    knockdown(id){const a=people.find(p=>p.id===id);if(!a||!a.alive)return null;a.alive=false;a.knocked=true;globalThis.__arondightWantedSystem?.reportCrime?.({id:`person-${id}`,kind:"person-hit",severity:1});return "down";}
  };
  return {people:people.length,cars:cars.length,routes:routes.length,lamps:lampCount};
}
function pointOn(route,s){
  const seg=route.segments.find(g=>s>=g.start&&s<=g.start+g.d)||route.segments.at(-1);
  if(!seg)return null;
  const t=Math.max(0,Math.min(1,(s-seg.start)/seg.d));
  return {x:seg.a[0]+seg.dx*t,y:seg.a[1]+seg.dy*t,yaw:Math.atan2(seg.dy,seg.dx)};
}
export function nativePeople(){return people;}
export function nativeTraffic(){
  const out=[];
  for(const car of cars){
    if(!car.alive)continue;
    const at=pointOn(car.route,car.s);if(!at)continue;
    out.push({id:car.id,bus:car.bus,x:at.x,y:at.y,z:.45,yaw:at.yaw,hp:car.hp,maxHp:car.maxHp});
  }
  return out;
}
export function takeNativeCarBooms(){return carBooms.splice(0);}
function dropPerson(a,impulse,fatal){
  if(!a||a.down)return;
  a.down=true;a.knocked=true;a.v=0;
  if(fatal)a.alive=false;
  spawnNativeRagdoll({
    position:[a.x,a.y,(Number(a.z)||0)+.05],yaw:(Number(a.yaw)||0)-Math.PI/2,
    impulse,seed:a.id,id:a.id,
    recover:fatal?null:{onUp:({x,y,yaw})=>{
      a.down=false;
      if(!a.alive||a.removed)return;
      a.knocked=false;a.x=x;a.y=y;
      if(Number.isFinite(yaw))a.yaw=yaw;
      if(Array.isArray(a.legs))a.legs.length=0;
      a.leader=null;a.state="wait";a.waitUntil=performance.now()+600;
      const route=net?.get?.(a.route);
      if(route){const j=projectOnRoute(route,x,y,{});if(Number.isFinite(j?.s))a.s=j.s;}
    }}
  });
}
function shotImpulse(dir){
  const hx=Number(dir?.[0])||0,hy=Number(dir?.[1])||0,h=Math.hypot(hx,hy)||1;
  return [hx/h*2.6,hy/h*2.6,1.7];
}
export function applyPersonDamage(id,{times=1,each=34,head=false,dir=[0,1,0],melee=false,momentumNs=30}={}){
  const a=people.find(p=>p.id===id);
  if(!a||!a.alive||a.knocked)return null;
  if(melee){
    a.hp=(Number.isFinite(a.hp)?a.hp:100)-each;
    const hd=Math.hypot(dir[0],dir[1])||1,k=Math.max(.5,momentumNs/30);
    let result="hit";
    if(a.hp<=0){a.alive=false;a.knocked=true;result="dead";}
    else if(a.hp<=35){a.knocked=true;a.v=0;result="down";}
    else{const step=Math.min(.6,.22*k);a.x+=dir[0]/hd*step;a.y+=dir[1]/hd*step;a.v=0;provoke(a,performance.now(),{punched:true});}
    frightenAround(a.x,a.y,12,performance.now(),1);
    globalThis.__arondightWantedSystem?.reportCrime?.({id:`assault-${id}-${Math.round(performance.now())}`,kind:result==="dead"?"person":"person-hit",severity:1});
    if(result!=="hit"){
      const push=result==="dead"?1.8:2;
      dropPerson(a,[dir[0]/hd*push*k,dir[1]/hd*push*k,result==="dead"?.8:.9],result==="dead");
    }
    return {result,hp:a.hp};
  }
  const shot=head?100:each;let applied=0;
  for(let i=0;i<Math.max(1,times);i++){
    if(!a.alive||a.knocked)break;
    a.hp=(Number.isFinite(a.hp)?a.hp:100)-shot;applied++;
    if(a.hp<=0){a.alive=false;a.knocked=true;}
  }
  const fatal=!a.alive;
  if(!fatal){a.knocked=true;a.v=0;}
  dropPerson(a,shotImpulse(dir),fatal);
  provoke(a,performance.now(),{shot:true,by:{x:a.x-(dir[0]||0),y:a.y-(dir[1]||0)}});
  frightenAround(a.x,a.y,16,performance.now(),1.2);
  globalThis.__arondightWantedSystem?.reportCrime?.({id:`person-${id}-${Math.round(performance.now())}`,kind:"person-hit",severity:1});
  return {result:fatal?"dead":"down",hp:a.hp,applied};
}
export function applyVehicleShot(id,amount){
  const car=cars.find(c=>c.id===id&&c.alive);if(!car||!(amount>0))return null;
  car.hp=(Number.isFinite(car.hp)?car.hp:car.maxHp)-amount;
  const kind=car.bus?"bus":"car";
  if(isCriticalDamage(kind,car.hp,car.maxHp)){
    const now=performance.now();
    car.criticalAt=car.criticalAt?accelerateCriticalDetonation(kind,car.criticalAt,now):criticalDetonationAt(kind,now);
  }
  return {hp:car.hp,critical:Boolean(car.criticalAt),kind};
}
export function hitNativePeople(origin,dir,range){
  if(!people.length)return null;
  let best=null,bestT=range;
  for(const a of people){
    if(!a.alive||a.knocked)continue;
    const ox=a.x-origin[0],oy=a.y-origin[1],oz=1.1-origin[2];
    const t=ox*dir[0]+oy*dir[1]+oz*dir[2];
    if(t<0||t>bestT)continue;
    const px=origin[0]+dir[0]*t-a.x,py=origin[1]+dir[1]*t-a.y,pz=origin[2]+dir[2]*t-1.1;
    if(px*px+py*py+pz*pz<.45*.45){best=a;bestT=t;}
  }
  if(!best)return null;
  const hit=applyPersonDamage(best.id,{times:1,each:34,dir});
  return {id:best.id,point:[origin[0]+dir[0]*bestT,origin[1]+dir[1]*bestT,origin[2]+dir[2]*bestT],reaction:hit?.result};
}
function frightenAround(x,y,radius,now,strength=1){
  for(const a of people){
    if(!a.alive||a.knocked)continue;
    const d=Math.hypot(a.x-x,a.y-y);
    if(d<radius)frighten(a,x,y,now,{strength:strength*(1-d/radius*.5)});
  }
}
if(typeof window!=="undefined"){
  addEventListener("arondight:weapon-fired",()=>{
    const p=playerPos();frightenAround(p[0],p[1],10,performance.now(),1);
  });
}
export function tickNativeCityLife(game,now=performance.now()){
  tickNativeRagdoll(game,now);
  if(!net)return;
  const dt=Math.min(.05,Math.max(0,(now-(last||now))/1000));last=now;
  const p=playerPos();
  for(const a of people)if(a.alive&&!a.knocked)stepAgent(a,dt,now,net);
  if(Math.random()<.02){const x=p[0],y=p[1];for(const a of people)if(a.alive&&Math.hypot(a.x-x,a.y-y)<28)frighten(a,x,y,now,{strength:.4});}
  visuals?.update();
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const data=[];
  for(const car of cars){
    if(!car.alive)continue;
    if(car.criticalAt&&now>=car.criticalAt){
      car.alive=false;car.criticalAt=0;
      const at=pointOn(car.route,car.s);
      if(at)carBooms.push({id:car.id,x:at.x,y:at.y,z:.6});
      continue;
    }
    car.s+=car.dir*car.speed*dt;
    if(car.s<0||car.s>car.route.length)car.dir*=-1;
    const at=pointOn(car.route,car.s);if(!at)continue;
    if(car.criticalAt&&now-carSmokeAt>180){carSmokeAt=now;game?.world?.effects?.emit?.({kind:"smoke",position:[at.x,at.y,1.1],velocity:[0,0,.8],lifeMs:700,size:.4});}
    data.push(...fromTRS([at.x,at.y,.45],yawQuat(at.yaw),car.bus?[1.6,3.2,1]:[1,1,1]));
  }
  if(!data.length){if(drawnCars){renderer.remove("traffic/cars");drawnCars=false;}return;}
  const transforms=new Float32Array(data);
  if(!drawnCars){renderer.upsert("traffic/cars",{...ORIGINAL_SEDAN,instances:{transforms},material:{doubleSided:true,castShadow:false}});drawnCars=true;}
  else renderer.updateInstances("traffic/cars",{transforms});
}
export function blastNativeCity(center,radius,falloff,exposure){
  const carsOut=[];
  for(const person of people){
    if(!person.alive||person.knocked)continue;
    const dist=Math.hypot(person.x-center[0],person.y-center[1],1.1-(center[2]||0));
    if(dist>=radius)continue;
    const f=falloff(dist)*(exposure?.(person.x,person.y,1.1)??1);
    if(f<=.22)continue;
    applyPersonDamage(person.id,{times:1,each:34,dir:[person.x-center[0],person.y-center[1],0]});
  }
  for(const car of cars){
    if(!car.alive)continue;
    const at=pointOn(car.route,car.s);if(!at)continue;
    const dist=Math.hypot(at.x-center[0],at.y-center[1],.45-(center[2]||0));
    if(dist>=radius)continue;
    const f=falloff(dist)*(exposure?.(at.x,at.y,.45)??1);
    const hits=Math.min(5,Math.ceil(f*(car.bus?4:3)));
    if(!hits)continue;
    car.hits+=hits;
    if(car.hits>=car.structure){car.alive=false;carsOut.push({id:car.id,x:at.x,y:at.y,z:.6});}
  }
  return {cars:carsOut};
}
