import assert from "node:assert/strict";
import {nativeOverpassQuery,parseNativeOverpass,fetchNativeOsm} from "../sim/native_osm_source.mjs";
const origin={lon:9.17,lat:47.66};
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
const mock=async(endpoint,{method,body})=>{
 requests++;assert.equal(method,"POST");assert.ok(body.startsWith("data="));
 if(endpoint.endsWith("/one"))return {ok:false,status:503};
 return {ok:true,json:async()=>fixture};
};
const loaded=await fetchNativeOsm(origin,{endpoints:["https://example.org/one","https://example.org/two"],
 fetchImpl:mock,timeoutMs:200});
assert.equal(requests,2,"real provider fallback should preserve game despite one outage");
assert.equal(loaded.origin.lon,9.17);
assert.equal(loaded.buildings.length,1);
assert.equal(loaded.roads.length,1);
assert.equal(loaded.synthetic,false);
assert.throws(()=>nativeOverpassQuery(origin,3000),/radius/);
await assert.rejects(()=>fetchNativeOsm(origin,{endpoints:["http://localhost"],fetchImpl:mock}),/HTTPS/);
await assert.rejects(()=>fetchNativeOsm(origin,{endpoints:["https://example.org/one"],fetchImpl:mock}),/unavailable/);
console.log("native game fetches actual OSM geometry and never substitutes a fabricated city");
