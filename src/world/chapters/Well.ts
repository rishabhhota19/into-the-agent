import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  PerspectiveCamera,
  PointLight,
  TorusGeometry,
  Vector3,
} from 'three';
import type { Section } from '../../content/types';
import { BuildContext, Chapter, Grade } from '../Chapter';
import { bandMaterial, DUMMY } from '../chambers/common';
import { darkMetalMaterial, metalMaterial } from '../materials';

const SPACING = 9;

/**
 * The clockwork well: experience read downward through time. Every role is a
 * dial ring in a shaft of rails and thin rings; the camera sinks from the
 * present to the first internship, and the plunge out is simply more well.
 */
export class Well extends Chapter {
  readonly id: string;
  readonly label: string;
  readonly fog = new Color(0x1c1410);
  readonly fogDensity = 0.046;
  readonly grade: Grade = { shadow: new Color(0x2a1a0c), highlight: new Color(0xffe7c2), saturation: 0.9 };
  override readonly accent = new Color(0xffb86b);
  private readonly depth: number;
  private readonly dials: Group[] = [];

  constructor(private readonly section: Section) {
    super();
    this.id = section.id;
    this.label = section.label;
    const n = section.items.length;
    this.depth = 10 + SPACING * n;
    const D = this.depth;
    // The well's rings run 28 below its last dial; the next chamber's entry tube takes over there.
    this.exit.set(0, -(D + 58), 0);
    this.contentPx = 900 * (n + 1);

    const points: [Vector3, Vector3][] = [[new Vector3(0.8, 2.2, 0.6), new Vector3(0, -8, 0.2)]];
    section.items.forEach((_, i) => {
      const y = -(8 + SPACING * i);
      const a = i * 1.9;
      points.push([new Vector3(Math.cos(a) * 1.6, y + 3.4, Math.sin(a) * 1.6), new Vector3(-Math.cos(a) * 1.2, y - 0.8, -Math.sin(a) * 1.2)]);
    });
    points.push([new Vector3(0, -D + 2, 0), new Vector3(0, -D - 30, 0.3)]);
    this.definePath(points);
    const fr = this.pathFractions(points.length);
    this.stations.push(0, ...fr.slice(1, 1 + n));
    this.texts.push({ t: 0, align: 'left', kicker: `chamber · ${section.label.toLowerCase()}`, title: `${section.label}. <em>${section.intro}</em>` });
    section.items.forEach((it, i) => {
      this.texts.push({ t: fr[1 + i], align: i % 2 === 0 ? 'left' : 'right', kicker: it.kicker, title: it.title, body: it.summary, tags: it.tags, link: it.link });
    });
  }

  build(ctx: BuildContext): void {
    const g = this.group;
    const D = this.depth;
    const metal = metalMaterial(ctx.textures, 0x7a6c62);
    const dark = darkMetalMaterial(ctx.textures, 0x3a302a);
    const top = 30;
    const bottom = -(D + 28);

    // Thin rings all the way down, every 2.6.
    const count = Math.floor((top - bottom) / 2.6);
    const rings = new InstancedMesh(new TorusGeometry(5.6, 0.16, 8, 72), metal, count);
    for (let i = 0; i < count; i++) {
      DUMMY.position.set(0, top - i * 2.6, 0);
      DUMMY.rotation.set(Math.PI / 2, 0, 0);
      DUMMY.scale.set(1, 1, 1);
      DUMMY.updateMatrix();
      rings.setMatrixAt(i, DUMMY.matrix);
    }
    rings.castShadow = rings.receiveShadow = true;
    g.add(rings);

    const rails = new InstancedMesh(new BoxGeometry(0.14, top - bottom, 0.14), dark, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      DUMMY.position.set(Math.cos(a) * 5.9, (top + bottom) / 2, Math.sin(a) * 5.9);
      DUMMY.rotation.set(0, -a, 0);
      DUMMY.scale.set(1, 1, 1);
      DUMMY.updateMatrix();
      rails.setMatrixAt(i, DUMMY.matrix);
    }
    g.add(rails);

    // One dial per role: a heavy ring, sixty ticks, twelve majors, a glowing hour band.
    const tickGeo = new BoxGeometry(0.06, 0.5, 0.14);
    const band = bandMaterial(this.accent, 1.4);
    this.section.items.forEach((it, i) => {
      const y = -(8 + SPACING * i);
      const dial = new Group();
      dial.position.y = y;
      const ring = new Mesh(new TorusGeometry(5.3, 0.34, 10, 96), metal);
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = true;
      dial.add(ring);
      const ticks = new InstancedMesh(tickGeo, dark, 60);
      for (let k = 0; k < 60; k++) {
        const a = (k / 60) * Math.PI * 2;
        const major = k % 5 === 0;
        DUMMY.position.set(Math.cos(a) * 4.75, 0, Math.sin(a) * 4.75);
        DUMMY.rotation.set(0, -a, 0);
        DUMMY.scale.set(1, major ? 1.7 : 1, major ? 1.6 : 1);
        DUMMY.updateMatrix();
        ticks.setMatrixAt(k, DUMMY.matrix);
      }
      dial.add(ticks);
      // The lit arc: how much of the clock this role covers, present roles glow brightest.
      const arc = new Mesh(new TorusGeometry(4.35, 0.06, 6, 64, Math.PI * (it.featured ? 1.6 : 1.0)), band);
      arc.rotation.x = Math.PI / 2;
      dial.add(arc);
      const hub = new Mesh(new TorusGeometry(1.2, 0.08, 6, 48), dark);
      hub.rotation.x = Math.PI / 2;
      dial.add(hub);
      g.add(dial);
      this.dials.push(dial);
    });

    // Light: warm from above, embers below.
    const down = new DirectionalLight(0xe8c9a8, 2.6);
    down.position.set(6, top + 10, 4);
    down.target.position.set(0, bottom, 0);
    g.add(down, down.target);
    g.add(new HemisphereLight(0xb07a52, 0x120804, 1.5));
    for (let i = 0; i < this.section.items.length; i += 2) {
      const l = new PointLight(this.accent, 70, 24, 2);
      l.position.set(0, -(8 + SPACING * i) + 1.5, 0);
      g.add(l);
    }
  }

  override update(dt: number, _t: number, _elapsed: number, _camera: PerspectiveCamera): void {
    this.dials.forEach((d, i) => {
      d.rotation.y += dt * (i % 2 === 0 ? 0.05 : -0.04);
    });
  }
}
