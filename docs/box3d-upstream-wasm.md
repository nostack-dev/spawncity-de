# Box3D: fresh upstream WebAssembly build (17 October 2026)

**Upstream author:** Erin Catto, [erincatto/box3d](https://github.com/erincatto/box3d).
Checked GitHub main on 2026-10-17: last commit [efca0c184d40](https://github.com/erincatto/box3d/commit/efca0c184d40fd6a82016983f1601c4d23965867), committed on 2026-10-16.

## Why this is a separate PR

SpawnCity is currently built with `box3d.js@0.1.1`, using Isaac Mason's Emscripten C API bindings and a previously pinned native library commit (`8441b4a0...`). Arbitrarily replacing the WASM behind those bindings is unsafe: different struct layouts or renamed functions could corrupt contact, raycast, player-capsule, jet or world physics.

This PR **compiles** the exact upstream commit using the same `box3d.js@0.1.1` source wrapper, pinned commit `5d5a3af0...`, and its required Emscripten SDK **6.0.2**. The upstream Box3D git submodule is intentionally moved **only inside the CI build** to `efca0c184d40...`. Existing live `box3d.js` import and gameplay code are unchanged until validation.

## Reproduce

Run `bash tools/build_box3d_upstream_wasm.sh` in an environment with `emcc/em++/emcmake` from emsdk 6.0.2 (such as `emscripten/emsdk:6.0.2`). CI runs the build in that image from the `Compile latest upstream Box3D WebAssembly` workflow.

Output: `artifacts/box3d-upstream-wasm/` with ST+MT JS/WASM modules, the same self-contained inline module form used by SpawnCity, declaration file, `provenance.json` and SHA-256 hashes.

CI requires wrapper smoke tests and app-facing Box3D API + gravity checks, then runs the actual city building collision regression against the just-compiled inline module. Full gameplay, aircraft dynamics and browser performance parity are required separately before a **second PR** changes the live bundled Box3D binary.

**Never enable MT universally:** SharedArrayBuffer requires COOP/COEP and can break third-party tiles/assets and mobile Safari. The existing ST inline module remains the reference.

A build failure means the upstream engine and old bindings are API-incompatible and must be adapted with tests, not papered over by silently falling back to the published package.
