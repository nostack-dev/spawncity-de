// Exclusive native SpawnCity game owner. No legacy Three.js renderer, graphics
// shim or alternate Box3D gameplay simulation: every moving entity is owned by
// its original 1 kHz flight body or by ONE 60 Hz rigid-vehicle/actor world.
// External maps/transport provide OSM features and genuine peer timelines.
import {createNativeFlightPhysics,nativeDefaultFlightParams} from "./native_flight_physics.mjs";
import {NativeFlightController} from "./native_flight_controller_wasm.mjs";
import {WorldRigidBodyPhysics,WORLD_PHYSICS_CATEGORIES} from "./world_rigid_body_physics.mjs";
import {createFootMotion,stepFootMotion,paintJetpackFuel,FOOT_WALK_MPS,FOOT_SPRINT_MPS,FOOT_FALL_SAFE_MPS,FOOT_FALL_LETHAL_MPS} from "./native_foot_locomotion.mjs";
import {JET_SPEC,createAirframe,airframeStep,setFlightMode} from "./jet_flight_dynamics.mjs";
import {NativeWorldPresenter} from "./native_world_presenter.mjs";
import {nativeBuildingCollisionSnapshot,syncNativeBuildingCollisions} from "./native_building_collision_bridge.mjs";
import {clearNativeActorSpawns} from "./native_spawn_clearance.mjs";
import {chooseNativeStreetSpawn} from "./native_street_spawn.mjs";
import {terrainNodeHeightAt} from "./terrain_craters.mjs";
export const NATIVE_GAME_RUNTIME_VERSION="single-native-1khz-full-game-physics-v1";
const MILLIS_PER_FLIGHT_TICK=1;
const WORLD_STEP_MS=1000/60;
const validMode=new Set(["drone","foot","car","jet","multiplayer"]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const finite=n=>Number.isFinite(n)?n:0;
export class NativeGameRuntime{
 constructor(canvas,{b3,flightCoreFactory,params=nativeDefaultFlightParams(),
   presenterFactory=(canvas,options)=>new NativeWorldPresenter(canvas,options),
   peerTimeline=null,osmHeightAt=null,clock=()=>performance.now(),
   requestFrame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id),
   frameBudgetMs=6,maxBacklogMs=125,initialMode="drone",
   beforeFrame=null,afterFrame=null,onError=null}={}){
  if(!b3?.b3CreateWorld||!b3?.b3CreateBody)throw Error("NativeGameRuntime requires original Box3D WASM");
  if(typeof flightCoreFactory!=="function"||typeof presenterFactory!=="function")
   throw Error("NativeGameRuntime requires genuine Flight Core and sole WebGL2 presentation");
  if(!validMode.has(initialMode)||!(frameBudgetMs>0&&frameBudgetMs<=25)||maxBacklogMs<100)
   throw Error("Invalid native runtime scheduler configuration");
  this.b3=b3;this.clock=clock;this.requestFrame=requestFrame;this.cancelFrame=cancelFrame;
  this.beforeFrame=beforeFrame;this.afterFrame=afterFrame;
  this.frameBudgetMs=frameBudgetMs;this.maxBacklogMs=maxBacklogMs;this.onError=onError;
  this.mode=initialMode;this.running=false;this.closed=false;this.frameHandle=null;this.generation=0;
  this.lastFrameAt=null;this.backlogMs=0;this.rigidPhaseMs=0;this.simulatedTicks=0;
  this.discontinuityMs=0;this.rigidSteps=0;this.frames=0;this.lastDraw=null;
  this.osmGeneration=0;this.osmCollisionOrigin=null;this.lastOsmCollision=null;
  this.flight=createNativeFlightPhysics(b3,params);
  this.flightControls={arm:false,throttle:0,roll:0,pitch:0,yaw:0,gameMode:true,groundClearance:2,bodyPitch:0};
  this.flightController=new NativeFlightController(this.flight,{
   factory:flightCoreFactory,controls:()=>this.flightControls
  });
  this.rigids=new WorldRigidBodyPhysics(b3,{onImpact:detail=>this.onImpact(detail)});
  this.jetAirframe=createAirframe();
  this.rigids.addBody({id:"player-foot",kind:"human",wheeled:false,position:[1,0,.97],
   massKg:82,halfExtents:[.23,.23,.88],gravityScale:1,linearDamping:0});
  this.rigids.addBody({id:"player-car",kind:"car",position:[8,1,.9],
   massKg:1420,halfExtents:[1.78,.82,.42],yaw:0});
  this.rigids.addBody({id:"player-jet",kind:"aircraft",position:[-24,0,JET_SPEC.gearHeight+.1],
   massKg:JET_SPEC.massKg,hulls:JET_SPEC.hulls,inertia:JET_SPEC.inertia,
   wheeled:false,linearDamping:0,angularDamping:0,friction:.35,
   controller:(state,dt,engine)=>airframeStep(this.jetAirframe,state,dt,{
    raycast:(origin,direction,length)=>engine.raycast(origin,direction,length,{
     maskBits:WORLD_PHYSICS_CATEGORIES.terrain
    })
   })});
  this.footInput={forward:0,strafe:0,sprint:false,jump:false,yaw:0,pitch:0};
  this.footMotion=createFootMotion();
  // jetpack_audio / scene lighting read the production __arondightJetpack state
  globalThis.__arondightJetpack=this.footMotion;
  this.carInput={pedal:0,steer:0,handbrake:true};
  this.jetInput={lift:0,yawIn:0,pitchIn:0,rollIn:0,brake:0};
  this.spectator=false;
  this.peerTimeline=peerTimeline;
  this.gameplayState={
   mode:initialMode,
   walk:{mode:initialMode==="foot"?"foot":"drone",position:{x:1,y:0,z:1.7},yaw:0,pitch:0},
   car:{active:false,pose:{position:[8,1,.9],rotation:[0,0,0,1]},speedMps:0},
   jet:{active:false,cockpit:true,pose:{x:-24,y:0,z:4,q:[0,0,0,1]},state:{speed:0}},
   peerTimeline
  };
  // Camera interpolation is derived from these SAME two physics clocks.
  this.flightView={
   get p(){return thisPhysics.p;},
   get motorOmega(){return thisPhysics.motorOmega;},
   presentationPose:()=>thisPhysics.presentationPose(clamp(this.backlogMs/MILLIS_PER_FLIGHT_TICK,0,1))
  };
  const thisPhysics=this.flight;
  this.world=presenterFactory(canvas,{
   worldPhysics:this.rigids,
   flight:this.flightView,
   interpolationAlpha:()=>clamp(this.rigidPhaseMs/WORLD_STEP_MS,0,1),
   gameplayState:this.gameplayState,
   rendererOptions:{shadows:{resolution:512,extent:96,bias:.0016}},
   ...(peerTimeline?{peer:{timeline:peerTimeline,connected:()=>true,mode:()=>"drone"}}:{}),
   ...(osmHeightAt?{heightAt:osmHeightAt}:{})
  });
  if(!this.world?.draw||!this.world?.dispose)throw Error("native game requires sole WebGL2 presenter");
  this.setMode(initialMode);
 }
 onImpact(detail){
  const p=detail?.position;
  if(!finite3(p)||!this.world)return;
  this.world.emitEffect?.({kind:"spark",position:p,size:clamp(detail.deltaVelocityMps*.05,.1,1),
   lifeMs:300,startMs:this.clock()});
 }
 setMode(mode){
  if(this.closed)throw Error("Native game disposed");
  if(!validMode.has(mode)||mode==="multiplayer"&&!this.peerTimeline)
   throw Error("Native mode unavailable: "+mode);
  if(this.mode==="car"&&mode!=="car")this.rigids.setDrive("player-car",null);
  this.mode=mode;this.gameplayState.mode=mode;
  this.gameplayState.walk.mode=mode==="foot"?"foot":"drone";
  this.gameplayState.car.active=mode==="car";
  this.gameplayState.jet.active=mode==="jet";
  if(mode!=="car")this.carInput={pedal:0,steer:0,handbrake:true};
  return mode;
 }
 setControls(input={}){
  if(this.closed)throw Error("Native game disposed");
  if(!input||typeof input!=="object")throw Error("Native controls object required");
  const axes=["throttle","roll","pitch","yaw","groundClearance","bodyPitch"];
  const footAxes=["forward","strafe","yaw","pitch"];
  const carAxes=["pedal","steer"],jetAxes=["lift","yawIn","pitchIn","rollIn","brake"];
  for(const key of axes)if(input[key]!==undefined&&Number.isFinite(input[key]))
   this.flightControls[key]=key==="throttle"?clamp(input[key],0,1):
     key==="groundClearance"?clamp(input[key],.5,120):clamp(input[key],-1,1);
  if(input.arm!==undefined)this.flightControls.arm=Boolean(input.arm);
  if(input.gameMode!==undefined)this.flightControls.gameMode=Boolean(input.gameMode);
  if(input.foot)for(const key of footAxes)if(Number.isFinite(input.foot[key]))
   this.footInput[key]=key==="yaw"?input.foot[key]:clamp(input.foot[key],-1.5,1.5);
  if(input.foot?.sprint!==undefined)this.footInput.sprint=Boolean(input.foot.sprint);
  if(input.foot?.jump!==undefined)this.footInput.jump=Boolean(input.foot.jump);
  if(input.car)for(const key of carAxes)if(Number.isFinite(input.car[key]))
   this.carInput[key]=clamp(input.car[key],-1,1);
  if(input.car?.handbrake!==undefined)this.carInput.handbrake=Boolean(input.car.handbrake);
  if(input.jet)for(const key of jetAxes)if(Number.isFinite(input.jet[key]))
   this.jetInput[key]=clamp(input.jet[key],-1,1);
 }
 moveActors(dt){
  if(this.mode==="foot"){
   const pose=this.rigids.pose("player-foot");
   if(pose){
    const half=pose.groundOffset||.88;
    const probe=this.rigids.raycast([pose.position[0],pose.position[1],pose.position[2]+.3],[.001,.001,-1],half+1.4,{maskBits:WORLD_PHYSICS_CATEGORIES.terrain});
    const gap=probe?pose.position[2]-half-probe.point[2]:1;
    const grounded=Boolean(probe)&&gap<.18&&pose.velocity[2]<1.6;
    const motion=stepFootMotion(this.footMotion,{now:performance.now(),dt,jumpHeld:this.footInput.jump,grounded,vz:pose.velocity[2],gapM:Math.max(0,gap),dead:Boolean(globalThis.__arondightPlayerDamageModel?.dead)});
    if(Number.isFinite(motion.landImpact)&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("arondight:player-land",{detail:{impactMps:motion.landImpact}}));
    if(motion.landImpact>FOOT_FALL_SAFE_MPS){
     const span=FOOT_FALL_LETHAL_MPS-FOOT_FALL_SAFE_MPS;
     globalThis.__arondightPlayerDamageModel?.damage?.(Math.round(100*Math.min(1,(motion.landImpact-FOOT_FALL_SAFE_MPS)/span)));
    }
    if(motion.dvz)this.rigids.applyImpulse("player-foot",[0,0,82*motion.dvz]);
    const a=this.footInput.yaw,f=this.footInput.forward,s=this.footInput.strafe,mag=Math.hypot(f,s);
    const speed=mag>.05?(this.footInput.sprint?FOOT_SPRINT_MPS:FOOT_WALK_MPS):0;
    const dx=mag>.05?(Math.sin(a)*f+Math.cos(a)*s)/mag:0;
    const dy=mag>.05?(Math.cos(a)*f-Math.sin(a)*s)/mag:0;
    this.rigids.setTarget("player-foot",{
     position:[pose.position[0]+dx,pose.position[1]+dy,pose.position[2]],
     speedMps:speed,response:grounded?14:6,maxAccelerationMps2:motion.maxAccel,
     yaw:a+Math.PI/2,omnidirectional:true
    });
   }
   paintJetpackFuel(this.footMotion,{onFoot:true});
  }else{this.rigids.clearTarget("player-foot");paintJetpackFuel(this.footMotion,{onFoot:false});}
  if(this.mode==="car")
   // Live car: D is +1 and turns right. This rack's positive angle is a left turn.
   this.rigids.setDrive("player-car",{...this.carInput,steer:-this.carInput.steer,maxSpeed:36,maxReverse:9});
  else this.rigids.setDrive("player-car",null);
  Object.assign(this.jetAirframe.input,this.mode==="jet"?this.jetInput:
   {lift:0,yawIn:0,pitchIn:0,rollIn:0,brake:1});
 }
 stepRigidbody(){
  this.moveActors(WORLD_STEP_MS/1000);
  this.rigids.step(WORLD_STEP_MS/1000,4,this.simulatedTicks);
  this.rigidSteps++;
 }
 stepBudget(ms,stepBudget=this.frameBudgetMs){
  if(this.closed)throw Error("Native game disposed");
  if(!this.flightController.backend.ready)throw Error("Original Flight Core not connected");
  if(!(Number.isFinite(ms)&&ms>=0)||!(stepBudget>0))throw Error("Invalid native 1 kHz scheduler");
  this.backlogMs+=ms;
  if(this.backlogMs>this.maxBacklogMs){
   // A WebGL2 frame that takes longer than the CPU can service must NOT leave
   // the pilot one or two seconds behind their live pointer/gamepad input.
   // Explicitly account for wall-clock discontinuity. Firmware and Box3D
   // still always run true 1 ms steps (never a fake variable-dt physics jump).
   this.discontinuityMs+=this.backlogMs-this.maxBacklogMs;
   this.backlogMs=this.maxBacklogMs;
  }
  const began=this.clock();
  let ticks=0;
  while(this.backlogMs>=MILLIS_PER_FLIGHT_TICK&&ticks<1000){
   const out=this.flightController.tick();
   this.backlogMs-=MILLIS_PER_FLIGHT_TICK;
   this.rigidPhaseMs+=MILLIS_PER_FLIGHT_TICK;
   this.simulatedTicks++;ticks++;
   if(this.rigidPhaseMs+1e-9>=WORLD_STEP_MS){
    this.rigidPhaseMs-=WORLD_STEP_MS;this.stepRigidbody();
   }
   if(ticks>=8&&this.clock()-began>=stepBudget)break;
  }
  return {ticks,remainingMs:this.backlogMs,rigidSteps:this.rigidSteps,discontinuityMs:this.discontinuityMs,simulationBehind:this.backlogMs>40};
 }
 updateAuthoritativeCamera(){
  const foot=this.rigids.renderPose("player-foot",clamp(this.rigidPhaseMs/WORLD_STEP_MS,0,1));
  if(foot){
   const a=this.gameplayState.walk,eye=foot.position;
   a.position={x:eye[0],y:eye[1],z:eye[2]+.72};
   a.yaw=this.footInput.yaw;a.pitch=this.footInput.pitch;
   a.speedMps=Math.hypot(foot.velocity[0],foot.velocity[1]);
   a.sprinting=Boolean(this.footInput.sprint);a.airborne=Boolean(this.footMotion?.airborne);
  }
  const car=this.rigids.renderPose("player-car",clamp(this.rigidPhaseMs/WORLD_STEP_MS,0,1));
  if(car){
   this.gameplayState.car.pose={position:car.position,rotation:car.rotation,yaw:car.yaw};
   this.gameplayState.car.speedMps=Math.hypot(...car.velocity);
   globalThis.__arondightVehicleDrive=this.mode==="car"?{active:true,vehicleId:"player-car",speedMps:this.gameplayState.car.speedMps,throttle:Math.abs(this.carInput.pedal||0)}:{active:false};
  }
  const jet=this.rigids.renderPose("player-jet",clamp(this.rigidPhaseMs/WORLD_STEP_MS,0,1));
  if(jet){
   this.gameplayState.jet.pose={x:jet.position[0],y:jet.position[1],z:jet.position[2],q:jet.rotation};
   this.gameplayState.jet.state.speed=Math.hypot(...jet.velocity);
  }
 }
 draw(now=this.clock()){
  if(this.closed)throw Error("Native game disposed");
  this.updateAuthoritativeCamera();
  this.lastDraw=this.world.draw(now);
  this.frames++;
  return this.lastDraw;
 }
 async start(){
  if(this.closed)throw Error("Native game disposed");
  if(this.running)return false;
  // PWA background/foreground must resume the SAME compiled Flight Core,
  // not instantiate another WASM machine and silently reset calibration.
  if(!this.flightController.backend.ready)await this.flightController.connect();
  if(this.closed)throw Error("Native game disposed during startup");
  this.running=true;this.lastFrameAt=null;const epoch=++this.generation;
  const frame=now=>{
   if(!this.running||epoch!==this.generation)return;
   try{
    this.beforeFrame?.(now);
    if(this.lastFrameAt!==null)this.stepBudget(Math.max(0,Math.min(2000,now-this.lastFrameAt)));
    this.lastFrameAt=now;
    // A slow CPU must not starve the GPU: drawing remains possible while
    // catch-up physics is pending. Reusing the most recent authoritative
    // snapshots gives responsive controls/cameras without lying about sim
    // time, switching engines, or overloading a frame with 2 seconds of work.
    this.draw(now);
   }catch(error){this.onError?.(error);}
   try{this.afterFrame?.(this.lastDraw,now);}catch(error){this.onError?.(error);}
   if(this.running&&epoch===this.generation)this.frameHandle=this.requestFrame(frame);
  };
  this.frameHandle=this.requestFrame(frame);
  return true;
 }
 stop(){
  if(!this.running)return false;
  this.running=false;this.generation++;
  if(this.frameHandle!==null)this.cancelFrame(this.frameHandle);
  this.frameHandle=null;return true;
 }
 async updateOsmFeatures(snapshot){
  if(this.closed)throw Error("Native game disposed");
  if(!snapshot||!Array.isArray(snapshot.buildings))throw Error("native OSM needs actual source features");
  // The exact same polygon/prism list must feed visible city geometry,
  // 1 kHz drone collision and 60 Hz cars/jet; otherwise projectiles and
  // movement silently pass through drawn walls.
  const seq=++this.osmGeneration;
  const collision=nativeBuildingCollisionSnapshot(snapshot.buildings,{
   origin:snapshot.origin,center:snapshot.center??[0,0]
  });
  const shown=await this.world.updateOsmFeatures(snapshot);
  if(this.closed||seq!==this.osmGeneration||shown?.city?.cancelled||shown?.roads?.cancelled)
   return {cancelled:true};
  const firstLoad=this.lastOsmCollision===null;
  const physics=syncNativeBuildingCollisions({flight:this.flight,rigids:this.rigids},collision);
  // Initial SpawnCity actors were constructed before genuine OSM ways
  // arrived. Some hard-coded [x,y] positions are inside a building, which
  // made the chase camera stare at a single polygon and appear blank.
  // Move only blocked initial actors using actual Box3D setPose, never
  // removing OSM geometry/collisions or creating a parallel game world.
  const heightAt=this.world.terrain?.heightAt??terrainNodeHeightAt;
  const spawnClearance=clearNativeActorSpawns(this.rigids,collision,{heightAt,firstLoad});
  // Geometry can be technically clear while the foot player is trapped in
  // an OSM courtyard. On FIRST load only, start from an actual mapped
  // pedestrian street and align the FPS view down its verified open corridor.
  // No synthetic roads, no changed Box3D building walls, no later teleport.
  if(firstLoad&&Array.isArray(snapshot.roads)&&snapshot.roads.length){
   const foot=this.rigids.pose("player-foot");
   const street=foot?chooseNativeStreetSpawn(snapshot.roads,collision,{
    origin:snapshot.origin,from:foot.position.slice(0,2),kind:"foot",maxDistanceM:95
   }):null;
   if(street){
    const ground=Number(heightAt(...street.position));
    if(!Number.isFinite(ground))throw Error("native OSM pedestrian spawn has invalid physical terrain height");
    const next=[...street.position,Math.max(ground+.97,foot.position[2])];
    if(!this.rigids.setPose("player-foot",{position:next,yaw:street.yaw}))
     throw Error("Box3D rejected genuine OSM street spawn");
    const initialView=Number(this.footInput.yaw)||0;
    if(Math.abs(initialView)<.001){
     this.footInput.yaw=street.yaw;this.footInput.pitch=-.095;
     this.gameplayState.walk.yaw=street.yaw;this.gameplayState.walk.pitch=-.095;
    }
    spawnClearance.streetFoot={...street,from:foot.position.slice(0,3),to:next};
   }
   const placeOnStreet=(id,altitude)=>{
    const pose=this.rigids.pose(id);
    if(!pose?.position)return null;
    const street=chooseNativeStreetSpawn(snapshot.roads,collision,{
     origin:snapshot.origin,from:pose.position.slice(0,2),kind:"car",maxDistanceM:140
    });
    if(!street)return null;
    const ground=Number(heightAt(...street.position));
    if(!Number.isFinite(ground))throw Error("native OSM vehicle spawn has invalid physical terrain height");
    const next=[...street.position,ground+altitude];
    if(!this.rigids.setPose(id,{position:next,yaw:street.yaw}))
     throw Error("Box3D rejected genuine OSM street spawn for "+id);
    return {id,...street,from:pose.position.slice(0,3),to:next};
   };
   const streetCar=placeOnStreet("player-car",1.15);
   const streetJet=placeOnStreet("player-jet",6.5);
   if(streetCar)spawnClearance.streetCar=streetCar;
   if(streetJet)spawnClearance.streetJet=streetJet;
  }
  this.osmCollisionOrigin=collision.originKey;
  // The same collision snapshot drives camera occlusion and rigid bodies.
  this.gameplayState.carObstacleSnapshot=collision;
  this.lastOsmCollision={...physics,hash:collision.hash,origin:collision.originKey,spawnClearance};
  return {...shown,collision:this.lastOsmCollision};
 }
 async dispose(){
  if(this.closed)return;
  this.stop();this.closed=true;this.osmGeneration++;
  await this.flightController.disconnect();
  this.world.dispose();this.rigids.destroy();this.flight.dispose();
 }
}
