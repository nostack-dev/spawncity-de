// Native WebGL2 city geometry from the exact OSM footprint shape already used
// by Box3D collision. No Three.js mesh/material, no MapLibre GPU pass.
// Polygon roofing (concave + holes) uses in-repo ISC Earcut v3.0.2.
import earcut,{deviation as earcutDeviation} from "./vendor/earcut.mjs";
export const NATIVE_CITY_GEOMETRY_VERSION="osm-city-chunks-webgl2-v1";
const WALLS=[[.79,.75,.68],[.72,.66,.55],[.56,.33,.27],[.61,.60,.58],[.85,.82,.76],[.66,.49,.37],[.49,.52,.57],[.80,.72,.60]];
const ROOFS=[[.29,.30,.32],[.23,.24,.25],[.43,.26,.20],[.33,.34,.36]];
const area=ring=>ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0)*.5;
const hash=text=>{let n=2166136261;for(const c of String(text)){n=Math.imul(n^c.charCodeAt(0),16777619);}return n>>>0;};
function cleanRing(input){
 const ring=[];
 for(const p of input||[]){
  if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))continue;
  const prev=ring.at(-1);
  if(!prev||Math.hypot(p[0]-prev[0],p[1]-prev[1])>.015)ring.push([p[0],p[1]]);
 }
 if(ring.length>2&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<.015)ring.pop();
 return ring.length>=3&&Math.abs(area(ring))>.08?ring:[];
}
function appendTriangle(batch,a,b,c,normal,color,uvA,uvB,uvC){
 const pairs=[[a,uvA],[b,uvB],[c,uvC]];
 for(const [point,uv]of pairs){
  batch.p.push(...point);batch.n.push(...normal);batch.col.push(...color);batch.uv.push(...uv);
 }
}
export function* nativeCityChunkSteps(footprints,{chunkSize=320,maxBuildings=2600,buildingsPerStep=24,damageTop=null}={}){
 if(!(chunkSize>=20)||!(buildingsPerStep>=1)||!(maxBuildings>0))throw Error("invalid city geometry budget");
 const chunks=new Map(),skipped=[];let built=0,processed=0,triangles=0;
 for(const fp of(Array.isArray(footprints)?footprints:[]).slice(0,maxBuildings)){
  processed++;
  const outer=cleanRing(fp.outer),holes=(fp.holes||[]).map(cleanRing);
  let reject="";
  if(!outer.length||holes.some(h=>!h.length))reject="invalid polygon ring";
  const base=Number(fp.base)||0,fullTop=Number(fp.top)||8,damaged=typeof damageTop==="function"?Number(damageTop(fp)):NaN;
  const top=Number.isFinite(damaged)?Math.min(fullTop,damaged):fullTop,wallHeight=top-base;
  if(!(wallHeight>.1))reject="collapsed building";
  let corners=[],holeStarts=[],flat=[],tri=[];
  if(!reject){
   const oriented=[area(outer)>0?outer:[...outer].reverse(),...holes.map(h=>area(h)<0?h:[...h].reverse())];
   corners=oriented.flat();let offset=0;
   for(let i=0;i<oriented.length;i++){
    if(i)holeStarts.push(offset);
    for(const point of oriented[i])flat.push(point[0],point[1]);
    offset+=oriented[i].length;
   }
   tri=earcut(flat,holeStarts,2);
   if(!tri.length||earcutDeviation(flat,holeStarts,2,tri)>.007)reject="roof triangulation failed";
   if(!reject){
    const center=fp.center||outer[0],x=Math.floor(center[0]/chunkSize),y=Math.floor(center[1]/chunkSize),key=x+","+y;
    let batch=chunks.get(key);
    if(!batch){batch={key,p:[],n:[],col:[],uv:[],buildings:0,triangles:0};chunks.set(key,batch);}
    const h=hash(fp.key||key),wallColor=WALLS[h%WALLS.length],roofColor=ROOFS[(h>>>8)%ROOFS.length];
    // All roof faces point up even when the source polygon's ring orientation
    // is reversed. A courtyard is a real hole, never roofed over.
    for(let i=0;i<tri.length;i+=3){
     const a=corners[tri[i]],b=corners[tri[i+1]],c=corners[tri[i+2]];
     const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
     if(Math.abs(cross)<.01)continue;
     const xyz=[a,b,c].map(p=>[p[0],p[1],top]);
     const order=cross>0?[0,1,2]:[0,2,1];
     appendTriangle(batch,xyz[order[0]],xyz[order[1]],xyz[order[2]],[0,0,1],roofColor,
       [a[0],a[1]],[cross>0?b[0]:c[0],cross>0?b[1]:c[1]],[cross>0?c[0]:b[0],cross>0?c[1]:b[1]]);
     batch.triangles++;triangles++;
    }
    for(const ring of oriented)for(let i=0;i<ring.length;i++){
     const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
     if(len<.02)continue;
     const normal=[dy/len,-dx/len,0],a0=[a[0],a[1],base],b0=[b[0],b[1],base],a1=[a[0],a[1],top],b1=[b[0],b[1],top];
     appendTriangle(batch,a0,b0,b1,normal,wallColor,[0,0],[len,0],[len,wallHeight]);
     appendTriangle(batch,a0,b1,a1,normal,wallColor,[0,0],[len,wallHeight],[0,wallHeight]);
     batch.triangles+=2;triangles+=2;
    }
    batch.buildings++;built++;
   }
  }
  if(reject)skipped.push({key:String(fp.key||""),reason:reject});
  if(processed%buildingsPerStep===0)yield {processed,built,triangles,complete:false};
 }
 const out=[...chunks.values()].map(batch=>({
  id:"city:"+batch.key,buildings:batch.buildings,triangles:batch.triangles,
  positions:new Float32Array(batch.p),normals:new Float32Array(batch.n),
  colors:new Float32Array(batch.col),uvs:new Float32Array(batch.uv)
 }));
 return {version:NATIVE_CITY_GEOMETRY_VERSION,chunks:out,processed,built,skipped,triangles};
}
export function buildNativeCityGeometry(footprints,options={}){
 const it=nativeCityChunkSteps(footprints,options);let result;
 while(!(result=it.next()).done){}
 return result.value;
}
