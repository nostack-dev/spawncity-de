// Native indexed terrain from the same 5 m height nodes and SW-NE diagonal
// that the SpawnCity/Box3D rotated height-field collision uses.
// No Three.js ground mesh, shader fallback, secondary height approximation,
// texture download or additional elevation source.
export const NATIVE_TERRAIN_GEOMETRY_VERSION="native-indexed-box3d-terrain-v1";
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function buildNativeTerrainTile({x0,y0,step=5,cells=32,heightAt,albedoAt=null,id=null}={}){
 if(!Number.isFinite(x0)||!Number.isFinite(y0)||!(step>0)||!Number.isInteger(cells)||cells<1||cells>128||typeof heightAt!=="function")
  throw Error("invalid native terrain tile");
 const n=cells+1,vertices=n*n,positions=new Float32Array(vertices*3),normals=new Float32Array(vertices*3),
  colors=new Float32Array(vertices*3),uvs=new Float32Array(vertices*2);
 let minHeight=Infinity,maxHeight=-Infinity;
 // One vertex and colour per physics height-field node; reuse via indices.
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const x=x0+i*step,y=y0+j*step,index=j*n+i,k=index*3,z=Number(heightAt(x,y));
  if(!Number.isFinite(z))throw Error("non-finite Box3D ground height");
  positions[k]=x;positions[k+1]=y;positions[k+2]=z;
  minHeight=Math.min(minHeight,z);maxHeight=Math.max(maxHeight,z);
  const dx=Number(heightAt(x+step,y))-Number(heightAt(x-step,y));
  const dy=Number(heightAt(x,y+step))-Number(heightAt(x,y-step));
  if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error("non-finite terrain normal");
  const len=Math.hypot(dx,dy,2*step)||1;
  normals[k]=-dx/len;normals[k+1]=-dy/len;normals[k+2]=2*step/len;
  const c=albedoAt?albedoAt(x,y,z):[.369,.478,.243]; // production ground 0x5e7a3e
  if(!c||c.length<3)throw Error("invalid terrain albedo");
  for(let a=0;a<3;a++)colors[k+a]=clamp(Number(c[a])||0,0,1);
  uvs[index*2]=i/cells;uvs[index*2+1]=j/cells;
 }
 const indices=vertices<=65535?new Uint16Array(cells*cells*6):new Uint32Array(cells*cells*6);
 let out=0;
 for(let j=0;j<cells;j++)for(let i=0;i<cells;i++){
  const sw=j*n+i,se=sw+1,nw=sw+n,ne=nw+1;
  // Both halves share the SW-NE diagonal, matching triangleHeightAt().
  indices[out++]=sw;indices[out++]=se;indices[out++]=ne;
  indices[out++]=sw;indices[out++]=ne;indices[out++]=nw;
 }
 return {id:id||"terrain:"+x0+","+y0,positions,normals,colors,uvs,indices,
  triangles:indices.length/3,vertexCount:vertices,cells,step,x0,y0,minHeight,maxHeight};
}
export function nativeTerrainTileCoordinates({center=[0,0],radius=420,step=5,cells=32,maxTiles=121}={}){
 if(!(radius>0)||!(step>0)||!Number.isInteger(cells)||cells<1||!Number.isInteger(maxTiles)||maxTiles<1)
  throw Error("invalid native terrain tile streaming");
 const tileM=cells*step,cx=Number(center[0]),cy=Number(center[1]);
 if(!Number.isFinite(cx)||!Number.isFinite(cy))throw Error("non-finite tile center");
 const ix=Math.floor(cx/tileM),iy=Math.floor(cy/tileM),r=Math.ceil(radius/tileM);
 const coords=[];
 for(let y=iy-r;y<=iy+r;y++)for(let x=ix-r;x<=ix+r;x++){
  const nearX=Math.max(x*tileM,Math.min(cx,(x+1)*tileM));
  const nearY=Math.max(y*tileM,Math.min(cy,(y+1)*tileM));
  const dist=Math.hypot(nearX-cx,nearY-cy);
  if(dist<=radius)coords.push({id:"terrain:"+x*tileM+","+y*tileM,x0:x*tileM,y0:y*tileM,dist});
 }
 coords.sort((a,b)=>a.dist-b.dist||a.y0-b.y0||a.x0-b.x0);
 return coords.slice(0,maxTiles);
}
export function* nativeTerrainTileSteps({heightAt,albedoAt,...options}={}){
 if(typeof heightAt!=="function")throw Error("native terrain height sampler required");
 for(const {id,x0,y0} of nativeTerrainTileCoordinates(options))
  yield buildNativeTerrainTile({id,x0,y0,step:options.step||5,cells:options.cells||32,heightAt,albedoAt});
}
