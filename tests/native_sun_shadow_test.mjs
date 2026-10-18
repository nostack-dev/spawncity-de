import assert from "node:assert/strict";
import {ortho,sunShadowMatrix,NATIVE_SUN_SHADOW_VERSION} from "../sim/native_sun_shadow.mjs";
const p=ortho(-20,20,-20,20,.2,100);
assert.ok(NATIVE_SUN_SHADOW_VERSION.includes("webgl")||NATIVE_SUN_SHADOW_VERSION.includes("native"));
assert.equal(p.length,16);
assert.ok(Math.abs(p[0]-.05)<1e-8);
assert.ok(Math.abs(p[5]-.05)<1e-8);
assert.ok(Math.abs(p[10]+2/99.8)<1e-8);
const focus=[5,12,1],light=[-.45,-.5,.7];
const matrix=sunShadowMatrix(focus,light,90);
const transform=(m,a)=>[m[0]*a[0]+m[4]*a[1]+m[8]*a[2]+m[12],
 m[1]*a[0]+m[5]*a[1]+m[9]*a[2]+m[13],
 m[2]*a[0]+m[6]*a[1]+m[10]*a[2]+m[14],
 m[3]*a[0]+m[7]*a[1]+m[11]*a[2]+m[15]];
const q=transform(matrix,focus);
assert.ok(Math.abs(q[0]/q[3])<1e-4&&Math.abs(q[1]/q[3])<1e-4,"shadow camera must face focus");
assert.ok(q[2]/q[3]>-1&&q[2]/q[3]<1,"shadow focus must lie between clipping planes");
const up=sunShadowMatrix([0,0,0],[0,0,1],50);
assert.ok([...up].every(Number.isFinite),"vertical sun cannot break Z-up lookAt");
assert.throws(()=>ortho(1,1,-1,1,.1,10));
assert.throws(()=>sunShadowMatrix([0,0,0],[0,0,0]));
console.log("Native sunlight orthographic projection, Z-up stabilization and depth range valid");
