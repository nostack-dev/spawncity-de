// Exact 1 kHz Box3D flight dynamics extracted from sim/simulator.mjs.
// NOT a second flight algorithm: original force, battery, motor, drag,
// collision, sensor and rotor dynamics are preserved. Presentation is managed
// exclusively by NativeWorldPresenter, no Three.js objects/legacy renderer.
// Keep the physics behavior identical to the current simulator by using its
// original public parameters and reference Box3D upstream WASM.
import {normalizeBuildingCollisionSnapshot,updateWorldBuildingCollisionBodies,
  findClearBuildingLaunchPoint,resolveBox3dCameraPath} from "./world_building_collision_physics.mjs";
import {TerrainTiles} from "./terrain_tiles.mjs";
import {createTerrainBody,TERRAIN_CRATERS_VERSION,staticGroundHeightAt,terrainRescueZ} from "./terrain_craters.mjs";
import {addPropellerSweepColliders} from "./airframe_collision_envelope.mjs";
import {deriveQuadMassProperties} from "./component_mass_model.mjs";
import {batteryOcvVoltage,batteryVoltageUnderLoad,scaleCurrentsToPackLimit,
  solveStaticPropulsionAuthority,MOTOR_BEARING_DRAG_NM_PER_RAD_S} from "./propulsion_authority.mjs";
import {MIN_GAME_AGL_SENSOR_SLANT_RANGE_M} from "./control_semantics.mjs";
import {interpolateNativeQuaternion} from "./native_flight_pose_view.mjs";
export const NATIVE_FLIGHT_PHYSICS_VERSION="same-box3d-1khz-dynamics-three-free-v1";
const DT=.001,DRONE_SUBSTEPS=1,G=9.80665;
const MOTOR_YAW_SIGN=Object.freeze([-1,1,-1,1]);
const TERRAIN_HALF=10000;
const COLLISION_TERRAIN=1n,COLLISION_AIRFRAME=2n,QUERY_RANGEFINDER=4n,QUERY_CAMERA=8n;
const AIRFRAME_COLLISION_HALF_Z_M=.022,AIRFRAME_SPAWN_Z_M=.024;
const NAV_AGL_RAY_MAX_M=MIN_GAME_AGL_SENSOR_SLANT_RANGE_M;
const $=id=>globalThis.document?.getElementById?.(id)??null;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const norm=v=>Math.hypot(v[0],v[1],v[2]);
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
class Noise {
  constructor(seed=0x45a31f27){this.s=seed>>>0;this.spare=null;this.gyroBias=[0.08,-0.05,0.04];this.accBias=[0.001,-0.0015,0.002];}
  uniform(){let x=this.s;x^=x<<13;x^=x>>>17;x^=x<<5;this.s=x>>>0;return(this.s+1)/4294967297;}
  gaussian(){if(this.spare!==null){const z=this.spare;this.spare=null;return z;}const u=Math.max(1e-12,this.uniform()),v=this.uniform(),r=Math.sqrt(-2*Math.log(u));this.spare=r*Math.sin(2*Math.PI*v);return r*Math.cos(2*Math.PI*v);}
  stepBias(dt){for(let i=0;i<3;i++){this.gyroBias[i]+=this.gaussian()*0.002*Math.sqrt(dt);this.accBias[i]+=this.gaussian()*0.00002*Math.sqrt(dt);}}
}
function validateParams(p){
  for(const[k,v]of Object.entries(p))if(typeof v==="number"&&!Number.isFinite(v))throw Error(`Invalid physical parameter ${k}`);
  for(const k of ["mass","span","propD","kv","R","J","Ct","Cq","capacity","batteryR","batteryCells","batteryMaxCurrentA","motorCurrentLimitA","escCurrentLimitA","Ixx","Iyy","Izz","rho","dragScale"])if(!(p[k]>0))throw Error(`${k} must be positive`);
  if(!Array.isArray(p.massCenter)||p.massCenter.length!==3||!p.massCenter.every(Number.isFinite))throw Error("Derived center of mass invalid");
  if(!Array.isArray(p.inertiaTensor)||p.inertiaTensor.length!==3||p.inertiaTensor.some(row=>!Array.isArray(row)||row.length!==3||!row.every(Number.isFinite)))throw Error("Derived inertia tensor invalid");
  if(!(p.groundEffect>=0))throw Error("groundEffect must be non-negative");
  if(p.Ixx+p.Iyy<=p.Izz||p.Ixx+p.Izz<=p.Iyy||p.Iyy+p.Izz<=p.Ixx)throw Error("Inertia tensor violates rigid-body triangle inequalities");
}

