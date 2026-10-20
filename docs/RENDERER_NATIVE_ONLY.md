# Full native WebGL2 renderer: exclusive release contract

**Owner instruction (17 October 2026): All or nothing.**

There must be exactly **one renderer** in the finished game: native WebGL2.
The existing Three.js renderer is not allowed to remain in the new production
bundle, including as a fallback. There will be no `?render=native-city` switch
and no native/Three mixed-city rendering. PR #12 was rolled back via PR #13.
Until a complete replacement is implemented, the proven legacy version may
remain the currently published game. The unfinished new engine must **not** be
deployed to users or masquerade as a finished release.

## 2026-10-19 — Engine sealed, game migration still later

The native engine now has one door: `sim/native_engine.mjs`
(`spawncity-native-engine-v1`). `/native/` boots through that module.
`tests/native_engine_seal_test.mjs` walks the whole static import graph and
fails if Three.js, `simulator.mjs` or `real_world_bootstrap.mjs` enters it.
Packages other than the pinned `box3d.js` runtime are rejected.

That seal is the engine. It is not the game cutover. The live
`drone_simulator.html` modules that still import Three stay outside the graph
so they can be ported one system at a time onto the exports of `sim/native_engine.mjs`
(renderer, scene graph, camera, pick, lights, instancing, particles, loop).
Do not add a Three shim, a second canvas, or a `?render=` fallback to make a
partial port look shipped. `renderer_acceptance_gate.mjs --gate` allows this
legacy game to publish, and the page bundle installs the pinned `three@0.185.1`
so that existing game can actually be built. Any other Three.js version, a CDN
fetch, or keeping that pin after the game no longer imports Three fails the
gate. It also fails when a native cutover is claimed without the 15 real-device
comparisons.

## Historical implementation log

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
- Native building geometry generated from exactly the `outer`/`holes`/base/top
  footprint structure shared with the existing OSM+Box3D system. New
  `sim/native_city_geometry.mjs` exports time-sliced chunk builders with
  wall-facing normals, metre-based procedural facade UVs, damaged roof heights,
  concave roofs and real open courtyard holes. Roofs are triangulated by
  vendored ISC Mapbox Earcut v3.0.2 (license preserved). Invalid roofs skip
  the building instead of silently creating a nonphysical solid.
- A real Chromium WebGL2 smoke test draws 900 building instances plus one
  skinned actor: 937 total instances, 4 draws, 11,234 triangles, no GL errors.
  This uses **software SwiftShader** and deliberately does **not** assert real
  device FPS gains or full-scene visual equivalence.

This implementation still lacks a full production native world/character asset
pipeline, full skinned rig behavior, cascaded sun shadow mapping, sky/weather,
post-FX, projectile/particle VFX, game-world ray picking, vehicles/terrain,
interiors and the production renderer hookup. The player cannot use it yet.

**Do not merge this branch until the complete release gate is green.**


## 17 October: Native city GPU performance stage

Additional Three-free modules now in this draft:

- `sim/native_render_culling.mjs`: conservative Z-up frustum- and transform-aware
  sphere bounds. The test introduces an offscreen mesh and proves it is culled
  before any GL draw, without losing an intersecting/on-screen mesh.
- `sim/native_city_indexed.mjs`: bit-for-bit lossless triangle deduplication
  (positions, normals, vertex colors, roof/facade UVs), preserves hard normals,
  damage and courtyard seams. The actual native GPU OSM browser proof shows
  **1,960 / 5,280 bytes (37.1%) fewer** geometry buffer bytes for its two
  OSM chunks, with `drawElementsInstanced` used on WebGL2 and no GL errors.
  This is a small scene fixture, not a representative all-city measurement.
- `sim/native_city_stream.mjs`: OSM/Box3D collision footprint source drives
  native scene chunk IDs. Unchanged chunks do not reupload, damage revisions
  update only affected geometry, removed tiles evict buffers, superseded
  asynchronous requests cannot reintroduce stale geometry. GPU uploads are
  time-sliced with a configurable per-frame limit (default two), yielding
  to browser input and painting between batches. This is not a separate
  renderer or a fallback.

