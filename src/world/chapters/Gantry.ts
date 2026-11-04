import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  QuadraticBezierCurve3,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LightShafts } from '../../atmosphere/LightShafts';
import type { SiteContent } from '../../content/types';
import { fbm2, noise1 } from '../../util/noise';
import { BuildContext, Chapter, StationText } from '../Chapter';
import { concreteMaterial, darkMetalMaterial, lacquerMaterial, metalMaterial } from '../materials';

const UP = new Vector3(0, 1, 0);

/** Chamber one: a ring gantry hanging in deep water, something dark at its centre. */
export class Gantry extends Chapter {
  readonly id = 'home';
  readonly label = 'Home';
  readonly fog = new Color(0x0b2a33);
  readonly fogDensity = 0.024;
  readonly grade = { shadow: new Color(0x0a2a33), highlight: new Color(0xf2e6d2), saturation: 0.95 };

  private core!: Mesh;
  private pupil!: Group;
  private readonly lamps: MeshStandardMaterial[] = [];
  private shafts!: LightShafts;
  private readonly tmp = new Vector3();
  private readonly tmpDir = new Vector3();

  constructor(content: SiteContent) {
    super();
    // The mouth tube reaches 70 below; the next chamber's entry tube meets it there.
    this.exit.set(0, -90, 0);
    this.contentPx = 3300;
    this.definePath([
      [new Vector3(0, 7.5, 27), new Vector3(0, -3, 0)],
      [new Vector3(9.5, 4, 15.5), new Vector3(0, -6, 0)],
      [new Vector3(3.6, 1.4, 5.2), new Vector3(0, -10, 0)],
      [new Vector3(3.2, -2.6, 0.8), new Vector3(3.2, -40, 0.8)],
    ]);
    this.stations.push(0, 0.42, 0.63, 0.82);

    const { site, home, sections } = content;
    const [lead, rest] = splitTagline(site.tagline);
    const counts = Object.fromEntries(sections.map((s) => [s.id, s.items.length]));
    const texts: StationText[] = [
      {
        t: 0,
        align: 'left',
        kicker: `${site.role} · ${site.location}`,
        title: rest ? `${lead} <em>${rest}</em>` : lead,
        body: home.now,
      },
      {
        t: 0.42,
        align: 'right',
        kicker: 'headline wins',
        title: 'Three wins, <em>three years.</em>',
        body: home.wins.slice(0, 3).join(' '),
      },
      {
        t: 0.63,
        align: 'left',
        kicker: 'for hire · freelance and full-time',
        title: 'Hire the builder, <em>not just the résumé.</em>',
        body: 'Intelligent, custom, autonomous systems that drive real-world value. Freelance builds, retainers and full-time roles: agents, RAG, fine-tuning and medical imaging, scoped in a call and shipped with evals.',
        tags: ['agentic systems', 'rag', 'fine-tuning', 'medical imaging', 'training'],
        link: { label: 'See the services', href: '#go:services' },
      },
      {
        t: 0.82,
        align: 'center',
        kicker: 'the edge',
        title: 'Keep scrolling to go under.',
        body: `${counts.projects ?? 0} builds, ${counts.research ?? 0} papers, ${counts.experience ?? 0} roles, ${counts.services ?? 0} services. Each chamber is one of them.`,
      },
    ];
    this.texts.push(...texts);
  }

