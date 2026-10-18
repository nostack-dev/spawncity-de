import assert from "node:assert/strict";
import {packCityMesh} from "../sim/native_city_indexed.mjs";
const positions=new Float32Array([
  0,0,0, 1,0,0, 1,1,0,
  0,0,0, 1,1,0, 0,1,0
]);
const normals=new Float32Array(18);for(let i=2;i<18;i+=3)normals[i]=1;
const colors=new Float32Array(18).fill(.65);
const uvs=new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1]);
const base={positions,normals,colors,uvs,triangles:2};
const result=packCityMesh(base);
assert.ok(result.indexed);
assert.equal(result.sourceVertices,6);
assert.equal(result.uniqueVertices,4);
assert.equal(result.mesh.indices.length,6);
assert.ok(result.mesh.indices instanceof Uint16Array);
assert.ok(result.bytesAfter<result.bytesBefore);
for(const [source,packed,stride]of [[positions,result.mesh.positions,3],[normals,result.mesh.normals,3],[colors,result.mesh.colors,3],[uvs,result.mesh.uvs,2]]){
 const expanded=[];
 for(const index of result.mesh.indices)for(let k=0;k<stride;k++)expanded.push(packed[index*stride+k]);
 assert.deepEqual(expanded,[...source],"indexing must not change the exact triangle stream");
}
const unindexed=packCityMesh(base,{minSaving:99999});
assert.equal(unindexed.indexed,false);
assert.equal(unindexed.mesh,base);
const seamColors=new Float32Array(colors);seamColors[9]=.1;
const seam=packCityMesh({...base,colors:seamColors});
assert.equal(seam.uniqueVertices,5,"different facade material must not merge shared vertex");
assert.throws(()=>packCityMesh({...base,positions:new Float32Array(2)}));
console.log("Lossless native OSM roof/wall GPU compaction preserved all normals, UVs, colors, hard seams, winding and index triangles.");
