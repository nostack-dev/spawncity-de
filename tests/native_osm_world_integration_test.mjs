import assert from "node:assert/strict";
import {nativeOsmProjector} from "../sim/native_osm_projector.mjs";
import {NativeWorldPresenter} from "../sim/native_world_presenter.mjs";
import {NativeCityStream} from "../sim/native_city_stream.mjs";
import {NativeRoadStream} from "../sim/native_road_stream.mjs";
const origin={lon:9.17,lat:47.66};
const metric=nativeOsmProjector(origin);
assert.deepEqual(metric.project(9.17,47.66),[0,0]);
const east=metric.project(9.1701,47.66)[0];
const north=metric.project(9.17,47.6601)[1];
assert.ok(east>7&&east<8,"true metre conversion at Konstanz latitude");
assert.ok(north>11&&north<12,"true metre conversion at earth radius");
assert.throws(()=>nativeOsmProjector({lon:Infinity,lat:47}),/WGS84/);
const buildings=[{id:"osm-42",properties:{height:14},geometry:{type:"Polygon",coordinates:[[
 [9.17005,47.66005],[9.17022,47.66005],[9.17022,47.66015],[9.17005,47.66015],[9.17005,47.66005]
]]}}];
const roads=[{id:"highway-7",properties:{class:"primary"},geometry:{type:"LineString",coordinates:[
 [9.1698,47.6599],[9.1704,47.6600]
]}}];
const meshes=new Map(),removed=[];
const renderer={
 upsert(id,data){assert.ok(id.startsWith("osm/"));meshes.set(id,data);},
 remove(id){removed.push(id);meshes.delete(id);return true;}
};
const scene=Object.create(NativeWorldPresenter.prototype);
scene.disposed=false;scene.osmOriginKey=null;
scene.city=new NativeCityStream(renderer,{chunkSize:100,buildingsPerStep:8});
scene.roads=new NativeRoadStream(renderer,{heightAt:()=>0,featuresPerStep:8,chunkSize:150,radius:300});
const options={origin,buildings,roads,revision:"source-1",center:[0,0],yieldFrame:()=>Promise.resolve()};
const first=await scene.updateOsmFeatures(options);
assert.equal(first.city.built,1,"real OSM buildings must be rendered from collision footprint geometry");
assert.equal(first.roads.roads,1,"same projection must feed street ribbon geometry");
const cityMesh=[...meshes.entries()].find(([id])=>!id.includes("roads:"))?.[1];
const streetMesh=[...meshes.entries()].find(([id])=>id.includes("roads:"))?.[1];
assert.ok(cityMesh?.positions?.length>0&&streetMesh?.positions?.length>0);
assert.ok([...cityMesh.positions].every(Number.isFinite));
assert.ok([...streetMesh.positions].every(Number.isFinite));
assert.ok(Math.abs(streetMesh.positions[0])>1,"lon/lat degrees were not converted to Box3D metres");
const count=meshes.size;
const second=await scene.updateOsmFeatures(options);
assert.equal(second.city.unchanged,true);
assert.equal(second.roads.unchanged,true);
assert.equal(meshes.size,count);
const nextOrigin={lon:9.17015,lat:47.66};
const third=await scene.updateOsmFeatures({...options,origin:nextOrigin});
assert.notEqual(third.origin,first.origin);
assert.ok(removed.length>=count,"all previous GPS-origin GPU tiles must be evicted");
assert.equal(third.city.built,1);
const movedCity=[...meshes.entries()].find(([id])=>!id.includes("roads:"))?.[1];
assert.ok(movedCity?.positions?.length>0);
assert.notEqual(movedCity.positions[0],cityMesh.positions[0],
 "building geometry must move with the Box3D authoritative origin");
scene.city.dispose();scene.roads.dispose();
assert.equal(meshes.size,0,"one world should release every generated GPU tile");
console.log("native OSM city/roads share actual Box3D metric world projection, cache and GPS rebase");