  async build(ctx: BuildContext): Promise<void> {
    const g = this.group;
    const metal = metalMaterial(ctx.textures);
    const dark = darkMetalMaterial(ctx.textures);
    const concrete = concreteMaterial(ctx.textures);
    const dummy = new Object3D();

    // --- decks: segmented rings, railings, posts -------------------------------------------
    const decks = [
      { y: 0, r: 9.6 },
      { y: -7, r: 8.5 },
      { y: -14, r: 7.4 },
    ];
    for (const d of decks) {
      g.add(this.ringSegments(d.r, d.y, 48, 0.95, 0.34, metal, dummy));
      g.add(this.ringSegments(d.r - 0.1, d.y - 0.55, 48, 0.5, 0.26, dark, dummy));
      const rail = new Mesh(new TorusGeometry(d.r - 0.5, 0.045, 6, 160), dark);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = d.y + 1.05;
      rail.castShadow = true;
      g.add(rail);
      const posts = new InstancedMesh(new CylinderGeometry(0.035, 0.035, 1.05, 6), dark, 36);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        dummy.position.set(Math.cos(a) * (d.r - 0.5), d.y + 0.52, Math.sin(a) * (d.r - 0.5));
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        posts.setMatrixAt(i, dummy.matrix);
      }
      posts.castShadow = true;
      g.add(posts);
    }

    // --- central platform and spokes on the top deck ---------------------------------------
    g.add(this.ringSegments(2.7, 0, 24, 1.2, 0.3, metal, dummy));
    for (let i = 0; i < 4; i++) {
      const spoke = new Mesh(new BoxGeometry(7.1, 0.26, 0.9), metal);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      spoke.position.set(Math.cos(a) * 6.15, 0, Math.sin(a) * 6.15);
      spoke.rotation.y = -a;
      spoke.castShadow = spoke.receiveShadow = true;
      g.add(spoke);
    }

    // --- pylons with lattice bracing --------------------------------------------------------
    const PYLONS = 8;
    const PR = 10.4;
    const pylons = new InstancedMesh(new BoxGeometry(0.7, 26, 0.7), dark, PYLONS);
    for (let i = 0; i < PYLONS; i++) {
      const a = (i / PYLONS) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * PR, -8, Math.sin(a) * PR);
      dummy.rotation.set(0, -a, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pylons.setMatrixAt(i, dummy.matrix);
    }
    pylons.castShadow = pylons.receiveShadow = true;
    g.add(pylons);
    const braces: Matrix4[] = [];
    const strutMats: Matrix4[] = [];
    const q = new Quaternion();
    const m = new Matrix4();
    const from = new Vector3();
    const to = new Vector3();
    const place = (list: Matrix4[], a: Vector3, b: Vector3): void => {
      const len = a.distanceTo(b);
      this.tmpDir.subVectors(b, a).normalize();
      q.setFromUnitVectors(UP, this.tmpDir);
      m.compose(this.tmp.addVectors(a, b).multiplyScalar(0.5), q, new Vector3(1, len, 1));
      list.push(m.clone());
    };
    for (let i = 0; i < PYLONS; i++) {
      const a0 = (i / PYLONS) * Math.PI * 2;
      const a1 = ((i + 1) / PYLONS) * Math.PI * 2;
      for (let lvl = 0; lvl < 6; lvl++) {
        const y0 = 4.5 - lvl * 4;
        const y1 = y0 - 4;
        from.set(Math.cos(a0) * PR, y0, Math.sin(a0) * PR);
        to.set(Math.cos(a1) * PR, y1, Math.sin(a1) * PR);
        place(braces, from, to);
        from.set(Math.cos(a1) * PR, y0, Math.sin(a1) * PR);
        to.set(Math.cos(a0) * PR, y1, Math.sin(a0) * PR);
        place(braces, from, to);
      }
      // Struts from each pylon in to the two hanging decks.
      for (const d of decks.slice(1)) {
        from.set(Math.cos(a0) * PR, d.y + 3.2, Math.sin(a0) * PR);
        to.set(Math.cos(a0) * (d.r - 0.2), d.y, Math.sin(a0) * (d.r - 0.2));
        place(strutMats, from, to);
      }
    }
    const braceMesh = new InstancedMesh(new BoxGeometry(0.11, 1, 0.11), dark, braces.length);
    braces.forEach((mat, i) => braceMesh.setMatrixAt(i, mat));
    braceMesh.castShadow = true;
    g.add(braceMesh);
    const strutMesh = new InstancedMesh(new CylinderGeometry(0.09, 0.09, 1, 8), dark, strutMats.length);
    strutMats.forEach((mat, i) => strutMesh.setMatrixAt(i, mat));
    strutMesh.castShadow = true;
    g.add(strutMesh);

