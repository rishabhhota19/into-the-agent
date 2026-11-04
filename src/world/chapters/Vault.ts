import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector3,
} from 'three';
import { LightShafts } from '../../atmosphere/LightShafts';
import content from '../../content/site.json';
import type { Section, SiteContent } from '../../content/types';
import { noise1 } from '../../util/noise';
import { BuildContext, Chapter, Grade } from '../Chapter';
import { DUMMY, ENTRY_POSE, entryTube, exitPit, floorWithHole, hallLights, ringSegments, sectionTexts } from '../chambers/common';
import { concreteMaterial, darkMetalMaterial, lacquerMaterial, metalMaterial } from '../materials';
import { radialTexture } from './Gantry';

const SPACING = 9;
const SCREEN_Y = 2.7;
const SCREEN_X = 3.1;

/**
 * The vault: a ribbed hall where every project hangs as a screen under its own
 * arch (its picture when one is provided, a standby glow until then), and a
 * machine eye on the far wall watches you walk the row.
 */
export class Vault extends Chapter {
  readonly id: string;
  readonly label: string;
  readonly fog = new Color(0x0c2330);
  readonly fogDensity = 0.032;
  readonly grade: Grade = { shadow: new Color(0x0a2a33), highlight: new Color(0xf2e6d2), saturation: 0.95 };
  override readonly accent = new Color(0x7fd3e0);
  private readonly length: number;
  /** One frame per project, in section order; `userData.slug` names it. Clickable. */
  readonly gems: Mesh[] = [];
  private readonly screens: Group[] = [];
  private readonly standby: ShaderMaterial[] = [];
  private pupil!: Group;
  private sclera!: Mesh;
  private shafts?: LightShafts;
  private readonly tmp = new Vector3();
  private readonly tmpDir = new Vector3();

  constructor(private readonly section: Section) {
    super();
    this.id = section.id;
    this.label = section.label;
    const n = section.items.length;
    this.length = 14 + SPACING * n;
    const L = this.length;
    this.exit.set(0, -64, -L + 0.2);
    this.contentPx = 900 * (n + 1);

    const points: [Vector3, Vector3][] = [ENTRY_POSE];
    section.items.forEach((_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(10 + SPACING * i);
      points.push([new Vector3(-side * 1.1, 1.9, z + 5.4), new Vector3(side * SCREEN_X, SCREEN_Y, z)]);
    });
    points.push([new Vector3(0, 2.0, -L + 7), new Vector3(0, 4.5, -L - 5)]);
    points.push([new Vector3(0, 2.4, -L + 0.2), new Vector3(0, -30, -L + 0.2)]);
    this.definePath(points);
    const fr = this.pathFractions(points.length);
    this.stations.push(0, ...fr.slice(1, 1 + n), fr[points.length - 2]);
    const texts = sectionTexts(section, fr.slice(1, 1 + n));
    // Each project's station opens its window instead of leaving for the site.
    section.items.forEach((it, i) => {
      texts[1 + i].link = { label: 'Open project', href: `#project:${it.slug}` };
    });
    this.texts.push(...texts);
    this.texts.push({ t: fr[points.length - 2], align: 'center', kicker: 'the watcher', title: 'Every build is <em>watched</em>. Keep going.' });
  }

