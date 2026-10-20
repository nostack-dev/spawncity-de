// Sole native street visuals, sharing Box3D road/terrain elevation.
// Real OSM transportation feature cache with deterministic GPU chunk IDs,
// frame-budgeted upload and explicit invalidation after terrain changes.
// No Three.js rendering or geometry fallback.
import {nativeRoadGeometrySteps} from "./native_road_geometry.mjs";
import {packCityMesh} from "./native_city_indexed.mjs";
export const NATIVE_ROAD_STREAM_VERSION="native-osm-road-stream-v1";
const defaultFrame=()=>typeof requestAnimationFrame==="function"?new Promise(r=>requestAnimationFrame(r)):Promise.resolve();
function hashMesh(m){
 let h=2166136261;
 for(const v of[m.positions,m.normals,m.colors,m.uvs]){
  const ints=new Uint32Array(v.buffer,v.byteOffset,v.length);
  for(const k of ints)h=Math.imul(h^k,16777619)>>>0;
 }
 return h;
}
export class NativeRoadStream{
 constructor(renderer,{heightAt,project=null,uploadsPerFrame=2,featuresPerStep=24,radius=850,chunkSize=420}={}){
  if(!renderer?.upsert||!renderer?.remove||typeof heightAt!=="function")throw Error("native road renderer and Box3D height required");
  if(!(uploadsPerFrame>=1)||!(featuresPerStep>=1))throw Error("invalid road upload budget");
  this.renderer=renderer;this.options={heightAt,project,featuresPerStep,radius,chunkSize};
  this.uploadsPerFrame=uploadsPerFrame;this.live=new Map();this.generation=0;
  this.lastRevision=null;this.lastCenter=null;this.dirty=true;this.disposed=false;
 }
 invalidate(){this.generation++;this.dirty=true;}
 async ingest(features,{center=[0,0],revision="",yieldFrame=defaultFrame}={}){
  if(this.disposed)throw Error("native road stream disposed");
  if(!Array.isArray(features)||typeof yieldFrame!=="function")throw Error("invalid native road stream input");
  const movement=this.lastCenter?Math.hypot(center[0]-this.lastCenter[0],center[1]-this.lastCenter[1]):Infinity;
  if(!this.dirty&&revision===this.lastRevision&&movement<200)return {unchanged:true,uploaded:0,removed:0,chunks:this.live.size};
  const serial=++this.generation;
  const iterator=nativeRoadGeometrySteps(features,{...this.options,center});
  let result=iterator.next();
  while(!result.done){
    await yieldFrame();
    if(this.disposed||serial!==this.generation)return {cancelled:true};
    result=iterator.next();
  }
  const required=new Set();
  let uploaded=0,removed=0,bytesSaved=0,bytesUploaded=0;
  for(const chunk of result.value.chunks){
    if(this.disposed||serial!==this.generation)return {cancelled:true};
    const id="osm/"+chunk.id;
    required.add(id);
    const hash=hashMesh(chunk);
    if(this.live.get(id)===hash)continue;
    const pack=packCityMesh(chunk);
    const mesh=pack.mesh;
    this.renderer.upsert(id,{positions:mesh.positions,normals:mesh.normals,
      colors:mesh.colors,uvs:mesh.uvs,indices:mesh.indices,
      material:{color:[1,1,1,1],doubleSided:true,castShadow:false}});
    this.live.set(id,hash);uploaded++;
    bytesSaved+=pack.bytesBefore-pack.bytesAfter;
    bytesUploaded+=pack.bytesAfter;
    if(uploaded%this.uploadsPerFrame===0){
      await yieldFrame();
      if(this.disposed||serial!==this.generation)return {cancelled:true};
    }
  }
  for(const key of [...this.live.keys()])
    if(!required.has(key)){this.renderer.remove(key);this.live.delete(key);removed++;}
  this.lastRevision=revision;this.lastCenter=[...center];this.dirty=false;
  return {roads:result.value.roads,triangles:result.value.triangles,
    uploaded,removed,chunks:this.live.size,bytesSaved,bytesUploaded,unchanged:false};
 }
 clear(){
  this.generation++;
  for(const key of this.live.keys())this.renderer.remove(key);
  this.live.clear();this.lastRevision=null;this.lastCenter=null;this.dirty=true;
 }
 dispose(){
  if(this.disposed)return;
  this.clear();this.disposed=true;
 }
}
