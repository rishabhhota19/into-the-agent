import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import content from '../content/site.json';
import type { SiteContent } from '../content/types';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Loads a GLB. Hosts that refuse binary files get the same bytes as base64 in a
 * `.glb.txt` beside it, so the loader tries the binary first and falls back.
 */
export async function loadGLB(url: string): Promise<Group> {
  let buffer: ArrayBuffer;
  const res = await fetch(url);
  if (res.ok && !(res.headers.get('content-type') ?? '').startsWith('text/html')) {
    buffer = await res.arrayBuffer();
  } else {
    const alt = await fetch(`${url}.txt`);
    if (!alt.ok) throw new Error(`model missing: ${url}`);
    const b64 = (await alt.text()).trim();
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    buffer = bytes.buffer;
  }
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => resolve(gltf.scene), reject);
  });
}

/**
 * The rabbit: the one figure that travels the whole descent. Loads `models/rabbit.glb`
 * when it exists (drop a CC-licensed model there) and quietly returns null until then.
 */
export async function loadRabbit(): Promise<Group | null> {
  if (!(content as SiteContent).assets?.rabbit) return null;
  const scene = await loadGLB('models/rabbit.glb');
  // Fit any model to a 1.1-unit-tall figure standing on y = 0.
  const box = new Box3().setFromObject(scene);
  const size = new Vector3();
  box.getSize(size);
  const s = 1.1 / Math.max(size.y, 1e-3);
  scene.scale.setScalar(s);
  box.setFromObject(scene);
  scene.position.y -= box.min.y;
  scene.position.x -= (box.min.x + box.max.x) / 2;
  scene.position.z -= (box.min.z + box.max.z) / 2;
  const wrap = new Group();
  wrap.add(scene);
  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const sm = m as MeshStandardMaterial;
      if (!sm.isMeshStandardMaterial) continue;
      sm.roughness = Math.max(sm.roughness, 0.75);
      sm.envMapIntensity = 0.6;
      sm.needsUpdate = true;
    }
  });
  return wrap;
}

/** The ant: a dark chitin body; its eyes are the chamber's subject, so keep them readable. */
export async function loadAnt(): Promise<Group> {
  const scene = await loadGLB('models/ant.glb');
  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const geo = mergeVertices(mesh.geometry, 1e-4);
    geo.computeVertexNormals();
    mesh.geometry = geo;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const sm = m as MeshStandardMaterial;
      if (!sm.isMeshStandardMaterial) continue;
      sm.color.multiplyScalar(0.55);
      sm.roughness = 0.42;
      sm.metalness = 0.25;
      sm.envMapIntensity = 1.1;
      sm.needsUpdate = true;
    }
  });
  return scene;
}

/** Smooth the low-poly figure and give it materials that answer to the scene's light. */
export async function loadAstronaut(): Promise<Group> {
  const scene = await loadGLB('models/astronaut.glb');
  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const geo = mergeVertices(mesh.geometry, 1e-4);
    geo.computeVertexNormals();
    mesh.geometry = geo;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const sm = m as MeshStandardMaterial;
      if (!sm.isMeshStandardMaterial) continue;
      sm.roughness = 0.58;
      sm.metalness = 0.12;
      sm.envMapIntensity = 0.9;
      sm.needsUpdate = true;
    }
  });
  return scene;
}
