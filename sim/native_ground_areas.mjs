// Parks, woods, pitches, sand and water areas of the real map as flat ground
// under the streets, with the production palette (world_city_roads.mjs:
// park 0x4f6e35, wood 0x3a5729, water 0x2f5f86, pitch 0x4f7a35, sand
// 0xc9b88f) at the production area height (5 cm, below sidewalks and roads).
import earcut from "./vendor/earcut.mjs";
import {nativeOsmProjector} from "./native_osm_projector.mjs";
export const NATIVE_GROUND_AREAS_VERSION="native-osm-ground-areas-prod-v1";
const hex=h=>[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255];
export const GROUND_AREA_COLORS=Object.freeze({park:hex(0x4f6e35),wood:hex(0x3a5729),water:hex(0x2f5f86),pitch:hex(0x4f7a35),sand:hex(0xc9b88f)});
const Z_AREA=.05,Z_ORDER={park:0,wood:.002,pitch:.004,sand:.004,water:.006},MAX_AREAS=600;
export function nativeAreaClass(tags={}){
  if(tags.natural==="water"||tags.waterway==="riverbank"||tags.water)return "water";
  if(tags.leisure==="pitch"||tags.leisure==="track")return "pitch";
  if(tags.natural==="sand"||tags.natural==="beach"||tags.leisure==="beach_resort")return "sand";
  if(tags.natural==="wood"||tags.landuse==="forest"||tags.natural==="scrub")return "wood";
  if(["park","garden","playground","recreation_ground","dog_park"].includes(tags.leisure)||
     ["grass","recreation_ground","village_green","cemetery","meadow","grassland","allotments"].includes(tags.landuse)||tags.natural==="grassland")return "park";
  return null;
}
export function buildNativeGroundAreas(areas,origin,{heightAt=()=>0}={}){
  const projector=nativeOsmProjector(origin);
  const p=[],n=[],c=[];let count=0;
  for(const area of (areas||[]).slice(0,MAX_AREAS)){
    const cls=area.class||nativeAreaClass(area.properties||{});if(!cls)continue;
    const ring=area.geometry?.coordinates?.[0];if(!Array.isArray(ring)||ring.length<4)continue;
    const pts=ring.slice(0,-1).map(q=>projector.project(q[0],q[1]));
    const flat=pts.flat(),tri=earcut(flat,null,2);if(!tri.length)continue;
    let cx=0,cy=0;for(const q of pts){cx+=q[0]/pts.length;cy+=q[1]/pts.length;}
    const z=(Number(heightAt(cx,cy))||0)+Z_AREA+(Z_ORDER[cls]||0),col=GROUND_AREA_COLORS[cls];
    for(let i=0;i<tri.length;i+=3){
      const a=pts[tri[i]],b=pts[tri[i+1]],d=pts[tri[i+2]];
      const cross=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);
      const order=cross>=0?[a,b,d]:[a,d,b];
      for(const v of order){p.push(v[0],v[1],z);n.push(0,0,1);c.push(...col);}
    }
    count++;
  }
  return {count,positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c)};
}
export function installNativeGroundAreas(game,snapshot){
  const renderer=game?.world?.renderer;if(!renderer?.upsert||!snapshot?.origin)return 0;
  const terrain=game.world?.terrain;
  const mesh=buildNativeGroundAreas(snapshot.areas,snapshot.origin,{heightAt:(x,y)=>terrain?.heightAt?.(x,y)??0});
  if(!mesh.positions.length){renderer.remove?.("world/ground-areas");return 0;}
  renderer.upsert("world/ground-areas",{positions:mesh.positions,normals:mesh.normals,colors:mesh.colors,material:{color:[1,1,1,1],castShadow:false}});
  return mesh.count;
}
