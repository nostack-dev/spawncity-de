// Sole native WebGL2 presentation owner for a future SpawnCity engine cutover.
// No Three.js import, no legacy GPU context or fallback. Existing Box3D
// simulation owns ALL positions. This is an independent native game-world
// composition entrypoint; the current live main does not use it yet.
import {NativeSceneRenderer} from "./native_scene_renderer.mjs";
import {NativeCityStream} from "./native_city_stream.mjs";
import {NativeTerrainStream} from "./native_terrain_stream.mjs";
import {NativeRigidVisuals} from "./native_rigid_visuals.mjs";
import {NativeRoadStream} from "./native_road_stream.mjs";
import {NativePedestrianVisuals} from "./native_pedestrian_visuals.mjs";
import {NativeAirframePresentation} from "./native_airframe_presentation.mjs";
import {nativeDrawingBufferSize,nativePointerToDrawingPixels} from "./native_viewport.mjs";
export const NATIVE_WORLD_PRESENTER_VERSION="native-sole-presenter-v1";
const finite3=p=>p?.length===3&&Array.from(p).every(Number.isFinite);
const nextFrame=()=>typeof requestAnimationFrame==="function"?new Promise(resolve=>requestAnimationFrame(resolve)):Promise.resolve();
export class NativeWorldPresenter{
 constructor(canvas,{physics,population=null,flight=null,heightAt,rendererOptions={},terrainOptions={},cityOptions={},roadOptions={}}={}){
  if(!physics?.bodies||!physics?.renderPose)throw Error("native world requires authoritative Box3D runtime");
  this.renderer=new NativeSceneRenderer(canvas,rendererOptions);
  this.terrain=new NativeTerrainStream(this.renderer,{...terrainOptions,...(heightAt?{heightAt}:null)});
  this.city=new NativeCityStream(this.renderer,cityOptions);
  this.roads=new NativeRoadStream(this.renderer,{heightAt:this.terrain.heightAt,...roadOptions});
  this.rigids=new NativeRigidVisuals(this.renderer,physics);
  this.people=population?new NativePedestrianVisuals(this.renderer,population):null;
  if(flight&&typeof flight.presentationPose!=="function")throw Error("native flight must expose authoritative Box3D presentationPose()");
  this.flight=flight;
  this.airframe=flight?new NativeAirframePresentation(this.renderer,{span:flight.p?.span??.25,propD:flight.p?.propD??.11}):null;
  this.flightCameraMode="follow";this.flightCameraSettings={};this.flightCameraActive=Boolean(flight);
  this.lastFrameAt=null;
  this.camera=null;this.running=false;this.disposed=false;this.lastTerrainAt=-Infinity;
  this.terrainPromise=null;this.pendingCity=null;this.error=null;this.frameNumber=0;
  this.drawStats=null;this.requestFrame=null;this.onError=null;this.frameEpoch=0;
 }
 setFlightCameraMode(mode,settings={}){
  if(!this.airframe)throw Error("native drone flight not configured");
  if(!["fpv","follow","third"].includes(mode))throw Error("invalid native drone camera mode");
  this.flightCameraMode=mode;this.flightCameraSettings={...settings};this.flightCameraActive=true;
 }
 setCamera(input){
  if(!finite3(input?.eye)||!finite3(input?.target)||!(input.fov>0&&input.fov<Math.PI)||!(input.far>input.near))
   throw Error("native game needs a valid authoritative camera");
  this.flightCameraActive=false;
  this.camera={
    eye:Array.from(input.eye),target:Array.from(input.target),
    up:finite3(input.up)?Array.from(input.up):[0,0,1],
    fov:input.fov,near:input.near,far:input.far
  };
 }
 async updateRoadFeatures(features,options={}){
  if(this.disposed)throw Error("native world disposed");
  return this.roads.ingest(features,options);
 }
 invalidateRoads(){this.roads.invalidate();}
 async updateCityFootprints(footprints,options={}){
  if(this.disposed)throw Error("native world disposed");
  // All city geometry comes from the same Box3D building collision footprints.
  // Concurrent map revisions are automatically rejected by NativeCityStream.
  return this.city.ingestFootprints(footprints,options);
 }
 async updateCityFeatures(features,{project,center,radiusM,revision,damageTop}={}){
  if(this.disposed)throw Error("native world disposed");
  return this.city.ingestFeatures(features,{project,center,radiusM,revision,damageTop});
 }
 start({requestFrame=globalThis.requestAnimationFrame?.bind(globalThis),onError=null}={}){
  if(this.disposed)throw Error("native world disposed");
  if(this.running)return false;
  if(typeof requestFrame!=="function")throw Error("browser animation frame required");
  this.running=true;this.requestFrame=requestFrame;this.onError=onError;
  const epoch=++this.frameEpoch;
  const frame=now=>{
   if(!this.running||this.disposed||epoch!==this.frameEpoch)return;
   try{this.draw(now);}catch(error){this.error=error;this.running=false;this.onError?.(error);return;}
   if(this.running&&!this.disposed&&epoch===this.frameEpoch)this.requestFrame(frame);
  };
  try{this.requestFrame(frame);}catch(error){this.running=false;throw error;}
  return true;
 }
 draw(now=performance.now()){
  if(this.disposed)throw Error("native world disposed");
  // Android GPU contexts can be evicted while changing apps or PWA window.
  // Pause only presentation until the SAME native WebGL2 context restores;
  // never initialize Three.js or terminate the only rendering loop.
  if(this.renderer.lost){this.lastFrameAt=now;return {paused:true,reason:"native-webgl2-context-lost",renderer:"native-webgl2-only"};}
  // The *same* Box3D presentationPose used by the original simulator now
  // feeds only the native GPU meshes; no parallel visual physics or Three.
  if(this.airframe){
   const dt=this.lastFrameAt===null?1/60:Math.min(.1,Math.max(0,(now-this.lastFrameAt)/1000));
   const frame=this.airframe.update(this.flight.presentationPose(),{
    dt,mode:this.flightCameraMode,motors:this.flight.motorOmega,
    ...this.flightCameraSettings
   });
   if(this.flightCameraActive)this.camera={eye:frame.eye,target:frame.target,up:frame.up,
     fov:frame.fov,near:frame.near,far:frame.far};
  }
  this.lastFrameAt=now;
  if(!this.camera)throw Error("native world requires camera before rendering");
  const canvas=this.renderer.canvas;
  // The document/layout owns CSS dimensions. The sole native canvas owns
  // backbuffer size. Do not force requestFullscreen or reinitialize GL.
  const viewport=nativeDrawingBufferSize(canvas);
  this.renderer.resize(viewport.width,viewport.height);
  this.renderer.setCamera(this.camera);
  const physics=this.rigids.update(),people=this.people?.update()||null;
  // View-radius data is reconciled asynchronously, at most every 250 ms.
  // Rendering never awaits terrain triangulation/GPU tile uploads.
  if(now-this.lastTerrainAt>=250&&!this.terrainPromise){
   this.lastTerrainAt=now;
   this.terrainPromise=this.terrain.update(this.camera.eye.slice(0,2),{yieldFrame:nextFrame})
     .catch(error=>{this.error=error;this.running=false;this.onError?.(error);})
     .finally(()=>{this.terrainPromise=null;});
  }
  const gpu=this.renderer.render();
  this.frameNumber++;
  this.drawStats={frame:this.frameNumber,gpu,physics,people,
    terrain:this.terrain.stats,city:this.city.lastStats,roads:this.roads.live.size,
    drawingWidth:viewport.width,drawingHeight:viewport.height,drawingDpr:viewport.pixelRatio,renderer:"native-webgl2-only"};
  return this.drawStats;
 }
 pick(x,y,options){if(!this.camera)throw Error("native camera unavailable");
  const pixel=nativePointerToDrawingPixels(this.renderer.canvas,x,y,this.renderer.width,this.renderer.height);
  return this.renderer.pick(pixel.x,pixel.y,options);
 }
 stop(){const was=this.running;this.running=false;this.frameEpoch++;return was;}
 dispose(){
  if(this.disposed)return;
  this.stop();this.city.dispose();this.roads.dispose();this.terrain.dispose();this.rigids.dispose();this.people?.dispose();this.airframe?.dispose();
  this.renderer.dispose();this.disposed=true;
 }
}
