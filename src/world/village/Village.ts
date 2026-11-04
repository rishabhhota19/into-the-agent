import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HalfFloatType,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { fbm2, noise1 } from '../../util/noise';
import { radialTexture } from '../chapters/Gantry';

const DUMMY = new Object3D();

interface VillagerGeos {
  body: CylinderGeometry;
  head: SphereGeometry;
  hat: ConeGeometry;
  leg: BoxGeometry;
  arm: BoxGeometry;
  bucket: CylinderGeometry;
  basket: SphereGeometry;
  jug: SphereGeometry;
  stick: CylinderGeometry;
  broomHead: BoxGeometry;
  log: CylinderGeometry;
}

/** One villager: a body of simple parts, a prop, and a job that moves them. */
class Villager {
  readonly group = new Group();
  t = 0;
  dir = 1;
  speed = 0.012;
  private readonly legs: Mesh[] = [];
  private readonly arms: Mesh[] = [];
  private readonly prop?: Mesh;
  private readonly tool?: Group;

  constructor(
    readonly kind: 'walk' | 'sweep' | 'chop' | 'wash' | 'well' | 'sit',
    seed: number,
    geos: VillagerGeos,
    skin: MeshStandardMaterial,
    cloth: MeshStandardMaterial,
    cloth2: MeshStandardMaterial,
    wood: MeshStandardMaterial,
    tin: MeshStandardMaterial,
  ) {
    const g = this.group;
    const body = new Mesh(geos.body, cloth);
    body.position.y = 0.95;
    body.castShadow = true;
    g.add(body);
    const head = new Mesh(geos.head, skin);
    head.position.y = 1.55;
    head.castShadow = true;
    g.add(head);
    if (seed % 3 !== 1) {
      const hat = new Mesh(geos.hat, seed % 2 ? cloth2 : wood);
      hat.position.y = 1.78;
      g.add(hat);
    }
    for (const s of [-1, 1]) {
      const leg = new Mesh(geos.leg, cloth2);
      leg.position.set(s * 0.13, 0.28, 0);
      g.add(leg);
      this.legs.push(leg);
      const arm = new Mesh(geos.arm, cloth);
      arm.position.set(s * 0.36, 1.1, 0);
      g.add(arm);
      this.arms.push(arm);
    }
    // Props by job.
    const held = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    if (kind === 'walk') {
      const which = seed % 3;
      if (which === 0) this.prop = held(new Mesh(geos.bucket, tin), 0.42, 0.75, 0.1);
      else if (which === 1) this.prop = held(new Mesh(geos.basket, wood), 0, 1.98, 0);
      else this.prop = held(new Mesh(geos.jug, cloth2), 0.4, 1.1, 0.25);
      if (this.prop.geometry === geos.basket) this.prop.rotation.x = Math.PI;
    } else if (kind === 'sweep') {
      this.tool = new Group();
      const stick = new Mesh(geos.stick, wood);
      stick.rotation.z = 0.5;
      const headM = new Mesh(geos.broomHead, cloth2);
      headM.position.set(0.32, -0.62, 0);
      this.tool.add(stick, headM);
      this.tool.position.set(0.3, 1.1, 0.3);
      g.add(this.tool);
    } else if (kind === 'chop') {
      this.tool = new Group();
      const stick = new Mesh(geos.stick, wood);
      stick.scale.y = 0.7;
      const blade = new Mesh(geos.broomHead, tin);
      blade.position.set(0, 0.5, 0);
      this.tool.add(stick, blade);
      this.tool.position.set(0.4, 1.2, 0.2);
      g.add(this.tool);
      held(new Mesh(geos.log, wood), 0.9, 0.85, 0.4).rotation.z = Math.PI / 2;
    } else if (kind === 'well') {
      this.prop = held(new Mesh(geos.bucket, tin), 0.45, 0.6, 0.2);
    } else if (kind === 'sit') {
      body.position.y = 0.6;
      head.position.y = 1.2;
      this.legs.forEach((l) => {
        l.rotation.x = -Math.PI / 2;
        l.position.set(l.position.x, 0.2, 0.3);
      });
      this.arms.forEach((a) => (a.position.y = 0.75));
    }
  }

