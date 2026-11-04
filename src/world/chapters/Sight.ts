import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { LightShafts } from '../../atmosphere/LightShafts';
import type { Section } from '../../content/types';
import { loadAnt } from '../../figures/Astronaut';
import { fbm2, noise1 } from '../../util/noise';
import { BuildContext, Chapter, Grade } from '../Chapter';
import { DUMMY, ENTRY_POSE, entryTube, exitPit, floorWithHole, hallLights } from '../chambers/common';
import { concreteMaterial, darkMetalMaterial } from '../materials';
import { radialTexture } from './Gantry';

const SPACING = 8;
const ANT_SCALE = 2.4;
const ANT_POS = new Vector3(-2.6, 0.95 * ANT_SCALE, -9);
const ANT_YAW = 0.42;
/** Right compound eye in model space (measured from the mesh). */
const EYE_LOCAL = new Vector3(0.28, 0.64, 0.07);
const SATS = 9;

/**
 * The hall of sight: research begins at an ant's compound eye, pulls back to
 * show the ant standing under a neural web, then walks the web node by node,
 * one bright constellation per paper, with signals running up into the canopy.
 */
export class Sight extends Chapter {
  readonly id: string;
  readonly label: string;
  readonly fog = new Color(0x07142a);
  readonly fogDensity = 0.03;
  readonly grade: Grade = { shadow: new Color(0x061a3c), highlight: new Color(0xdfe8ff), saturation: 1.0 };
  override readonly accent = new Color(0x4d8dff);
  private readonly bright = new Color(0x9cc4ff);
  private readonly length: number;
  private readonly eye = new Vector3();
  private ant?: Group;
  private sats?: InstancedMesh;
  private pulses?: InstancedMesh;
  private readonly threadSegs: [Vector3, Vector3][] = [];
  private readonly centres: Vector3[] = [];
  private readonly rings: Mesh[] = [];
  private coreMat?: MeshStandardMaterial;
  private shafts?: LightShafts;

  constructor(private readonly section: Section) {
    super();
    this.id = section.id;
    this.label = section.label;
    const n = section.items.length;
    this.length = 24 + SPACING * n;
    const L = this.length;
    this.exit.set(0, -64, -L + 0.2);
    this.contentPx = 900 * (n + 3);

    // The eye in chamber space: scale, yaw about y, then the ant's position.
    const e = EYE_LOCAL.clone().multiplyScalar(ANT_SCALE);
    this.eye.set(e.x * Math.cos(ANT_YAW) + e.z * Math.sin(ANT_YAW), e.y, -e.x * Math.sin(ANT_YAW) + e.z * Math.cos(ANT_YAW)).add(ANT_POS);

    const points: [Vector3, Vector3][] = [ENTRY_POSE];
    points.push([this.eye.clone().add(new Vector3(1.05, 0.22, 1.45)), this.eye.clone()]);
    points.push([new Vector3(4.2, 3.4, 0.5), new Vector3(-1, 4.2, -12)]);
    section.items.forEach((_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(20 + SPACING * i);
      const c = new Vector3(side * 3.4, 4.3 + (i % 3) * 0.5, z);
      this.centres.push(c);
      points.push([new Vector3(-side * 1.0, 2.3, z + 5.2), c.clone()]);
    });
    points.push([new Vector3(0, 1.9, -L + 6), new Vector3(0, 0.6, -L + 0.2)]);
    points.push([new Vector3(0, 2.4, -L + 0.2), new Vector3(0, -30, -L + 0.2)]);
    this.definePath(points);
    const fr = this.pathFractions(points.length);
    this.stations.push(0, fr[1], fr[2], ...fr.slice(3, 3 + n));
    this.texts.push({ t: 0, align: 'left', kicker: `chamber · ${section.label.toLowerCase()}`, title: `${section.label}. <em>${section.intro}</em>` });
    this.texts.push({ t: fr[1], align: 'right', kicker: 'sight', title: 'Research starts by <em>looking closer.</em>', body: 'A compound eye: hundreds of lenses, one picture. The papers below each began as one narrow look at a hard problem.' });
    this.texts.push({ t: fr[2], align: 'left', kicker: 'the web', title: 'Every look <em>joins the web.</em>' });
    section.items.forEach((it, i) => {
      this.texts.push({ t: fr[3 + i], align: i % 2 === 0 ? 'left' : 'right', kicker: it.kicker, title: it.title, body: it.summary, link: it.link });
    });
  }

