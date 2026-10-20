// Enterable buildings, a 3-lap race and the tow truck.
// Door size, laps and tow speeds are the live ones.
import {ORIGINAL_SEDAN} from "./native_original_vehicles.mjs";
import {fromTRS} from "./native_render_math.mjs";

const DOOR_W=1.8,DOORS_R=95,RACE_LAPS=3;
const SPAWN_MIN=170,SPAWN_MAX=320,HOOK_M=7.5,TOW_SPEED=9,DRIVE_SPEED=14;
const EARTH=6378137;
const toMeters=(lon0,lat0,lon,lat)=>[(lon-lon0)*Math.PI/180*EARTH*Math.max(.01,Math.cos(lat0*Math.PI/180)),(lat-lat0)*Math.PI/180*EARTH];
const yawQuat=y=>[0,0,Math.sin(y*.5),Math.cos(y*.5)];
let doors=[],race=null,truck=null,inside=null,drawn={};
function player(){const p=globalThis.__arondightWalkMode?.position;return p?[p.x,p.y]:[0,0];}
function paint(renderer,id,geo,data){
  if(!data.length){if(drawn[id]){renderer.remove(id);drawn[id]=false;}return;}
  const transforms=new Float32Array(data);
  if(drawn[id])renderer.updateInstances(id,{transforms});
  else{renderer.upsert(id,{...geo,instances:{transforms},material:{doubleSided:true,castShadow:false}});drawn[id]=true;}
}
function doorMesh(){
  const p=[],n=[],c=[];
  const add=(a,b,d,e)=>{for(const q of [a,b,d,a,d,e]){p.push(...q);n.push(0,0,1);c.push(.35,.28,.18);}};
  add([-.9,-.04,0],[.9,-.04,0],[.9,.04,2.55],[-.9,.04,2.55]);
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
const DOOR=doorMesh();
export function installNativePlaces(game,snapshot){
  const origin=snapshot?.origin;if(!origin)return;
  doors=[];
  for(const b of snapshot.buildings||[]){
    const ring=b.geometry?.coordinates?.[0];if(!ring||ring.length<4)continue;
    const pts=ring.map(([lon,lat])=>toMeters(origin.lon,origin.lat,lon,lat));
    let best=null,len=0;
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],c=pts[i+1],dx=c[0]-a[0],dy=c[1]-a[1],d=Math.hypot(dx,dy);
      if(d>len&&d>DOOR_W+1.4){len=d;best={a,c,dx:dx/d,dy:dy/d};}
    }
    if(!best)continue;
    const mid=[(best.a[0]+best.c[0])/2,(best.a[1]+best.c[1])/2];
    const cx=pts.reduce((s,q)=>s+q[0],0)/pts.length,cy=pts.reduce((s,q)=>s+q[1],0)/pts.length;
    doors.push({x:mid[0],y:mid[1],yaw:Math.atan2(best.dy,best.dx),in:[cx,cy]});
    if(doors.length>=80)break;
  }
  const routes=globalThis.__arondightProceduralPopulation?.roads?.()||[];
  const loop=routes.slice().sort((a,b)=>b.length-a.length)[0];
  if(loop)race={route:loop,lap:0,s:0,best:Infinity,started:false};
  globalThis.__buildingInteriors={version:"walkable-buildings-v1",doors:()=>doors,PLANKS:6};
  globalThis.__arondightRace={version:"native-race-v1",laps:RACE_LAPS,get lap(){return race?.lap||0;}};
  globalThis.__towService={version:"tow-truck-dispatch-v1",dispatch(){return spawnTruck();}};
  addEventListener("keydown",e=>{
    if(e.code==="KeyR"&&race&&!race.started){race.started=true;race.lap=0;race.armed=true;return;}
    const p=player();
    if(inside){game.rigids.setPose("player-foot",{position:[inside.x,inside.y,1]});inside=null;return;}
    const door=doors.find(d=>Math.hypot(d.x-p[0],d.y-p[1])<2.4);
    if(!door)return;
    inside={x:p[0],y:p[1]};
    game.rigids.setPose("player-foot",{position:[door.in[0],door.in[1],1]});
  });
  return {doors:doors.length,race:Boolean(race)};
}
function spawnTruck(){
  if(truck)return true;
  const p=player(),a=Math.random()*Math.PI*2,r=SPAWN_MIN+Math.random()*(SPAWN_MAX-SPAWN_MIN);
  truck={x:p[0]+Math.cos(a)*r,y:p[1]+Math.sin(a)*r,state:"drive"};
  return true;
}
export function tickNativePlaces(game,now=performance.now()){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const p=player();
  const near=doors.filter(d=>Math.hypot(d.x-p[0],d.y-p[1])<DOORS_R).slice(0,24);
  paint(renderer,"places/doors",DOOR,near.flatMap(d=>[...fromTRS([d.x,d.y,0],yawQuat(d.yaw),[1,1,1])]));
  if(race?.started){
    const car=game.rigids.pose("player-car");
    if(car?.position){
      const seg=race.route.segments[0];
      if(seg&&Math.hypot(car.position[0]-seg.a[0],car.position[1]-seg.a[1])<8){
        if(race.armed){race.lap++;race.armed=false;if(race.lap>=RACE_LAPS){race.started=false;race.lap=RACE_LAPS;}}
      }else race.armed=true;
    }
  }
  if(game.mode==="car"&&!truck){
    const car=game.rigids.pose("player-car");
    if(car&&Math.hypot(...(car.velocity||[0,0,0]))<.4&&Math.abs(game.carInput?.pedal||0)>.5)spawnTruck();
  }
  if(truck){
    const target=game.mode==="car"?game.rigids.pose("player-car")?.position:null;
    const tx=target?.[0]??p[0],ty=target?.[1]??p[1];
    const dx=tx-truck.x,dy=ty-truck.y,d=Math.hypot(dx,dy)||1;
    const speed=d<HOOK_M?TOW_SPEED:DRIVE_SPEED;
    truck.x+=dx/d*speed/60;truck.y+=dy/d*speed/60;
    if(d<HOOK_M&&target){game.rigids.setPose("player-car",{position:[tx+dx/d*2,ty+dy/d*2,.9]});truck=null;}
    paint(renderer,"places/tow",ORIGINAL_SEDAN,truck?[...fromTRS([truck.x,truck.y,.5],yawQuat(Math.atan2(dy,dx)),[1.2,1,1])]:[]);
  }
}
