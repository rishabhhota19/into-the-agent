import {
  BackSide,
  Color,
  DataTexture,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  UnsignedByteType,
  WebGLRenderer,
} from 'three';
import { fbm2 } from '../util/noise';

/** Tileable noise maps generated at start: grain for roughness, bump for surface. No image files. */
export class ProceduralTextures {
  readonly bump: DataTexture;
  readonly rough: DataTexture;
  readonly grain: DataTexture;

  constructor(size = 256) {
    const bump = new Uint8Array(size * size * 4);
    const rough = new Uint8Array(size * size * 4);
    const grain = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        // Periodic coordinates so the maps tile.
        const px = x / size;
        const py = y / size;
        const ax = Math.cos(px * Math.PI * 2) * 2.2;
        const ay = Math.sin(px * Math.PI * 2) * 2.2;
        const bx = Math.cos(py * Math.PI * 2) * 2.2;
        const by = Math.sin(py * Math.PI * 2) * 2.2;
        const n = fbm2(ax + bx * 0.7 + 11.3, ay + by * 0.7 + 4.1, 5) * 0.5 + 0.5;
        const streak = fbm2((ax + bx) * 0.3 + 7.7, (ay + by) * 3.5 + 2.2, 3) * 0.5 + 0.5;
        const scratch = Math.pow(fbm2(ax * 4 + 1.3, by * 4 + 9.1, 2) * 0.5 + 0.5, 6);
        const b = Math.round(255 * (n * 0.75 + streak * 0.25));
        const r = Math.round(255 * Math.min(1, 0.42 + n * 0.35 + scratch * 0.9));
        const g = Math.round(255 * (0.5 + (fbm2(ax * 3 + 3.3, by * 3 + 8.8, 3) * 0.5) * 0.5));
        bump[i] = bump[i + 1] = bump[i + 2] = b;
        rough[i] = rough[i + 1] = rough[i + 2] = r;
        grain[i] = grain[i + 1] = grain[i + 2] = g;
        bump[i + 3] = rough[i + 3] = grain[i + 3] = 255;
      }
    }
    this.bump = this.make(bump, size, 3);
    this.rough = this.make(rough, size, 3);
    this.grain = this.make(grain, size, 6);
  }

  private make(data: Uint8Array, size: number, repeat: number): DataTexture {
    const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.needsUpdate = true;
    return t;
  }
}

/** A gradient sky baked to a PMREM so metal and glass have something to reflect: deep water below, pale light above. */
export function makeEnvironment(renderer: WebGLRenderer, top = 0x7cc4d6, horizon = 0x10404b, bottom = 0x03090c): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Scene();
  const sky = new Mesh(
    new SphereGeometry(40, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      uniforms: {
        uTop: { value: new Color(top) },
        uHorizon: { value: new Color(horizon) },
        uBottom: { value: new Color(bottom) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.6)) : mix(uHorizon, uBottom, pow(-y, 0.5));
          // A soft bright patch overhead: the surface, far above.
          c += uTop * 0.6 * pow(max(0.0, y), 6.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  envScene.add(sky);
  const tex = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  return tex;
}

export const metalMaterial = (tex: ProceduralTextures, color = 0x6e7d89): MeshStandardMaterial =>
  new MeshStandardMaterial({
    color,
    metalness: 0.82,
    roughness: 0.62,
    roughnessMap: tex.rough,
    bumpMap: tex.bump,
    bumpScale: 0.012,
    envMapIntensity: 0.9,
  });

export const darkMetalMaterial = (tex: ProceduralTextures, color = 0x3b444d): MeshStandardMaterial =>
  new MeshStandardMaterial({
    color,
    metalness: 0.7,
    roughness: 0.7,
    roughnessMap: tex.rough,
    bumpMap: tex.bump,
    bumpScale: 0.02,
    envMapIntensity: 0.7,
  });

export const concreteMaterial = (tex: ProceduralTextures, color = 0x171c21): MeshStandardMaterial =>
  new MeshStandardMaterial({
    color,
    metalness: 0.02,
    roughness: 0.95,
    bumpMap: tex.grain,
    bumpScale: 0.05,
    envMapIntensity: 0.35,
  });

export const glassMaterial = (color = 0x9fd5e0): MeshPhysicalMaterial =>
  new MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.08,
    transmission: 0.92,
    thickness: 0.6,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.2,
    transparent: true,
  });

export const lacquerMaterial = (color = 0x05080a): MeshPhysicalMaterial =>
  new MeshPhysicalMaterial({
    color,
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });
