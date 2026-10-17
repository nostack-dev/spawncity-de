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
