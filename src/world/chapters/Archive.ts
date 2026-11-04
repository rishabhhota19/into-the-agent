import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Vector3,
} from 'three';
import { LightShafts } from '../../atmosphere/LightShafts';
import type { Section } from '../../content/types';
import { noise1 } from '../../util/noise';
import { BuildContext, Chapter, Grade } from '../Chapter';
import { DUMMY, ENTRY_POSE, entryTube, exitPit, floorWithHole, hallLights, sectionTexts } from '../chambers/common';
import { concreteMaterial, darkMetalMaterial } from '../materials';

const SPACING = 9;

/**
 * The archive: a reading room where pages hang in the water. One lit page per
 * piece of writing, written in bars of light; loose leaves drift around them.
 */
export class Archive extends Chapter {
  readonly id: string;
  readonly label: string;
  readonly fog = new Color(0x14101f);
  readonly fogDensity = 0.036;
  readonly grade: Grade = { shadow: new Color(0x1c1030), highlight: new Color(0xf0e4ff), saturation: 0.92 };
  override readonly accent = new Color(0xc9a6ff);
  private readonly length: number;
  private leaves?: InstancedMesh;
  private readonly leafSeeds: number[] = [];
  private readonly pages: Mesh[] = [];
  private shafts?: LightShafts;

  constructor(private readonly section: Section) {
    super();
    this.id = section.id;
    this.label = section.label;
    const n = section.items.length;
    this.length = 16 + SPACING * n;
    const L = this.length;
    this.exit.set(0, -64, -L + 0.2);
    this.contentPx = 900 * (n + 1);

    const points: [Vector3, Vector3][] = [ENTRY_POSE];
    section.items.forEach((_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(10 + SPACING * i);
      points.push([new Vector3(-side * 1.2, 1.8, z + 5), new Vector3(side * 2.4, 2.2, z)]);
    });
    points.push([new Vector3(0, 1.9, -L + 6), new Vector3(0, 0.6, -L + 0.2)]);
    points.push([new Vector3(0, 2.4, -L + 0.2), new Vector3(0, -30, -L + 0.2)]);
    this.definePath(points);
    const fr = this.pathFractions(points.length);
    this.stations.push(0, ...fr.slice(1, 1 + n));
    this.texts.push(...sectionTexts(section, fr.slice(1, 1 + n)));
  }

  build(ctx: BuildContext): void {
    const g = this.group;
    const L = this.length;
    const dark = darkMetalMaterial(ctx.textures, 0x3a3344);
    const concrete = concreteMaterial(ctx.textures, 0x1b1822);
    g.add(floorWithHole(L, concrete));

    // Shelves: tall thin stacks along the walls.
    const stacks = Math.ceil((L + 8) / 4.5);
    const shelf = new InstancedMesh(new BoxGeometry(1.2, 7, 3.6), dark, stacks * 2);
    for (let i = 0; i < stacks; i++) {
      for (const s of [-1, 1]) {
        DUMMY.position.set(s * 8.5, 3.5, 4 - i * 4.5);
        DUMMY.rotation.set(0, 0, 0);
        DUMMY.scale.set(1, 1, 1);
        DUMMY.updateMatrix();
        shelf.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), DUMMY.matrix);
      }
    }
    shelf.castShadow = shelf.receiveShadow = true;
    g.add(shelf);

    // Loose leaves drifting through the room.
    const leafMat = new MeshStandardMaterial({ color: 0xd8cfe8, roughness: 0.9, metalness: 0, side: DoubleSide, emissive: this.accent, emissiveIntensity: 0.08 });
    const LEAVES = 90;
    this.leaves = new InstancedMesh(new PlaneGeometry(0.42, 0.56), leafMat, LEAVES);
    for (let i = 0; i < LEAVES; i++) this.leafSeeds.push(Math.random());
    g.add(this.leaves);

    // One page per piece: a tall glowing sheet with lines of light.
    const pageMat = new MeshStandardMaterial({ color: 0xece6f5, roughness: 0.85, emissive: this.accent, emissiveIntensity: 0.12, side: DoubleSide });
    const lineMat = new MeshStandardMaterial({ color: 0x0a0a0a, emissive: this.accent, emissiveIntensity: 1.6, roughness: 0.5 });
    this.section.items.forEach((_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(10 + SPACING * i);
      const page = new Mesh(new PlaneGeometry(2.4, 3.3), pageMat);
      page.position.set(side * 2.4, 2.2, z);
      page.rotation.y = -side * Math.PI / 2;
      page.castShadow = true;
      g.add(page);
      this.pages.push(page);
      const lines = new InstancedMesh(new BoxGeometry(1, 0.05, 0.02), lineMat, 14);
      for (let k = 0; k < 14; k++) {
        const w = 0.9 + noise1(k * 0.7 + i, 3) * 0.6;
        DUMMY.position.set(side * 2.38, 3.5 - k * 0.2, z + (w - 1.8) / 2 * side * 0);
        DUMMY.rotation.set(0, -side * Math.PI / 2, 0);
        DUMMY.scale.set(w, 1, 1);
        DUMMY.position.z = z - side * 0 + (k % 3 === 2 ? 0.12 : 0);
        DUMMY.updateMatrix();
        lines.setMatrixAt(k, DUMMY.matrix);
      }
      g.add(lines);
      const lamp = new PointLight(this.accent, 60, 20, 2);
      lamp.position.set(side * 1.2, 4.5, z);
      g.add(lamp);
    });

    // Lecterns under the pages.
    const lectern = new InstancedMesh(new CylinderGeometry(0.3, 0.5, 1.1, 10), dark, this.section.items.length);
    this.section.items.forEach((_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      DUMMY.position.set(side * 2.4, 0.55, -(10 + SPACING * i));
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.set(1, 1, 1);
      DUMMY.updateMatrix();
      lectern.setMatrixAt(i, DUMMY.matrix);
    });
    g.add(lectern);

    entryTube(g, ctx.textures, this.accent);
    exitPit(g, ctx.textures, new Color(0xff3b4a), -L + 0.2);
    hallLights(g, L, this.accent, ctx.quality.shadowMap, 2.4);
    this.shafts = new LightShafts(Math.max(2, ctx.quality.shafts - 3), this.accent.getHex(), 0.5);
    this.shafts.group.position.set(0, 0, -L / 2);
    this.shafts.group.scale.set(1.4, 1, 1.4);
    g.add(this.shafts.group);
  }

  override update(_dt: number, _t: number, elapsed: number, _camera: PerspectiveCamera): void {
    const L = this.length;
    if (this.leaves) {
      this.leafSeeds.forEach((s, i) => {
        const z = -(((s * 97 + elapsed * 0.25 * (0.5 + s)) % (L + 10)) - 4);
        DUMMY.position.set(Math.sin(s * 40 + elapsed * 0.2) * 6, 1.2 + s * 6 + Math.sin(elapsed * 0.6 + s * 20) * 0.4, z);
        DUMMY.rotation.set(elapsed * 0.3 * s + s * 7, elapsed * 0.2 + s * 3, Math.sin(elapsed * 0.5 + s) * 0.6);
        DUMMY.scale.set(1, 1, 1);
        DUMMY.updateMatrix();
        this.leaves!.setMatrixAt(i, DUMMY.matrix);
      });
      this.leaves.instanceMatrix.needsUpdate = true;
    }
    this.pages.forEach((p, i) => {
      p.position.y = 2.2 + Math.sin(elapsed * 0.45 + i) * 0.08;
    });
    this.shafts?.update(elapsed);
  }
}