    // --- cables sagging from the pylon tops to the first hanging deck: merged to one mesh -------
    const cableGeos: TubeGeometry[] = [];
    for (let i = 0; i < PYLONS; i++) {
      const a0 = (i / PYLONS) * Math.PI * 2;
      const a1 = a0 + Math.PI / PYLONS;
      const start = new Vector3(Math.cos(a0) * PR, 5, Math.sin(a0) * PR);
      const end = new Vector3(Math.cos(a1) * 8.4, -6.9, Math.sin(a1) * 8.4);
      const mid = start.clone().lerp(end, 0.5);
      mid.y -= 2.2;
      cableGeos.push(new TubeGeometry(new QuadraticBezierCurve3(start, mid, end), 18, 0.035, 6, false));
    }
    const cables = new Mesh(mergeGeometries(cableGeos), dark);
    cables.castShadow = true;
    g.add(cables);

    // --- lamps on the pylon tops --------------------------------------------------------------
    const lampGeo = new SphereGeometry(0.2, 16, 12);
    const housings = new InstancedMesh(new BoxGeometry(0.5, 0.26, 0.5), dark, PYLONS);
    for (let i = 0; i < PYLONS; i++) {
      const a = (i / PYLONS) * Math.PI * 2;
      const x = Math.cos(a) * PR;
      const z = Math.sin(a) * PR;
      const mat = new MeshStandardMaterial({ color: 0x1a1612, emissive: 0xffd2a0, emissiveIntensity: 2.8, roughness: 0.4 });
      const lamp = new Mesh(lampGeo, mat);
      lamp.position.set(x, 5.25, z);
      g.add(lamp);
      dummy.position.set(x, 5.55, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      housings.setMatrixAt(i, dummy.matrix);
      this.lamps.push(mat);
      // Two real lights carry the lamps; the rest glow through bloom. Every light costs every pixel.
      if (i % 4 === 0) {
        const light = new PointLight(0xffc48a, 48, 30, 2);
        light.position.set(x, 5.1, z);
        g.add(light);
      }
    }
    g.add(housings);

    // --- the core and its crimson pupil ---------------------------------------------------------
    this.core = new Mesh(new SphereGeometry(2.5, 64, 48), lacquerMaterial());
    this.core.position.set(0, -10.2, 0);
    this.core.castShadow = this.core.receiveShadow = true;
    g.add(this.core);

    this.pupil = new Group();
    const iris = new Mesh(new RingGeometry(0.64, 0.82, 48), new MeshBasicMaterial({ color: new Color(1.3, 0.1, 0.14) }));
    const pupilDisc = new Mesh(new CircleGeometry(0.62, 48), new MeshBasicMaterial({ color: new Color(2.8, 0.22, 0.3) }));
    this.pupil.add(iris, pupilDisc);
    g.add(this.pupil);
    const glow = new Sprite(
      new SpriteMaterial({ map: radialTexture(), color: 0xff2a3a, blending: AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    glow.scale.set(5, 5, 1);
    this.pupil.add(glow);

    // --- the floor, far below, with the shaft mouth open in its middle ------------------------------
    const HOLE = 7.6;
    const floorGeo = new RingGeometry(HOLE, 130, 96, 44);
    floorGeo.rotateX(-Math.PI / 2);
    const fp = floorGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i);
      const z = fp.getZ(i);
      const r = Math.hypot(x, z);
      const rim = Math.min(1, Math.max(0, (r - HOLE) / 6)); // flat collar around the mouth
      fp.setY(i, (fbm2(x * 0.028 + 3.1, z * 0.028 + 7.7, 5) * 6 + fbm2(x * 0.11, z * 0.11, 3) * 1.1) * rim);
    }
    floorGeo.computeVertexNormals();
    const floor = new Mesh(floorGeo, concrete);
    floor.position.y = -46;
    floor.receiveShadow = true;
    g.add(floor);
    g.add(this.ringSegments(HOLE + 0.4, -45.9, 48, 1.1, 0.5, metal, dummy));
    const mouthMat = darkMetalMaterial(ctx.textures, 0x2a3138);
    mouthMat.side = DoubleSide;
    const mouth = new Mesh(new CylinderGeometry(HOLE, HOLE, 24, 48, 1, true), mouthMat);
    mouth.position.y = -58;
    mouth.receiveShadow = true;
    g.add(mouth);
    // Inside the mouth: bands of light so the plunge has something to streak.
    const bandTeal = new MeshStandardMaterial({ color: 0x0b1a1e, emissive: 0x7fd3e0, emissiveIntensity: 1.6, roughness: 0.5 });
    const bandRed = new MeshStandardMaterial({ color: 0x1a0507, emissive: 0xff2a3a, emissiveIntensity: 1.8, roughness: 0.5 });
    [-50, -56, -62, -68].forEach((y, i) => {
      g.add(this.ringSegments(HOLE - 0.25, y, 48, 0.12, 0.08, i < 2 ? bandTeal : bandRed, dummy));
    });
    for (const [y, c] of [[-52, 0x8fd8e4], [-65, 0xff5a66]] as const) {
      const l = new PointLight(c, 60, 22, 2);
      l.position.set(0, y, 0);
      g.add(l);
    }

    // --- light --------------------------------------------------------------------------------------
    const key = new DirectionalLight(0xd6eef5, 3.6);
    key.position.set(16, 42, 14);
    key.target.position.set(0, -8, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(ctx.quality.shadowMap, ctx.quality.shadowMap);
    key.shadow.camera.left = key.shadow.camera.bottom = -26;
    key.shadow.camera.right = key.shadow.camera.top = 26;
    key.shadow.camera.near = 4;
    key.shadow.camera.far = 110;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 4;
    g.add(key, key.target);
    g.add(new HemisphereLight(0x5fb0c4, 0x0a1a1c, 1.1));

    this.shafts = new LightShafts(ctx.quality.shafts);
    g.add(this.shafts.group);

  }


  private ringSegments(radius: number, y: number, count: number, w: number, h: number, mat: MeshStandardMaterial, dummy: Object3D): InstancedMesh {
    const len = ((Math.PI * 2 * radius) / count) * 1.06;
    const mesh = new InstancedMesh(new BoxGeometry(len, h, w), mat, count);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
      dummy.rotation.set(0, -a - Math.PI / 2, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  override update(dt: number, _t: number, elapsed: number, camera: PerspectiveCamera): void {
    this.core.rotation.y += dt * 0.05;
    // The pupil slides over the core to face you.
    this.tmp.copy(camera.position);
    this.group.worldToLocal(this.tmp);
    this.tmpDir.subVectors(this.tmp, this.core.position).normalize();
    const goal = this.tmpDir.multiplyScalar(2.53).add(this.core.position);
    this.pupil.position.lerp(goal, 1 - Math.exp(-dt * 2.2));
    this.pupil.lookAt(this.tmp);

    this.lamps.forEach((mat, i) => {
      mat.emissiveIntensity = 2.6 + noise1(elapsed * 5.5, i + 10) * 0.45;
    });
    this.shafts.update(elapsed);
  }
}

/** "I turn research into systems — agents that ship." → lead sentence + dimmed tail. */
function splitTagline(s: string): [string, string] {
  const i = s.search(/\s[—–-]\s/);
  if (i < 0) return [s, ''];
  return [s.slice(0, i).trim(), s.slice(i).replace(/^\s[—–-]\s/, '').trim()];
}

export function radialTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}
