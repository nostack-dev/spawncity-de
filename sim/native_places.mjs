// Enterable buildings. (The race is native_race.mjs, the tow truck
// native_tow_service.mjs.)
import {fromTRS} from "./native_render_math.mjs";

const GROUND_STOREY=4,MAX_LEVELS=12;
function levelsFor(height){
  const top=Math.max(3,Number(height)||8),levels=[1];
  let z=GROUND_STOREY;
  while(z+2.7<=top-.05&&levels.length<MAX_LEVELS){levels.push(z);z+=3;}
  return levels;
}
const EARTH=6378137;
const toMeters=(lon0,lat0,lon,lat)=>[(lon-lon0)*Math.PI/180*EARTH*Math.max(.01,Math.cos(lat0*Math.PI/180)),(lat-lat0)*Math.PI/180*EARTH];
const yawQuat=y=>[0,0,Math.sin(y*.5),Math.cos(y*.5)];
let doors=[],inside=null,drawn={},activeGame=null,placesKeys=false;
const DOOR_W=1.8,DOORS_R=95;
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
  const origin=snapshot?.origin;if(!origin||!game)return;
  activeGame=game;
  doors=[];
  for(const b of snapshot.buildings||[]){
    const ring=b.geometry?.coordinates?.[0];if(!ring||ring.length<4)continue;
    const pts=[];
    for(const p of ring){if(Array.isArray(p)&&p.length>=2)pts.push(toMeters(origin.lon,origin.lat,Number(p[0]),Number(p[1])));}
    if(pts.length<4)continue;
    let best=null,len=0;
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],c=pts[i+1],dx=c[0]-a[0],dy=c[1]-a[1],d=Math.hypot(dx,dy);
      if(d>len&&d>DOOR_W+1.4){len=d;best={a,c,dx:dx/d,dy:dy/d};}
    }
    if(!best)continue;
    const mid=[(best.a[0]+best.c[0])/2,(best.a[1]+best.c[1])/2];
    const cx=pts.reduce((s,q)=>s+q[0],0)/pts.length,cy=pts.reduce((s,q)=>s+q[1],0)/pts.length;
    const height=Number(b.properties?.height)||8;
    doors.push({x:mid[0],y:mid[1],yaw:Math.atan2(best.dy,best.dx),in:[cx,cy],levels:levelsFor(height),ring:pts});
    if(doors.length>=80)break;
  }
  globalThis.__buildingInteriors={version:"walkable-buildings-v1",doors:()=>doors,PLANKS:6};
  if(!placesKeys){placesKeys=true;addEventListener("keydown",onPlaceKey);}
  return {doors:doors.length};
}
function onPlaceKey(e){
  const game=activeGame;if(!game||e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.target?.closest?.("input,textarea,select,[contenteditable=true]"))return;
  const menu=document.getElementById("gameMenu");
  if((menu&&!menu.hidden)||document.querySelector("dialog[open],#quitConfirmDialog,#worldOptionsPanel:not([hidden]),#changelogPanel:not([hidden])"))return;
  // Production interact is E. Every other key is flight, look or a weapon — never a door.
  if(e.code!=="KeyE")return;
  const p=player();
  if(inside){game.rigids.setPose("player-foot",{position:[inside.x,inside.y,1]});inside=null;e.preventDefault();return;}
  const door=doors.find(d=>Math.hypot(d.x-p[0],d.y-p[1])<2.4);
  if(!door)return;
  inside={x:p[0],y:p[1]};
  door.floor=Math.min((door.floor||0)+1,door.levels.length-1);
  const z=door.levels[door.floor];
  game.rigids.setPose("player-foot",{position:[door.in[0],door.in[1],z]});
  e.preventDefault();
}
export function tickNativePlaces(game,now=performance.now()){
  const renderer=game?.world?.renderer;if(!renderer?.upsert)return;
  const p=player();
  const near=doors.filter(d=>Math.hypot(d.x-p[0],d.y-p[1])<DOORS_R).slice(0,24);
  paint(renderer,"places/doors",DOOR,near.flatMap(d=>[...fromTRS([d.x,d.y,0],yawQuat(d.yaw),[1,1,1])]));
  if(inside){
    const floor=fromTRS([inside.x,inside.y,0],[0,0,0,1],[8,.2,8]);
    const walls=[fromTRS([inside.x,inside.y+4,1.5],[0,0,0,1],[8,3,.2]),fromTRS([inside.x,inside.y-4,1.5],[0,0,0,1],[8,3,.2])];
    paint(renderer,"places/interior",DOOR,[...floor,...walls.flat()]);
  }else renderer.remove("places/interior");
}
