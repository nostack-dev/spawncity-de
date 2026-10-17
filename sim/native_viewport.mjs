// Native-only presentation dimensions: the same physical pixel density must
// be used for camera projection, drawing and screen-space hit testing.
// Lowering DPR to make the new renderer appear faster is NOT permitted.
export const NATIVE_VIEWPORT_VERSION="native-display-dpr-v1";
export function nativeDrawingBufferSize(canvas,dpr=globalThis.devicePixelRatio??1){
  if(!canvas)throw Error("native canvas required");
  if(!Number.isFinite(dpr)||dpr<=0||dpr>8)throw Error("invalid device pixel ratio");
  const cssWidth=Number(canvas.clientWidth)||Number(canvas.width)||0;
  const cssHeight=Number(canvas.clientHeight)||Number(canvas.height)||0;
  if(!(cssWidth>0&&cssHeight>0))throw Error("native CSS viewport must have nonzero dimensions");
  return {width:Math.max(1,Math.round(cssWidth*dpr)),
    height:Math.max(1,Math.round(cssHeight*dpr)),cssWidth,cssHeight,pixelRatio:dpr};
}
export function nativePointerToDrawingPixels(canvas,x,y,drawWidth,drawHeight){
  if(!(Number.isFinite(x)&&Number.isFinite(y)&&drawWidth>0&&drawHeight>0))
    throw Error("invalid native pointer coordinates");
  const width=Number(canvas?.clientWidth)||Number(canvas?.width)||0;
  const height=Number(canvas?.clientHeight)||Number(canvas?.height)||0;
  if(!(width>0&&height>0))throw Error("native pointer needs CSS dimensions");
  // x/y are canvas-local CSS pixels (NOT absolute page or screen coords).
  return {x:x*drawWidth/width,y:y*drawHeight/height};
}
