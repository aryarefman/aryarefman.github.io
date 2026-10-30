// Realistic sea life and the pirate ship from Sketchfab (CC BY; credits in models/sketchfab/credits.json and the
// page footer). Each model is wrapped in a holder whose +z is "forward", scaled to a target length, and plays its
// own swim animation. Holders exist immediately; the model appears inside once it has loaded.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

// yaw/roll turn each model so its head points along +z (measured from a top-down render of every model)
export const MODELS = {
  sea_turtle: { yaw: 0 },
  dolphin: { yaw: 0 },
  humpback_whale: { yaw: Math.PI / 2 },
  whale_shark: { yaw: -Math.PI / 2 },
  hammerhead: { yaw: -Math.PI / 2 },
  manta_ray: { yaw: 0 },
  jellyfish: { roll: Math.PI / 2, upright: true },
  octopus: { yaw: 0 },
  clownfish: { yaw: Math.PI },
  anglerfish: { yaw: Math.PI / 2 },
  seaweed: { yaw: 0, still: true, tint: 0x2f7a4a },
  pirate_ship: { yaw: Math.PI / 2, still: true, hide: /water|sea|ocean|plane/i },
  lionfish: { yaw: 0 },
  seahorse: { yaw: Math.PI, still: true, glow: 0.4 },
  blue_tang: { yaw: Math.PI / 2 },
  powder_tang: { yaw: Math.PI / 2 },
  nudibranch: { yaw: Math.PI / 2, glow: 0.4 },
  sea_dragon: { yaw: -Math.PI / 2, glow: 0.4 },
  narwhal: { yaw: 0 },
  parrotfish: { yaw: -Math.PI / 2 },
  orca: { yaw: 0, glow: 0.15 },
  coral: { yaw: 0, still: true, glow: 0.3 },
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);   // models are meshopt-compressed GLBs with WebP textures
const sources = {};
function source(name) {
  return (sources[name] ??= loader.loadAsync(`models/sketchfab/${name}/scene.glb`));
}

// holder: an Object3D whose +z is forward and whose longest side is `length` units
export function creature(name, length, { speed = 1 } = {}) {
  const cfg = MODELS[name];
  const holder = new THREE.Group();
  holder.userData.mixer = null;
  holder.userData.length = length;
  holder.userData.ready = source(name).then((gltf) => {
    const model = cfg.still ? gltf.scene.clone(true) : cloneSkinned(gltf.scene);
    if (cfg.hide) model.traverse((o) => { if (o.isMesh && (cfg.hide.test(o.name) || cfg.hide.test(o.material?.name || ""))) o.visible = false; });
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      if (cfg.tint && o.material) { o.material = o.material.clone(); o.material.color = new THREE.Color(cfg.tint); o.material.roughness = 0.7; }
      // deep water light is dim and blue, which greys every texture: let each animal show a little of its own
      // colour so its real markings (stripes, spots, fins) still read at depth
      const glow = cfg.glow ?? (cfg.still ? 0 : 0.35);
      if (glow && o.material?.map && o.material.emissive) {   // unlit (MeshBasic) materials have no emissive slot
        o.material = o.material.clone();
        o.material.emissiveMap = o.material.map; o.material.emissive = new THREE.Color(1, 1, 1); o.material.emissiveIntensity = glow;
      }
    });
    const turn = new THREE.Group(); turn.add(model);
    if (cfg.yaw) turn.rotation.y = cfg.yaw;
    if (cfg.roll) turn.rotation.z = cfg.roll;
    turn.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(turn, true);
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const s = length / Math.max(size.x, size.y, size.z);
    turn.position.copy(centre).multiplyScalar(-s);
    turn.scale.setScalar(s);
    holder.add(turn);
    if (gltf.animations.length && !cfg.still) {
      const mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(gltf.animations[0]); action.play();
      action.time = Math.random() * gltf.animations[0].duration;
      action.timeScale = speed;
      holder.userData.mixer = mixer;
      holder.userData.action = action; holder.userData.baseSpeed = speed;   // swim() in backdrop.js scales this with pace
    }
    return holder;
  }).catch((e) => console.warn("model failed", name, e));
  return holder;
}
