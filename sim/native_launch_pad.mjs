// Physical launch-location landmark, not fabricated OSM city data.
// A visible local reference on flat ground allows the pilot to recognize
// attitude and depth even when GPS/Overpass is unavailable. All Z values
// come from the SAME Box3D terrain sampler as collision geometry.
import {terrainNodeHeightAt} from "./terrain_craters.mjs";
export const NATIVE_LAUNCH_PAD_VERSION="physical-terrain-game-start-v1";
const TAU=Math.PI*2;
const isFinite3=v=>v.length===3&&v.every(Number.isFinite);
export function nativeLaunchPadMesh({center=[0,0],heightAt=terrainNodeHeightAt,
 radius=3.8,segments=48}={}){
 if(!Array.isArray(center)||center.length!==2||!center.every(Number.isFinite)
  ||typeof heightAt!=="function"||!(radius>1&&radius<15)
  ||!Number.isInteger(segments)||segments<12||segments>128)
  throw Error("native landing marker must follow valid physical terrain");
 const positions=[],normals=[],colors=[];
 const put=(v,color)=>{
  const z=Number(heightAt(v[0],v[1]));
  if(!Number.isFinite(z)||!isFinite3(color))throw Error("invalid physical launch terrain");
  positions.push(v[0],v[1],z+.025);
  normals.push(0,0,1);
  colors.push(...color);
 };
 const tri=(a,b,c,color)=>{put(a,color);put(b,color);put(c,color);};
 const ring=(inner,outer,i,color)=>{
  const a=i*TAU/segments,b=(i+1)*TAU/segments;
  const polar=(r,t)=>[center[0]+Math.cos(t)*r,center[1]+Math.sin(t)*r];
  const ai=polar(inner,a),bi=polar(inner,b),ao=polar(outer,a),bo=polar(outer,b);
  tri(ai,ao,bo,color);tri(ai,bo,bi,color);
 };
 const orange=[1,.48,.08],light=[.95,1,.96],navy=[.06,.16,.24];
 for(let i=0;i<segments;i++){
  ring(.55,radius*.49,i,navy);
  ring(radius*.49,radius*.60,i,i%4===0?orange:[.14,.24,.30]);
  ring(radius*.60,radius*.74,i,i%2===0?light:orange);
  ring(radius*.74,radius*.85,i,navy);
 }
 const bar=(x0,y0,x1,y1,color)=>{
  const a=[center[0]+x0,center[1]+y0],b=[center[0]+x1,center[1]+y0],
   c=[center[0]+x1,center[1]+y1],d=[center[0]+x0,center[1]+y1];
  tri(a,b,c,color);tri(a,c,d,color);
 };
 // Bright H marking is visible from directly above and the low chase camera.
 bar(-.46,-.55,-.22,.55,light);
 bar(.22,-.55,.46,.55,light);
 bar(-.46,-.12,.46,.12,light);
 // A pair of directional guidance chevrons is in front of the drone's
 // original -X nose, so the first native frame has visible depth landmarks.
 for(const y of[-1,1]){
  const u=[center[0]-radius-1,center[1]+y*1.6];
  tri([u[0],u[1]],[u[0]-1.5,u[1]+.45],[u[0]-1.5,u[1]-.45],orange);
 }
 return {positions:new Float32Array(positions),normals:new Float32Array(normals),
  colors:new Float32Array(colors),triangles:positions.length/9,
  physicalGroundM:Number(heightAt(...center))};
}
export class NativeLaunchPad{
 constructor(renderer,{center=[0,0],heightAt=terrainNodeHeightAt}={}){
  if(typeof renderer?.upsert!=="function"||typeof renderer?.remove!=="function")
   throw Error("native game requires the sole WebGL2 renderer");
  this.renderer=renderer;this.id="game/physical-launch-pad";this.center=[...center];this.heightAt=heightAt;
  this.refresh();
 }
 refresh(){
  if(!this.renderer)return false;
  const mesh=nativeLaunchPadMesh({center:this.center,heightAt:this.heightAt});
  this.renderer.upsert(this.id,{positions:mesh.positions,normals:mesh.normals,colors:mesh.colors,
   material:{color:[1,1,1,1],unlit:true,doubleSided:true,castShadow:false}});
  return true;
 }
 dispose(){if(!this.renderer)return;this.renderer.remove(this.id);this.renderer=null;}
}
