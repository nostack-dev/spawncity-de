# Full native WebGL2 renderer: exclusive release contract

**Owner instruction (17 October 2026): All or nothing.**

There must be exactly **one renderer** in the finished game: native WebGL2.
The existing Three.js renderer is not allowed to remain in the new production
bundle, including as a fallback. There will be no `?render=native-city` switch
and no native/Three mixed-city rendering. PR #12 was rolled back via PR #13.
Until a complete replacement is implemented, the proven legacy version may
remain the currently published game. The unfinished new engine must **not** be
deployed to users or masquerade as a finished release.

The existing codebase imports Three in dozens of runtime modules for scene
graphs, player/vehicle meshes, skeletal animation, materials, cameras,
frustum culling, world interaction, raycasting and animation, shadows, sky,
fog, post-processing and destruction effects. Replacing only the
`WebGLRenderer` constructor cannot produce a working game.

**Implementation requirements:** migrate all runtime scene graph structures
and transforms; camera + input targeting; opaque/transparent/instanced and
skinned geometry; dynamic world-city chunks; real procedural facades;
lights, visibility and depth; weather, skyline, ocean, environment, weapon
and damage effects; render ordering, GPU resource lifetime/context restoration;
and raycasts/collisions coupling. Keep flight controller and Box3D authoritative
and unchanged. Remove every runtime Three import and the package from the
production bundle. Never substitute a blank/native-only city for gameplay.

**Release criterion:** `node tests/renderer_acceptance_gate.mjs --gate`
must pass without exceptions, plus the usual full physics/input/browser/HIL
regressions. It audits for a truly Three-free runtime and requires original
real hardware on desktop, Android Chrome and iPhone Safari across drone,
foot, car, jet and multiplayer. Compare at the same viewport/DPR and state
with >=15% faster GPU p95, no frame-pacing regression, and a reviewed visual
result at least as good. Screenshots may differ deliberately if the new art
is better, but missing objects/HUD are forbidden.

The isolated native WebGL2 static-geometry proof is a **tooling fixture**,
not production engine or proof of device performance. Its software renderer
statistics must not be sold as actual gaming FPS.

PR #7 stays a **draft, deliberately failing the full-engine gate** until these
changes and real device evidence are delivered. Any proposed partial
native/Three migration must be rejected.


## New renderer implementation (this branch, not shipped)

The experimental **native-only scene renderer** is in `sim/native_scene_renderer.mjs`
with independent `sim/native_render_math.mjs`. This is production-oriented
renderer infrastructure, **not** a finished SpawnCity integration:

- Column-major Z-up camera, projection, TRS, correct inverse-transpose normals.
- Real WebGL2 GLSL300 shader, diffuse sun/hemisphere lighting, simple filmic
  response, exponential fog, texture/alpha-mask/transparency support.
- GPU hardware instancing with dynamic model matrices, per-instance tints and
  per-instance normal matrices; bufferSubData updates do not reallocate VAOs.
- Procedural anti-aliased facade window grid without a texture download.
- GPU skeletal skinning, up to 32 bones per skinned mesh; animated bone matrices
  update uniforms rather than rebuilding all vertex buffers.
- Explicit WebGL context loss/recovery, resource deletion, optional async
  EXT_disjoint_timer_query_webgl2 GPU frame timing (returns null if unsupported).
- A real Chromium WebGL2 smoke test draws 900 building instances plus one
  skinned actor: 937 total instances, 4 draws, 11,234 triangles, no GL errors.
  This uses **software SwiftShader** and deliberately does **not** assert real
  device FPS gains or full-scene visual equivalence.

This implementation still lacks a complete native world/character asset
pipeline, full skinned rig behavior, cascaded sun shadow mapping, sky/weather,
post-FX, projectile/particle VFX, game-world ray picking, vehicles/terrain,
interiors and the production renderer hookup. The player cannot use it yet.

**Do not merge this branch until the complete release gate is green.**
