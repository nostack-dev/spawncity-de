// Identical original HIL1/SBUS/NAV1 wire path and shared Flight Core WASM.
// Reads authoritative NativeFlightPhysics only; NO Three.js, substitute
// PID controller, GPU clock or second physics world.
import {MIN_GAME_CLEARANCE_M,MAX_GAME_CLEARANCE_M,
  MIN_GAME_AGL_SENSOR_SLANT_RANGE_M} from "./control_semantics.mjs";
export const NATIVE_FLIGHT_WASM_VERSION="original-1khz-wire-controller-native-v1";
const DT=.001,G=9.80665;
const NAV_AGL_RAY_MAX_M=MIN_GAME_AGL_SENSOR_SLANT_RANGE_M;
const INPUT_MAGIC=0x314c4948,OUTPUT_MAGIC=0x314f4c48;
const INPUT_BYTES=80,OUTPUT_BYTES=32,NAVIGATION_BYTES=20;
const FLAG_IMU_PRESENT=1,FLAG_RESET=2,FLAG_SBUS_PRESENT=4,FLAG_NAVIGATION_PRESENT=8;
const NAV_VELOCITY_VALID=1<<0,NAV_AGL_VALID=1<<1,NAV_HEADING_VALID=1<<2;
const NAV_HEADING_SHIFT=3,NAV_SPLIT_VALIDITY=1<<15;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function crc32(bytes, length=bytes.byteLength) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let c = 0xffffffff;
  for (let i=0;i<length;i++) {
    c ^= u[i];
    for (let bit=0;bit<8;bit++) c = (c>>>1) ^ ((c&1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function crc16Ccitt(bytes,length=bytes.byteLength){
  let crc=0xffff;
  for(let i=0;i<length;i++){crc^=bytes[i]<<8;for(let bit=0;bit<8;bit++)crc=((crc<<1)^((crc&0x8000)?0x1021:0))&0xffff;}
  return crc;
}
function encodeNavigationWire(sequence,measurement){
  const bytes=new Uint8Array(NAVIGATION_BYTES),view=new DataView(bytes.buffer),s16=value=>clamp(Math.round(value*100),-32767,32767);
  view.setUint32(0,0x3156414e,true);view.setUint16(4,1,true);view.setUint16(6,sequence&0xffff,true);
  view.setInt16(8,s16(measurement.vx),true);view.setInt16(10,s16(measurement.vy),true);view.setInt16(12,s16(measurement.vz),true);
  let flags=NAV_SPLIT_VALIDITY|(measurement.velocityValid?NAV_VELOCITY_VALID:0)|(measurement.aglValid?NAV_AGL_VALID:0);
  if(measurement.headingValid&&Number.isFinite(measurement.headingDeg)){
    const wrapped=((measurement.headingDeg%360)+360)%360,code=Math.round(wrapped*10)%3600;
    flags|=NAV_HEADING_VALID|(code<<NAV_HEADING_SHIFT);
  }
  view.setUint16(14,clamp(Math.round(Math.max(0,measurement.agl)*1000),0,65535),true);view.setUint16(16,flags,true);
  view.setUint16(18,crc16Ccitt(bytes,18),true);return bytes;
}

function parseOutput(bytes,target=null) {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength !== OUTPUT_BYTES || d.getUint32(0,true) !== OUTPUT_MAGIC) throw Error("Invalid HLO1 response");
  if (crc32(bytes,28) !== d.getUint32(28,true)) throw Error("HLO1 CRC mismatch");
  const output=target||{sequence:0,motors:[0,0,0,0],attitude:[0,0,0],state:0,processingUs:0};
  output.sequence=d.getUint32(4,true);output.motors[0]=d.getUint16(8,true);output.motors[1]=d.getUint16(10,true);output.motors[2]=d.getUint16(12,true);output.motors[3]=d.getUint16(14,true);
  output.attitude[0]=d.getInt16(16,true)/100;output.attitude[1]=d.getInt16(18,true)/100;output.attitude[2]=d.getInt16(20,true)/100;
  output.state=d.getUint16(22,true);output.processingUs=d.getUint32(24,true);return output;
}

function encodeSbus(channels) {
  const packet = new Uint8Array(25);
  packet[0]=0x0f;
  packet[24]=0;
  for (let channel=0;channel<16;channel++) {
    const value = channels[channel] & 2047;
    for (let bit=0;bit<11;bit++) {
      if (value & (1<<bit)) {
        const k=8+channel*11+bit;
        packet[k>>3] |= 1<<(k&7);
      }
    }
  }
  return packet;
}

const controllerInputPacket=new Uint8Array(INPUT_BYTES),controllerInputView=new DataView(controllerInputPacket.buffer);
function makeInput(sequence,imu,sbus,flags,dtUs=1000,navigationFrame=null,missedSamples=0) {
  const bytes=controllerInputPacket,view=controllerInputView;bytes.fill(0);
  view.setUint32(0,INPUT_MAGIC,true);view.setUint32(4,sequence,true);view.setUint32(8,dtUs,true);
  view.setUint16(12,clamp(missedSamples|0,0,65535),true);view.setUint16(14,flags,true);
  bytes.set(imu,16);if(sbus)bytes.set(sbus,30);if(navigationFrame)bytes.set(navigationFrame,55);
  view.setUint32(76,crc32(bytes,76),true);return bytes;
}


export class NativeWasmBackend {
  constructor(factory){this.factory=factory;this.module=null;this.inPtr=0;this.outPtr=0;this.ready=false;this.output={sequence:0,motors:[0,0,0,0],attitude:[0,0,0],state:0,processingUs:0};}
  async connect(){
    if(typeof this.factory!=="function")throw Error("Native flight requires the real WASM Flight Core factory");
    this.module = await this.factory();
    if (this.module._fc_input_size() !== INPUT_BYTES || this.module._fc_output_size() !== OUTPUT_BYTES) throw Error("WASM HIL protocol size mismatch");
    if (this.module._fc_protocol_version() !== 3) throw Error("WASM HIL protocol version mismatch");
    this.inPtr=this.module._fc_input_buffer();
    this.outPtr=this.module._fc_output_buffer();
    this.module._fc_reset();
    this.ready=true;
  }
  async disconnect(){this.ready=false;this.module=null;}
  async reset(){if(this.module)this.module._fc_reset();}
  exchangeSync(packet){
    if(!this.ready) throw Error("WASM flight core not ready");
    this.module.HEAPU8.set(packet,this.inPtr);
    this.module._fc_process();
    return parseOutput(this.module.HEAPU8.subarray(this.outPtr,this.outPtr+OUTPUT_BYTES),this.output);
  }
  async exchange(packet){return this.exchangeSync(packet);}
  label(){return "raw sensor wire → shared fc::FirmwareRuntime → shared fc::StateRuntime → fc::Runtime / WASM";}
}


class Noise {
  constructor(seed=0x45a31f27){this.s=seed>>>0;this.spare=null;this.gyroBias=[0.08,-0.05,0.04];this.accBias=[0.001,-0.0015,0.002];}
  uniform(){let x=this.s;x^=x<<13;x^=x>>>17;x^=x<<5;this.s=x>>>0;return(this.s+1)/4294967297;}
  gaussian(){if(this.spare!==null){const z=this.spare;this.spare=null;return z;}const u=Math.max(1e-12,this.uniform()),v=this.uniform(),r=Math.sqrt(-2*Math.log(u));this.spare=r*Math.sin(2*Math.PI*v);return r*Math.cos(2*Math.PI*v);}
  stepBias(dt){for(let i=0;i<3;i++){this.gyroBias[i]+=this.gaussian()*0.002*Math.sqrt(dt);this.accBias[i]+=this.gaussian()*0.00002*Math.sqrt(dt);}}
}


function quatToEuler(q){
  const[x,y,z,w]=q;
  const sinr=2*(w*x+y*z),cosr=1-2*(x*x+y*y),roll=Math.atan2(sinr,cosr);
  const sinp=2*(w*y-z*x),pitch=Math.abs(sinp)>=1?Math.sign(sinp)*Math.PI/2:Math.asin(sinp);
  const siny=2*(w*z+x*y),cosy=1-2*(y*y+z*z),yaw=Math.atan2(siny,cosy);
  return[roll*180/Math.PI,pitch*180/Math.PI,yaw*180/Math.PI];
}
class SimNavigationSensors {
  constructor(){this.reset();}
  reset(){this.noise=new Noise(0x7193ab21);this.headingNoise=new Noise(0x45a1d1a5);this.elapsed=.01;this.filtered=[0,0,0];this.sequence=1;this.last={vx:0,vy:0,vz:0,agl:0,valid:false,velocityValid:false,aglValid:false,headingDeg:0,headingValid:false};}
  sampleFrame(model,dt=DT){
    this.elapsed+=dt;if(this.elapsed<.01)return null;this.elapsed-=.01;
    const truth=model.linear(),alpha=.42;
    for(let i=0;i<3;i++){const measured=truth[i]+this.noise.gaussian()*.025;this.filtered[i]+=alpha*(measured-this.filtered[i]);}
    const velocityValid=this.filtered.every(Number.isFinite),range=model.groundRange(NAV_AGL_RAY_MAX_M),aglValid=range.valid;let agl=0;
    if(aglValid){const measuredSlant=Math.max(0,range.slant+this.noise.gaussian()*.004);agl=measuredSlant*range.verticalProjection;}
    const truthHeading=quatToEuler(model.rotation())[2],headingDeg=(((truthHeading+this.headingNoise.gaussian()*.12+180)%360)+360)%360-180,headingValid=Number.isFinite(headingDeg);
    this.last={vx:this.filtered[0],vy:this.filtered[1],vz:this.filtered[2],agl,valid:velocityValid&&aglValid&&headingValid,velocityValid,aglValid,headingDeg,headingValid};
    return encodeNavigationWire(this.sequence++,this.last);
  }
}


class SimSbusReceiver {
  constructor(){this.reset();}
  reset(){this.elapsed=.01;}
  sample(makeFrame,dt=DT){this.elapsed+=dt;if(this.elapsed<.01)return null;this.elapsed-=.01;return makeFrame();}
}


export {crc32,encodeSbus,encodeNavigationWire,parseOutput};
export const NATIVE_FLIGHT_WIRE_BYTES={input:INPUT_BYTES,output:OUTPUT_BYTES,nav:NAVIGATION_BYTES};
export function nativeSbusPacket(c={}){
 const channels=new Array(16).fill(992);
 channels[0]=Math.round(992+820*clamp(Number(c.roll)||0,-1,1));
 channels[1]=Math.round(992+820*clamp(Number(c.pitch)||0,-1,1));
 channels[3]=Math.round(992+820*clamp(Number(c.yaw)||0,-1,1));
 channels[4]=c.arm?1811:172;
 if(c.gameMode){
  channels[2]=172;
  const clearance=clamp(Number(c.groundClearance)||2,MIN_GAME_CLEARANCE_M,MAX_GAME_CLEARANCE_M);
  channels[5]=Math.round(172+1639*(clearance-MIN_GAME_CLEARANCE_M)/(MAX_GAME_CLEARANCE_M-MIN_GAME_CLEARANCE_M));
  channels[6]=1811;
  channels[7]=Math.round(992+820*clamp(Number(c.bodyPitch)||0,-1,1));
 }else channels[2]=Math.round(172+1639*clamp(Number(c.throttle)||0,0,1));
 return encodeSbus(channels);
}
export class NativeFlightController{
 constructor(physics,{factory,controls=()=>({arm:false,throttle:0}),backend=null}={}){
  if(!physics?.imuRaw||!physics?.step||!physics?.groundRange||typeof controls!=="function")
   throw Error("Native Flight Core requires the original 1 kHz Box3D model");
  this.physics=physics;this.controls=controls;
  this.backend=backend??new NativeWasmBackend(factory);
  this.navigationSensors=new SimNavigationSensors();
  this.sbusReceiver=new SimSbusReceiver();
  this.sequence=0;this.resetFlag=true;this.ticks=0;this.latest=null;
 }
 async connect(){await this.backend.connect();return this;}
 tick(){
  if(!this.backend.ready)throw Error("Flight Core WASM not connected");
  // The original simulator builds NAV1 and SBUS from the exact same 1 ms
  // model state, sends the IMU as HIL1, then applies firmware motor output.
  // Sample rate is 1 kHz/100 Hz/100 Hz respectively (no fabricated data).
  const seq=this.sequence++;
  const nav=this.navigationSensors.sampleFrame(this.physics,DT);
  const sbus=this.sbusReceiver.sample(()=>nativeSbusPacket(this.controls()),DT);
  let flags=(this.physics.p.imuValid?FLAG_IMU_PRESENT:0)|(this.resetFlag?FLAG_RESET:0);
  if(sbus)flags|=FLAG_SBUS_PRESENT;
  if(nav)flags|=FLAG_NAVIGATION_PRESENT;
  const packet=makeInput(seq,this.physics.imuRaw(DT),sbus,flags,1000,nav,0);
  this.resetFlag=false;
  this.latest=this.backend.exchangeSync(packet);
  this.physics.step(this.latest.motors,DT);
  this.ticks++;
  return this.latest;
 }
 reset(){this.sequence=0;this.resetFlag=true;this.ticks=0;this.latest=null;
  this.navigationSensors.reset();this.sbusReceiver.reset();return this.backend.reset();}
 async disconnect(){await this.backend.disconnect();this.latest=null;}
}
