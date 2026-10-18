import assert from "node:assert/strict";
import {chooseNativeStreetSpawn} from "../sim/native_street_spawn.mjs";
import {buildingLaunchPointClear} from "../sim/world_building_collision_physics.mjs";
// Unit geometries test the real WGS84 metres conversion. Public preview CI
// separately checks an actual downloaded Konstanz OSM polygon snapshot.
const origin={lon:9.17442,lat:47.66022};
const K=6378137*Math.PI/180,C=Math.cos(origin.lat*Math.PI/180);
const ll=(x,y)=>[origin.lon+x/(K*C),origin.lat+y/K];
const way=(id,type,points)=>({id,properties:{class:type},geometry:{type:"LineString",coordinates:points.map(p=>ll(...p))}});
const building={buildingKey:"nearby-osm",base:0,top:17,points:[[-4,-4],[8,-4],[8,7],[-4,7]]};
const collisions={prisms:[building],prismCount:1,hash:"osm"};
const roads=[
 way("closed", "pedestrian", [[1,-2],[1,4]]), // inside real Box3D footprint
 way("footstreet","pedestrian",[[12,18],[35,16]]),
 way("carroad","residential",[[40,-7],[65,-7]]),
 way("elevator","elevator",[[4,15],[5,27]])
];
const original=[1.2,1.95];
const foot=chooseNativeStreetSpawn(roads,collisions,{origin,from:original,kind:"foot"});
assert.ok(foot&&foot.source==="openstreetmap-way");
assert.equal(foot.wayId,"footstreet");
assert.ok(foot.distanceM>8&&foot.distanceM<45);
assert.equal(buildingLaunchPointClear(collisions,foot.position,{clearanceM:1.15}),true);
assert.ok(Number.isFinite(foot.yaw));
assert.ok(foot.openDistanceScore>0,"road heading must be checked ahead for buildings");
const car=chooseNativeStreetSpawn(roads,collisions,{origin,from:original,kind:"car"});
assert.equal(car.wayId,"carroad","Box3D car must not spawn on a foot-only pedestrian road");
assert.equal(buildingLaunchPointClear(collisions,car.position,{clearanceM:2.6}),true);
assert.equal(chooseNativeStreetSpawn([] ,collisions,{origin,from:original}),null,
 "no OSM data: never invent a street");
assert.equal(chooseNativeStreetSpawn(roads,collisions,{origin,from:[10000,10000],maxDistanceM:80}),null);
assert.throws(()=>chooseNativeStreetSpawn(null,collisions,{origin,from:original}),/real OSM roads/);
assert.throws(()=>chooseNativeStreetSpawn(roads,collisions,{origin,from:original,kind:"jet"}),/unknown actor/);
const reversal=chooseNativeStreetSpawn([...roads].reverse(),collisions,{origin,from:original,kind:"foot"});
assert.equal(reversal.wayId,foot.wayId,"deterministic street launch independent of OSM network response order");
assert.ok(Math.abs(reversal.yaw-foot.yaw)<1e-9);
console.log("native FPS: map the original Box3D foot actor to a genuinely clear OSM pedestrian street, with real-road orientation");