  update(elapsed: number, lane: (t: number) => Vector3): void {
    const g = this.group;
    if (this.kind === 'walk') {
      this.t += this.speed * 0.016 * this.dir;
      if (this.t > 1 || this.t < 0) {
        this.dir *= -1;
        this.t = Math.min(1, Math.max(0, this.t));
      }
      const p = lane(this.t);
      const ahead = lane(Math.min(1, Math.max(0, this.t + 0.01 * this.dir)));
      g.position.copy(p);
      g.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z);
      const swing = Math.sin(elapsed * 6 + this.t * 50);
      this.legs[0].rotation.x = swing * 0.5;
      this.legs[1].rotation.x = -swing * 0.5;
      this.arms[0].rotation.x = -swing * 0.35;
      this.arms[1].rotation.x = swing * 0.35;
      g.position.y += Math.abs(Math.sin(elapsed * 6 + this.t * 50)) * 0.04;
      return;
    }
    if (this.kind === 'sweep' && this.tool) {
      this.tool.rotation.y = Math.sin(elapsed * 2.2) * 0.5;
      this.arms[1].rotation.x = -0.9 + Math.sin(elapsed * 2.2) * 0.2;
    } else if (this.kind === 'chop' && this.tool) {
      const k = Math.max(0, Math.sin(elapsed * 2.6));
      this.tool.rotation.x = -2.2 + k * 2.4;
      this.arms[1].rotation.x = -2.0 + k * 2.0;
    } else if (this.kind === 'wash') {
      this.arms[0].rotation.x = -1.6 + Math.sin(elapsed * 1.5) * 0.2;
      this.arms[1].rotation.x = -1.6 + Math.cos(elapsed * 1.5) * 0.2;
    } else if (this.kind === 'well') {
      const pull = Math.sin(elapsed * 1.8);
      this.arms.forEach((a) => (a.rotation.x = -1.2 + pull * 0.4));
      if (this.prop) this.prop.position.y = 0.6 + pull * 0.2;
    } else if (this.kind === 'sit') {
      g.rotation.y += Math.sin(elapsed * 0.3) * 0.0005;
    }
  }
}

/**
 * A village at dusk, before any of this: hills, a river, houses with lit
 * windows and chimney smoke, a windmill turning, birds, lanterns coming on.
 * Rendered live into a texture that the last chamber shows as a window.
 */
export class Village {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(38, 16 / 9, 0.5, 400);
  readonly target: WebGLRenderTarget;
  private readonly sails = new Group();
  private readonly smoke: ShaderMaterial;
  private readonly birds: InstancedMesh;
  private readonly birdSeeds: number[] = [];
  private readonly lanterns: MeshStandardMaterial;
  private readonly river: ShaderMaterial;

