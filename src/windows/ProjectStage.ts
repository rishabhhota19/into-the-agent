import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointLight,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { LightShafts } from '../atmosphere/LightShafts';
import { fbm2, lerp, noise1, smoothstep } from '../util/noise';
import { radialTexture } from '../world/chapters/Gantry';
import type { Grade } from '../world/Chapter';

export type Preset = 'agent' | 'xray' | 'market' | 'device' | 'swarm' | 'crystal';
export const PRESETS: Preset[] = ['agent', 'xray', 'market', 'device', 'swarm', 'crystal'];

/** Which scene a project opens with; anything unlisted gets the crystal. */
export function presetFor(slug: string): Preset {
  const map: Record<string, Preset> = {
    'portfolio-agent': 'agent',
    'oa-classification': 'xray',
    turbotrade: 'market',
    'gemma-3n-on-device': 'device',
    'collaterals-agent': 'swarm',
  };
  return map[slug] ?? 'crystal';
}

interface Built {
  group: Group;
  update: (p: number, dt: number, elapsed: number) => void;
  /** Camera pose for progress p; defaults to a slow orbit. */
  camera?: (p: number, elapsed: number, cam: PerspectiveCamera) => void;
}

const TEAL = new Color(0x7fd3e0);
const CRIMSON = new Color(0xff3b4a);
const DUMMY = new Object3D();

/**
 * The project window's world: its own small scene, rendered through the same
 * pipeline as the descent while a window is open, driven by the window's scroll.
 */
export class ProjectStage {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly grade: Grade = { shadow: new Color(0x0a2a33), highlight: new Color(0xf2e6d2), saturation: 0.95 };
  private built?: Built;
  private shafts?: LightShafts;

  constructor(aspect: number, env: Texture) {
    this.camera = new PerspectiveCamera(42, aspect, 0.1, 120);
    this.scene.fog = new FogExp2(0x08161c, 0.05);
    this.scene.background = new Color(0x08161c);
    this.scene.environment = env;
    const key = new DirectionalLight(0xd9ecf2, 2.6);
    key.position.set(6, 10, 6);
    this.scene.add(key, new HemisphereLight(0x5fb0c4, 0x0a1a1c, 1.4));
    const lamp = new PointLight(TEAL, 40, 20, 2);
    lamp.position.set(-3, 4, 3);
    this.scene.add(lamp);
    this.shafts = new LightShafts(3, 0x9fd9e3, 0.35);
    this.shafts.group.position.set(0, -6, -2);
    this.shafts.group.scale.set(0.5, 0.5, 0.5);
    this.scene.add(this.shafts.group);
  }

  open(preset: Preset): void {
    this.close();
    const b = BUILDERS[preset]();
    this.scene.add(b.group);
    this.built = b;
  }

  close(): void {
    if (!this.built) return;
    this.scene.remove(this.built.group);
    this.built.group.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) mat.dispose();
    });
    this.built = undefined;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(p: number, dt: number, elapsed: number): void {
    if (!this.built) return;
    this.built.update(p, dt, elapsed);
    if (this.built.camera) this.built.camera(p, elapsed, this.camera);
    else orbit(p, elapsed, this.camera, 8.5, 1.2);
    this.shafts?.update(elapsed);
  }
}

function orbit(p: number, elapsed: number, cam: PerspectiveCamera, radius: number, height: number, target = new Vector3(0, 1, 0)): void {
  const a = -0.5 + p * 1.6 + elapsed * 0.04;
  const r = radius - p * 2.2;
  cam.position.set(Math.sin(a) * r, height + 0.6 + p * 1.6 + noise1(elapsed * 0.1, 31) * 0.15, Math.cos(a) * r);
  cam.lookAt(target);
}

const glass = (color: number, emissive: Color, intensity = 0.2): MeshPhysicalMaterial =>
  new MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.6,
    envMapIntensity: 1.6,
    emissive,
    emissiveIntensity: intensity,
    flatShading: true,
  });

const lit = (emissive: Color, intensity = 1.4): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: 0x0a0a0a, emissive, emissiveIntensity: intensity, roughness: 0.5 });

const dark = new MeshStandardMaterial({ color: 0x2a3138, metalness: 0.7, roughness: 0.7 });

function halo(color: Color, size: number, opacity = 0.45): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: radialTexture(), color, blending: AdditiveBlending, transparent: true, opacity, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

