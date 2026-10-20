import assert from "node:assert/strict";
import {nativeOverpassQuery,parseNativeOverpass,fetchNativeOsm,NATIVE_DEMO_CITY} from "../sim/native_osm_source.mjs";
const origin={lon:9.17,lat:47.66};
assert.equal(NATIVE_DEMO_CITY.name,"Konstanz (real OpenStreetMap)");
assert.equal(NATIVE_DEMO_CITY.origin.lat,47.66022);
assert.equal(NATIVE_DEMO_CITY.origin.lon,9.17442);
assert.notEqual(NATIVE_DEMO_CITY.origin,origin,"demo city must never impersonate live GPS");
assert.ok(nativeOverpassQuery(NATIVE_DEMO_CITY.origin).includes("47.6602200"),
 "demo must request actual OSM data for its announced WGS84 centre");

assert.match(nativeOverpassQuery(origin),/way\["building"\]/);
assert.match(nativeOverpassQuery(origin),/way\["highway"\]/);
assert.throws(()=>nativeOverpassQuery({lon:NaN,lat:44}),/GPS/);
const poly=[{lon:9.17,lat:47.66},{lon:9.1701,lat:47.66},
 {lon:9.1701,lat:47.6601},{lon:9.17,lat:47.6601},{lon:9.17,lat:47.66}];
const way={type:"way",id:123,tags:{building:"yes","building:levels":"4"},geometry:poly};
const road={type:"way",id:223,tags:{highway:"primary"},geometry:poly.slice(0,3)};
const fixture={elements:[way,{...way},road,{type:"node",id:1,lon:9,lat:47},
 {type:"way",id:444,tags:{building:"yes"},geometry:poly.slice(0,2)}]};
const parsed=parseNativeOverpass(fixture);
assert.equal(parsed.buildings.length,1);
assert.equal(parsed.roads.length,1);
assert.equal(parsed.buildings[0].properties.height,12);
assert.equal(parsed.roads[0].properties.class,"primary");
assert.equal(parsed.synthetic,false);
assert.equal(parsed.buildings[0].geometry.type,"Polygon");
assert.equal(parsed.roads[0].geometry.type,"LineString");
assert.throws(()=>parseNativeOverpass({elements:null}),/Overpass/);
let requests=0;
const mock=async(url,{method,signal})=>{
 requests++;assert.equal(method,"GET");assert.ok(url.includes("?data="));
 assert.ok(decodeURIComponent(url.split("?data=")[1]).includes('way["building"]'));
 assert.ok(signal instanceof AbortSignal);
 if(url.includes("/one?"))return {ok:false,status:503};
 return {ok:true,json:async()=>fixture};
};
const loaded=await fetchNativeOsm(origin,{endpoints:["https://example.org/one","https://example.org/two"],
 fetchImpl:mock,timeoutMs:200});
assert.equal(requests,2,"real provider fallback should preserve game despite one outage");
assert.equal(loaded.origin.lon,9.17);
assert.equal(loaded.buildings.length,1);
assert.equal(loaded.roads.length,1);
assert.equal(loaded.synthetic,false);
assert.equal(loaded.source,"openstreetmap-overpass");
assert.throws(()=>nativeOverpassQuery(origin,3000),/radius/);
await assert.rejects(()=>fetchNativeOsm(origin,{endpoints:["http://localhost"],fetchImpl:mock}),/HTTPS/);
await assert.rejects(()=>fetchNativeOsm(origin,{endpoints:["https://example.org/one"],fetchImpl:mock}),/unavailable/);
await assert.rejects(()=>fetchNativeOsm(origin,{
 endpoints:["https://example.org/empty"],fetchImpl:async()=>({ok:true,json:async()=>({elements:[]})})
}),/unavailable/);
assert.equal(parseNativeOverpass({elements:[]}).buildings.length,0);


const snapshot={
 origin:NATIVE_DEMO_CITY.origin,source:"openstreetmap-api-0.6",
 retrievedAt:"2026-10-18T08:00:00+00:00",synthetic:false,elements:[way,road]
};
let localRequests=0;
const local=async(url,opts)=>{
 localRequests++;
 assert.equal(url,"./osm/demo-konstanz.json");
 assert.equal(opts.method,"GET");
 assert.equal(opts.cache,"no-store");
 return {ok:true,json:async()=>snapshot};
};
const demo=await fetchNativeOsm(NATIVE_DEMO_CITY.origin,{
 snapshotUrl:"./osm/demo-konstanz.json",fetchImpl:local
});
assert.equal(localRequests,1,"Demo must not call third-party Overpass");
assert.equal(demo.buildings.length,1);
assert.equal(demo.roads.length,1);
assert.equal(demo.source,"openstreetmap-api-0.6-snapshot");
assert.equal(demo.synthetic,false);
assert.equal(demo.retrievedAt,snapshot.retrievedAt);
await assert.rejects(()=>fetchNativeOsm(origin,{
 snapshotUrl:"./osm/demo-konstanz.json",fetchImpl:local
}),/exact announced demo/);
await assert.rejects(()=>fetchNativeOsm(NATIVE_DEMO_CITY.origin,{
 snapshotUrl:"https://example.org/forge.json",fetchImpl:local
}),/same-origin/);
await assert.rejects(()=>fetchNativeOsm(NATIVE_DEMO_CITY.origin,{
 snapshotUrl:"./osm/demo-konstanz.json",
 fetchImpl:async()=>({ok:true,json:async()=>({...snapshot,synthetic:true})})
}),/provenance/);
await assert.rejects(()=>fetchNativeOsm(NATIVE_DEMO_CITY.origin,{
 snapshotUrl:"./osm/demo-konstanz.json",
 fetchImpl:async()=>({ok:false,status:404})
}),/HTTP 404/);

console.log("native game fetches genuine same-origin OSM demo and never substitutes fabricated city");