  async build(ctx: BuildContext): Promise<void> {
    const g = this.group;
    const L = this.length;
    const n = this.section.items.length;
    const dark = darkMetalMaterial(ctx.textures, 0x2a3650);
    const concrete = concreteMaterial(ctx.textures, 0x121a28);
    g.add(floorWithHole(L, concrete));

    // Columns: irregular, tall, lost in the fog above.
    const COLS = 22;
    const columns = new InstancedMesh(new CylinderGeometry(0.26, 0.34, 14, 10), dark, COLS);
    for (let i = 0; i < COLS; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * (5 + noise1(i * 0.8, 11) * 2.5);
      const z = 6 - (i / COLS) * (L + 10) + noise1(i * 1.3, 12) * 2;
      DUMMY.position.set(x, 7, z);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.set(1, 1, 1);
      DUMMY.updateMatrix();
      columns.setMatrixAt(i, DUMMY.matrix);
    }
    columns.castShadow = columns.receiveShadow = true;
    g.add(columns);

    // The web: a canopy of blue nodes, each tied to its nearest neighbours.
    const N = 170;
    const pts: Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const x = (fbm2(i * 0.37 + 3, 7.1, 2) * 0.5 + 0.5) * 20 - 10;
      const z = 6 - (i / N) * (L + 8) + noise1(i * 0.9, 21) * 1.5;
      const y = 7.2 + 2.2 * Math.cos(x / 4.2) + noise1(i * 0.7, 22) * 1.4;
      pts.push(new Vector3(x, y, z));
    }
    const nodeMat = new MeshStandardMaterial({ color: 0x0a1020, emissive: this.bright, emissiveIntensity: 1.5, roughness: 0.4 });
    const nodes = new InstancedMesh(new SphereGeometry(0.2, 12, 10), nodeMat, N);
    pts.forEach((p, i) => {
      DUMMY.position.copy(p);
      DUMMY.rotation.set(0, 0, 0);
      const s = 0.7 + noise1(i * 0.5, 23) * 0.4 + (i % 11 === 0 ? 1.5 : 0);
      DUMMY.scale.setScalar(s);
      DUMMY.updateMatrix();
      nodes.setMatrixAt(i, DUMMY.matrix);
    });
    g.add(nodes);
    const segs: number[] = [];
    pts.forEach((p, i) => {
      const near = pts
        .map((q, j) => ({ j, d: j === i ? Infinity : p.distanceTo(q) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      for (const { j, d } of near) if (j > i && d < 7) segs.push(p.x, p.y, p.z, pts[j].x, pts[j].y, pts[j].z);
    });
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(segs), 3));
    g.add(new LineSegments(lineGeo, new LineBasicMaterial({ color: this.accent, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false })));

    // One constellation per paper: a glass core with a bright heart, an orbit ring, satellites, and threads up into the canopy.
    const glow = radialTexture();
    this.coreMat = new MeshStandardMaterial({ color: 0x0a1020, emissive: this.bright, emissiveIntensity: 2.4, roughness: 0.3 });
    const shellMat = new MeshPhysicalMaterial({ color: 0x9cc4ff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.35, clearcoat: 1, envMapIntensity: 1.4 });
    const satMat = new MeshStandardMaterial({ color: 0x0a1020, emissive: this.accent, emissiveIntensity: 1.8, roughness: 0.4 });
    this.sats = new InstancedMesh(new SphereGeometry(0.15, 10, 8), satMat, n * SATS);
    const threads: number[] = [];
    this.centres.forEach((c, i) => {
      const it = this.section.items[i];
      const core = new Mesh(new SphereGeometry(it.featured ? 0.4 : 0.32, 24, 16), this.coreMat!);
      core.position.copy(c);
      g.add(core);
      const shell = new Mesh(new SphereGeometry(it.featured ? 0.72 : 0.6, 32, 20), shellMat);
      shell.position.copy(c);
      g.add(shell);
      const ring = new Mesh(new TorusGeometry(1.35, 0.02, 8, 96), new MeshBasicMaterial({ color: this.bright, transparent: true, opacity: 0.7 }));
      ring.position.copy(c);
      ring.rotation.set(1.1 + i * 0.2, i * 0.7, 0.3);
      g.add(ring);
      this.rings.push(ring);
      const halo = new Sprite(new SpriteMaterial({ map: glow, color: this.accent, blending: AdditiveBlending, transparent: true, opacity: 0.45, depthWrite: false }));
      halo.scale.setScalar(5.5);
      halo.position.copy(c);
      g.add(halo);
      // Three threads to the nearest canopy nodes; a signal runs up each one.
      pts
        .map((q, j) => ({ j, d: c.distanceTo(q) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .forEach(({ j }) => {
          threads.push(c.x, c.y, c.z, pts[j].x, pts[j].y, pts[j].z);
          this.threadSegs.push([c.clone(), pts[j].clone()]);
        });
      if (i % 2 === 0) {
        const lamp = new PointLight(this.accent, 50, 18, 2);
        lamp.position.copy(c);
        g.add(lamp);
      }
    });
    g.add(this.sats);
    const threadGeo = new BufferGeometry();
    threadGeo.setAttribute('position', new BufferAttribute(new Float32Array(threads), 3));
    g.add(new LineSegments(threadGeo, new LineBasicMaterial({ color: this.bright, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false })));
    this.pulses = new InstancedMesh(new SphereGeometry(0.09, 8, 6), new MeshBasicMaterial({ color: new Color(1.6, 2.0, 3.0) }), this.threadSegs.length);
    g.add(this.pulses);

    entryTube(g, ctx.textures, this.accent);
    exitPit(g, ctx.textures, new Color(0xff3b4a), -L + 0.2);
    hallLights(g, L, this.accent, ctx.quality.shadowMap, 2.6);
    const eyeLamp = new PointLight(this.accent, 50, 16, 2);
    eyeLamp.position.copy(this.eye).add(new Vector3(1.5, 1.5, 2));
    g.add(eyeLamp);
    this.shafts = new LightShafts(Math.max(2, ctx.quality.shafts - 3), 0x7fb0ff, 0.45);
    this.shafts.group.position.set(0, 0, -L / 2);
    this.shafts.group.scale.set(1.5, 1, 1.5);
    g.add(this.shafts.group);

    try {
      this.ant = await loadAnt();
      this.ant.scale.setScalar(ANT_SCALE);
      this.ant.position.copy(ANT_POS);
      this.ant.rotation.y = ANT_YAW;
      g.add(this.ant);
    } catch (err) {
      console.warn('ant skipped', err);
    }
  }

  override update(dt: number, _t: number, elapsed: number, _camera: PerspectiveCamera): void {
    if (this.coreMat) this.coreMat.emissiveIntensity = 2.2 + Math.sin(elapsed * 1.7) * 0.5;
    // Satellites orbit each core; the orbit rings turn.
    if (this.sats) {
      this.centres.forEach((c, i) => {
        for (let k = 0; k < SATS; k++) {
          const a = (k / SATS) * Math.PI * 2 + elapsed * (0.25 + (i % 3) * 0.08);
          const r = 1.1 + (k % 2) * 0.45;
          DUMMY.position.set(c.x + Math.cos(a) * r, c.y + Math.sin(a * 2.3 + i) * 0.5, c.z + Math.sin(a) * r);
          DUMMY.rotation.set(0, 0, 0);
          DUMMY.scale.setScalar(k % 3 === 0 ? 1.4 : 1);
          DUMMY.updateMatrix();
          this.sats!.setMatrixAt(i * SATS + k, DUMMY.matrix);
        }
      });
      this.sats.instanceMatrix.needsUpdate = true;
    }
    this.rings.forEach((r, i) => {
      r.rotation.y += dt * (i % 2 ? 0.3 : -0.25);
    });
    // Signals run from each paper up its threads into the canopy.
    if (this.pulses) {
      this.threadSegs.forEach(([a, b], i) => {
        const p = (elapsed * 0.22 + i * 0.37) % 1;
        DUMMY.position.lerpVectors(a, b, p);
        DUMMY.rotation.set(0, 0, 0);
        DUMMY.scale.setScalar(0.7 + Math.sin(p * Math.PI) * 0.6);
        DUMMY.updateMatrix();
        this.pulses!.setMatrixAt(i, DUMMY.matrix);
      });
      this.pulses.instanceMatrix.needsUpdate = true;
    }
    if (this.ant) {
      this.ant.rotation.y = ANT_YAW + Math.sin(elapsed * 0.6) * 0.02;
      this.ant.position.y = ANT_POS.y + Math.sin(elapsed * 1.1) * 0.02;
    }
    this.shafts?.update(elapsed);
  }
}