function quatToEuler(q){
  const[x,y,z,w]=q;
  const sinr=2*(w*x+y*z),cosr=1-2*(x*x+y*y),roll=Math.atan2(sinr,cosr);
  const sinp=2*(w*y-z*x),pitch=Math.abs(sinp)>=1?Math.sign(sinp)*Math.PI/2:Math.asin(sinp);
  const siny=2*(w*z+x*y),cosy=1-2*(y*y+z*z),yaw=Math.atan2(siny,cosy);
  return[roll*180/Math.PI,pitch*180/Math.PI,yaw*180/Math.PI];
}

function eulerToQuat(r,p,y){
  r*=Math.PI/360;p*=Math.PI/360;y*=Math.PI/360;
  const cr=Math.cos(r),sr=Math.sin(r),cp=Math.cos(p),sp=Math.sin(p),cy=Math.cos(y),sy=Math.sin(y);
  return[sr*cp*cy-cr*sp*sy,cr*sp*cy+sr*cp*sy,cr*cp*sy-sr*sp*cy,cr*cp*cy+sr*sp*sy];
}

// Same initial physical components as the shipped drone_simulator.html.
export function nativeDefaultFlightParams(overrides={}){
  const mass=deriveQuadMassProperties({
    spanM:.225,propDiameterM:.127,
    massesKg:{frame:.180,motorEach:.035,propEach:.005,battery:.200,esc:.030,
      fcRx:.020,cameraVtx:.030,wiringHardware:.100},
    placementM:{batteryX:.015,batteryZ:-.015,cameraX:-.070,cameraZ:.028}
  });
  const params={
    mass:mass.massKg,massCenter:[...mass.centerM],
    inertiaTensor:mass.inertiaTensorKgM2.map(row=>[...row]),
    span:.225,propD:.127,kv:2300,R:.080,J:.000011,Ct:.105,Cq:.012,
    capacity:1.5,batteryR:.055,batteryCells:4,batteryMaxCurrentA:180,
    motorCurrentLimitA:45,escCurrentLimitA:45,
    Ixx:mass.Ixx,Iyy:mass.Iyy,Izz:mass.Izz,
    rho:1.225,dragScale:.35,groundEffect:.18,wind:[0,0,0],
    failed:-1,imuValid:true,
    ...overrides
  };
  validateParams(params);
  params.staticAuthority=solveStaticPropulsionAuthority(params);
  return params;
}
// Construct with the SAME Box3D runtime used by the game, not a second world
// under any legacy engine. The sole returned flight model owns its body.
export function createNativeFlightPhysics(b3,params=nativeDefaultFlightParams(),options={}){
  if(!b3?.b3CreateWorld||!b3?.b3CreateBody)throw Error("Native flight requires real Box3D WASM");
class NativeFlightPhysics {
  constructor(params,{initial=null}={}){
    this.graphics=false;this.scene=null;this.noise=new Noise();this.world=null;this.body=null;
    this.worldBuildingCollisionSnapshot=normalizeBuildingCollisionSnapshot(null);
    this.worldBuildingCollisionState=null;this.worldBuildingCollisionRevision=0;
    this.renderPreviousPosition=[0,0,0];this.renderCurrentPosition=[0,0,0];
    this.renderPreviousRotation=[0,0,0,1];this.renderCurrentRotation=[0,0,0,1];
    this.renderPreviousVelocity=[0,0,0];this.renderCurrentVelocity=[0,0,0];
    this.reset(params,initial);
  }
  reset(p,initial=null){
    validateParams(p);
    this.noise=new Noise();
    this.p={...p,wind:[...p.wind]};
    this.worldBuildingLaunchResolved=false;this.worldBuildingLaunchPoint=[Number(initial?.x)||0,Number(initial?.y)||0];
    if(this.world){this.worldBuildingCollisionState=null;this.terrainTiles?.destroyAll();this.terrainTiles=null;b3.b3DestroyWorld(this.world);}
    const worldDef=b3.b3DefaultWorldDef();worldDef.gravity=[0,0,-G];worldDef.enableSleep=false;worldDef.enableContinuous=true;this.world=b3.b3CreateWorld(worldDef);
    this.terrainBodies=[];this.rebuildTerrain();
    const bodyDef=b3.b3DefaultBodyDef();bodyDef.type=b3.b3BodyType.b3_dynamicBody;const initialZ=Number.isFinite(initial?.z)?initial.z:AIRFRAME_SPAWN_Z_M;const spawnGroundZ=staticGroundHeightAt(initial?.x||0,initial?.y||0);this.lastGroundZ=spawnGroundZ;bodyDef.position=[initial?.x||0,initial?.y||0,Math.max(spawnGroundZ+AIRFRAME_SPAWN_Z_M,initialZ)];bodyDef.rotation=initial?[...eulerToQuat(initial.roll_deg||0,initial.pitch_deg||0,initial.yaw_deg||0)]:[0,0,0,1];bodyDef.linearDamping=.002;bodyDef.angularDamping=.002;bodyDef.enableSleep=false;this.body=b3.b3CreateBody(this.world,bodyDef);
    const shapeDef=b3.b3DefaultShapeDef();shapeDef.density=100;shapeDef.baseMaterial.friction=.65;shapeDef.baseMaterial.restitution=.08;shapeDef.filter={categoryBits:COLLISION_AIRFRAME,maskBits:COLLISION_TERRAIN,groupIndex:0};b3.b3CreateBoxShape(this.body,shapeDef,.055,.045,AIRFRAME_COLLISION_HALF_Z_M);
    const arm=p.span/(2*Math.sqrt(2));this.motorPos=[[-arm,-arm,0],[-arm,arm,0],[arm,arm,0],[arm,-arm,0]];
    for(const position of this.motorPos){b3.b3CreateCapsuleShape(this.body,shapeDef,{center1:[0,0,0],center2:position,radius:.008});b3.b3CreateSphereShape(this.body,shapeDef,{center:position,radius:.018});}
    addPropellerSweepColliders(b3,this.body,shapeDef,this.motorPos,p.propD);
    this.skidHalfLength=Math.min(.045,Math.max(.03,p.span*.18));
    const mass=b3.b3Body_GetMassData(this.body);mass.mass=p.mass;mass.center=[...p.massCenter];const I=p.inertiaTensor;mass.inertia={cx:[I[0][0],I[1][0],I[2][0]],cy:[I[0][1],I[1][1],I[2][1]],cz:[I[0][2],I[1][2],I[2][2]]};b3.b3Body_SetMassData(this.body,mass);
    if(initial?.vx!=null && b3.b3Body_SetLinearVelocity)b3.b3Body_SetLinearVelocity(this.body,[initial.vx||0,initial.vy||0,initial.vz||0]);
    this.motorOmega=[0,0,0,0];this.motorCurrent=[0,0,0,0];this.motorTorque=[0,0,0,0];this.propTorque=[0,0,0,0];this.motorPower=[0,0,0,0];this.batterySoc=1;this.batteryVoltage=4.2*p.batteryCells;this.batteryCurrent=0;this.worldAcceleration=[0,0,0];this.prevOmegaBody=[0,0,0];this.imuBytes=new Uint8Array(14);this.imuView=new DataView(this.imuBytes.buffer);this.motorBackEmf=60/(2*Math.PI*p.kv);this.propDiameter4=p.propD**4;this.propDiameter5=p.propD**5;this.cdA=[.035*p.dragScale,.035*p.dragScale,.07*p.dragScale];this.rebuildWorldBuildingCollisions();this.syncPresentationSnapshots();

  }
  // Ground = flat box with crater holes filled by surface-following slabs
  // (terrain_craters.mjs). Rebuilt when a nuke crater appears or resets.
  rebuildTerrain(regions=null){if(!this.world)return 0;const groundShape=b3.b3DefaultShapeDef();groundShape.baseMaterial.friction=.75;groundShape.baseMaterial.restitution=.03;groundShape.filter={categoryBits:COLLISION_TERRAIN,maskBits:COLLISION_AIRFRAME|QUERY_RANGEFINDER|QUERY_CAMERA,groupIndex:0};
    // Box3D height-field tiles shared with the rendered ground; deformations rebuild only changed tiles.
    if(!this.terrainTiles){this.terrainTiles=new TerrainTiles(b3,this.world,groundShape,{floorHalfM:TERRAIN_HALF});regions=null;}
    let result;if(this.terrainTiles.available){this.terrainTiles.update(regions);this.terrainBodies=this.terrainTiles.bodies;result={shapeCount:this.terrainTiles.shapeCount};}
    else{for(const body of this.terrainBodies||[])if(b3.b3Body_IsValid?.(body)!==false)b3.b3DestroyBody(body);this.terrainBodies=[];result=createTerrainBody(b3,this.world,groundShape,TERRAIN_HALF);this.terrainBodies=result.bodies;}const viewport=$("viewport");if(viewport){viewport.dataset.terrainVersion=TERRAIN_CRATERS_VERSION;viewport.dataset.terrainShapes=String(result.shapeCount);}return result.shapeCount;}
  // Never trapped under the terrain: if the airframe is below the physical
  // surface (terrain rose under it, spawned before the DEM loaded, tunnelled
  // through), put it back on top with its horizontal motion and no downward speed.
  // On a terrain change a drone standing / flying low keeps its exact height
  // above the new ground (no drop, no jolt for the IMU calibration).
  reseatOnTerrain(){if(!this.body||!this.world||!Number.isFinite(this.lastGroundZ))return this.rescueFromTerrain();const p=this.position(),g=staticGroundHeightAt(p[0],p[1]),agl=p[2]-this.lastGroundZ;if(agl>-.5&&agl<3&&Math.abs(g-this.lastGroundZ)>1e-4){b3.b3Body_SetTransform(this.body,[p[0],p[1],g+Math.max(agl,AIRFRAME_SPAWN_Z_M)],this.rotation());this.lastGroundZ=g;if(this.graphics)this.syncPresentationSnapshots();return true;}return this.rescueFromTerrain();}
  rescueFromTerrain(){if(!this.body||!this.world)return false;const p=this.position();this.lastGroundZ=staticGroundHeightAt(p[0],p[1]);const z=terrainRescueZ(p[0],p[1],p[2],AIRFRAME_SPAWN_Z_M+.05);if(z===null)return false;const v=this.linear();b3.b3Body_SetTransform(this.body,[p[0],p[1],z],this.rotation());b3.b3Body_SetLinearVelocity(this.body,[v[0],v[1],Math.max(0,v[2])]);this.terrainRescues=(this.terrainRescues||0)+1;if(this.graphics){this.syncPresentationSnapshots();const viewport=$("viewport");if(viewport)viewport.dataset.terrainRescues=String(this.terrainRescues);}return true;}
  setWorldBuildingCollisions(value){const snapshot=normalizeBuildingCollisionSnapshot(value);if(snapshot.hash===this.worldBuildingCollisionSnapshot.hash&&snapshot.prismCount===this.worldBuildingCollisionSnapshot.prismCount)return false;this.worldBuildingCollisionSnapshot=snapshot;this.rebuildWorldBuildingCollisions();return true;}
  resolveWorldBuildingLaunch(){
    if(!this.body||!this.worldBuildingCollisionSnapshot.prismCount)return false;
    const position=this.position(),velocity=this.linear(),angular=this.angular(),reference=Array.isArray(this.worldBuildingLaunchPoint)&&this.worldBuildingLaunchPoint.length===2&&this.worldBuildingLaunchPoint.every(Number.isFinite)?this.worldBuildingLaunchPoint:[position[0],position[1]],untouched=Math.hypot(position[0]-reference[0],position[1]-reference[1])<.14&&position[2]<=staticGroundHeightAt(position[0],position[1])+AIRFRAME_SPAWN_Z_M+.08&&norm(velocity)<.20&&norm(angular)<.80;
    if(!untouched){this.worldBuildingLaunchResolved=true;this.worldBuildingLaunchPoint=[Infinity,Infinity];return false;}
    const safe=findClearBuildingLaunchPoint(this.worldBuildingCollisionSnapshot,{point:[position[0],position[1]],clearanceM:.55,maxSearchM:80}),offset=Math.hypot(safe[0]-position[0],safe[1]-position[1]);
    this.worldBuildingLaunchResolved=false;this.worldBuildingLaunchPoint=[safe[0],safe[1]];
    const viewport=$("viewport");if(viewport){viewport.dataset.worldLaunchRelocated=offset>.01?"1":"0";viewport.dataset.worldLaunchOffsetM=offset.toFixed(3);viewport.dataset.worldLaunchX=Number(safe[0]).toFixed(3);viewport.dataset.worldLaunchY=Number(safe[1]).toFixed(3);}
    if(offset<=.01)return false;
    b3.b3Body_SetTransform(this.body,[safe[0],safe[1],staticGroundHeightAt(safe[0],safe[1])+AIRFRAME_SPAWN_Z_M],this.rotation());b3.b3Body_SetLinearVelocity(this.body,[0,0,0]);b3.b3Body_SetAngularVelocity(this.body,[0,0,0]);this.syncPresentationSnapshots();return true;
  }
  rebuildWorldBuildingCollisions(){if(!this.world)return;this.resolveWorldBuildingLaunch();this.worldBuildingCollisionState=updateWorldBuildingCollisionBodies(b3,this.world,this.worldBuildingCollisionState,this.worldBuildingCollisionSnapshot,{categoryBits:COLLISION_TERRAIN,maskBits:COLLISION_AIRFRAME|QUERY_RANGEFINDER|QUERY_CAMERA,launchExclusionPoint:this.worldBuildingLaunchPoint||[Infinity,Infinity]});this.worldBuildingCollisionRevision++;}
  localVector(v){return b3.b3Body_GetLocalVector([0,0,0],this.body,v);}
  worldVector(v){return b3.b3Body_GetWorldVector([0,0,0],this.body,v);}
  worldPoint(v){return b3.b3Body_GetWorldPoint([0,0,0],this.body,v);}
  linear(){return b3.b3Body_GetLinearVelocity([0,0,0],this.body);}
  angular(){return b3.b3Body_GetAngularVelocity([0,0,0],this.body);}
  position(){return b3.b3Body_GetPosition([0,0,0],this.body);}
  rotation(){return b3.b3Body_GetRotation([0,0,0,1],this.body);}
  syncPresentationSnapshots(){
    const position=this.position(),rotation=this.rotation(),velocity=this.linear();
    for(let i=0;i<3;i++){this.renderPreviousPosition[i]=this.renderCurrentPosition[i]=position[i];this.renderPreviousVelocity[i]=this.renderCurrentVelocity[i]=velocity[i];}
    for(let i=0;i<4;i++)this.renderPreviousRotation[i]=this.renderCurrentRotation[i]=rotation[i];
  }
  capturePresentationStep(){
    for(let i=0;i<3;i++){this.renderPreviousPosition[i]=this.renderCurrentPosition[i];this.renderPreviousVelocity[i]=this.renderCurrentVelocity[i];}
    for(let i=0;i<4;i++)this.renderPreviousRotation[i]=this.renderCurrentRotation[i];
  }
  capturePresentationCurrent(){
    const position=this.position(),rotation=this.rotation(),velocity=this.linear();
    for(let i=0;i<3;i++){this.renderCurrentPosition[i]=position[i];this.renderCurrentVelocity[i]=velocity[i];}
    for(let i=0;i<4;i++)this.renderCurrentRotation[i]=rotation[i];
  }
  presentationPose(alpha=1){
    const t=clamp(Number(alpha)||0,0,1),lerp=(a,b)=>a.map((v,i)=>v+(b[i]-v)*t);
    return {
      position:lerp(this.renderPreviousPosition,this.renderCurrentPosition),
      quaternion:interpolateNativeQuaternion(this.renderPreviousRotation,this.renderCurrentRotation,t),
      velocity:lerp(this.renderPreviousVelocity,this.renderCurrentVelocity)
    };
  }
  groundRange(maxRange=12){
    const range=clamp(Number(maxRange)||12,.05,NAV_AGL_RAY_MAX_M),origin=this.worldPoint([0,0,-.018]),down=this.worldVector([0,0,-1]),verticalProjection=-down[2];
    if(!(verticalProjection>.55))return{valid:false,slant:0,agl:0,verticalProjection};
    const filter=b3.b3DefaultQueryFilter();filter.categoryBits=QUERY_RANGEFINDER;filter.maskBits=COLLISION_TERRAIN;const hit=b3.b3World_CastRayClosest(this.world,origin,scale(down,range),filter),fraction=Number(hit?.fraction);
    if(!hit?.hit||!Number.isFinite(fraction)||fraction<0||fraction>1)return{valid:false,slant:0,agl:0,verticalProjection};
    const slant=fraction*range,agl=slant*verticalProjection;
    return{valid:slant>=.001&&slant<=range&&Number.isFinite(agl),slant,agl,verticalProjection};
  }
  resolveCameraPath(anchor,desired){const a=Array.isArray(anchor)?anchor:[0,0,0],g=staticGroundHeightAt(Number(a[0])||0,Number(a[1])||0);return resolveBox3dCameraPath(b3,this.world,anchor,desired,{queryCategoryBits:QUERY_CAMERA,terrainCategoryBits:COLLISION_TERRAIN,clearanceM:.08,anchorClearanceM:(Number(a[2])||0)-(Number.isFinite(g)?g:0)});}
  imuRaw(dt=DT){
    this.noise.stepBias(dt);
    const omegaBody=this.localVector(this.angular()),alpha=scale(sub(omegaBody,this.prevOmegaBody),1/dt);this.prevOmegaBody=omegaBody.slice();
    const specific=this.localVector(sub(this.worldAcceleration,[0,0,-G])),sensorOffset=[0,0,.008],accel=add(specific,add(cross(alpha,sensorOffset),cross(omegaBody,cross(omegaBody,sensorOffset)))),gyro=scale(omegaBody,180/Math.PI);
    for(let i=0;i<3;i++){accel[i]+=this.noise.accBias[i]*G+this.noise.gaussian()*.0025*G;gyro[i]+=this.noise.gyroBias[i]+this.noise.gaussian()*.035;}
    const raw=this.imuBytes,view=this.imuView,sat=x=>clamp(Math.round(x),-32767,32767);
    view.setInt16(0,0,false);view.setInt16(2,sat(accel[0]/G*2048),false);view.setInt16(4,sat(accel[1]/G*2048),false);view.setInt16(6,sat(accel[2]/G*2048),false);view.setInt16(8,sat(gyro[0]*16.4),false);view.setInt16(10,sat(gyro[1]*16.4),false);view.setInt16(12,sat(gyro[2]*16.4),false);
    return raw;
  }
  batteryOcv(){return batteryOcvVoltage(this.batterySoc,this.p.batteryCells);}
  applyForces(pulses,dt=DT){
    const p=this.p,yawSign=MOTOR_YAW_SIGN,diameter=p.propD,backEmf=this.motorBackEmf,torqueConstant=backEmf,ocv=this.batteryOcv(),currents=this.motorCurrent;let total=0;
    for(let pass=0;pass<2;pass++){
      total=0;
      for(let i=0;i<4;i++){
        let command=clamp((pulses[i]-1000)/1000,0,1);
        if(i===p.failed)command=0;
        const volts=command*(pass?this.batteryVoltage:ocv);
        currents[i]=clamp((volts-backEmf*this.motorOmega[i])/p.R,0,Math.min(p.motorCurrentLimitA,p.escCurrentLimitA));
        total+=currents[i];
      }
      total=scaleCurrentsToPackLimit(currents,p.batteryMaxCurrentA);
      this.batteryVoltage=batteryVoltageUnderLoad(ocv,total,p.batteryR,p.batteryCells);
    }
    this.batteryCurrent=total;
    this.batterySoc=clamp(this.batterySoc-total*dt/(p.capacity*3600),0,1);
    const localVelocity=this.localVector(this.linear()),altitude=Math.max(.001,this.position()[2]);
    for(let i=0;i<4;i++){
      const revolutions=this.motorOmega[i]/(2*Math.PI),propTorque=p.Cq*p.rho*revolutions*revolutions*this.propDiameter5,motorTorque=torqueConstant*currents[i];
      this.motorTorque[i]=motorTorque;this.propTorque[i]=propTorque;this.motorPower[i]=Math.max(0,motorTorque*this.motorOmega[i]);
      this.motorOmega[i]=Math.max(0,this.motorOmega[i]+(motorTorque-propTorque-MOTOR_BEARING_DRAG_NM_PER_RAD_S*this.motorOmega[i])*dt/p.J);
      const n=this.motorOmega[i]/(2*Math.PI);let thrust=p.Ct*p.rho*n*n*this.propDiameter4;
      const advance=localVelocity[2]/Math.max(1,n*diameter);thrust*=clamp(1-.12*advance,.55,1.25);thrust*=1+p.groundEffect*Math.exp(-altitude/Math.max(.02,.75*diameter));
      b3.b3Body_ApplyForce(this.body,this.worldVector([0,0,thrust]),this.worldPoint(this.motorPos[i]),true);
      b3.b3Body_ApplyTorque(this.body,this.worldVector([0,0,yawSign[i]*motorTorque]),true);
    }
    const relative=this.localVector(sub(this.linear(),p.wind)),cdA=this.cdA,horizontalSpeed=Math.hypot(relative[0],relative[1]),drag=[-.5*p.rho*cdA[0]*relative[0]*horizontalSpeed,-.5*p.rho*cdA[1]*relative[1]*horizontalSpeed,-.5*p.rho*cdA[2]*relative[2]*Math.abs(relative[2])];b3.b3Body_ApplyForceToCenter(this.body,this.worldVector(drag),true);
    const omega=this.localVector(this.angular()),angularDrag=omega.map(v=>-.0012*v*Math.abs(v));b3.b3Body_ApplyTorque(this.body,this.worldVector(angularDrag),true);
  }
  // A parked airframe (motors stopped, at rest for 0.5 s) is not stepped: exactly what Box3D's
  // own sleeping does, which this world keeps off for the IMU path. Stepping it 1000×/s while
  // the player walks, drives or flies the jet was a quarter of the whole frame's CPU. Any motor
  // command, a teleport or an impulse (pose/velocity no longer the parked ones) wakes it at once.
  parkedCheck(pulses){
    let commanded=false;for(let i=0;i<4;i++)if(pulses[i]>1000||this.motorOmega[i]>1e-3){commanded=true;break;}
    if(commanded){this.parkedSteps=0;this.parked=null;return false;}
    const v=this.linear(),pos=this.position();
    if(this.parked){const q=this.parked;if(Math.abs(v[0])+Math.abs(v[1])+Math.abs(v[2])<1e-9&&pos[0]===q[0]&&pos[1]===q[1]&&pos[2]===q[2])return true;this.parked=null;this.parkedSteps=0;return false;}
    const w=this.angular();if(Math.hypot(v[0],v[1],v[2])<2e-3&&Math.hypot(w[0],w[1],w[2])<2e-3){if((this.parkedSteps=(this.parkedSteps||0)+1)>500){b3.b3Body_SetLinearVelocity(this.body,[0,0,0]);b3.b3Body_SetAngularVelocity(this.body,[0,0,0]);this.parked=this.position();this.worldAcceleration=[0,0,0];return true;}}else this.parkedSteps=0;
    return false;
  }
  step(pulses,dt=DT){
    this.capturePresentationStep();
    if(this.parkedCheck(pulses)){this.terrainTiles?.tick();this.capturePresentationCurrent();return;}
    this.applyForces(pulses,dt);
    const before=this.linear();
    this.terrainTiles?.tick();
    // 1 kHz steps: one Box3D substep is already 4× finer than Box3D's design point (60 Hz × 4);
    // four substeps per 1 ms step tripled the solver work for no physical difference.
    b3.b3World_Step(this.world,dt,DRONE_SUBSTEPS);
    if(((this.terrainGuardTick=(this.terrainGuardTick||0)+1)&3)===0)this.rescueFromTerrain();
    this.worldAcceleration=scale(sub(this.linear(),before),1/dt);
    this.capturePresentationCurrent();
  }
  state(){const p=this.position(),q=this.rotation(),v=this.linear();return{x:p[0],y:p[1],z:p[2],vx:v[0],vy:v[1],vz:v[2],speed:norm(v),attitude:quatToEuler(q),battery_v:this.batteryVoltage,current_a:this.batteryCurrent};}
  dispose(){
    if(!this.world)return false;
    this.terrainTiles?.destroyAll?.();this.terrainTiles=null;
    b3.b3DestroyWorld(this.world);this.world=null;this.body=null;return true;
  }
}
  return new NativeFlightPhysics(params,options);
}
