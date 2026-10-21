// Native WebGL2 city geometry from the exact OSM footprint shape already used
// by Box3D collision. No Three.js mesh/material, no MapLibre GPU pass.
// Polygon roofing (concave + holes) uses in-repo ISC Earcut v3.0.2.
import earcut,{deviation as earcutDeviation} from "./vendor/earcut.mjs";
export const NATIVE_CITY_GEOMETRY_VERSION="osm-city-chunks-webgl2-v2-production-facades";
const WALLS=[[.788,.749,.682],[.725,.659,.549],[.557,.329,.263],[.612,.604,.580],[.847,.824,.769],[.659,.486,.373],[.490,.522,.565],[.796,.718,.604]];
const ROOFS=[[.290,.298,.314],[.231,.239,.251],[.431,.263,.204],[.333,.345,.361]];
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
// Per-vertex facade record, the production world_city_buildings.mjs "aWall"
// contract: (wall length, building height, per-building seed, storey height).
// Length > 0 marks a wall, -1 a roof, -2 the cornice trim. u (metres along the
// wall) and z (metres above the building base) travel in the UVs.
let facadeRecord=[0,0,0,3.3];
function appendTriangle(batch,a,b,c,normal,color,uvA,uvB,uvC){
 const pairs=[[a,uvA],[b,uvB],[c,uvC]];
 for(const [point,uv]of pairs){
  batch.p.push(...point);batch.n.push(...normal);batch.col.push(...color);batch.uv.push(...uv);batch.fac.push(...facadeRecord);
 }
}
const TRIM=[.957,.937,.894];
const lerp3=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function* nativeCityChunkSteps(footprints,{chunkSize=320,maxBuildings=2600,buildingsPerStep=24,damageTop=null,cornice=true}={}){
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
    if(!batch){batch={key,p:[],n:[],col:[],uv:[],fac:[],buildings:0,triangles:0};chunks.set(key,batch);}
    const h=hash(fp.key||key),wallColor=WALLS[h%WALLS.length],roofColor=ROOFS[(h>>>8)%ROOFS.length];
    // Same seed and storey height as production facadeParams(key).
    const seed=(h%997)/997,floorH=3.1+.5*(((h>>>12)%1000)/1000),trim=lerp3(wallColor,TRIM,.45);
    facadeRecord=[-1,wallHeight,seed,floorH];
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
     facadeRecord=[len,wallHeight,seed,floorH];
     appendTriangle(batch,a0,b0,b1,normal,wallColor,[0,0],[len,0],[len,wallHeight]);
     appendTriangle(batch,a0,b1,a1,normal,wallColor,[0,0],[len,wallHeight],[0,wallHeight]);
     // Cornice: the production outset trim band and lip along every wall top.
     if(cornice&&len>1.2&&wallHeight>3.5){
      const o=.24,ax=a[0]+normal[0]*o,ay=a[1]+normal[1]*o,bx=b[0]+normal[0]*o,by=b[1]+normal[1]*o,z0=top-.55,z1=top;
      facadeRecord=[-2,wallHeight,seed,floorH];
      appendTriangle(batch,[ax,ay,z0],[bx,by,z0],[bx,by,z1],normal,trim,[0,0],[len,0],[len,1]);
      appendTriangle(batch,[ax,ay,z0],[bx,by,z1],[ax,ay,z1],normal,trim,[0,0],[len,1],[0,1]);
      appendTriangle(batch,[a[0],a[1],z1],[ax,ay,z1],[bx,by,z1],[0,0,1],trim,[0,0],[0,0],[0,0]);
      appendTriangle(batch,[a[0],a[1],z1],[bx,by,z1],[b[0],b[1],z1],[0,0,1],trim,[0,0],[0,0],[0,0]);
      appendTriangle(batch,[ax,ay,z0],[a[0],a[1],z0],[b[0],b[1],z0],[0,0,-1],trim,[0,0],[0,0],[0,0]);
      appendTriangle(batch,[ax,ay,z0],[b[0],b[1],z0],[bx,by,z0],[0,0,-1],trim,[0,0],[0,0],[0,0]);
      batch.triangles+=6;triangles+=6;
     }
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
  colors:new Float32Array(batch.col),uvs:new Float32Array(batch.uv),facade:new Float32Array(batch.fac)
 }));
 return {version:NATIVE_CITY_GEOMETRY_VERSION,chunks:out,processed,built,skipped,triangles};
}
export function buildNativeCityGeometry(footprints,options={}){
 const it=nativeCityChunkSteps(footprints,options);let result;
 while(!(result=it.next()).done){}
 return result.value;
}
