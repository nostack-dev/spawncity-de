import assert from "node:assert/strict";
import {nativeDrawingBufferSize,nativePointerToDrawingPixels} from "../sim/native_viewport.mjs";
const canvas={clientWidth:360,clientHeight:780,width:360,height:780};
for(const dpr of [1,1.5,2,2.625,3]){
 const size=nativeDrawingBufferSize(canvas,dpr);
 assert.equal(size.width,Math.round(360*dpr));
 assert.equal(size.height,Math.round(780*dpr));
 const center=nativePointerToDrawingPixels(canvas,180,390,size.width,size.height);
 assert.equal(center.x,size.width/2);
 assert.equal(center.y,size.height/2);
}
const full=nativeDrawingBufferSize({...canvas,clientWidth:844,clientHeight:390},3);
assert.equal(full.width,2532);assert.equal(full.height,1170);
const origin=nativePointerToDrawingPixels(canvas,0,0,720,1560);
assert.deepEqual(origin,{x:0,y:0});
const edge=nativePointerToDrawingPixels(canvas,360,780,720,1560);
assert.deepEqual(edge,{x:720,y:1560});
const recovered=nativeDrawingBufferSize({width:960,height:540},1);
assert.equal(recovered.width,960);assert.equal(recovered.height,540);
for(const invalid of [0,-1,Infinity,NaN,9])
 assert.throws(()=>nativeDrawingBufferSize(canvas,invalid),/pixel ratio/);
assert.throws(()=>nativePointerToDrawingPixels(canvas,NaN,1,100,100));
assert.throws(()=>nativeDrawingBufferSize({clientWidth:0,clientHeight:0,width:0,height:0}));
console.log("Native fullscreen/PWA DPR and CSS-to-WebGL aiming coordinates: exact pixel scaling passed.");