  constructor(width = 1024, height = 576) {
    this.target = new WebGLRenderTarget(width, height, { type: HalfFloatType });
    this.target.texture.colorSpace = NoColorSpace;
    const s = this.scene;
    s.fog = new FogExp2(0xd99a6a, 0.012);

    // Sky: a dusk gradient dome, the sun low on the ridge.
    const sky = new Mesh(
      new SphereGeometry(180, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { uTop: { value: new Color(0x3b2a5a) }, uMid: { value: new Color(0xe07a4a) }, uBottom: { value: new Color(0xf6c988) } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; varying vec3 vDir;
          void main() {
            float y = clamp(vDir.y, -0.1, 1.0);
            vec3 c = y < 0.12 ? mix(uBottom, uMid, smoothstep(-0.1, 0.12, y)) : mix(uMid, uTop, pow(smoothstep(0.12, 0.9, y), 0.7));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    s.add(sky);
    const sun = new Sprite(new SpriteMaterial({ map: radialTexture(), color: 0xffd9a6, blending: AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false }));
    sun.position.set(-90, 14, -120);
    sun.scale.setScalar(70);
    s.add(sun);

    // Light: a low warm sun, violet sky fill.
    // Dusk light: low sun, violet sky fill. No shadow map here; the window is small and the fog soft.
    const key = new DirectionalLight(0xffc48a, 2.6);
    key.position.set(-60, 30, -40);
    s.add(key, new HemisphereLight(0x8a6aa8, 0x3a4a2a, 1.1));

    // Hills.
    const ground = new PlaneGeometry(220, 220, 110, 110);
    ground.rotateX(-Math.PI / 2);
    const gp = ground.attributes.position;
    const heightAt = (x: number, z: number): number => {
      const d = Math.hypot(x, z);
      const valley = Math.max(0, 1 - d / 40) * 2.2;
      return fbm2(x * 0.02 + 5, z * 0.02 + 9, 5) * 9 + fbm2(x * 0.08, z * 0.08, 3) * 1.2 - valley + Math.max(0, d - 70) * 0.12;
    };
    for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));
    ground.computeVertexNormals();
    const groundMesh = new Mesh(ground, new MeshStandardMaterial({ color: 0x5f7a3c, roughness: 1 }));
    groundMesh.receiveShadow = true;
    s.add(groundMesh);

    // River: a strip along a curve, water that moves.
    const bend = [new Vector3(-110, 0, 30), new Vector3(-40, 0, 12), new Vector3(0, 0, 18), new Vector3(35, 0, 4), new Vector3(110, 0, -20)];
    const curve = new CatmullRomCurve3(bend);
    const SEG = 120;
    const rp: number[] = [];
    const ruv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const nx = -tan.z;
      const nz = tan.x;
      const w = 4.5 + noise1(t * 6, 3) * 1.2;
      const y = heightAt(p.x, p.z) - 0.6;
      rp.push(p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w);
      ruv.push(0, t * 40, 1, t * 40);
      if (i < SEG) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const riverGeo = new BufferGeometry();
    riverGeo.setAttribute('position', new BufferAttribute(new Float32Array(rp), 3));
    riverGeo.setAttribute('uv', new BufferAttribute(new Float32Array(ruv), 2));
    riverGeo.setIndex(idx);
    riverGeo.computeVertexNormals();
    this.river = new ShaderMaterial({
      transparent: true,
      side: DoubleSide,
      uniforms: { uTime: { value: 0 }, uDeep: { value: new Color(0x2a5a7a) }, uLight: { value: new Color(0xf2c48a) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uLight; varying vec2 vUv;
        void main() {
          float ripple = sin(vUv.y * 9.0 - uTime * 1.6 + sin(vUv.x * 12.0) * 0.8) * 0.5 + 0.5;
          float glint = pow(ripple, 6.0) * 0.6;
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          vec3 c = mix(uDeep, uLight, 0.25 + glint);
          gl_FragColor = vec4(c, 0.85 * edge);
        }`,
    });
    s.add(new Mesh(riverGeo, this.river));

    // Houses: plaster walls, dark pyramid roofs, a chimney, lit windows.
    const H = 18;
    const spots: { x: number; z: number; r: number; sc: number }[] = [];
    for (let i = 0; i < H; i++) {
      const a = (i / H) * Math.PI * 2 + noise1(i, 4) * 0.6;
      const r = 9 + ((i * 7) % 5) * 3.4 + noise1(i, 5) * 2;
      spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r * 0.7 - 6, r: noise1(i, 6) * Math.PI, sc: 0.85 + noise1(i, 8) * 0.25 });
    }
    const walls = new InstancedMesh(new BoxGeometry(4.2, 3, 3.4), new MeshStandardMaterial({ color: 0xe6d2b0, roughness: 0.95 }), H);
    const roofs = new InstancedMesh(new CylinderGeometry(0, 3.3, 2.2, 4), new MeshStandardMaterial({ color: 0x5a3a2e, roughness: 0.9 }), H);
    const chimneys = new InstancedMesh(new BoxGeometry(0.5, 1.4, 0.5), new MeshStandardMaterial({ color: 0x6a5a52, roughness: 1 }), H);
    const windows = new InstancedMesh(new PlaneGeometry(0.7, 0.9), new MeshStandardMaterial({ color: 0x1a1008, emissive: 0xffb050, emissiveIntensity: 2.2, side: DoubleSide }), H * 2);
    const chimneyPos: Vector3[] = [];
    spots.forEach((h, i) => {
      const y = heightAt(h.x, h.z);
      DUMMY.position.set(h.x, y + 1.5 * h.sc, h.z);
      DUMMY.rotation.set(0, h.r, 0);
      DUMMY.scale.setScalar(h.sc);
      DUMMY.updateMatrix();
      walls.setMatrixAt(i, DUMMY.matrix);
      DUMMY.position.y = y + (3 + 1.1) * h.sc;
      DUMMY.rotation.set(0, h.r + Math.PI / 4, 0);
      DUMMY.updateMatrix();
      roofs.setMatrixAt(i, DUMMY.matrix);
      const cx = h.x + Math.cos(h.r) * 1.2 * h.sc;
      const cz = h.z - Math.sin(h.r) * 1.2 * h.sc;
      DUMMY.position.set(cx, y + 4.6 * h.sc, cz);
      DUMMY.rotation.set(0, h.r, 0);
      DUMMY.updateMatrix();
      chimneys.setMatrixAt(i, DUMMY.matrix);
      chimneyPos.push(new Vector3(cx, y + 5.3 * h.sc, cz));
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? 1 : -1;
        DUMMY.position.set(h.x + Math.sin(h.r) * 1.72 * h.sc * side, y + 1.5 * h.sc, h.z + Math.cos(h.r) * 1.72 * h.sc * side);
        DUMMY.rotation.set(0, h.r + (side > 0 ? 0 : Math.PI), 0);
        DUMMY.scale.setScalar(h.sc);
        DUMMY.updateMatrix();
        windows.setMatrixAt(i * 2 + k, DUMMY.matrix);
      }
    });
    walls.castShadow = walls.receiveShadow = true;
    roofs.castShadow = true;
    s.add(walls, roofs, chimneys, windows);

    // Chimney smoke.
    const SM = 360;
    const smokeGeo = new BufferGeometry();
    const sp = new Float32Array(SM * 3);
    const ss = new Float32Array(SM);
    for (let i = 0; i < SM; i++) {
      const c = chimneyPos[i % chimneyPos.length];
      sp[i * 3] = c.x;
      sp[i * 3 + 1] = c.y;
      sp[i * 3 + 2] = c.z;
      ss[i] = Math.random();
    }
    smokeGeo.setAttribute('position', new BufferAttribute(sp, 3));
    smokeGeo.setAttribute('aSeed', new BufferAttribute(ss, 1));
    this.smoke = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uSize: { value: 90 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform float uSize; varying float vA;
        void main() {
          float life = fract(aSeed * 3.0 + uTime * 0.07 * (0.7 + aSeed * 0.6));
          vec3 p = position + vec3(life * 6.0 + sin(life * 9.0 + aSeed * 7.0) * 0.8, life * 7.0, sin(life * 5.0 + aSeed * 3.0) * 0.6);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (1.0 - life) * 0.35 * smoothstep(0.0, 0.1, life);
          gl_PointSize = uSize * (0.4 + life * 1.6) / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.15, d); gl_FragColor = vec4(vec3(0.85, 0.8, 0.78) * a, a * vA); }`,
    });
    const smoke = new Points(smokeGeo, this.smoke);
    smoke.frustumCulled = false;
    s.add(smoke);

    // Windmill on the rise.
    const mx = 26;
    const mz = -22;
    const my = heightAt(mx, mz);
    const tower = new Mesh(new CylinderGeometry(1.6, 2.4, 11, 12), new MeshStandardMaterial({ color: 0xd9c3a0, roughness: 0.95 }));
    tower.position.set(mx, my + 5.5, mz);
    tower.castShadow = true;
    const cap = new Mesh(new ConeGeometry(2.2, 2.4, 12), new MeshStandardMaterial({ color: 0x4a3328, roughness: 0.9 }));
    cap.position.set(mx, my + 12.2, mz);
    s.add(tower, cap);
    this.sails.position.set(mx, my + 10.4, mz + 2.3);
    for (let i = 0; i < 4; i++) {
      const blade = new Mesh(new BoxGeometry(0.5, 7, 0.12), new MeshStandardMaterial({ color: 0xf1e6d2, roughness: 0.9, side: DoubleSide }));
      blade.position.y = 3.5;
      const arm = new Group();
      arm.rotation.z = (i / 4) * Math.PI * 2;
      arm.add(blade);
      blade.castShadow = true;
      this.sails.add(arm);
    }
    s.add(this.sails);

    // Trees: trunks and canopies in three greens.
    const T = 90;
    const trunks = new InstancedMesh(new CylinderGeometry(0.18, 0.3, 2.4, 6), new MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }), T);
    const canopies = new InstancedMesh(new IcosahedronGeometry(1.6, 1), new MeshStandardMaterial({ color: 0x3f6b2e, roughness: 1, flatShading: true }), T);
    for (let i = 0; i < T; i++) {
      const a = noise1(i * 1.7, 12) * Math.PI * 2;
      // Trees ring the village from beyond the lane and the houses; none stands in the lens.
      const r = 34 + Math.abs(noise1(i * 0.9, 13)) * 55;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r - 10;
      const y = heightAt(x, z);
      const sc = 0.8 + Math.abs(noise1(i, 14)) * 0.9;
      DUMMY.position.set(x, y + 1.2 * sc, z);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.setScalar(sc);
      DUMMY.updateMatrix();
      trunks.setMatrixAt(i, DUMMY.matrix);
      DUMMY.position.y = y + 3.2 * sc;
      DUMMY.rotation.set(noise1(i, 15) * 0.3, noise1(i, 16) * 3, 0);
      DUMMY.updateMatrix();
      canopies.setMatrixAt(i, DUMMY.matrix);
      canopies.setColorAt(i, new Color().setHSL(0.26 + noise1(i, 17) * 0.04, 0.45, 0.28 + noise1(i, 18) * 0.08));
    }
    trunks.castShadow = canopies.castShadow = true;
    s.add(trunks, canopies);

    // The lane runs across the near side of the village, where the window looks.
    const laneZ = (t: number): number => 6 + Math.sin(t * 3.5) * 4;

    // Lanterns along the lane, coming on with the dusk.
    this.lanterns = new MeshStandardMaterial({ color: 0x3a2a1a, emissive: 0xffc070, emissiveIntensity: 1.8 });
    const LN = 14;
    const lanterns = new InstancedMesh(new SphereGeometry(0.28, 10, 8), this.lanterns, LN);
    const posts = new InstancedMesh(new CylinderGeometry(0.08, 0.1, 2.6, 6), new MeshStandardMaterial({ color: 0x2a2420 }), LN);
    for (let i = 0; i < LN; i++) {
      const t = i / (LN - 1);
      const x = -30 + t * 60;
      const z = laneZ(t);
      const y = heightAt(x, z);
      DUMMY.position.set(x, y + 1.3, z);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.setScalar(1);
      DUMMY.updateMatrix();
      posts.setMatrixAt(i, DUMMY.matrix);
      DUMMY.position.y = y + 2.75;
      DUMMY.updateMatrix();
      lanterns.setMatrixAt(i, DUMMY.matrix);
    }
    s.add(lanterns, posts);

    // Villagers: simple folk on the lane and at their chores.
    this.lanePoint = (t: number): Vector3 => {
      const x = -30 + t * 60;
      const z = laneZ(t);
      return new Vector3(x, heightAt(x, z), z);
    };
    this.buildVillagers(heightAt);

    // Birds: a loose flock crossing the sky.
    const B = 22;
    this.birds = new InstancedMesh(new BoxGeometry(1.1, 0.06, 0.18), new MeshBasicMaterial({ color: 0x2a1a22 }), B);
    for (let i = 0; i < B; i++) this.birdSeeds.push(Math.random());
    s.add(this.birds);

    this.camera.position.set(0, 6.5, 32);
    this.camera.lookAt(0, 2.2, -4);
  }

  private lanePoint!: (t: number) => Vector3;
  private readonly villagers: Villager[] = [];

  /** Low-poly villagers: walkers on the lane carrying things, and a few at their chores. */
  private buildVillagers(heightAt: (x: number, z: number) => number): void {
    const skin = [0xe8c39e, 0xc99a6e, 0x8d5a3c, 0xf1d2b6].map((c) => new MeshStandardMaterial({ color: c, roughness: 0.9 }));
    const cloth = [0x8a3a3a, 0x3a5a8a, 0xb08a3a, 0x4a6a3a, 0x6a4a7a, 0xd9c7a8].map((c) => new MeshStandardMaterial({ color: c, roughness: 0.95 }));
    const wood = new MeshStandardMaterial({ color: 0x6a4a30, roughness: 1 });
    const tin = new MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.5 });
    const geos = {
      body: new CylinderGeometry(0.26, 0.32, 0.8, 8),
      head: new SphereGeometry(0.2, 10, 8),
      hat: new ConeGeometry(0.3, 0.22, 8),
      leg: new BoxGeometry(0.13, 0.55, 0.13),
      arm: new BoxGeometry(0.1, 0.5, 0.1),
      bucket: new CylinderGeometry(0.14, 0.11, 0.22, 8),
      basket: new SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      jug: new SphereGeometry(0.14, 8, 6),
      stick: new CylinderGeometry(0.02, 0.02, 1.3, 5),
      broomHead: new BoxGeometry(0.22, 0.14, 0.08),
      log: new CylinderGeometry(0.16, 0.16, 0.5, 8),
    };
    const kinds: Villager['kind'][] = ['walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'sweep', 'chop', 'wash', 'well', 'sit'];
    kinds.forEach((kind, i) => {
      const v = new Villager(kind, i, geos, skin[i % skin.length], cloth[i % cloth.length], cloth[(i * 5 + 2) % cloth.length], wood, tin);
      v.group.scale.setScalar(1.3);
      if (kind === 'walk') {
        v.t = (i * 0.137) % 1;
        v.dir = i % 2 === 0 ? 1 : -1;
        v.speed = 0.012 + (i % 3) * 0.004;
      } else {
        const spot: Record<string, [number, number, number]> = {
          sweep: [-14, 9.5, 0.9],
          chop: [12, 1.5, 0.4],
          wash: [-4, 15, 0],
          well: [6, 10.5, 1.4],
          sit: [-22, 3, 0.8],
        };
        const [x, z, ry] = spot[kind];
        v.group.position.set(x, heightAt(x, z), z);
        v.group.rotation.y = ry;
      }
      this.scene.add(v.group);
      this.villagers.push(v);
    });
    // A washing line and a chopping block for the chores.
    const lineA = new Vector3(-6.5, heightAt(-6.5, 15) + 2.2, 15);
    const lineB = new Vector3(-1.5, heightAt(-1.5, 15) + 2.2, 15);
    const line = new Mesh(new CylinderGeometry(0.015, 0.015, lineA.distanceTo(lineB), 4), tin);
    line.position.lerpVectors(lineA, lineB, 0.5);
    line.rotation.z = Math.PI / 2;
    this.scene.add(line);
    for (let k = 0; k < 4; k++) {
      const sheet = new Mesh(new PlaneGeometry(0.8, 1.1), cloth[(k + 1) % cloth.length]);
      sheet.material = sheet.material.clone();
      (sheet.material as MeshStandardMaterial).side = DoubleSide;
      sheet.position.lerpVectors(lineA, lineB, 0.15 + k * 0.23);
      sheet.position.y -= 0.55;
      sheet.castShadow = true;
      this.scene.add(sheet);
      this.laundry.push(sheet);
    }
    const block = new Mesh(new CylinderGeometry(0.4, 0.45, 0.6, 10), wood);
    block.position.set(12.9, heightAt(12.9, 1.3) + 0.3, 1.3);
    this.scene.add(block);
  }
  private readonly laundry: Mesh[] = [];

  private frameParity = 0;

  /** Draw the village into its texture, every other frame. Call before the main render while the window is in view. */
  render(renderer: WebGLRenderer, elapsed: number): void {
    this.frameParity ^= 1;
    if (this.frameParity) return;
    for (const v of this.villagers) v.update(elapsed, this.lanePoint);
    this.laundry.forEach((s, k) => {
      s.rotation.x = Math.sin(elapsed * 1.4 + k) * 0.25;
    });
    this.sails.rotation.z = elapsed * 0.45;
    this.smoke.uniforms.uTime.value = elapsed;
    this.river.uniforms.uTime.value = elapsed;
    this.lanterns.emissiveIntensity = 1.6 + Math.sin(elapsed * 1.3) * 0.2;
    this.birdSeeds.forEach((s, i) => {
      const t = (elapsed * 0.03 * (0.8 + s * 0.4) + s) % 1;
      const x = -90 + t * 180;
      const y = 26 + Math.sin(t * Math.PI) * 10 + Math.sin(elapsed * 2 + s * 10) * 0.6 + s * 6;
      const z = -40 + s * 30 + Math.sin(t * 6 + s) * 4;
      DUMMY.position.set(x, y, z);
      DUMMY.rotation.set(0, 0, Math.sin(elapsed * 9 + s * 20) * 0.5);
      DUMMY.scale.setScalar(0.8 + s * 0.6);
      DUMMY.updateMatrix();
      this.birds.setMatrixAt(i, DUMMY.matrix);
    });
    this.birds.instanceMatrix.needsUpdate = true;
    // A slow drift along the lane side of the valley, close enough to see who is about.
    const a = Math.sin(elapsed * 0.05) * 0.55;
    this.camera.position.set(Math.sin(a) * 24, 6.5 + Math.sin(elapsed * 0.1) * 0.3, Math.cos(a) * 22 + 10);
    this.camera.lookAt(Math.sin(a) * 4, 2.2, -4);

    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }
}
