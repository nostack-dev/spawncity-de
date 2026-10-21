// The live city, on native. People are the original pedestrian_agents.
// Cars ride the original traffic routes. No invented crowd.
import {buildTrafficRoute} from "./world_traffic_routes.mjs";
import {createPedestrianNetwork,seedRouteAgents,stepAgent,frighten,provoke} from "./pedestrian_agents.mjs";
import {NativePedestrianVisuals} from "./native_pedestrian_visuals.mjs";
import {NativeStreetLamps} from "./native_street_lamps.mjs";
import {ORIGINAL_SEDAN} from "./native_original_vehicles.mjs";
import {fromTRS} from "./native_render_math.mjs";
import {NATIVE_DEMO_CITY} from "./native_osm_source.mjs";

const PERSON_CAP=100,CAR_CAP=36,CAR_SPEED=8;
let net=null,people=[],cars=[],visuals=null,lamps=null,last=0,drawnCars=false,routes=[];
const yawQuat=y=>[0,0,Math.sin(y*.5),Math.cos(y*.5)];
function playerPos(){
  const w=globalThis.__arondightWalkMode,p=w?.position;
  if(p)return [p.x,p.y,p.z||1];
  const pose=globalThis.__arondightNativeGame?.flight?.position?.();
  return pose?[pose[0],pose[1],pose[2]]:[0,0,2];
}
export function installNativeCityLife(game,snapshot){
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
    people.push(...seedRouteAgents(route,{spacingM:16,cap:8,salt:"native"}));
  }
  people=people.slice(0,PERSON_CAP);
  cars=routes.slice(0,CAR_CAP).map((route,i)=>({
    id:`traffic-${i}`,route,s:(i+.3)/CAR_CAP*route.length,dir:i%2?1:-1,speed:CAR_SPEED*(.7+.4*(i%5)/5)
  }));
  visuals=new NativePedestrianVisuals(game.world.renderer,{people:()=>people.filter(a=>a.alive&&!a.knocked).map(a=>({id:a.id,x:a.x,y:a.y,z:0,yaw:a.yaw}))},{maxPeople:PERSON_CAP});
  last=performance.now();
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
  best.hp=(best.hp??100)-34;
  const reaction=provoke(best,performance.now(),{shot:true,by:{x:origin[0],y:origin[1]}});
  if(best.hp<=0){best.alive=false;best.knocked=true;}
  frightenAround(best.x,best.y,16,performance.now(),1.2);
  globalThis.__arondightWantedSystem?.reportCrime?.({id:`person-${best.id}-${Math.round(performance.now())}`,kind:"person-hit",severity:1});
  return {id:best.id,point:[origin[0]+dir[0]*bestT,origin[1]+dir[1]*bestT,origin[2]+dir[2]*bestT],reaction};
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
  if(!net)return;
  const dt=Math.min(.05,Math.max(0,(now-(last||now))/1000));last=now;
  const p=playerPos();
  for(const a of people)if(a.alive&&!a.knocked)stepAgent(a,dt,now,net);
  if(Math.random()<.02){const x=p[0],y=p[1];for(const a of people)if(a.alive&&Math.hypot(a.x-x,a.y-y)<28)frighten(a,x,y,now,{strength:.4});}
  visuals?.update();
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const data=[];
  for(const car of cars){
    car.s+=car.dir*car.speed*dt;
    if(car.s<0||car.s>car.route.length)car.dir*=-1;
    const at=pointOn(car.route,car.s);if(!at)continue;
    data.push(...fromTRS([at.x,at.y,.45],yawQuat(at.yaw),[1,1,1]));
  }
  if(!data.length){if(drawnCars){renderer.remove("traffic/cars");drawnCars=false;}return;}
  const transforms=new Float32Array(data);
  if(!drawnCars){renderer.upsert("traffic/cars",{...ORIGINAL_SEDAN,instances:{transforms},material:{doubleSided:true,castShadow:false}});drawnCars=true;}
  else renderer.updateInstances("traffic/cars",{transforms});
}
