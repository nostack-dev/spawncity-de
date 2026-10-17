// Single-path, native-only OSM city source -> chunk buffers -> WebGL2.
// Shares the *geometry/coordinate* contract with Box3D; no Three scene graph,
// old renderer, fallback toggle, or extra network tile provider.
import {buildingFootprintsFromFeatures,buildingFootprintHash} from "./world_building_collisions.mjs";
import {buildNativeCityGeometry,nativeCityChunkSteps} from "./native_city_geometry.mjs";
export const NATIVE_CITY_STREAM_VERSION="native-city-stream-v1";
const hashFloatArrays=parts=>{
  let hash=2166136261;
  for(const array of parts){
    const values=new Uint32Array(array.buffer,array.byteOffset,array.byteLength/4);
    for(let i=0;i<values.length;i++)hash=Math.imul(hash^values[i],16777619)>>>0;
  }
  return hash.toString(16).padStart(8,"0");
};
const keyForChunk=part=>"osm/"+part.id;
const drawOptions={facade:true,color:[1,1,1,1],doubleSided:false,alphaMode:"opaque"};
export class NativeCityStream{
  constructor(renderer,{chunkSize=320,maxBuildings=2600,buildingsPerStep=24}={}){
    if(!renderer?.upsert||!renderer?.remove)throw Error("NativeCityStream requires one native-only WebGL2 renderer");
    this.renderer=renderer;
    this.options={chunkSize,maxBuildings,buildingsPerStep};
    this.chunkHashes=new Map();this.snapshotKey=null;this.generation=0;this.closed=false;
    this.lastStats={built:0,uploaded:0,removed:0,skipped:0,chunks:0};
  }
  async ingestFeatures(features,{project,center=[0,0],radiusM=1250,maxFootprints=2600,revision="",damageTop=null,yieldFrame=()=>Promise.resolve()}={}){
    const footprints=buildingFootprintsFromFeatures(features,{project,center,radiusM,maxFootprints});
    return this.ingestFootprints(footprints,{revision,damageTop,yieldFrame});
  }
  async ingestFootprints(footprints,{revision="",damageTop=null,yieldFrame=()=>Promise.resolve()}={}){
    if(this.closed)throw Error("native city stream disposed");
    if(typeof yieldFrame!=="function")throw Error("yieldFrame callback required");
    const generation=++this.generation;
    const stable=buildingFootprintHash(footprints);
    // A damageTop callback can change the scene even when OSM coordinates do not.
    const token=stable+"|"+revision;
    if(!damageTop&&token===this.snapshotKey)return {...this.lastStats,unchanged:true};
    const steps=nativeCityChunkSteps(footprints,{...this.options,damageTop});
    let current=steps.next();
    while(!current.done){
      await yieldFrame();
      if(this.closed||generation!==this.generation)return {cancelled:true,generation};
      current=steps.next();
    }
    if(this.closed||generation!==this.generation)return {cancelled:true,generation};
    const {chunks,built,skipped}=current.value;
    let uploaded=0,removed=0;
    const next=new Map();
    for(const part of chunks){
      const id=keyForChunk(part);
      const hash=hashFloatArrays([part.positions,part.normals,part.colors,part.uvs]);
      next.set(id,hash);
      if(this.chunkHashes.get(id)===hash)continue;
      this.renderer.upsert(id,{positions:part.positions,normals:part.normals,colors:part.colors,uvs:part.uvs,material:drawOptions});
      uploaded++;
    }
    for(const id of this.chunkHashes.keys()){
      if(!next.has(id)){this.renderer.remove(id);removed++;}
    }
    this.chunkHashes=next;this.snapshotKey=token;
    this.lastStats={built,uploaded,removed,skipped:skipped.length,chunks:chunks.length};
    return {...this.lastStats,unchanged:false};
  }
  clear(){
    this.generation++;
    for(const id of this.chunkHashes.keys())this.renderer.remove(id);
    this.chunkHashes.clear();this.snapshotKey=null;this.lastStats={built:0,uploaded:0,removed:0,skipped:0,chunks:0};
  }
  dispose(){if(this.closed)return;this.clear();this.closed=true;}
}