**Remaining scope is still substantial:** the native modules do not yet own the
actual production game presentation path. All controls, player/NPC animation,
jet and drone visuals, weapon targeting/HUD integration, real-world terrain,
street meshes, dynamic city, lighting/shadows, all effects and multiplayer
actors must be ported as a single tested cutover. The existing Three.js game
stays on live until the new native-only engine passes the full acceptance gate
on physical phones and desktop. No performance guarantee is inferred from
SwiftShader CI.


## Native collision terrain (Box3D ground, not separate scenery)

The native-only renderer now includes `sim/native_terrain_geometry.mjs`
and `sim/native_terrain_stream.mjs`. Real ground height sampling is taken
straight from `terrain_craters.mjs:terrainNodeHeightAt`, the same ground
used by the Box3D height-field. Every 5 m physics cell is rendered using
the same southwest-to-northeast diagonal. Indexed 32-cell tiles share
height/normal samples at borders. A 32-cell terrain tile requires more than
65% fewer GPU bytes than expanded triangles in the pure geometry test.

Tiles are selected by camera radius and uploaded at most two per frame
(default). When craters, DEM or roads change, the existing terrain-change
listener invalidates only overlapping tiles; moving across the map evicts
stale GPU buffers and preserves unchanged tiles. New terrain is never
a hybrid Three/native render path.

The native browser GPU fixture now draws 4,608 physics-compatible
terrain triangles as an indexed mesh alongside city buildings and a
skinned actor (15,880 triangles total, six draw calls, zero GL errors
on SwiftShader). The full native player/world presentation and real
phone GPU performance measurements are **still missing**, so the
full-engine merge gate remains red by design.


## Native camera targeting: actual deforming geometry, accelerated static hits

The native-only rendering branch includes `sim/native_scene_picking.mjs`
with `getScreenRay` / `pick` in `NativeSceneRenderer`. Weapon and
lock-on rays use the native Z-up camera inverse, exact indexed/instanced
triangle meshes, and **current skeletal bone palettes** for characters.
The old Three raycaster is not called by these new modules.

`sim/native_scene_bvh.mjs` now builds a spatial triangle index once for
static world-space OSM/Box3D meshes; dynamic instance updates invalidate it.
On a 12,800-triangle terrain fixture, the same hit position/depth was
returned with **25 instead of 12,800 triangle checks (99.8047% fewer)**.
All native picking/BVH/scene-GPU regression tests were green for commit
`6d99ea035e2b18918a71ea241c1684550917cf01`.

This is a CPU geometry-pruning measurement, **not a frame-rate gain** and
does **not** make the game production-native. The actual player/jet/drone
weapon systems still use Three objects; the renderer cutover remains
blocked on a complete port and true hardware measurements. Do not merge
just the proof or weaken the acceptance gate.


## 17 October: One composed native city/traffic/population draw path

The experimental **sole** native game-world presenter now exists in
`sim/native_world_presenter.mjs`. It owns one `NativeSceneRenderer` and
composes live-data adapters without ever creating a Three.js renderer:

- `native_rigid_visuals.mjs`: reads authoritative interpolated Box3D
  `bodies()` / `renderPose(id)`, including car and bus hulls, drone and
  jet hulls and per-wheel poses. The geometry is grouped by type so existing
  GPU buffers can be updated with instance transforms without reallocation.
  **No second physics simulation or fake derived pose exists.**
- `native_road_geometry.mjs` and `native_road_stream.mjs`:
  asphalt, curb sidewalks, road classes and center dashes from real OSM
  transportation features, draped directly on the Box3D terrain height
  callback, cached into indexed native GPU tiles. The terrain API retains
  the authority for all heights; no separate map is introduced.
- `native_pedestrian_visuals.mjs`: consumes the existing persistent
  crowd-agent `people()` pose contract; one GPU draw for all pedestrians.
  This adapter renders simple stylized humanoids, not yet the full old
  character rigs, expressions, weapons or skeletal animations.
