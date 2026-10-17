# Native WebGL2 city pilot (experimental, off by default)

The full game still uses Three.js, including players, traffic, character rigs,
particle effects, shadows, picking, collision visualizations and the camera.
This PR adds a narrower **native WebGL2 path for streamed building chunks only**.
It is not a replacement for the game engine.

To enable locally for visual review, append `?render=native-city` to the game URL.
The normal/default route is unchanged. On a WebGL setup/compilation/render error,
the city pass disables itself for that page session, restores chunk visibility
and renders the original Three.js scene again.

### What the pilot can already do

- Draw the actual OSM-derived city-building meshes through GPU VAO/VBO batches,
  including real per-wall window and interior cutout rules.
- Reuse the existing depth buffer, use the same game camera, update chunk damage
  geometry in-place and release GL resources when disposed.
- Compare candidate/reference **at the same instant**, preserving both raw
  framebuffer captures, diagnostics and automated rendering checks.

### Verified CI evidence (2026-10-17)

In Chrome headless SwiftShader, 19 native city chunks and 43,894 triangles
were rendered. An earlier software-mode frame-rate sample gave 3.59 vs 2.78
presentation FPS (+29%), at dynamic DPR 0.3, and an exact same-frame comparison
showed 24.73% of pixels differing by >20 RGB units. These are **not** real device
GPU speed measurements; the rendering still lacks full Three.js shadow/PBR,
weather, actor and post-processing equivalence. The user permits restyling and
visual improvement, but objective desktop and iPhone/Android QA remains required.

### Mandatory final migration release gate

Do **not** enable the opt-in path as default or remove Three.js until the
remaining rendering subsystems have been replaced and production-device tests
at equal DPR and representative game scenarios prove a sustained performance
improvement, with acceptable visual appearance. The full-engine follow-up
remains tracked in PR #7.
