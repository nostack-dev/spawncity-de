import {readFileSync,writeFileSync} from "node:fs";
const path=process.argv[2];
if(!path)throw Error("Usage: node tools/patch_box3d_upstream_bindings.mjs <wrapper/src/bindings.cpp>");
let t=readFileSync(path,"utf8");
const note=[];
function one(before,after,label){
 const count=t.split(before).length-1;
 if(count!==1)throw Error(label+" expected exactly one old reference, found "+count);
 t=t.replace(before,after);note.push(label);
}
// The upstream 2026-10-16 main branch has intentional public C API changes.
// Keep the old JavaScript-facing names for the methods SpawnCity calls.
one('function( "b3World_DumpShapeBounds(worldId, type)", &b3World_DumpShapeBounds );',
    '// Removed debug dump entry: disabled in upstream optimized Emscripten core.',
    "unavailable native diagnostics not linked");
one('function( "b3World_RebuildStaticTree(worldId)", &b3World_RebuildStaticTree );',
    '// REMOVED upstream: b3World_RebuildStaticTree no longer exists.',
    "deprecated static tree rebuild removed");
one('return b3CreateCompoundShape( bodyId, &def, compound );',
    'return b3CreateBakedCompoundShape( bodyId, &def, compound );',
    "compound shape renamed to baked compound");
one('.field( "applyRestitution", &b3Profile::applyRestitution )',
    '/* removed b3Profile::applyRestitution in upstream */',
    "profile field removed");
one('b3Body_GetLocalCenterOfMass( bodyId )',
    'b3Body_GetLocalCenter( bodyId )',
    "local center renamed preserving JS export");
one('b3Body_GetWorldCenterOfMass( bodyId )',
    'b3Body_GetWorldCenter( bodyId )',
    "world center renamed preserving JS export");
one('b3RecPlayer_Create( b3Recording_GetData( r ), b3Recording_GetSize( r ), workerCount )',
    'b3CreatePlayer( b3Recording_GetData( r ), b3Recording_GetSize( r ), workerCount )',
    "record player constructor renamed");
one('b3RecPlayer_Destroy( reinterpret_cast<b3RecPlayer*>( p ) )',
    'b3DestroyPlayer( reinterpret_cast<b3RecPlayer*>( p ) )',
    "record player destructor renamed");
const start=t.indexOf('\tfunction( "b3CollideCapsuleAndTriangle('),
      end=t.indexOf('\n\t// Compute mass-data / AABB',start);
if(start<0||end<start)throw Error("Expected contiguous old direct triangle API block");
const removed=t.slice(start,end);
for(const name of ["b3CollideCapsuleAndTriangle","b3CollideHullAndTriangle","b3CollideSphereAndTriangle"])
 if(!removed.includes(name))throw Error("Removed region unexpectedly missing "+name);
// The new APIs collide in triangle-first order and have different transforms.
// These unused *manual* direct-collision diagnostics cannot be trivially
// aliased without changing the normal orientation; don't pretend they work.
// SpawnCity's world collision and contact solver use b3World* APIs instead.
t=t.slice(0,start)+'\t// Removed deprecated direct triangle diagnostic bindings. Native world solver retained.\n'+t.slice(end);
note.push("three unused orientation-changing direct-triangle helper APIs omitted");
writeFileSync(path,t);
console.log("Patching upstream Box3D C binding ABI: "+note.join("; "));