- The composed Chromium proof imports **no Three.js** and draws the city,
  four terrain tiles, four road chunks, two interpolated Box3D physics
  vehicles/drones and two people through one native context. It reported
  13 draw calls, 2,716 drawn triangles and zero WebGL errors on SwiftShader.

This is a substantive **native game presentation composition milestone**.
It is *not* the production game bootstrap and does not yet consume the
complete player/drone/jet combat, multiplayer and camera update pipeline.
Full-game performance on phones has not been measured. No new default
renderer or fallback was shipped.

### Next required engineering cutover

1. Rewrite `sim/simulator.mjs` and `sim/real_world_bootstrap.mjs` to
   inject the authoritative Box3D/flight-controller state into
   `NativeWorldPresenter`, preserving the same run/pause/replay physics
   steps, network and control IDs. The current simulator still imports
   `THREE` and allocates `THREE.WebGLRenderer`.
2. Remove remaining imported Three scene graph clients, including existing
   player/jet models, weapons, crowds, props, effects, light/shadow and sky.
   Compose their state-only sources into the native presenter; use the native
   ray picking and bone palettes already tested.
3. Verify full desktop and mobile presentation and touch/controller paths;
   preserve headshots, guided-rocket targets and Box3D hit semantics.
4. Only when production is 100% native run the existing 15 device-mode
   appearance/frame-time checks and merge on a green gate. **No partial
   legacy renderer remains in the eventual live bundle.**


## Box3D player-flight presentation in the sole native world

`sim/native_airframe_presentation.mjs` now consumes the simulator's actual
`PhysicsModel.presentationPose()` shape: position, quaternion, velocity,
`physics.p.span`, `physics.p.propD`, `physics.motorOmega`. No independent
visual motion simulation or Three.js renderer is used. It builds an actual
quadcopter hull/arms and four animated rotor instances, and updates their GPU
transforms from Box3D snapshots. Native FPV uses the current .102 m forward,
.028 m up optical mount, rigid body -X forward and camera tilt; follow/third
reuse the existing pure-JS stabilized camera rig and its game distances.

`NativeWorldPresenter` now accepts optional `flight` in its constructor and
`setFlightCameraMode("fpv"|"follow"|"third")`. This renders the player drone
in **the same native GL scene** as rigid Box3D vehicles, road geometry,
people, OSM buildings and height-field terrain. The `native-world` Chrome
software-GL CI run verified 15 draw calls, 2 rigid bodies, 1 player flight,
16 buildings, 4 terrain tiles, 4 road chunks, 2 pedestrians, successful FPV
and third camera placement, and zero WebGL errors. No graphics fallback exists
in the new path.

This is **not** yet the canonical live simulator: gameplay is still
implemented on Three scene objects in dozens of modules. Integrating all
scene producers, player/jet/car modes, combat/lock-on, multiplayer, shadows
and effects is still mandatory before the native-only release gate can pass;
Android/iPhone/desktop GPU comparisons are also untested. The release stays
blocked by design.


## 2026-10-17 — Real PWA backbuffer resolution and aiming

`sim/native_viewport.mjs` now measures the actual CSS viewport and
uses the device pixel ratio to allocate the native backbuffer, instead of
silently rendering mobile fullscreen at 1x physical resolution. The
`NativeWorldPresenter` camera and native touch-hit tests share that
exact drawing-buffer resolution: a CSS-local touch is transformed to
physical pixels before camera unprojection.

The native Chromium scene fixture explicitly runs a full frame at
2x pixel density (960x540 CSS → 1920x1080 GPU), verifies identical
touch-vs-GPU-center picking, then restores normal resolution. The
CI-native-world proof passed with context restoration and zero GL errors.

**This does not establish faster FPS on phones:** equal-DPR real-game
hardware measurements are still needed. The production game is still
Three-backed, so PR #7 remains draft, unmerged and intentionally
fails the whole-engine gate (75 Three-importing files / 2,292 calls;
0 of 15 physical device/mode comparisons).
