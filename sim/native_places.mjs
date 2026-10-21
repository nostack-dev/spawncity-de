// A 3-lap race and the tow truck. Laps and tow speeds are the live ones.
// Walkable buildings (doors, interiors, barricades, globalThis.__buildingInteriors)
// live in native_building_interiors.mjs (production building_interiors.mjs).
import {ORIGINAL_SEDAN} from "./native_original_vehicles.mjs";
import {fromTRS} from "./native_render_math.mjs";

const SPAWN_MIN=170,SPAWN_MAX=320,HOOK_M=7.5,TOW_SPEED=9,DRIVE_SPEED=14;
const yawQuat=y=>[0,0,Math.sin(y*.5),Math.cos(y*.5)];
let race=null,truck=null,drawn={},activeGame=null,placesKeys=false;
const RACE_LAPS=3;
function player(){const p=globalThis.__arondightWalkMode?.position;return p?[p.x,p.y]:[0,0];}
function paint(renderer,id,geo,data){
  if(!data.length){if(drawn[id]){renderer.remove(id);drawn[id]=false;}return;}
  const transforms=new Float32Array(data);
  if(drawn[id])renderer.updateInstances(id,{transforms});
  else{renderer.upsert(id,{...geo,instances:{transforms},material:{doubleSided:true,castShadow:false}});drawn[id]=true;}
}
export function installNativePlaces(game,snapshot){
  const origin=snapshot?.origin;if(!origin||!game)return;
  activeGame=game;
  const routes=globalThis.__arondightProceduralPopulation?.roads?.()||[];
  const loop=routes.slice().sort((a,b)=>b.length-a.length)[0];
  if(loop)race={route:loop,lap:0,s:0,best:Infinity,started:false};
  globalThis.__arondightRace={version:"native-race-v1",laps:RACE_LAPS,get lap(){return race?.lap||0;}};
  globalThis.__towService={version:"tow-truck-dispatch-v1",dispatch(){return spawnTruck();}};
  if(!placesKeys){placesKeys=true;addEventListener("keydown",onPlaceKey);}
  return {race:Boolean(race)};
}
function onPlaceKey(e){
  const game=activeGame;if(!game||e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.target?.closest?.("input,textarea,select,[contenteditable=true]"))return;
  const menu=document.getElementById("gameMenu");
  if((menu&&!menu.hidden)||document.querySelector("dialog[open],#quitConfirmDialog,#worldOptionsPanel:not([hidden]),#changelogPanel:not([hidden])"))return;
  if(e.code==="KeyR"&&game.mode==="car"&&race&&!race.started){race.started=true;race.lap=0;race.armed=true;return;}
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
