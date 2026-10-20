// Native-only map street ribbons: consistent Box3D ground height, sidewalks,
// asphalt and dashed center markings from real OSM transportation features.
// Retains the stylized street widths and colours of world_city_roads.mjs,
// WITHOUT Three.js geometry, materials, GPU renderer or fallback.
export const NATIVE_ROADS_VERSION="native-osm-road-surfaces-v1";
const WIDTH={motorway:14,trunk:12,primary:11,secondary:9,tertiary:8,minor:6.5,service:4.2,track:3,path:2.2,pedestrian:3.6,raceway:8,busway:7};
const COLOR={asphalt:[.24,.25,.27],major:[.20,.22,.24],curb:[.52,.51,.48],line:[.90,.88,.85],yellow:[.84,.71,.29],path:[.72,.67,.53]};
const SEGMENT_M=6,CHUNK_M=420;
const lines=geometry=>!geometry?[]:geometry.type==="LineString"?[geometry.coordinates]:geometry.type==="MultiLineString"?geometry.coordinates:[];
const finite2=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
const distance=(x,y,cx,cy)=>Math.hypot(x-cx,y-cy);
export function* nativeRoadGeometrySteps(features,{project=null,heightAt=()=>0,center=[0,0],radius=800,chunkSize=CHUNK_M,maxRoads=2500,featuresPerStep=32}={}){
 if(typeof heightAt!=="function"||!(radius>0)||!(chunkSize>0)||!(featuresPerStep>0)||!(maxRoads>0)||!finite2(center))
  throw Error("invalid native road source");
 const buckets=new Map(),roadLines=[],seen=new Set();
 let processed=0,roads=0,triangles=0,skipped=0;
 const bucket=(x,y)=>{
  const key=Math.floor(x/chunkSize)+","+Math.floor(y/chunkSize);
  if(!buckets.has(key))buckets.set(key,{key,p:[],normals:[],colors:[],uvs:[],triangles:0});
  return buckets.get(key);
 };
 const tri=(a,b,c,z,col)=>{
  const batch=bucket((a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3);
  for(const q of[a,b,c]){
   const h=Number(heightAt(q[0],q[1]));if(!Number.isFinite(h))throw Error("invalid Box3D terrain elevation");
   batch.p.push(q[0],q[1],h+z);
   batch.normals.push(0,0,1);batch.colors.push(...col);batch.uvs.push(q[0]*.2,q[1]*.2);
  }
  batch.triangles++;triangles++;
 };
 const quad=(a,b,c,d,z,col)=>{tri(a,b,c,z,col);tri(a,c,d,z,col);};
 const band=(a,b,width,z,color)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  if(len<.05)return;
  const nx=-dy/len*width*.5,ny=dx/len*width*.5,segments=Math.max(1,Math.ceil(len/SEGMENT_M));
  for(let i=0;i<segments;i++){
   const t=i/segments,u=(i+1)/segments;
   const p=[a[0]+dx*t,a[1]+dy*t],q=[a[0]+dx*u,a[1]+dy*u];
   if(Math.min(distance(...p,...center),distance(...q,...center))>radius+SEGMENT_M+width)continue;
   quad([p[0]+nx,p[1]+ny],[p[0]-nx,p[1]-ny],[q[0]-nx,q[1]-ny],[q[0]+nx,q[1]+ny],z,color);
  }
 };
 const marking=(a,b,z,col)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<3)return;
  const ux=dx/len,uy=dy/len;
  for(let t=1;t+3<len;t+=7)band([a[0]+ux*t,a[1]+uy*t],[a[0]+ux*(t+3),a[1]+uy*(t+3)],.18,z,col);
 };
 for(const feature of(Array.isArray(features)?features:[])){
  processed++;
  const cls=String(feature?.properties?.class||feature?.class||"minor").toLowerCase();
  if(/rail|transit|ferry|aerialway/.test(cls)||feature?.properties?.brunnel==="tunnel"){skipped++;continue;}
  const width=WIDTH[cls]??5;
  for(const line of lines(feature?.geometry)){
   const points=line.map(raw=>typeof project==="function"?project(raw[0],raw[1]):raw).filter(finite2);
   if(points.length<2||!points.some(p=>distance(...p,...center)<=radius+150))continue;
   const key=cls+":"+points.map(p=>p.map(x=>Math.round(x)).join(",")).join(";");
   if(seen.has(key))continue;seen.add(key);roads++;
   roadLines.push({cls,w:width,pts:points});
   if(!/path|track|service/.test(cls))for(let i=0;i<points.length-1;i++)band(points[i],points[i+1],width+3.4,.09,COLOR.curb);
   const main=/motorway|trunk|primary|secondary/.test(cls);
   for(let i=0;i<points.length-1;i++){
    band(points[i],points[i+1],width,.112,cls==="path"||cls==="track"?COLOR.path:main?COLOR.major:COLOR.asphalt);
    if(/motorway|trunk|primary|secondary|tertiary/.test(cls))
      marking(points[i],points[i+1],.135,/motorway|trunk/.test(cls)?COLOR.yellow:COLOR.line);
   }
   if(roads>=maxRoads)break;
  }
  if(processed%featuresPerStep===0)yield {processed,roads,triangles,complete:false};
  if(roads>=maxRoads)break;
 }
 return {version:NATIVE_ROADS_VERSION,processed,roads,skipped,triangles,roadLines,
  chunks:[...buckets.values()].map(x=>({
   id:"roads:"+x.key,triangles:x.triangles,
   positions:new Float32Array(x.p),normals:new Float32Array(x.normals),
   colors:new Float32Array(x.colors),uvs:new Float32Array(x.uvs)
  }))};
}
export function buildNativeRoadGeometry(features,options={}){
 const iterator=nativeRoadGeometrySteps(features,options);let result;
 while(!(result=iterator.next()).done){}
 return result.value;
}
