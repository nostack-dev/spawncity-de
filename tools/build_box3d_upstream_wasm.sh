#!/usr/bin/env bash
# Reproducible compatible Emscripten build against Erin Catto's 2026-10-16 HEAD.
# The produced binaries are staged, not silently switched into the live game.
set -euo pipefail
BOX3D_SOURCE_REPO="https://github.com/erincatto/box3d.git"
BOX3D_SOURCE_SHA="efca0c184d40fd6a82016983f1601c4d23965867"
BOX3D_BINDINGS_REPO="https://github.com/isaac-mason/box3d.js.git"
BOX3D_BINDINGS_SHA="5d5a3af049cccd9948b2b55bac4342414af0ef64"
BOX3D_EMSDK_VERSION="6.0.2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="/tmp/spawncity-box3d-wasm-build"
ARTIFACT="$ROOT/artifacts/box3d-upstream-wasm"
mkdir -p "$ARTIFACT"
if ! command -v emcc >/dev/null || ! command -v em++ >/dev/null || ! command -v emcmake >/dev/null; then
  echo "An active Emscripten SDK $BOX3D_EMSDK_VERSION is required" >&2
  exit 1
fi
if [[ ! -d "$WORK/wrapper/.git" ]]; then
  git clone -q --depth 1 --recurse-submodules "$BOX3D_BINDINGS_REPO" "$WORK/wrapper"
fi
git -C "$WORK/wrapper" fetch -q --depth 1 origin "$BOX3D_BINDINGS_SHA"
git -C "$WORK/wrapper" checkout -q --detach "$BOX3D_BINDINGS_SHA"
git -C "$WORK/wrapper" submodule update --init --depth 1 --recursive
git -C "$WORK/wrapper/vendor/box3d" fetch -q --depth 1 origin "$BOX3D_SOURCE_SHA"
git -C "$WORK/wrapper/vendor/box3d" checkout -q --detach "$BOX3D_SOURCE_SHA"
test "$(git -C "$WORK/wrapper" rev-parse HEAD)" = "$BOX3D_BINDINGS_SHA"
test "$(git -C "$WORK/wrapper/vendor/box3d" rev-parse HEAD)" = "$BOX3D_SOURCE_SHA"
test "$(em++ --version | head -n1 | grep -o -m1 -E '[0-9]+\.[0-9]+\.[0-9]+')" = "$BOX3D_EMSDK_VERSION"
cd "$WORK/wrapper"
node "$ROOT/tools/patch_box3d_upstream_bindings.mjs" "$WORK/wrapper/src/bindings.cpp"
node scripts/build.mjs
node test/smoke.mjs
test -s dist/box3d.inline.mjs
test -s dist/box3d.wasm
test -s dist/box3d.mjs
test -s dist/box3d.d.ts
cp -f dist/box3d.inline.mjs dist/box3d.wasm dist/box3d.mjs dist/box3d.d.ts "$ARTIFACT/"
# MT products are staged separately; never require SharedArrayBuffer on mobile
# or change COEP headers as a side effect of this update.
cp -f dist/box3d.mt.inline.mjs dist/box3d.mt.wasm dist/box3d.mt.mjs "$ARTIFACT/"
cat > "$ARTIFACT/provenance.json" <<EOF
{
  "schema": "spawncity-box3d-wasm-provenance-v1",
  "upstream": "erincatto/box3d",
  "upstreamSha": "$BOX3D_SOURCE_SHA",
  "bindingSource": "isaac-mason/box3d.js",
  "bindingSha": "$BOX3D_BINDINGS_SHA",
  "emsdk": "$BOX3D_EMSDK_VERSION",
  "mode": "st-and-mt-compiled-smoke-tested-not-live",
  "currentGamePackage": "box3d.js@0.1.1"
}
EOF
(cd "$ARTIFACT" && sha256sum *.mjs *.wasm *.d.ts > SHA256SUMS.txt)
test -s "$ARTIFACT/SHA256SUMS.txt"
echo "Compiled and smoke tested Box3D $BOX3D_SOURCE_SHA; staging only."
