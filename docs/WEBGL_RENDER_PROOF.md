# WebGL rendering proof: scope and measured result

## The actual engine today

SpawnCity already draws onto a WebGL context via Three.js WebGLRenderer.
A switch from Three.js to raw WebGL2 is **not** a switch of GPU API:
scene graph, GL program/shader compilation, fog, lights, shadows, postprocessing,
instancing, actor rigs, raycasting, geometry management and camera wiring all
currently depend on Three.js. Those functions require explicit native replacements.

## Repeatable isolated raw-WebGL2 versus Three.js draw test

Code: `tests/native_webgl_proof_scene.mjs` and
`tests/native_webgl_proof.mjs`.

Recorded CI example: https://github.com/nostack-dev/spawncity-de/actions/runs/39029298775
(artifact `spawncity-native-webgl-proof` includes PNG images, HTML comparison and JSON).

- Chrome with ANGLE **SwiftShader** (software renderer), 960 × 540, no MSAA.
- Identical perspective camera, world geometry, triangle winding, unlit
  per-vertex colors, depth buffer and WebGL output color space.
- 1,024 box buildings, **12,288 triangles**, **16 draw calls on each path**.
- Raw WebGL2 pixel mean absolute RGB difference **0.03/255** against the
  Three.js WebGL reference; 0.06% of rendered pixels differ by >20/255.
  This is a **static-geometry parity result**, not a full game appearance result.
- Mean frame + finish time: Three.js WebGL **0.119 ms**, native WebGL2
  **0.015 ms**. p95: **0.30 ms** versus **0.10 ms**.
  The p50 raw measurement is below timer resolution: these very small durations
  must not be presented as reliable hardware or end-to-end FPS speedups.

## Production WebGL quality-versus-fast A/B

Use `tests/renderer_ab_compare.mjs` and the `renderer-compare.yml` workflow.
After release, it waits until **the exact release SHA** is live, and runs the
full game at `render=quality` then `render=fast` with the same Berlin GPS,
Chrome binary, fixed desktop and phone viewports, fixed time-of-day, screenshots,
presentation FPS/p50/p95, draw calls and triangle counts. The runner uses
SwiftShader: this test is useful for regression diagnosis and **visual inspection**
but cannot prove real iPhone/Android/desktop GPU FPS.

The fast mode changes the fixed DPR ceiling to 1.0, and is **opt-in only**.
For a normal 1.5 DPR quality profile, that reduces the pixel count to
1 / 2.25 = **44.4%** (a 55.6% reduction in fragment pixels at a constant
viewport). It does *not* reduce scene draw calls or prove faster gameplay.
The default quality preset stays untouched.

## Native renderer release gate

Do **not** remove Three.js or turn on a new native draw path for every player
based on this microbenchmark. Before replacement:
1. Render **the same actual SpawnCity city**, materials, animated actors,
   shadows, sky, terrain, missiles, first-person viewmodels and bloom in both
   renderers at the **same DPR and resolution**.
2. Freeze camera, time-of-day, inputs and simulation to inspect matched
   images in first-person, drone, car, jet and multiplayer modes.
3. On real Android Chrome, iPhone Safari and desktop hardware, measure
   per-device presentation FPS, GPU frame time, p95 hitching, JS CPU time,
   memory and context-loss/recovery over several runs at identical quality.
4. Keep native rendering only if visuals pass and stable frame time improves
   materially (target >=15% p95 benefit without regressions). Preserve full
   control/physics behavior; retain the old WebGL path as a rollback until
   mobile and fullscreen regression tests pass.

**Result:** Native WebGL2 can reproduce a simplified batched city path with
very close pixels and lower overhead in the CI software microbenchmark.
It is **not yet technically proven** as a safe or faster complete replacement
for the current SpawnCity renderer. Claims of production GPU speedup require
real-device evidence.
