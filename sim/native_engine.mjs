// Sealed SpawnCity engine. Gameplay migration imports ONLY this module.
// The live Three.js game stays outside this graph until each system is ported.
// This seal is not the production cutover: renderer_acceptance_gate.mjs --gate
// still refuses to publish a half-migrated game.
export const NATIVE_ENGINE_VERSION="spawncity-native-engine-v1";

export {NativeSceneRenderer,NATIVE_SCENE_RENDERER_VERSION} from "./native_scene_renderer.mjs";
export {NativeSceneGraph,NATIVE_SCENE_GRAPH_VERSION} from "./native_scene_graph.mjs";
export {NativeEffects,NATIVE_FX_VERSION} from "./native_effects.mjs";
export {NativePointLightPool,NATIVE_POINT_LIGHTS_VERSION,NATIVE_LIGHT_BUDGET} from "./native_point_lights.mjs";
export {NativeWorldPresenter,NATIVE_WORLD_PRESENTER_VERSION} from "./native_world_presenter.mjs";
export {NativeGameRuntime,NATIVE_GAME_RUNTIME_VERSION} from "./native_game_runtime.mjs";
export {NativeGameInput,NATIVE_GAME_INPUT_VERSION,resolveNativeInput} from "./native_game_input.mjs";
export {fetchNativeOsm,NATIVE_DEMO_CITY,NATIVE_OSM_SOURCE_VERSION,nativeOverpassQuery,parseNativeOverpass} from "./native_osm_source.mjs";
export {screenRay,pickNativeMeshes,NATIVE_PICKING_VERSION} from "./native_scene_picking.mjs";
