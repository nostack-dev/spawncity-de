// Native-only visual tiles driven directly by the Box3D terrain height nodes.
// Physics never depends on these meshes; a changed crater/bridge/DEM region
// invalidates only overlapping GPU tiles. No Three.js ground or fallback.
import {terrainNodeHeightAt,onTerrainChange,TERRAIN_FIELD_STEP_M} from "./terrain_craters.mjs";
import {buildNativeTerrainTile,nativeTerrainTileCoordinates} from "./native_terrain_geometry.mjs";
export const NATIVE_TERRAIN_STREAM_VERSION="native-physics-terrain-stream-v1";
const nextFrame=()=>typeof requestAnimationFrame==="function"?new Promise(resolve=>requestAnimationFrame(resolve)):Promise.resolve();
export class NativeTerrainStream{
 constructor(renderer,{step=TERRAIN_FIELD_STEP_M,cells=32,radius=700,maxTiles=100,
   uploadsPerFrame=2,heightAt=terrainNodeHeightAt,albedoAt=null,listenPhysics=true}={}){
  if(!renderer?.upsert||!renderer?.remove||typeof heightAt!=="function")throw Error("native terrain needs one GPU renderer and Box3D height sampler");
  if(!Number.isInteger(uploadsPerFrame)||uploadsPerFrame<1)throw Error("invalid terrain upload budget");
  this.renderer=renderer;this.options={step,cells,radius,maxTiles};this.uploadsPerFrame=uploadsPerFrame;
  this.heightAt=heightAt;this.albedoAt=albedoAt;this.live=new Map();this.generation=0;this.closed=false;
  this.dirtyAll=false;this.dirtyRegions=[];this.lastRevision=null;this.stats={uploaded:0,removed:0,retained:0,chunks:0,bytesUploaded:0};
  this.unsubscribe=listenPhysics?onTerrainChange((_craters,regions)=>this.markDirty(regions)):null;
 }
 markDirty(regions=null){
  if(this.closed)return;
  this.generation++;
  if(!Array.isArray(regions))this.dirtyAll=true;
  else if(!this.dirtyAll)this.dirtyRegions.push(...regions.filter(r=>r?.length===4));
 }
 touches(x0,y0){
  if(this.dirtyAll)return true;
  const tileM=this.options.step*this.options.cells,pad=this.options.step;
  return this.dirtyRegions.some(r=>r[0]<=x0+tileM+pad&&r[2]>=x0-pad&&r[1]<=y0+tileM+pad&&r[3]>=y0-pad);
 }
 async update(center,{revision="",yieldFrame=nextFrame,force=false}={}){
  if(this.closed)throw Error("native terrain stream disposed");
  if(typeof yieldFrame!=="function")throw Error("yieldFrame callback required");
  const generation=++this.generation;
  const tiles=nativeTerrainTileCoordinates({...this.options,center});
  const required=new Set(),fullRefresh=force||(this.lastRevision!==null&&this.lastRevision!==revision);
  let uploaded=0,removed=0,retained=0,bytesUploaded=0;
  for(const {id,x0,y0} of tiles){
   if(this.closed||generation!==this.generation)return {cancelled:true,generation};
   const key="osm/"+id;required.add(key);
   const changed=fullRefresh||!this.live.has(key)||this.touches(x0,y0);
   if(!changed){retained++;continue;}
   const mesh=buildNativeTerrainTile({id:key,x0,y0,step:this.options.step,cells:this.options.cells,heightAt:this.heightAt,albedoAt:this.albedoAt});
   this.renderer.upsert(key,{positions:mesh.positions,normals:mesh.normals,colors:mesh.colors,uvs:mesh.uvs,
     indices:mesh.indices,material:{color:[1,1,1,1],alphaMode:"opaque",doubleSided:true,terrain:true,castShadow:false}});
   this.live.set(key,{x0,y0});
   bytesUploaded+=mesh.positions.byteLength+mesh.normals.byteLength+mesh.colors.byteLength+mesh.uvs.byteLength+mesh.indices.byteLength;
   uploaded++;
   if(uploaded%this.uploadsPerFrame===0){
    await yieldFrame();
    if(this.closed||generation!==this.generation)return {cancelled:true,generation};
   }
  }
  for(const id of [...this.live.keys()]){
   if(!required.has(id)){this.renderer.remove(id);this.live.delete(id);removed++;}
  }
  this.dirtyAll=false;this.dirtyRegions=[];this.lastRevision=revision;
  this.stats={uploaded,removed,retained,chunks:required.size,bytesUploaded};
  return {...this.stats};
 }
 clear(){
  this.generation++;
  for(const id of this.live.keys())this.renderer.remove(id);
  this.live.clear();this.dirtyAll=true;this.dirtyRegions=[];this.lastRevision=null;
 }
 dispose(){if(this.closed)return;this.clear();this.unsubscribe?.();this.closed=true;}
}
