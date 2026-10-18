import assert from "node:assert/strict";
import {nativeBuildingCollisionSnapshot,syncNativeBuildingCollisions} from "../sim/native_building_collision_bridge.mjs";
import {nativeOsmProjector} from "../sim/native_osm_projector.mjs";
const origin={lon:9.17,lat:47.66},project=nativeOsmProjector(origin);
const ll=(x,y)=>[origin.lon+x/(6378137*Math.PI/180*Math.cos(origin.lat*Math.PI/180)),
 origin.lat+y/(6378137*Math.PI/180)];
const ring=(x,y,w,h)=>[ll(x,y),ll(x+w,y),ll(x+w,y+h),ll(x,y+h),ll(x,y)];
const features=[
 {id:"house",properties:{height:12,min_height:0},geometry:{type:"Polygon",coordinates:[ring(20,0,14,10)]}},
 {id:"courtyard",properties:{height:17},geometry:{type:"Polygon",
  coordinates:[ring(-18,0,12,12),ring(-15,3,6,6)]}},
 {id:"far-away",properties:{height:9},geometry:{type:"Polygon",coordinates:[ring(3000,0,10,10)]}}
];
const p=nativeBuildingCollisionSnapshot(features,{origin});
assert.equal(p.footprintCount,2,"far OSM houses must not exceed real collision radius");
assert.ok(p.prismCount>=2,"both the house and courtyard must have solid convex hulls");
assert.equal(p.originKey,project.key);
assert.ok(p.prisms.every(x=>x.points.length<=24&&x.top>x.base));
assert.equal(nativeBuildingCollisionSnapshot([...features].reverse(),{origin}).hash,p.hash,
 "OSM tile order must never change physical building identity");
assert.throws(()=>nativeBuildingCollisionSnapshot([], {origin:{lon:Infinity,lat:0}}),/origin/);
const calls=[];
let a={hash:"",prismCount:0,prisms:[]},b={hash:"",prismCount:0,prisms:[]};
const flight={get worldBuildingCollisionSnapshot(){return a;},setWorldBuildingCollisions(next){calls.push("flight");a=next;return true;}};
const rigids={get buildingSnapshot(){return b;},syncBuildings(next){calls.push("rigids");b=next;return true;}};
assert.equal(syncNativeBuildingCollisions({flight,rigids},p).prismCount,p.prismCount);
assert.equal(a.hash,b.hash);
assert.deepEqual(calls,["flight","rigids"]);
const before=a,beforeB=b;
rigids.syncBuildings=next=>{if(next.hash===p.hash)throw Error("simulated rigid world collision failure");b=next;return true;};
assert.throws(()=>syncNativeBuildingCollisions({flight,rigids},p),/simulated/);
assert.equal(a.hash,before.hash,"1 kHz flight colliders rolled back");
assert.equal(b.hash,beforeB.hash,"60 Hz vehicle colliders rolled back");
assert.throws(()=>syncNativeBuildingCollisions({flight:null,rigids},p),/BOTH/);
console.log("native OSM uses ONE geometry source for visible buildings and both Box3D collision worlds");
