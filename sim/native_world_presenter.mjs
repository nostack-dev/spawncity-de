// Sole native WebGL2 presentation owner for a future SpawnCity engine cutover.
// No Three.js import, no legacy GPU context or fallback. Existing Box3D
// simulation owns ALL positions. This is an independent native game-world
// composition entrypoint; the current live main does not use it yet.
import {NativeSceneRenderer} from "./native_scene_renderer.mjs";
import {NativeSceneGraph} from "./native_scene_graph.mjs";
import {NativeEffects} from "./native_effects.mjs";
import {NativeCombatEvents} from "./native_combat_events.mjs";
import {NativeCityStream} from "./native_city_stream.mjs";
import {NativeTerrainStream} from "./native_terrain_stream.mjs";
import {NativeRigidVisuals} from "./native_rigid_visuals.mjs";
import {nativeWorldPhysicsView,nativeRigidRuntimeView} from "./native_world_physics_view.mjs";
import {nativeFlightPoseView} from "./native_flight_pose_view.mjs";
import {nativeGameplayCamera,nativeLiveGameplayState} from "./native_gameplay_camera.mjs";
import {nativeOsmProjector} from "./native_osm_projector.mjs";
import {NativeRoadStream} from "./native_road_stream.mjs";
import {NativePedestrianVisuals} from "./native_pedestrian_visuals.mjs";
import {NativeAirframePresentation} from "./native_airframe_presentation.mjs";
import {NativePeerVisuals} from "./native_peer_visuals.mjs";
import {nativeDrawingBufferSize,nativePointerToDrawingPixels} from "./native_viewport.mjs";
export const NATIVE_WORLD_PRESENTER_VERSION="native-sole-presenter-v1";
const finite3=p=>p?.length===3&&Array.from(p).every(Number.isFinite);
const nextFrame=()=>typeof requestAnimationFrame==="function"?new Promise(resolve=>requestAnimationFrame(resolve)):Promise.resolve();
export class NativeWorldPresenter{
 constructor(canvas,{physics=null,worldPhysics=null,rigidRuntime=null,interpolationAlpha=()=>1,population=null,flight=null,flightPhysics=null,peer=null,gameplayState=null,heightAt,rendererOptions={},terrainOptions={},cityOptions={},roadOptions={},combatEventTarget=typeof window!=="undefined"?window:null}={}){
  if([physics,worldPhysics,rigidRuntime].filter(Boolean).length!==1)throw Error("native world requires exactly one Box3D pose authority");
  const poseSource=rigidRuntime?nativeRigidRuntimeView(rigidRuntime)
    :worldPhysics?nativeWorldPhysicsView(worldPhysics,{alpha:interpolationAlpha}):physics;
  if(!poseSource?.bodies||!poseSource?.renderPose)throw Error("native world requires authoritative Box3D runtime");
  this.renderer=new NativeSceneRenderer(canvas,rendererOptions);
  this.sceneGraph=new NativeSceneGraph(this.renderer);
  this.effects=new NativeEffects(this.renderer);
  this.terrain=new NativeTerrainStream(this.renderer,{...terrainOptions,...(heightAt?{heightAt}:null)});
  this.city=new NativeCityStream(this.renderer,cityOptions);
  this.roads=new NativeRoadStream(this.renderer,{heightAt:this.terrain.heightAt,...roadOptions});
  this.rigids=new NativeRigidVisuals(this.renderer,poseSource);
  this.worldPhysics=rigidRuntime||worldPhysics;
  const crowdSource=typeof population?.nativePeople==="function"
   ?{people:()=>population.nativePeople(this.camera?.eye?.slice(0,2)??[0,0])}
   :population;
  this.people=crowdSource?new NativePedestrianVisuals(this.renderer,crowdSource):null;
  this.peer=peer?new NativePeerVisuals(this.renderer,peer):null;
  if(flight&&flightPhysics)throw Error("native world requires exactly one 1 kHz flight pose authority");
  const flightSource=flightPhysics?nativeFlightPoseView(flightPhysics,{alpha:interpolationAlpha}):flight;
  if(flightSource&&typeof flightSource.presentationPose!=="function")throw Error("native flight must expose authoritative Box3D presentationPose()");
  this.flight=flightSource;
  this.airframe=flightSource?new NativeAirframePresentation(this.renderer,{span:flightSource.p?.span??.25,propD:flightSource.p?.propD??.11}):null;
  this.flightCameraMode="follow";this.flightCameraSettings={};this.flightCameraActive=Boolean(flightSource);
  this.gameplayState=gameplayState==="live"?nativeLiveGameplayState():gameplayState;this.gameMode=null;
  this.lastFrameAt=null;
  this.camera=null;this.running=false;this.disposed=false;this.lastTerrainAt=-Infinity;
  this.terrainPromise=null;this.pendingCity=null;this.error=null;this.frameNumber=0;
  this.osmOriginKey=null;
  this.drawStats=null;this.requestFrame=null;this.onError=null;this.frameEpoch=0;
  this.combatEvents=new NativeCombatEvents(this,{target:combatEventTarget,onError:error=>{this.error=error;this.onError?.(error);}});
  this.combatEvents.connect();
 }
 emitEffect(event){if(this.disposed)throw Error("native world disposed");return this.effects.emit(event);}
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
 async updateOsmFeatures({origin,buildings=[],roads=[],center=[0,0],revision="",damageTop=null,yieldFrame}={}){
  if(this.disposed)throw Error("native world disposed");
  if(!Array.isArray(buildings)||!Array.isArray(roads)||center?.length!==2||!center.every(Number.isFinite))
   throw Error("native OSM frame needs building/road features and Box3D metric camera center");
  const {key,project}=nativeOsmProjector(origin);
  // Changing GPS origin changes EVERY Box3D-relative metre coordinate:
  // never render stale GPU tiles from a previous coordinate system.
  if(this.osmOriginKey!==key){
   this.city.clear();this.roads.clear();this.osmOriginKey=key;
  }
  this.roads.options.project=project;
  const opts=yieldFrame?{yieldFrame}:{};
  const [city,street]=await Promise.all([
   this.city.ingestFeatures(buildings,{project,center,revision:key+"|"+revision,damageTop,...opts}),
   this.roads.ingest(roads,{center,revision:key+"|"+revision,...opts})
  ]);
  return {origin:key,city,roads:street};
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
  // The document owns layout; one native canvas owns the actual backbuffer.
  // Read viewport aspect BEFORE deriving the on-foot 90-degree horizontal FOV.
  const canvas=this.renderer.canvas,viewport=nativeDrawingBufferSize(canvas);
  // The *same* Box3D presentationPose used by the original simulator now
  // feeds only the native GPU meshes; no parallel visual physics or Three.
  let flightFrame=null;
  if(this.airframe){
   const dt=this.lastFrameAt===null?1/60:Math.min(.1,Math.max(0,(now-this.lastFrameAt)/1000));
   flightFrame=this.airframe.update(this.flight.presentationPose(),{
    dt,mode:this.flightCameraMode,motors:this.flight.motorOmega,
    ...this.flightCameraSettings
   });
   if(this.flightCameraActive)this.camera={eye:flightFrame.eye,target:flightFrame.target,up:flightFrame.up,
     fov:flightFrame.fov,near:flightFrame.near,far:flightFrame.far};
  }
  if(this.gameplayState){
   const selected=nativeGameplayCamera(this.gameplayState,{aspect:viewport.width/viewport.height,now});
   this.gameMode=selected.mode;
   if(selected.camera)this.camera=selected.camera;
   else if(flightFrame)this.camera={eye:flightFrame.eye,target:flightFrame.target,up:flightFrame.up,
      fov:flightFrame.fov,near:flightFrame.near,far:flightFrame.far};
   else throw Error("native drone mode requires live flight presentation");
   // Avoid drawing the quad body/rotors during on-foot, car, jet or spectator
   // modes. Keep one WebGL2 context and keep the actual physics ticking.
   if(this.airframe){
    this.renderer.setVisible("flight/airframe",selected.mode==="drone");
    this.renderer.setVisible("flight/rotors",selected.mode==="drone");
   }
  }
  this.lastFrameAt=now;
  if(!this.camera)throw Error("native world requires camera before rendering");
  this.renderer.resize(viewport.width,viewport.height);
  this.renderer.setCamera(this.camera);
  const physics=this.rigids.update(),people=this.people?.update()||null,peer=this.peer?.update(now)||null;
  // View-radius data is reconciled asynchronously, at most every 250 ms.
  // Rendering never awaits terrain triangulation/GPU tile uploads.
  if(now-this.lastTerrainAt>=250&&!this.terrainPromise){
   this.lastTerrainAt=now;
   this.terrainPromise=this.terrain.update(this.camera.eye.slice(0,2),{yieldFrame:nextFrame})
     .catch(error=>{this.error=error;this.running=false;this.onError?.(error);})
     .finally(()=>{this.terrainPromise=null;});
  }
  const hierarchy=this.sceneGraph.sync();
  const fx=this.effects.tick(now,this.camera.eye);
  const gpu=this.renderer.render();
  this.frameNumber++;
  this.drawStats={frame:this.frameNumber,gpu,physics,people,peer,hierarchy,effects:fx,
    terrain:this.terrain.stats,city:this.city.lastStats,roads:this.roads.live.size,
    drawingWidth:viewport.width,drawingHeight:viewport.height,drawingDpr:viewport.pixelRatio,
    gameMode:this.gameMode,renderer:"native-webgl2-only"};
  return this.drawStats;
 }
 pick(x,y,options){if(!this.camera)throw Error("native camera unavailable");
  const pixel=nativePointerToDrawingPixels(this.renderer.canvas,x,y,this.renderer.width,this.renderer.height);
  const visual=this.renderer.pick(pixel.x,pixel.y,options);
  if(visual.hit){
   const bodyId=this.rigids.bodyIdForHit(visual.hit);
   if(bodyId)visual.hit={...visual.hit,bodyId,source:"native-webgl2"};
  }
  return visual;
 }
 pickGameplay(x,y,{maxDistance=this.renderer.far,ignoreId=null}={}){
  if(!this.camera)throw Error("native camera unavailable");
  if(!this.worldPhysics||typeof this.worldPhysics.raycast!=="function")
   throw Error("native game targeting requires authoritative Box3D raycast");
  const pixel=nativePointerToDrawingPixels(this.renderer.canvas,x,y,this.renderer.width,this.renderer.height);
  const ray=this.renderer.getScreenRay(pixel.x,pixel.y);
  const physical=this.worldPhysics.raycast(ray.origin,ray.direction,maxDistance);
  const visual=this.pick(x,y,{maxDistance,ignoreId});
  // The Box3D result remains authoritative for gameplay damage, walls and
  // occlusion. The native mesh hit is presentation-only and supplies a visual
  // triangle/bone; never turn a decorative mesh into a fake damage collider.
  return {hit:physical?{...physical,distance:physical.distanceM,source:"box3d"}:null,
   visualHit:visual.hit||null,ray,trianglesExamined:visual.trianglesExamined};
 }
 stop(){const was=this.running;this.running=false;this.frameEpoch++;return was;}
 dispose(){
  if(this.disposed)return;
  this.stop();this.combatEvents.dispose();this.city.dispose();this.roads.dispose();this.terrain.dispose();this.rigids.dispose();this.people?.dispose();this.airframe?.dispose();
  this.peer?.dispose();this.effects.dispose();this.sceneGraph.dispose();this.renderer.dispose();this.disposed=true;
 }
}
