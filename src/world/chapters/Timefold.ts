import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Texture,
  TorusGeometry,
  Vector3,
} from 'three';
import { LightShafts } from '../../atmosphere/LightShafts';
import type { Section } from '../../content/types';
import { loadRabbit } from '../../figures/Astronaut';
import { noise1 } from '../../util/noise';
import { BuildContext, Chapter, Grade } from '../Chapter';
import { DUMMY, ENTRY_POSE, entryTube } from '../chambers/common';
import { concreteMaterial, darkMetalMaterial, metalMaterial } from '../materials';

const SPACING = 9;
const NEAR = new Color(0x7fd3e0);
const FAR = new Color(0xffb86b);

/**
 * The timefold: the last chamber. Time laid out as a direction you can walk:
 * a corridor whose walls and ceiling are panes of moments, cold and teal at
 * this end, warm and amber the further back you go. At the far end, a window
 * into the time before any of this, with a village living inside it.
 */
export class Timefold extends Chapter {
  readonly id: string;
  readonly label: string;
  readonly fog = new Color(0x120d1c);
  readonly fogDensity = 0.03;
  readonly grade: Grade = { shadow: new Color(0x1a1030), highlight: new Color(0xffe2bc), saturation: 0.95 };
  override readonly accent = new Color(0xffb86b);
  private readonly length: number;
  private readonly windowZ: number;
  private paneFaces?: InstancedMesh;
  private readonly drift: Mesh[] = [];
  private shafts?: LightShafts;
  private rabbit?: Group | null;
  private readonly windowMat = new MeshBasicMaterial({ color: 0xffffff });

  constructor(
    section: Section,
    private readonly windowTexture: Texture,
  ) {
    super();
    this.id = section.id;
    this.label = section.label;
    const n = section.items.length;
    this.length = 16 + SPACING * n;
    const L = this.length;
    this.windowZ = -L - 2;
    this.contentPx = 900 * (n + 2);
    this.plungePx = 0;

    const points: [Vector3, Vector3][] = [ENTRY_POSE];
    section.items.forEach((_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(10 + SPACING * i);
      points.push([new Vector3(-side * 0.8, 1.8, z + 4), new Vector3(side * 2.2, 2.2, z - 6)]);
    });
    points.push([new Vector3(0, 2.1, -L + 7), new Vector3(0, 3.2, this.windowZ)]);
    this.definePath(points);
    const fr = this.pathFractions(points.length);
    this.stations.push(0, ...fr.slice(1, 1 + n), fr[points.length - 1]);
    this.texts.push({ t: 0, align: 'left', kicker: `chamber · ${section.label.toLowerCase()}`, title: `${section.label}. <em>${section.intro}</em>`, body: 'Time runs down this corridor. Everything you passed is the AI era; the far end is before it.' });
    section.items.forEach((it, i) => {
      this.texts.push({ t: fr[1 + i], align: i % 2 === 0 ? 'left' : 'right', kicker: it.kicker, title: it.title, body: it.summary || it.body, link: it.link });
    });
    this.texts.push({
      t: fr[points.length - 1],
      align: 'left',
      kicker: 'the fourth dimension · before ai',
      title: 'Look back. <em>This is where the work comes from.</em>',
      body: 'A village at dusk, before agents and models: lamps lit by hand, bread baked at home, a windmill doing the computing. Every build above is in service of a place like this.',
    });
  }

