import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Regression contract for intermittent Windows Precision Touchpad mouselook
// stalls. Pointer Lock publishes movementX/Y on mousemove, not on a guaranteed
// pointerType === "mouse" pointermove stream. Keep exactly one camera stream.
const src=readFileSync("sim/desktop_controls.mjs","utf8");
assert.match(src,/function requestLock\(\)\s*\{[\s\S]*?v\.requestPointerLock\(\)/);
assert.doesNotMatch(src,/unadjustedMovement\s*:\s*true/);
assert.match(src,/window\.addEventListener\("mousemove",onMouseMove/);
assert.match(src,/window\.addEventListener\("pointermove",onPointerMove/);
const mouse=src.split("function onMouseMove(event){")[1]?.split("\nfunction onWheel(")[0];
assert.ok(mouse,"native mousemove handler must exist");
assert.match(mouse,/if\(!locked\(\)\)return/);
assert.match(mouse,/event\.movementX/);
assert.match(mouse,/event\.movementY/);
assert.match(mouse,/scaleMouseDelta\(dx,dy\)/);
assert.match(mouse,/mode==="foot"\)walk\(\)\?\.applyMouseLook/);
assert.match(mouse,/clamp\(rawX,-MAX_EVENT_PX,MAX_EVENT_PX\)/);
assert.match(mouse,/clamp\(rawY,-MAX_EVENT_PX,MAX_EVENT_PX\)/);
assert.doesNotMatch(mouse,/pointerType/,"Trackpad mouselook must not be gated by pointer type");
const pointer=src.split("function onPointerMove(event){")[1]?.split("\nfunction onMouseMove(")[0];
assert.ok(pointer,"pointermove may only handle device detection");
assert.doesNotMatch(pointer,/applyMouseLook|scaleMouseDelta|jetDelta\.x\s*\+=/);
assert.match(src,/window\.addEventListener\("mousedown",onMouseDown/);
assert.match(src,/window\.addEventListener\("mouseup",onMouseUp/);
console.log("Desktop touchpad pointer-lock contract passed: native mousemove, one delta stream, regular pointer lock, no swallowed fast deltas.");
