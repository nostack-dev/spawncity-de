// Initial native foot/car entry from ACTUAL OSM street geometry, not a
// physically-clear-but-invisible medieval courtyard surrounded by walls.
// The authoritative Box3D buildings and renderer use the same metric XY.
import {nativeOsmProjector} from "./native_osm_projector.mjs";
import {buildingLaunchPointClear} from "./world_building_collision_physics.mjs";
export const NATIVE_OSM_STREET_SPAWN_VERSION="native-real-osm-street-v1";
const FOOT_WAYS=new Set(["pedestrian","footway","living_street","residential","service","primary","secondary",
 "tertiary","unclassified","path","cycleway"]);
const CAR_WAYS=new Set(["living_street","residential","service","primary","secondary","tertiary","unclassified"]);
const finite2=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
export function chooseNativeStreetSpawn(roads,snapshot,{origin,from,kind="foot",maxDistanceM=120}={}){
 if(!Array.isArray(roads)||!Array.isArray(snapshot?.prisms)||!finite2(from)||!(maxDistanceM>0))
  throw Error("native street spawn needs real OSM roads and Box3D collision prisms");
 if(kind!=="foot"&&kind!=="car")throw Error("native street spawn unknown actor");
 const allowed=kind==="foot"?FOOT_WAYS:CAR_WAYS;
 const clearanceM=kind==="foot"?1.15:2.6;
 const projector=nativeOsmProjector(origin),choices=[];
 for(const road of roads){
  const type=String(road?.properties?.class??road?.properties?.highway??"");
  if(!allowed.has(type)||road?.geometry?.type!=="LineString")continue;
  const coordinates=road.geometry.coordinates;
  if(!Array.isArray(coordinates)||coordinates.length<2)continue;
  let points;
  try{
   points=coordinates.map(p=>projector.project(p[0],p[1]));
  }catch{continue;}
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   if(length<4||!Number.isFinite(length))continue;
   const u=clamp(((from[0]-a[0])*dx+(from[1]-a[1])*dy)/(length*length),0,1);
   // Test the exact measured street centre, not an invented road offset.
   const p=[a[0]+u*dx,a[1]+u*dy],dist=Math.hypot(p[0]-from[0],p[1]-from[1]);
   if(dist>maxDistanceM||!buildingLaunchPointClear(snapshot,p,{clearanceM}))continue;
   // Which direction is genuinely open? Sample the same collision prisms
   // along both street directions. A medieval alley terminating in a wall
   // must not become the default straight-ahead first-person screenshot.
   const forward=[dx/length,dy/length];
   const pathScore=sign=>{
    let score=0;
    for(const distance of [3,6,10,15,22]){
     const q=[p[0]+sign*forward[0]*distance,p[1]+sign*forward[1]*distance];
     if(!buildingLaunchPointClear(snapshot,q,{clearanceM:Math.min(.9,clearanceM)}))break;
     score+=distance;
    }
    return score;
   };
   const pos=pathScore(1),neg=pathScore(-1),sign=pos>=neg?1:-1;
   const yaw=Math.atan2(sign*dx,sign*dy);
   // Avoid choosing a tiny courtyard stub over the through-street.
   const visibility=Math.max(pos,neg);
   choices.push({position:p,yaw,kind,source:"openstreetmap-way",wayId:String(road.id),
    distanceM:dist,openDistanceScore:visibility,roadClass:type,
    score:dist+Math.max(0,45-visibility)*.7+15/Math.max(6,length)});
  }
 }
 choices.sort((a,b)=>a.score-b.score||a.wayId.localeCompare(b.wayId));
 return choices[0]??null;
}
