// Decoded live meshes. Missiles point along local -Z, the soldier stands on z=0
// facing +Y, the drone's nose is -X, the fighter's nose is +Y.
import {NATIVE_ORIGINAL_ACTORS} from "./native_original_actors.mjs";
function bytes(b64){
  const bin=atob(b64),out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return new Float32Array(out.buffer);
}
function mesh(name){
  const src=NATIVE_ORIGINAL_ACTORS[name];
  const positions=bytes(src.positions);
  return {positions,normals:bytes(src.normals),colors:bytes(src.colors),uvs:new Float32Array(positions.length/3*2)};
}
export const ORIGINAL_DRONE=mesh("drone");
export const ORIGINAL_JET=mesh("jet");
export const ORIGINAL_HUMAN=mesh("human");
export const ORIGINAL_MISSILE=mesh("missile");
export const ORIGINAL_GUIDED=mesh("guided");
export const ORIGINAL_GRENADE=mesh("grenade");
