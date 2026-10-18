import assert from "node:assert/strict";
import {buildNativeTerrainTile,nativeTerrainTileSteps} from "../sim/native_terrain_geometry.mjs";
import {triangleHeightAt} from "../sim/terrain_surface.mjs";
const heightAt=(x,y)=>.1*x+.07*y+.006*x*y+Math.sin(x/11)*.5;
const a=buildNativeTerrainTile({x0:0,y0:0,cells:8,step:5,heightAt});
const b=buildNativeTerrainTile({x0:40,y0:0,cells:8,step:5,heightAt});
assert.equal(a.vertexCount,81);
assert.equal(a.triangles,128);
assert.equal(a.indices.length,384);
assert.ok(a.indices instanceof Uint16Array);
assert.equal(a.positions.length,a.vertexCount*3);
assert.equal(a.uvs.length,a.vertexCount*2);
const nearly=(x,y,msg)=>assert.ok(Math.abs(x-y)<.0005,(msg||"mismatch")+" "+x+" vs "+y);
for(let j=0;j<=8;j++){
 const k=(j*9+8)*3,l=(j*9)*3;
 nearly(a.positions[k],b.positions[l],"tile X seam");
 nearly(a.positions[k+1],b.positions[l+1],"tile Y seam");
 nearly(a.positions[k+2],b.positions[l+2],"height-field seam");
 for(let component=0;component<3;component++)nearly(a.normals[k+component],b.normals[l+component],"smooth normal seam");
}
for(let i=0;i<a.indices.length;i+=3){
 const idx=[a.indices[i],a.indices[i+1],a.indices[i+2]];
 const v=idx.map(j=>[a.positions[j*3],a.positions[j*3+1],a.positions[j*3+2]]);
 const orient=(v[1][0]-v[0][0])*(v[2][1]-v[0][1])-(v[1][1]-v[0][1])*(v[2][0]-v[0][0]);
 assert.ok(orient>0,"terrain triangle must face up");
 for(const point of v)nearly(point[2],heightAt(point[0],point[1]),"physics vertex not on ground");
}
for(let j=0;j<8;j++)for(let i=0;i<8;i++){
 const idx=(j*8+i)*6;
 assert.deepEqual([...a.indices.slice(idx,idx+6)],[j*9+i,j*9+i+1,(j+1)*9+i+1,j*9+i,(j+1)*9+i+1,(j+1)*9+i]);
 for(const [u,v]of [[.17,.06],[.63,.42],[.92,.9]]){
  const x=i*5+u*5,y=j*5+v*5,expected=triangleHeightAt(x,y,heightAt,5);
  const sw=heightAt(i*5,j*5),ne=heightAt((i+1)*5,(j+1)*5);
  const interpolated=u>=v?sw+(heightAt((i+1)*5,j*5)-sw)*(u-v)+(ne-sw)*v:
       sw+(heightAt(i*5,(j+1)*5)-sw)*(v-u)+(ne-sw)*u;
  nearly(interpolated,expected,"Box3D height field diagonal");
 }
}
const unindexedBytes=a.indices.length*11*4;
const indexedBytes=a.positions.byteLength+a.colors.byteLength+a.normals.byteLength+a.uvs.byteLength+a.indices.byteLength;
assert.ok(indexedBytes<unindexedBytes*.35,"indexed terrain buffer must cut upload size");
const tiles=[...nativeTerrainTileSteps({center:[12,14],radius:100,step:5,cells:8,maxTiles:5,heightAt})];
assert.equal(tiles.length,5);
assert.equal(new Set(tiles.map(t=>t.id)).size,5);
assert.throws(()=>buildNativeTerrainTile({x0:0,y0:0,heightAt:()=>Infinity}),/height/);
console.log("Native Box3D-aligned terrain tiles: shared seams, upward faces, 5m collision triangles and >65% GPU byte reduction.");
