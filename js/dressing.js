// Real scanned assets (Poly Haven, CC0) placed on the seasonal islands of the portfolio. Each asset is scaled to a
// target height and dropped onto the island surface with a downward raycast, so it sits on the real ground.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const BASE = "models/polyhaven/";
const ASSETS = {
  fern: "fern_02", sorrel: "shrub_sorrel_01", calathea: "calathea_orbifolia_01",
  rocks: "rock_moss_set_01", chest: "treasure_chest", cannon: "cannon_01", lantern: "Lantern_01",
};

// [asset, x, z, target height, yaw] per island (spring, summer, autumn, winter), in island-local units
const LAYOUT = [
  [["fern", -1.2, 0.2, 0.42, 0.3], ["fern", -0.4, 1.35, 0.36, 1.9], ["calathea", 1.35, -0.6, 0.4, 0.8], ["calathea", -1.05, -0.55, 0.34, 2.5], ["rocks", 1.1, 1.3, 0.3, 0.4]],
  [["chest", 0.25, -1.35, 0.3, 2.6], ["cannon", -0.55, 1.35, 0.38, -0.6], ["lantern", 0.75, -1.2, 0.26, 0], ["sorrel", 1.5, 0.25, 0.3, 1.2], ["sorrel", -1.65, 0.6, 0.26, 0.4], ["rocks", 1.65, 1.0, 0.24, 1.5]],
  [["rocks", -1.5, -0.35, 0.3, 0.9], ["sorrel", 1.55, 0.6, 0.3, 0.2], ["fern", -0.95, 1.25, 0.34, 2.2]],
  [["rocks", -1.55, 0.0, 0.32, 2.1], ["rocks", 1.6, 0.85, 0.26, 0.7], ["lantern", 0.35, -0.95, 0.24, 0.5]],
];

export async function dressIslands(isles) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cache = {};
  const load = (key) => (cache[key] ??= loader.loadAsync(`${BASE}${ASSETS[key]}/${ASSETS[key]}.glb`).then((g) => g.scene));
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < isles.length && i < LAYOUT.length; i++) {
    const isle = isles[i];
    isle.updateMatrixWorld(true);
    const ground = [];
    // only the terrain itself (the island's first child is its rock body), not trees or buildings
    isle.children[0].traverse((o) => { if (o.isMesh && !o.isInstancedMesh) ground.push(o); });
    for (const [key, x, z, h, yaw] of LAYOUT[i]) {
      let src;
      try { src = await load(key); } catch (e) { console.warn("asset failed", key, e); continue; }
      const obj = src.clone(true);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) o.material.side = THREE.DoubleSide; } });
      const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
      const s = h / Math.max(0.001, size.y);
      obj.scale.setScalar(s);
      obj.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
      const holder = new THREE.Group(); holder.add(obj); holder.rotation.y = yaw;
      // find the ground under (x, z) in the island's local frame
      const from = isle.localToWorld(new THREE.Vector3(x, 5, z));
      ray.set(from, down.clone().applyQuaternion(isle.getWorldQuaternion(new THREE.Quaternion())));
      const hit = ray.intersectObjects(ground, false)[0];
      const y = hit ? isle.worldToLocal(hit.point.clone()).y : 0.05;
      holder.position.set(x, y - 0.01, z);
      isle.add(holder);
    }
  }
}
