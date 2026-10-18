import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {NativeFlightController,nativeSbusPacket,crc32,NATIVE_FLIGHT_WIRE_BYTES} from "../sim/native_flight_controller_wasm.mjs";
const source=readFileSync("sim/native_flight_controller_wasm.mjs","utf8");
assert.doesNotMatch(source,/\bTHREE\.|from\s*["']three["']/);
assert.deepEqual(NATIVE_FLIGHT_WIRE_BYTES,{input:80,output:32,nav:20});
assert.equal(nativeSbusPacket({arm:true,throttle:.5}).length,25);
assert.equal(nativeSbusPacket({arm:false,throttle:0})[0],15);
const packets=[],motorOutputs=[],physics={
 p:{imuValid:true},
 imuRaw:()=>new Uint8Array(14),
 step:(pulses,dt)=>{assert.equal(dt,.001);motorOutputs.push([...pulses]);},
 linear:()=>[1,2,0],rotation:()=>[0,0,0,1],
 groundRange:()=>({valid:true,slant:1.3,verticalProjection:1})
};
let arm=true,throttle=.4;
const backend={
 ready:true,
 exchangeSync(bytes){
  const frame=new Uint8Array(bytes);
  assert.equal(frame.length,80);assert.equal(new DataView(frame.buffer).getUint32(0,true),0x314c4948);
  assert.equal(crc32(frame,76),new DataView(frame.buffer).getUint32(76,true));
  packets.push(frame);
  return {sequence:packets.length-1,motors:[1300,1300,1300,1300],state:1,processingUs:40};
 },
 reset(){return Promise.resolve();},
 disconnect(){this.ready=false;return Promise.resolve();}
};
const fc=new NativeFlightController(physics,{backend,controls:()=>({arm,throttle})});
for(let i=0;i<32;i++)fc.tick();
assert.equal(fc.ticks,32);
assert.equal(packets.length,32);
assert.equal(motorOutputs.length,32);
const view=frame=>new DataView(frame.buffer);
assert.equal(view(packets[0]).getUint32(4,true),0);
assert.equal(view(packets[31]).getUint32(4,true),31);
assert.ok((view(packets[0]).getUint16(14,true)&2)!==0,"first tick resets real firmware state");
assert.ok((view(packets[1]).getUint16(14,true)&2)===0,"reset must not repeat");
const sbus=packets.filter(p=>(view(p).getUint16(14,true)&4)!==0);
const nav=packets.filter(p=>(view(p).getUint16(14,true)&8)!==0);
assert.equal(sbus.length,3,"SBUS updates exactly every 10 ms");
assert.equal(nav.length,3,"NAV1 updates exactly every 10 ms");
assert.ok(sbus.every(p=>p[30]===15),"real SBUS 0x0f wire preamble");
assert.ok(nav.every(p=>view(p).getUint32(55,true)===0x3156414e),"real NAV1 magic and CRC");
assert.ok(packets.every(p=>(view(p).getUint16(14,true)&1)!==0),"IMU delivered at 1 kHz");
await fc.reset();
assert.equal(fc.ticks,0);
fc.tick();
assert.ok((view(packets.at(-1)).getUint16(14,true)&2)!==0,"firmware reset flag restored on reset");
await fc.disconnect();
assert.throws(()=>fc.tick(),/not connected/);
console.log("native flight wire: original 1 kHz IMU, 100 Hz SBUS/NAV, HIL1 magic/CRC and firmware reset preserved");