  async build(ctx: BuildContext): Promise<void> {
    const g = this.group;
    const L = this.length;
    const metal = metalMaterial(ctx.textures, 0x6e6472);
    const dark = darkMetalMaterial(ctx.textures, 0x2e2733);
    const concrete = concreteMaterial(ctx.textures, 0x15111c);

    // Floor: a dark mirror of a floor with pane tiles.
    const floor = new Mesh(new PlaneGeometry(14, L + 24), new MeshPhysicalMaterial({ color: 0x0b0a12, roughness: 0.25, metalness: 0.2, clearcoat: 0.6, envMapIntensity: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -L / 2 + 2);
    floor.receiveShadow = true;
    g.add(floor);

    // The lattice: panes on both walls and the ceiling, each a moment, colder near and warmer far.
    const rows = Math.ceil((L + 6) / 1.9);
    const perRow = 4 + 4 + 5; // left wall, right wall, ceiling
    const count = rows * perRow;
    // Dark glass panes with glowing edges; the edge colour walks from this era's teal to the past's amber.
    const faceMat = new MeshPhysicalMaterial({ color: 0x1a1f2c, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1, envMapIntensity: 0.5 });
    this.paneFaces = new InstancedMesh(new BoxGeometry(1.62, 1.1, 0.04), faceMat, count);
    const BANDS = 5;
    const edgeMeshes: InstancedMesh[] = [];
    const edgeGeo = new BoxGeometry(1, 1, 0.03);
    for (let b = 0; b < BANDS; b++) {
      const c = NEAR.clone().lerp(FAR, b / (BANDS - 1));
      const mat = new MeshStandardMaterial({ color: 0x0a0a0a, emissive: c, emissiveIntensity: 1.1, roughness: 0.5 });
      edgeMeshes.push(new InstancedMesh(edgeGeo, mat, Math.ceil(count / BANDS + rows * perRow) * 4));
    }
    const edgeCount: number[] = new Array(BANDS).fill(0);
    let k = 0;
    const tmp = new Object3D();
    for (let r = 0; r < rows; r++) {
      const z = 4 - r * 1.9;
      const depth = Math.min(1, Math.max(0, (-z - 2) / (L + 2)));
      const band = Math.min(BANDS - 1, Math.round(depth * (BANDS - 1)));
      const place = (x: number, y: number, ry: number, rx: number): void => {
        DUMMY.position.set(x, y, z);
        DUMMY.rotation.set(rx, ry, 0);
        DUMMY.scale.set(1, 1, 1);
        DUMMY.updateMatrix();
        this.paneFaces!.setMatrixAt(k, DUMMY.matrix);
        k += 1;
        // Four bars around the pane, expressed in the pane's local frame.
        const bars: [number, number, number, number][] = [
          [0, 0.57, 1.7, 0.05],
          [0, -0.57, 1.7, 0.05],
          [-0.83, 0, 0.05, 1.18],
          [0.83, 0, 0.05, 1.18],
        ];
        const m = edgeMeshes[band];
        for (const [bx, by, bw, bh] of bars) {
          tmp.position.set(bx, by, 0.03);
          tmp.rotation.set(0, 0, 0);
          tmp.scale.set(bw, bh, 1);
          tmp.updateMatrix();
          const world = DUMMY.matrix.clone().multiply(tmp.matrix);
          m.setMatrixAt(edgeCount[band]++, world);
        }
      };
      for (let i = 0; i < 4; i++) {
        place(-7, 0.75 + i * 1.3, Math.PI / 2, 0);
        place(7, 0.75 + i * 1.3, -Math.PI / 2, 0);
      }
      for (let i = 0; i < 5; i++) place(-4 + i * 2, 6.1, 0, Math.PI / 2);
    }
    edgeMeshes.forEach((m, b) => {
      m.count = edgeCount[b];
      g.add(m);
    });
    g.add(this.paneFaces);

    // Ribs between the rows of panes.
    const ribs = new InstancedMesh(new TorusGeometry(7.6, 0.08, 6, 48, Math.PI), dark, Math.ceil(rows / 3));
    for (let i = 0; i < Math.ceil(rows / 3); i++) {
      DUMMY.position.set(0, 0.4, 4 - i * 5.7);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.set(1, 0.8, 1);
      DUMMY.updateMatrix();
      ribs.setMatrixAt(i, DUMMY.matrix);
    }
    g.add(ribs);

    // Loose moments drifting in the corridor.
    for (let i = 0; i < 7; i++) {
      const m = new Mesh(new BoxGeometry(2.2, 1.5, 0.05), new MeshPhysicalMaterial({ color: NEAR.clone().lerp(FAR, i / 6), roughness: 0.1, transparent: true, opacity: 0.4, clearcoat: 1, emissive: NEAR.clone().lerp(FAR, i / 6), emissiveIntensity: 0.25 }));
      m.position.set(noise1(i, 41) * 3.5, 2 + Math.abs(noise1(i, 42)) * 2.5, -8 - i * (L / 7));
      g.add(m);
      this.drift.push(m);
    }

    // The window at the end: an arch of metal around the living picture.
    const win = new Mesh(new PlaneGeometry(11.2, 6.3), this.windowMat);
    this.windowMat.map = this.windowTexture;
    this.windowMat.needsUpdate = true;
    win.position.set(0, 3.4, this.windowZ);
    g.add(win);
    const frame = new Mesh(new TorusGeometry(6.4, 0.3, 10, 96, Math.PI), metal);
    frame.position.set(0, 2.6, this.windowZ + 0.1);
    g.add(frame);
    const sill = new Mesh(new BoxGeometry(13.4, 0.5, 1.4), metal);
    sill.position.set(0, 0.25, this.windowZ + 0.2);
    g.add(sill);
    for (const s of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.5, 2.8, 0.5), dark);
      post.position.set(s * 6.5, 1.4, this.windowZ + 0.1);
      g.add(post);
    }
    const wall = new Mesh(new PlaneGeometry(30, 20), concrete);
    wall.position.set(0, 7, this.windowZ - 0.3);
    g.add(wall);
    const glow = new PointLight(0xffc48a, 120, 30, 2);
    glow.position.set(0, 3.5, this.windowZ + 3);
    g.add(glow);

    entryTube(g, ctx.textures, NEAR);
    const key = new DirectionalLight(0xd9d2f2, 1.6);
    key.position.set(6, 20, -L / 2);
    key.target.position.set(0, 0, -L / 2);
    g.add(key, key.target);
    g.add(new HemisphereLight(0x6a5a9a, 0x0a0810, 1.2));
    const lampA = new PointLight(NEAR, 60, 26, 2);
    lampA.position.set(0, 5, -6);
    g.add(lampA);
    this.shafts = new LightShafts(Math.max(2, ctx.quality.shafts - 4), 0xffd0a0, 0.3);
    this.shafts.group.position.set(0, 0, -L + 4);
    this.shafts.group.scale.set(1.2, 0.8, 1.2);
    g.add(this.shafts.group);

    try {
      this.rabbit = await loadRabbit();
      if (this.rabbit) {
        // On the sill's step, looking out into the village.
        this.rabbit.position.set(3.4, 0.5, this.windowZ + 2.6);
        this.rabbit.rotation.y = 2.0;
        g.add(this.rabbit);
      }
    } catch (err) {
      console.warn('rabbit skipped', err);
    }
  }

  /** True while the window is worth drawing: this chamber is current and its far half is near. */
  windowInView(t: number): boolean {
    return t > 0.35;
  }

  override update(dt: number, _t: number, elapsed: number, _camera: PerspectiveCamera): void {
    this.drift.forEach((m, i) => {
      m.rotation.y += dt * 0.08 * (i % 2 ? 1 : -1);
      m.position.y = 2 + Math.abs(noise1(i, 42)) * 2.5 + Math.sin(elapsed * 0.4 + i) * 0.25;
    });
    this.shafts?.update(elapsed);
  }
}
