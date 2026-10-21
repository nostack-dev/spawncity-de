import assert from "node:assert/strict";
import {buildingFootprintsFromFeatures} from "../sim/world_building_collisions.mjs";
import {buildNativeCityGeometry,nativeCityChunkSteps,NATIVE_CITY_GEOMETRY_VERSION} from "../sim/native_city_geometry.mjs";
const outer=[[0,0],[12,0],[12,12],[0,12],[0,0]];
const courtyard=[[3,3],[3,7],[7,7],[7,3],[3,3]];
const concave=[[25,0],[35,0],[35,3],[28,3],[28,12],[25,12],[25,0]];
const features=[
 {id:101,properties:{height:16},geometry:{type:"Polygon",coordinates:[outer,courtyard]}},
 {id:202,properties:{height:9,min_height:2},geometry:{type:"Polygon",coordinates:[concave]}}
];
const footprints=buildingFootprintsFromFeatures(features,{center:[16,6],radiusM:300});
assert.equal(footprints.length,2);
const scene=buildNativeCityGeometry(footprints,{chunkSize:100,cornice:false});
assert.equal(scene.version,NATIVE_CITY_GEOMETRY_VERSION);
assert.equal(scene.built,2);
assert.equal(scene.skipped.length,0);
assert.equal(scene.chunks.length,1);
const mesh=scene.chunks[0];
assert.equal(mesh.positions.length,mesh.normals.length);
assert.equal(mesh.colors.length,mesh.positions.length);
assert.equal(mesh.uvs.length,mesh.positions.length/3*2);
assert.equal(mesh.triangles,mesh.positions.length/9);
assert.ok(mesh.triangles>20);
let roofArea=0,wallTriangles=0,roofTriangles=0;
const p=mesh.positions,n=mesh.normals;
for(let i=0;i<p.length;i+=9){
 if(n[i+2]>.8){
  roofTriangles++;
  const a=[p[i],p[i+1]],b=[p[i+3],p[i+4]],c=[p[i+6],p[i+7]];
  roofArea+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
  assert.ok(Math.abs(p[i+2]-p[i+5])<.001&&Math.abs(p[i+5]-p[i+8])<.001);
 }else{
  wallTriangles++;
  assert.ok(Math.abs(n[i+2])<.001);
 }
}
const expectedRoof=(12*12-4*4)+(10*3+3*9);
assert.ok(Math.abs(roofArea-expectedRoof)<.01,"roof must preserve courtyard holes and concave L shape: "+roofArea);
assert.equal(wallTriangles,2*(4+4+6));
const damaged=buildNativeCityGeometry(footprints,{chunkSize:100,cornice:false,damageTop:fp=>fp.top-3});
assert.ok(Math.max(...damaged.chunks[0].positions.filter((v,i)=>i%3===2))<=13.00001);
const steps=nativeCityChunkSteps(footprints,{chunkSize:100,buildingsPerStep:1});
assert.equal(steps.next().value.complete,false);
assert.equal(steps.next().value.complete,false);
assert.equal(steps.next().value.built,2);
assert.throws(()=>buildNativeCityGeometry(footprints,{chunkSize:1}),/budget/);
const bad=buildNativeCityGeometry([{key:"bad",outer:[[0,0],[0,0],[0,0]],base:0,top:8}]);
assert.equal(bad.built,0);assert.equal(bad.skipped.length,1);
console.log("Native OSM city geometry: courtyard roofs, concave footprints, wall normals, damage heights and deterministic GPU buffers passed.");

// Production facades: every vertex carries the world_city_buildings.mjs facade
// record (wall length / -1 roof / -2 cornice, height, seed, storey height),
// and the default build adds the production cornice trim.
{
 const full=buildNativeCityGeometry(footprints,{chunkSize:100}).chunks[0];
 assert.equal(full.facade.length,full.positions.length/3*4);
 const kinds=new Set();for(let i=0;i<full.facade.length;i+=4)kinds.add(full.facade[i]>0?"wall":String(full.facade[i]));
 assert.deepEqual([...kinds].sort(),["-1","-2","wall"]);
 for(let i=0;i<full.facade.length;i+=4){assert.ok(full.facade[i+2]>=0&&full.facade[i+2]<1);assert.ok(full.facade[i+3]>=3.1&&full.facade[i+3]<=3.6);}
 assert.ok(Math.max(...full.positions.filter((v,i)=>i%3===2))<=16.001,"cornice never rises above the collision roof");
}
console.log("Native OSM city geometry: production facade records and cornice");