function floor(): Mesh {
  const f = new Mesh(new PlaneGeometry(40, 40), new MeshStandardMaterial({ color: 0x0f1a20, roughness: 0.95 }));
  f.rotation.x = -Math.PI / 2;
  f.position.y = -1.2;
  f.receiveShadow = true;
  return f;
}

const BUILDERS: Record<Preset, () => Built> = {
  /** A faceted stone that lifts and sheds its shards as you scroll. */
  crystal: () => {
    const g = new Group();
    g.add(floor());
    const gem = new Mesh(new IcosahedronGeometry(1.5, 1), glass(0x9fe4ee, TEAL, 0.25));
    gem.position.y = 1.2;
    g.add(gem);
    const glow = halo(TEAL, 7);
    glow.position.y = 1.2;
    g.add(glow);
    const N = 40;
    const shards = new InstancedMesh(new OctahedronGeometry(0.16, 0), glass(0x8fd0dc, TEAL, 0.5), N);
    g.add(shards);
    const seeds = Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 2, y: noise1(i, 7) * 1.2, s: 0.6 + Math.random() * 0.8 }));
    return {
      group: g,
      update: (p, dt, t) => {
        gem.rotation.y += dt * 0.25;
        gem.rotation.x = Math.sin(t * 0.3) * 0.15;
        gem.position.y = 1.2 + p * 0.8 + Math.sin(t * 0.6) * 0.08;
        glow.position.y = gem.position.y;
        const r = 1.2 + p * 3.5;
        seeds.forEach((s, i) => {
          const a = s.a + t * 0.15 * s.s;
          DUMMY.position.set(Math.cos(a) * r, 1.2 + s.y * (0.5 + p) + Math.sin(t * 0.8 + i) * 0.1, Math.sin(a) * r);
          DUMMY.rotation.set(t * s.s, a, 0);
          DUMMY.scale.setScalar(s.s);
          DUMMY.updateMatrix();
          shards.setMatrixAt(i, DUMMY.matrix);
        });
        shards.instanceMatrix.needsUpdate = true;
      },
    };
  },

  /** The agent's pipeline: a question travels six stations; the router's 17 models orbit the last-but-one. */
  agent: () => {
    const g = new Group();
    g.add(floor());
    const NODES = 6;
    const xs = Array.from({ length: NODES }, (_, i) => -6.5 + i * 2.6);
    const nodeMat = lit(TEAL, 1.0);
    const nodes = new InstancedMesh(new SphereGeometry(0.3, 20, 14), nodeMat, NODES);
    xs.forEach((x, i) => {
      DUMMY.position.set(x, 1, 0);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.setScalar(1);
      DUMMY.updateMatrix();
      nodes.setMatrixAt(i, DUMMY.matrix);
    });
    g.add(nodes);
    const rail = new Mesh(new BoxGeometry(xs[NODES - 1] - xs[0], 0.05, 0.05), dark);
    rail.position.set(0, 1, 0);
    g.add(rail);
    const pedestals = new InstancedMesh(new CylinderGeometry(0.18, 0.28, 2.1, 10), dark, NODES);
    xs.forEach((x, i) => {
      DUMMY.position.set(x, -0.15, 0);
      DUMMY.updateMatrix();
      pedestals.setMatrixAt(i, DUMMY.matrix);
    });
    g.add(pedestals);

    const orb = new Mesh(new SphereGeometry(0.2, 16, 12), new MeshBasicMaterial({ color: new Color(2.4, 2.2, 1.6) }));
    g.add(orb);
    const orbGlow = halo(new Color(0xfff1d6), 3.2, 0.6);
    g.add(orbGlow);

    // The router: three tilted orbits of models around a crimson combiner at station five.
    const router = new Group();
    router.position.set(xs[4], 1, 0);
    const combiner = new Mesh(new SphereGeometry(0.34, 24, 16), lit(CRIMSON, 1.8));
    router.add(combiner, halo(CRIMSON, 3.6, 0.5));
    const rings = [1.1, 1.5, 1.9].map((r, i) => {
      const ring = new Group();
      ring.rotation.set(0.9 + i * 0.5, i * 1.1, 0.3 * i);
      const torus = new Mesh(new TorusGeometry(r, 0.012, 6, 96), lit(TEAL, 0.6));
      ring.add(torus);
      const count = [5, 6, 6][i];
      const models = new InstancedMesh(new SphereGeometry(0.09, 10, 8), lit(TEAL, 1.6), count);
      ring.add(models);
      router.add(ring);
      return { ring, models, count, r, speed: 0.5 - i * 0.12 };
    });
    g.add(router);
    const curve = new CatmullRomCurve3(xs.map((x, i) => new Vector3(x, 1 + (i % 2) * 0.35, 0)));
    return {
      group: g,
      update: (p, dt, t) => {
        const q = smoothstep(0, 0.85, p);
        curve.getPointAt(q, orb.position);
        orb.position.y += 0.1 + Math.sin(t * 5) * 0.04;
        orbGlow.position.copy(orb.position);
        rings.forEach(({ ring, models, count, r, speed }) => {
          ring.rotation.y += dt * speed;
          for (let k = 0; k < count; k++) {
            const a = (k / count) * Math.PI * 2 + t * speed * 2;
            DUMMY.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
            DUMMY.rotation.set(0, 0, 0);
            DUMMY.scale.setScalar(1);
            DUMMY.updateMatrix();
            models.setMatrixAt(k, DUMMY.matrix);
          }
          models.instanceMatrix.needsUpdate = true;
        });
        combiner.scale.setScalar(1 + Math.sin(t * 2.5) * 0.08 + smoothstep(0.6, 0.9, p) * 0.3);
      },
      camera: (p, t, cam) => {
        const x = lerp(-3, xs[4], smoothstep(0.1, 0.9, p));
        cam.position.set(x + Math.sin(t * 0.1) * 0.3, 2.6 + p * 0.6, 7.5 - p * 2.5);
        cam.lookAt(x, 1, 0);
      },
    };
  },

  /** A knee read on film: bones in X-ray glass, the joint gap in crimson, a scan plane sweeping down. */
  xray: () => {
    const g = new Group();
    const film = new MeshPhysicalMaterial({
      color: 0x8fd2e8,
      emissive: new Color(0x2a6e88),
      emissiveIntensity: 0.6,
      metalness: 0,
      roughness: 0.4,
      transparent: true,
      opacity: 0.42,
      side: DoubleSide,
      depthWrite: false,
    });
    const femur = new Mesh(new CapsuleGeometry(0.42, 3.2, 6, 18), film);
    femur.position.set(0, 3.2, 0);
    femur.rotation.z = 0.08;
    g.add(femur);
    for (const s of [-1, 1]) {
      const condyle = new Mesh(new SphereGeometry(0.5, 18, 14), film);
      condyle.position.set(s * 0.42, 1.55, 0.05);
      condyle.scale.set(1, 0.85, 1.1);
      g.add(condyle);
    }
    const plateau = new Mesh(new SphereGeometry(0.95, 20, 14), film);
    plateau.position.set(0, 0.55, 0);
    plateau.scale.set(1.1, 0.42, 0.9);
    g.add(plateau);
    const tibia = new Mesh(new CapsuleGeometry(0.4, 3.4, 6, 18), film);
    tibia.position.set(0, -1.6, 0);
    tibia.rotation.z = -0.05;
    g.add(tibia);
    const fibula = new Mesh(new CapsuleGeometry(0.14, 3.0, 4, 10), film);
    fibula.position.set(0.95, -1.9, -0.2);
    g.add(fibula);
    const gap = new Mesh(new CylinderGeometry(0.95, 0.95, 0.06, 32), lit(CRIMSON, 1.6));
    gap.position.set(0, 1.0, 0);
    g.add(gap);
    const gapGlow = halo(CRIMSON, 4, 0.35);
    gapGlow.position.copy(gap.position);
    g.add(gapGlow);
    const backdrop = new Mesh(new PlaneGeometry(12, 12), new MeshStandardMaterial({ color: 0x07131a, roughness: 1 }));
    backdrop.position.set(0, 1, -2.5);
    g.add(backdrop);
    const scan = new Mesh(
      new PlaneGeometry(5, 3.5),
      new MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.18, blending: AdditiveBlending, side: DoubleSide, depthWrite: false }),
    );
    scan.rotation.x = -Math.PI / 2;
    g.add(scan);
    const scanEdge = new Mesh(new BoxGeometry(5, 0.02, 3.5), new MeshBasicMaterial({ color: new Color(1.5, 2.6, 2.8), transparent: true, opacity: 0.55 }));
    g.add(scanEdge);
    return {
      group: g,
      update: (p, _dt, t) => {
        const y = 5.2 - p * 8.2;
        scan.position.y = y;
        scanEdge.position.y = y;
        const near = 1 - smoothstep(0, 1.2, Math.abs(y - 1.0));
        (gap.material as MeshStandardMaterial).emissiveIntensity = 1.2 + near * 2.2 + Math.sin(t * 3) * 0.2;
        gapGlow.material.opacity = 0.25 + near * 0.5;
      },
      camera: (p, t, cam) => {
        const a = -0.4 + p * 0.9 + Math.sin(t * 0.08) * 0.1;
        cam.position.set(Math.sin(a) * 7.5, 1.2 + (1 - p) * 1.2, Math.cos(a) * 7.5);
        cam.lookAt(0, 1.1, 0);
      },
    };
  },

  /** A price river with candles beneath it; the agent rides the line as you scroll. */
  market: () => {
    const g = new Group();
    g.add(floor());
    const pts: Vector3[] = [];
    let v = 1;
    for (let i = 0; i < 90; i++) {
      v += fbm2(i * 0.11 + 4, 2.3, 3) * 0.35;
      pts.push(new Vector3(-7 + (i / 89) * 14, 0.8 + v, 0));
    }
    const curve = new CatmullRomCurve3(pts);
    const river = new Mesh(new TubeGeometry(curve, 180, 0.045, 6, false), lit(TEAL, 1.5));
    g.add(river);
    const N = 45;
    const up = new InstancedMesh(new BoxGeometry(0.14, 1, 0.14), lit(new Color(0x7fe0b0), 1.0), N);
    const down = new InstancedMesh(new BoxGeometry(0.14, 1, 0.14), lit(CRIMSON, 1.0), N);
    let nu = 0;
    let nd = 0;
    for (let i = 0; i < N; i++) {
      const a = curve.getPointAt(i / N);
      const b = curve.getPointAt(Math.min(1, (i + 0.6) / N));
      const h = Math.max(0.15, Math.abs(b.y - a.y) * 3 + 0.2);
      DUMMY.position.set(a.x, -1.2 + h / 2, 0.6);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.set(1, h, 1);
      DUMMY.updateMatrix();
      if (b.y >= a.y) up.setMatrixAt(nu++, DUMMY.matrix);
      else down.setMatrixAt(nd++, DUMMY.matrix);
    }
    up.count = nu;
    down.count = nd;
    g.add(up, down);
    const orb = new Mesh(new SphereGeometry(0.22, 16, 12), new MeshBasicMaterial({ color: new Color(2.4, 2.2, 1.6) }));
    g.add(orb);
    const glow = halo(new Color(0xfff1d6), 3.4, 0.6);
    g.add(glow);
    return {
      group: g,
      update: (p, _dt, t) => {
        const q = smoothstep(0, 0.9, p);
        curve.getPointAt(q, orb.position);
        orb.position.y += 0.35 + Math.sin(t * 4) * 0.05;
        glow.position.copy(orb.position);
      },
      camera: (p, t, cam) => {
        const x = lerp(-5, 5, smoothstep(0.05, 0.95, p));
        cam.position.set(x + Math.sin(t * 0.1) * 0.2, 2.8, 7.5 - p * 1.5);
        cam.lookAt(x, 1.2, 0);
      },
    };
  },

  /** A phone with a mind inside it and an orbit of work that never leaves the device. */
  device: () => {
    const g = new Group();
    g.add(floor());
    const body = new Mesh(new BoxGeometry(2.3, 4.6, 0.26), dark);
    body.position.y = 1.4;
    g.add(body);
    const screen = new Mesh(new PlaneGeometry(2.05, 4.3), new MeshPhysicalMaterial({ color: 0x06141a, roughness: 0.08, clearcoat: 1, metalness: 0.1, envMapIntensity: 1.4 }));
    screen.position.set(0, 1.4, 0.135);
    g.add(screen);
    const core = new Mesh(new IcosahedronGeometry(0.42, 1), lit(TEAL, 2.0));
    core.position.set(0, 1.6, 0.3);
    g.add(core);
    const coreGlow = halo(TEAL, 3.6, 0.55);
    coreGlow.position.copy(core.position);
    g.add(coreGlow);
    const ring = new Group();
    ring.position.copy(core.position);
    ring.rotation.set(1.1, 0, 0.3);
    ring.add(new Mesh(new TorusGeometry(1.5, 0.012, 6, 96), lit(TEAL, 0.6)));
    const bits = new InstancedMesh(new BoxGeometry(0.1, 0.1, 0.1), lit(new Color(0xfff1d6), 1.4), 12);
    ring.add(bits);
    g.add(ring);
    return {
      group: g,
      update: (p, dt, t) => {
        ring.rotation.y += dt * (0.3 + p * 0.6);
        core.rotation.y += dt * 0.4;
        core.scale.setScalar(1 + Math.sin(t * 2.2) * 0.06 + p * 0.25);
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2 + t * 0.6;
          DUMMY.position.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
          DUMMY.rotation.set(t, a, 0);
          DUMMY.scale.setScalar(1);
          DUMMY.updateMatrix();
          bits.setMatrixAt(k, DUMMY.matrix);
        }
        bits.instanceMatrix.needsUpdate = true;
        body.rotation.y = lerp(0.55, 0, smoothstep(0, 0.7, p)) + Math.sin(t * 0.3) * 0.04;
        screen.rotation.y = body.rotation.y;
        screen.position.set(Math.sin(body.rotation.y) * 0.135, 1.4, Math.cos(body.rotation.y) * 0.135);
      },
      camera: (p, t, cam) => {
        cam.position.set(Math.sin(t * 0.07) * 0.4, 1.9 + p * 0.4, 7.2 - p * 2.4);
        cam.lookAt(0, 1.5, 0);
      },
    };
  },

  /** Agents streaming from three teams into one head agent, which blooms as you scroll. */
  swarm: () => {
    const g = new Group();
    g.add(floor());
    const head = new Mesh(new SphereGeometry(0.5, 28, 20), lit(CRIMSON, 1.8));
    head.position.y = 1.4;
    g.add(head);
    const bloom = halo(CRIMSON, 5, 0.5);
    bloom.position.copy(head.position);
    g.add(bloom);
    const sources = [new Vector3(-5.5, 0.6, -2), new Vector3(5.2, 2.6, -1), new Vector3(0.5, 0.2, 5.5)];
    sources.forEach((s) => {
      const m = new Mesh(new OctahedronGeometry(0.28, 0), lit(TEAL, 1.2));
      m.position.copy(s);
      g.add(m);
    });
    const N = 900;
    const geo = new BufferGeometry();
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const src = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      seed[i] = Math.random();
      src[i] = i % 3;
    }
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    geo.setAttribute('aSrc', new BufferAttribute(src, 1));
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uP: { value: 0 },
        uSize: { value: 22 },
        uS0: { value: sources[0] },
        uS1: { value: sources[1] },
        uS2: { value: sources[2] },
        uHead: { value: head.position },
        uColor: { value: TEAL },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed; attribute float aSrc;
        uniform float uTime; uniform float uP; uniform float uSize; uniform vec3 uS0; uniform vec3 uS1; uniform vec3 uS2; uniform vec3 uHead;
        varying float vA;
        void main() {
          vec3 s = aSrc < 0.5 ? uS0 : (aSrc < 1.5 ? uS1 : uS2);
          float life = fract(aSeed * 5.0 + uTime * (0.08 + aSeed * 0.07));
          float e = life * life * (3.0 - 2.0 * life);
          vec3 p = mix(s, uHead, e);
          float sw = (1.0 - e) * e * 2.2;
          p += vec3(sin(aSeed * 40.0 + uTime * 1.3), cos(aSeed * 31.0 + uTime), sin(aSeed * 17.0 - uTime * 0.8)) * sw * (0.3 + uP);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = 0.35 + 0.65 * (1.0 - abs(e - 0.5) * 2.0);
          gl_PointSize = uSize * (0.5 + aSeed * 0.7) / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(uColor * a, a * vA * 0.7);
        }`,
    });
    const points = new Points(geo, mat);
    points.frustumCulled = false;
    g.add(points);
    return {
      group: g,
      update: (p, _dt, t) => {
        mat.uniforms.uTime.value = t;
        mat.uniforms.uP.value = p;
        const s = 1 + smoothstep(0.3, 1, p) * 1.2 + Math.sin(t * 2) * 0.05;
        head.scale.setScalar(s);
        bloom.scale.setScalar(5 * s);
      },
    };
  },
};
