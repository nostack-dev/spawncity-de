// SpawnCity native WebGL2 math, column-major matrices, metres, Z-up.
// Independent of Three.js, MapLibre and the Box3D simulation.
export const NATIVE_RENDER_MATH_VERSION="native-render-math-v1";
export const identity4=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export function multiply4(a,b,out=new Float32Array(16)){
  if(a?.length!==16||b?.length!==16)throw Error("multiply4 requires 4x4 matrices");
  // Works with aliased outputs too.
  const values=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++){
    values[4*c+r]=a[r]*b[4*c]+a[4+r]*b[4*c+1]+a[8+r]*b[4*c+2]+a[12+r]*b[4*c+3];
  }
  out.set(values);return out;
}
export function perspective(fovRadians,aspect,near,far){
  if(!(fovRadians>0&&fovRadians<Math.PI)||!(aspect>0)||!(near>0)||!(far>near))throw Error("invalid perspective camera");
  const f=1/Math.tan(fovRadians/2),nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);
}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(x)=>{const n=Math.hypot(...x);if(n<1e-10)throw Error("degenerate camera direction/up");return x.map(a=>a/n);};
export function lookAt(eye,target,up=[0,0,1]){
  if([eye,target,up].some(x=>x?.length!==3))throw Error("lookAt requires vec3");
  const z=unit(sub(eye,target)),x=unit(cross(up,z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
export function fromTRS(position=[0,0,0],rotation=[0,0,0,1],scale=[1,1,1]){
  if(position.length!==3||rotation.length!==4||scale.length!==3)throw Error("invalid TRS");
  const [x,y,z,w]=rotation,[sx,sy,sz]=scale;
  const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2;
  const wx=w*x2,wy=w*y2,wz=w*z2;
  return new Float32Array([
    (1-yy-zz)*sx,(xy+wz)*sx,(xz-wy)*sx,0,
    (xy-wz)*sy,(1-xx-zz)*sy,(yz+wx)*sy,0,
    (xz+wy)*sz,(yz-wx)*sz,(1-xx-yy)*sz,0,
    position[0],position[1],position[2],1
  ]);
}
export function normalMatrix3(m){
  if(m?.length!==16)throw Error("normalMatrix3 requires mat4");
  const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10];
  const A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,det=a*A+b*B+c*C;
  if(Math.abs(det)<1e-10)throw Error("singular world transform");
  const inv=1/det;
  // Transposed inverse, column-major output.
  return new Float32Array([A*inv,B*inv,C*inv,(c*h-b*i)*inv,(a*i-c*g)*inv,(b*g-a*h)*inv,(b*f-c*e)*inv,(c*d-a*f)*inv,(a*e-b*d)*inv]);
}
export function worldMatrix(node){
  if(node.world?.length===16)return node.world;
  return fromTRS(node.position||[0,0,0],node.rotation||[0,0,0,1],node.scale||[1,1,1]);
}
