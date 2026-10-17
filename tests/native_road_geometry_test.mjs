import assert from "node:assert/strict";
import {buildNativeRoadGeometry,nativeRoadGeometrySteps} from "../sim/native_road_geometry.mjs";
const ground=(x,y)=>x*.01+y*.007;
const features=[
 {properties:{class:"primary"},geometry:{type:"LineString",coordinates:[[0,0],[32,0]]}},
 {properties:{class:"minor"},geometry:{type:"MultiLineString",coordinates:[[[2,12],[2,42]],[[22,12],[42,12]]]}}
];
const result=buildNativeRoadGeometry(features,{heightAt:ground,radius:180,center:[0,0],chunkSize:100});
assert.equal(result.roads,3);
assert.ok(result.triangles>50);
assert.equal(result.chunks.length,1);
const m=result.chunks[0];
assert.equal(m.positions.length/3*3,m.normals.length);
assert.equal(m.positions.length,m.colors.length);
assert.equal(m.uvs.length,m.positions.length/3*2);
assert.equal(m.triangles,m.positions.length/9);
let raisedRoad=0,raisedSidewalk=0,raisedPaint=0;
for(let i=0;i<m.positions.length;i+=3){
 const x=m.positions[i],y=m.positions[i+1],z=m.positions[i+2],delta=z-ground(x,y);
 if(Math.abs(delta-.112)<1e-5)raisedRoad++;
 if(Math.abs(delta-.09)<1e-5)raisedSidewalk++;
 if(Math.abs(delta-.135)<1e-5)raisedPaint++;
 assert.equal(m.normals[i],0);assert.equal(m.normals[i+1],0);assert.equal(m.normals[i+2],1);
}
assert.ok(raisedRoad>40);assert.ok(raisedSidewalk>10);assert.ok(raisedPaint>0);
const generator=nativeRoadGeometrySteps(features,{heightAt:ground,featuresPerStep:1});
assert.equal(generator.next().value.complete,false);
assert.equal(generator.next().value.complete,false);
const complete=generator.next();
assert.equal(complete.done,true);assert.equal(complete.value.roads,3);
const withProject=buildNativeRoadGeometry([{properties:{class:"path"},geometry:{type:"LineString",coordinates:[[0,0],[.0001,0]]}}],{
  project:(lon,lat)=>[lon*100000,lat*100000],heightAt:ground,center:[0,0]});
assert.ok(withProject.triangles>0);
assert.throws(()=>buildNativeRoadGeometry(features,{radius:0}),/invalid native road/);
console.log(JSON.stringify({nativeRoadGeometry:true,features:result.processed,roadLines:result.roads,triangles:result.triangles,
 sidewalks:raisedSidewalk,asphalt:raisedRoad,paint:raisedPaint}));
