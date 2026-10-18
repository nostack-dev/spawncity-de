// Real OpenStreetMap source for the native engine. Only genuine Overpass
// ways; NEVER synthetic buildings/roads, no MapLibre second WebGL context.
// Loads publicly available OSM ways for a selected demo city, or an explicitly
// user-authorized GPS location. Never infers GPS or fabricates geometry.
export const NATIVE_OSM_SOURCE_VERSION="osm-live-vector-features-v1";
const DEFAULT_ENDPOINTS=Object.freeze([
 "https://overpass.private.coffee/api/interpreter",
 "https://overpass-api.de/api/interpreter",
 "https://overpass.osm.jp/api/interpreter"
]);
const metres=400;
const isLL=(lon,lat)=>Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=85;
const finitePair=p=>Array.isArray(p)&&p.length>=2&&isLL(Number(p[0]),Number(p[1]));
const ringKey=p=>p.map(n=>Number(n).toFixed(7)).join(",");
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export function nativeOverpassQuery({lon,lat},radiusM=metres){
 if(!isLL(Number(lon),Number(lat))||!Number.isFinite(radiusM)||radiusM<100||radiusM>1500)
  throw Error("native OSM query requires finite GPS fix and bounded radius");
 return '[out:json][timeout:18];(way["building"](around:'+Math.round(radiusM)+','+Number(lat).toFixed(7)+','+Number(lon).toFixed(7)+');way["highway"](around:'+Math.round(radiusM)+','+Number(lat).toFixed(7)+','+Number(lon).toFixed(7)+'););out geom;';
}
const height=(tags)=>{
 const explicit=parseFloat(String(tags?.height??""));
 const levels=parseInt(String(tags?.["building:levels"]??""),10);
 return Number.isFinite(explicit)&&explicit>.1?clamp(explicit,1,300):
  Number.isFinite(levels)&&levels>0?clamp(levels*3,3,300):8;
};
export function parseNativeOverpass(json,{maxBuildings=1300,maxRoads=800}={}){
 if(!Array.isArray(json?.elements))throw Error("OSM requires actual Overpass JSON");
 const buildings=[],roads=[],seen=new Set();
 for(const e of json.elements){
  if(e?.type!=="way"||!Array.isArray(e.geometry)||!e.geometry.length)continue;
  const tags=e.tags??{},id="osm-way-"+String(e.id);
  if(seen.has(id))continue;
  const coordinates=e.geometry.map(p=>[Number(p.lon),Number(p.lat)]);
  if(!coordinates.every(finitePair))continue;
  const props={...tags};
  if(tags.building&&buildings.length<maxBuildings&&coordinates.length>=4){
   if(ringKey(coordinates[0])!==ringKey(coordinates.at(-1)))continue;
   props.height=height(tags);
   props.min_height=clamp(parseFloat(tags.min_height)||0,0,props.height-.1);
   buildings.push({id,properties:props,geometry:{type:"Polygon",coordinates:[coordinates]}});
   seen.add(id);
  }else if(tags.highway&&roads.length<maxRoads&&coordinates.length>=2){
   props.class=String(tags.highway);
   roads.push({id,properties:props,geometry:{type:"LineString",coordinates}});
   seen.add(id);
  }
 }
 return {buildings,roads,source:"openstreetmap-overpass",synthetic:false};
}
export async function fetchNativeOsm(origin,{fetchImpl=globalThis.fetch,
 endpoints=DEFAULT_ENDPOINTS,timeoutMs=16000,radiusM=metres,signal=null}={}){
 const query=nativeOverpassQuery(origin,radiusM);
 if(typeof fetchImpl!=="function")throw Error("native OSM needs HTTP fetch");
 if(!Array.isArray(endpoints)||!endpoints.length)throw Error("native OSM endpoint missing");
 let error=null;
 for(const endpoint of endpoints){
  if(!/^https:\/\//i.test(endpoint))throw Error("OSM endpoints must use HTTPS");
  const timeout=new AbortController();
  const onAbort=()=>timeout.abort();
  signal?.addEventListener?.("abort",onAbort,{once:true});
  const timer=setTimeout(()=>timeout.abort(),timeoutMs);
  try{
   // A simple GET avoids third-party browser preflight and is cacheable.
   // Never send a GPS fix unless the user selected the location explicitly.
   const url=endpoint+(endpoint.includes("?")?"&":"?")+"data="+encodeURIComponent(query);
   const response=await fetchImpl(url,{method:"GET",signal:timeout.signal});
   if(!response.ok)throw Error("OSM HTTP "+response.status);
   const result=parseNativeOverpass(await response.json());
   if(result.buildings.length===0&&result.roads.length===0)
    throw Error("OSM returned no usable buildings or roads");
   return {...result,origin:{lon:Number(origin.lon),lat:Number(origin.lat)},
    center:[0,0],revision:String(Date.now())};
  }catch(e){error=e;if(signal?.aborted)throw e;}
  finally{clearTimeout(timer);signal?.removeEventListener?.("abort",onAbort);}
 }
 throw new Error("Native OSM unavailable; continuing without fabricated map data",{cause:error});
}
