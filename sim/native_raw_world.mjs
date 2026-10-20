// Uploads the meshes emitted by sim/raw/spawncity_raw_world.cpp.
// The triangles are not rebuilt here. WebGL2 only receives the C++ buffers.
import {RAW_MODULES,RAW_MODULE_COUNT,RAW_WORLD_VERSION} from "./raw/catalog.mjs";
export {RAW_MODULE_COUNT,RAW_WORLD_VERSION};
export function installRawWorld(renderer){
 if(!renderer?.upsert)throw Error("raw world needs the native WebGL2 renderer");
 if(renderer.__rawWorld)return 0;
 let uploaded=0;
 for(const mod of RAW_MODULES){
  if(!mod.positions.length)continue;
  renderer.upsert("raw/"+mod.mesh,{
   positions:new Float32Array(mod.positions),
   normals:new Float32Array(mod.normals),
   colors:new Float32Array(mod.colors),
   indices:new Uint32Array(mod.indices),
   material:{color:[1,1,1,1],roughness:1,metallic:0,castShadow:mod.kind!=="water"&&mod.kind!=="disc",doubleSided:mod.kind==="water"||mod.kind==="disc"||mod.kind==="ground",alphaMode:mod.color[3]<0.99?"blend":"opaque"}
  });
  uploaded++;
 }
 renderer.__rawWorld=true;
 return uploaded;
}