  async build(ctx: BuildContext): Promise<void> {
    const g = this.group;
    const L = this.length;
    const metal = metalMaterial(ctx.textures, 0x6e7b86);
    const dark = darkMetalMaterial(ctx.textures, 0x3a434c);
    const concrete = concreteMaterial(ctx.textures, 0x1a2128);

    g.add(floorWithHole(L, concrete));
    // Strut grid over the floor.
    const along = new InstancedMesh(new BoxGeometry(0.08, 0.06, L + 16), dark, 9);
    for (let i = 0; i < 9; i++) {
      DUMMY.position.set(-12 + i * 3, 0.04, -L / 2 + 2);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.set(1, 1, 1);
      DUMMY.updateMatrix();
      along.setMatrixAt(i, DUMMY.matrix);
    }
    const across = Math.ceil((L + 16) / 3);
    const cross = new InstancedMesh(new BoxGeometry(24, 0.06, 0.08), dark, across);
    for (let i = 0; i < across; i++) {
      DUMMY.position.set(0, 0.04, 8 - i * 3);
      DUMMY.updateMatrix();
      cross.setMatrixAt(i, DUMMY.matrix);
    }
    g.add(along, cross);

    // Ribs: an arch every bay, standing across the hall.
    const bays = Math.ceil((L + 6) / SPACING) + 1;
    const ribs = new InstancedMesh(new TorusGeometry(7.4, 0.26, 8, 48, Math.PI), metal, bays);
    const piers = new InstancedMesh(new CylinderGeometry(0.42, 0.5, 4.2, 10), dark, bays * 2);
    for (let i = 0; i < bays; i++) {
      const z = 4 - i * SPACING;
      DUMMY.position.set(0, 4.2, z);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.set(1, 1, 1);
      DUMMY.updateMatrix();
      ribs.setMatrixAt(i, DUMMY.matrix);
      for (const s of [-1, 1]) {
        DUMMY.position.set(s * 7.4, 2.1, z);
        DUMMY.updateMatrix();
        piers.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), DUMMY.matrix);
      }
    }
    ribs.castShadow = piers.castShadow = true;
    g.add(ribs, piers);

    // Screens: one per project, hung from its arch on two cables, turned a little toward you.
    const glow = radialTexture();
    const images = (content as SiteContent).assets.projects ?? {};
    const loader = new TextureLoader();
    const bezelMat = new MeshStandardMaterial({ color: 0x0a0a0a, emissive: this.accent, emissiveIntensity: 1.2, roughness: 0.5 });
    this.section.items.forEach((it, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(10 + SPACING * i);
      const W = it.featured ? 3.6 : 2.9;
      const H = W * 0.625;
      // The group's origin is the cable anchor on the arch, so the screen swings from where it hangs.
      const archY = 4.2 + Math.sqrt(Math.max(0, 7.4 * 7.4 - SCREEN_X * SCREEN_X));
      const drop = archY - 0.2 - SCREEN_Y;
      const screen = new Group();
      screen.position.set(side * SCREEN_X, archY - 0.2, z);
      screen.rotation.y = -side * (Math.PI / 2 - 0.28);
      screen.userData.slug = it.slug;
      screen.userData.drop = drop;

      const frame = new Mesh(new BoxGeometry(W + 0.18, H + 0.18, 0.1), lacquerMaterial(0x0a0e12));
      frame.position.y = -drop;
      frame.castShadow = true;
      frame.userData.slug = it.slug;
      screen.add(frame);
      this.gems.push(frame);

      const image = images[it.slug];
      let face: Mesh;
      if (image) {
        const tex = loader.load(image);
        tex.colorSpace = SRGBColorSpace;
        face = new Mesh(new PlaneGeometry(W, H), new MeshBasicMaterial({ map: tex }));
      } else {
        const mat = standbyMaterial(this.accent, i);
        this.standby.push(mat);
        face = new Mesh(new PlaneGeometry(W, H), mat);
      }
      face.position.set(0, -drop, 0.056);
      screen.add(face);

      // Bezel: four lit bars in the screen's own plane (they swing with it, so they live in the group).
      const bars: [number, number, number, number][] = [
        [0, H / 2 + 0.07, W + 0.18, 0.04],
        [0, -H / 2 - 0.07, W + 0.18, 0.04],
        [-W / 2 - 0.07, 0, 0.04, H + 0.18],
        [W / 2 + 0.07, 0, 0.04, H + 0.18],
      ];
      for (const [bx, by, bw, bh] of bars) {
        const edge = new Mesh(new BoxGeometry(bw, bh, 0.05), bezelMat);
        edge.position.set(bx, by - drop, 0.06);
        screen.add(edge);
      }

      // Two cables from the anchor down to the frame's top corners; they hang with the screen.
      for (const cx of [-W * 0.38, W * 0.38]) {
        const top = new Vector3(0, 0, 0);
        const bottom = new Vector3(cx, -drop + H / 2 + 0.09, 0);
        const len = top.distanceTo(bottom);
        const cable = new Mesh(new CylinderGeometry(0.018, 0.018, len, 5), dark);
        cable.position.lerpVectors(top, bottom, 0.5);
        cable.lookAt(top);
        cable.rotateX(Math.PI / 2);
        screen.add(cable);
      }

      const halo = new Sprite(new SpriteMaterial({ map: glow, color: this.accent, blending: AdditiveBlending, transparent: true, opacity: it.featured ? 0.4 : 0.26, depthWrite: false }));
      halo.scale.set(W * 1.9, H * 2.2, 1);
      halo.position.set(0, -drop, -0.4);
      screen.add(halo);

      g.add(screen);
      this.screens.push(screen);
    });

    // The end wall and the machine eye set into it.
    const wall = new Mesh(new PlaneGeometry(30, 18), concrete);
    wall.position.set(0, 7, -L - 6);
    wall.receiveShadow = true;
    g.add(wall);
    const eyeZ = -L - 5.6;
    for (const [r, tube] of [[5.2, 0.34], [4.2, 0.18]] as const) {
      const ring = new Mesh(new TorusGeometry(r, tube, 8, 96), metal);
      ring.position.set(0, 4.5, eyeZ);
      g.add(ring);
    }
    const blades = new InstancedMesh(new BoxGeometry(0.16, 1.6, 0.1), dark, 48);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      DUMMY.position.set(Math.cos(a) * 3.5, 4.5 + Math.sin(a) * 3.5, eyeZ + 0.1);
      DUMMY.rotation.set(0, 0, a);
      DUMMY.scale.set(1, 1, 1);
      DUMMY.updateMatrix();
      blades.setMatrixAt(i, DUMMY.matrix);
    }
    g.add(blades);
    this.sclera = new Mesh(new SphereGeometry(2.6, 48, 32), lacquerMaterial(0x05080a));
    this.sclera.position.set(0, 4.5, eyeZ + 0.4);
    this.sclera.castShadow = true;
    g.add(this.sclera);
    this.pupil = new Group();
    this.pupil.add(
      new Mesh(new RingGeometry(0.66, 0.86, 48), new MeshBasicMaterial({ color: new Color(1.3, 0.1, 0.14) })),
      new Mesh(new CircleGeometry(0.64, 48), new MeshBasicMaterial({ color: new Color(2.8, 0.22, 0.3) })),
    );
    const pupilGlow = new Sprite(new SpriteMaterial({ map: glow, color: 0xff2a3a, blending: AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false }));
    pupilGlow.scale.set(5, 5, 1);
    this.pupil.add(pupilGlow);
    g.add(this.pupil);

    entryTube(g, ctx.textures, this.accent);
    exitPit(g, ctx.textures, new Color(0xff3b4a), -L + 0.2);
    g.add(ringSegments(1.0, 0.1, 0, metal, 24, 0.3, 0.1));

    hallLights(g, L, this.accent, ctx.quality.shadowMap);
    const lampA = new PointLight(this.accent, 90, 28, 2);
    lampA.position.set(0, 6, -4);
    const lampB = new PointLight(0xff5a66, 80, 30, 2);
    lampB.position.set(0, 5, -L + 2);
    g.add(lampA, lampB);
    this.shafts = new LightShafts(Math.max(2, ctx.quality.shafts - 3), this.accent.getHex(), 0.4);
    this.shafts.group.position.set(0, 0, -L / 2);
    this.shafts.group.scale.set(1.6, 1, 1.6);
    g.add(this.shafts.group);
  }

  override update(dt: number, _t: number, elapsed: number, camera: PerspectiveCamera): void {
    this.screens.forEach((s, i) => {
      // A pendulum on its cables: period 2π√(L/g) for its drop, a hair of amplitude, water-damped.
      const L = s.userData.drop as number;
      const omega = Math.sqrt(9.81 / Math.max(0.5, L));
      s.rotation.z = Math.sin(elapsed * omega + i * 1.3) * 0.01;
      s.rotation.x = Math.sin(elapsed * omega * 0.8 + i * 0.7) * 0.006;
    });
    for (const m of this.standby) m.uniforms.uTime.value = elapsed;
    // The pupil slides over the sclera to face you.
    this.tmp.copy(camera.position);
    this.group.worldToLocal(this.tmp);
    this.tmpDir.subVectors(this.tmp, this.sclera.position).normalize();
    const goal = this.tmpDir.multiplyScalar(2.63).add(this.sclera.position);
    this.pupil.position.lerp(goal, 1 - Math.exp(-dt * 2.2));
    this.pupil.lookAt(this.tmp);
    this.shafts?.update(elapsed);
    void noise1;
  }
}

/** A screen with nothing on it yet: dark glass, a slow scan of light, a faint grid, breathing. */
function standbyMaterial(accent: Color, seed: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAccent: { value: accent }, uSeed: { value: seed * 1.7 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uAccent; uniform float uSeed; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        vec3 base = vec3(0.02, 0.05, 0.07);
        // Fine grid, barely there.
        vec2 g = abs(fract(uv * vec2(32.0, 20.0)) - 0.5);
        float grid = smoothstep(0.47, 0.5, max(g.x, g.y)) * 0.06;
        // A band of light sweeping down every few seconds.
        float sweep = fract(uTime * 0.11 + uSeed * 0.37);
        float band = smoothstep(0.08, 0.0, abs(uv.y - (1.0 - sweep))) * 0.35;
        // Breathing glow from the centre.
        float d = length(uv - 0.5);
        float breathe = (1.0 - smoothstep(0.1, 0.75, d)) * (0.08 + 0.05 * sin(uTime * 1.3 + uSeed));
        float noise = (hash(floor(uv * 160.0) + floor(uTime * 12.0)) - 0.5) * 0.02;
        vec3 c = base + uAccent * (grid + band + breathe) + noise;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}
