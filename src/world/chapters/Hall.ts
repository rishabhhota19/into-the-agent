import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Path,
  PerspectiveCamera,
  PointLight,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { LightShafts } from '../../atmosphere/LightShafts';
import type { Section } from '../../content/types';
import { noise1 } from '../../util/noise';
import { BuildContext, Chapter, Grade } from '../Chapter';
import { concreteMaterial, darkMetalMaterial, lacquerMaterial, metalMaterial } from '../materials';

export interface HallPalette {
  fog: number;
  accent: number;
  shadow: number;
  highlight: number;
}

const ITEM_SPACING = 9;
const HOLE = 7.3;

/**
 * A content chamber: a long hall of columns with one slab per item, lit from
 * above, entered through a tube in the ceiling and left through a pit in the
 * floor. Phase 2 replaces the slabs with each section's own world; the
 * entry, the pit, the path and the texts stay.
 */
export class Hall extends Chapter {
  readonly id: string;
  readonly label: string;
  readonly fog: Color;
  readonly fogDensity = 0.034;
  readonly grade: Grade;
  override readonly accent: Color;
  private readonly length: number;
  private shafts?: LightShafts;
  private readonly frames: MeshStandardMaterial[] = [];

  constructor(
    private readonly section: Section,
    palette: HallPalette,
  ) {
    super();
    this.id = section.id;
    this.label = section.label;
    this.fog = new Color(palette.fog);
    this.accent = new Color(palette.accent);
    this.grade = { shadow: new Color(palette.shadow), highlight: new Color(palette.highlight), saturation: 0.95 };

    const n = section.items.length;
    this.length = 12 + ITEM_SPACING * n;
    const L = this.length;
    this.exit.set(0, -64, -L + 0.2);
    this.contentPx = 900 * (n + 1);

    const points: [Vector3, Vector3][] = [[new Vector3(3.2, 1.8, 0.8), new Vector3(0, 1.3, -9)]];
    section.items.forEach((_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(9 + ITEM_SPACING * i);
      points.push([new Vector3(-side * 1.1, 1.7, z + 5.4), new Vector3(side * 3.2, 1.7, z)]);
    });
    points.push([new Vector3(0, 1.9, -L + 6), new Vector3(0, 0.6, -L + 0.2)]);
    points.push([new Vector3(0, 2.4, -L + 0.2), new Vector3(0, -30, -L + 0.2)]);
    this.definePath(points);

    const fr = this.pathFractions(points.length);
    this.stations.push(0, ...fr.slice(1, 1 + n));
    this.texts.push({ t: 0, align: 'left', kicker: `chamber · ${section.label.toLowerCase()}`, title: `${section.label}. <em>${section.intro}</em>` });
    section.items.forEach((it, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      this.texts.push({
        t: fr[1 + i],
        align: side > 0 ? 'left' : 'right',
        kicker: it.kicker || section.label,
        title: it.title,
        body: it.summary,
        tags: it.tags,
        link: it.link,
      });
    });
  }

  build(ctx: BuildContext): void {
    const g = this.group;
    const L = this.length;
    const n = this.section.items.length;
    const metal = metalMaterial(ctx.textures, 0x6e7b86);
    const dark = darkMetalMaterial(ctx.textures, 0x3a434c);
    const concrete = concreteMaterial(ctx.textures, 0x1c232a);
    const dummy = new Object3D();

    // --- floor with the pit cut out of its end --------------------------------------------------
    // The shape lies in XY; rotateX(-90°) maps shape +y onto -z, so the hall's depth is drawn as +y here.
    const shape = new Shape();
    shape.moveTo(-14, -10);
    shape.lineTo(14, -10);
    shape.lineTo(14, L + 10);
    shape.lineTo(-14, L + 10);
    shape.closePath();
    const hole = new Path();
    hole.absarc(0, L - 0.2, HOLE, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const floorGeo = new ShapeGeometry(shape, 40);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.computeVertexNormals();
    const floor = new Mesh(floorGeo, concrete);
    floor.receiveShadow = true;
    g.add(floor);

    // --- columns down both sides ------------------------------------------------------------------
    const count = Math.ceil((L + 10) / ITEM_SPACING) + 1;
    const columns = new InstancedMesh(new CylinderGeometry(0.34, 0.4, 11, 12), dark, count * 2);
    const capitals = new InstancedMesh(new BoxGeometry(1.1, 0.3, 1.1), metal, count * 2);
    let c = 0;
    for (let i = 0; i < count; i++) {
      for (const side of [-1, 1]) {
        dummy.position.set(side * 6.8, 5.5, 3 - i * ITEM_SPACING);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        columns.setMatrixAt(c, dummy.matrix);
        dummy.position.y = 11.1;
        dummy.updateMatrix();
        capitals.setMatrixAt(c, dummy.matrix);
        c += 1;
      }
    }
    columns.castShadow = columns.receiveShadow = true;
    g.add(columns, capitals);

    // --- one slab per item, with a lit frame ------------------------------------------------------
    const slabGeo = new BoxGeometry(3.6, 2.2, 0.1);
    const frameGeo = new BoxGeometry(0.06, 0.06, 0.06);
    const frames = new InstancedMesh(frameGeo, new MeshStandardMaterial({ color: 0x111111 }), n * 4);
    let f = 0;
    this.section.items.forEach((it, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(9 + ITEM_SPACING * i);
      const slab = new Mesh(slabGeo, lacquerMaterial(it.featured ? 0x0b1216 : 0x080b0e));
      slab.position.set(side * 4.6, 1.9, z);
      slab.rotation.y = -side * Math.PI / 2;
      slab.castShadow = slab.receiveShadow = true;
      g.add(slab);
      // Frame: four emissive edges.
      const mat = new MeshStandardMaterial({ color: 0x0a0a0a, emissive: this.accent, emissiveIntensity: it.featured ? 1.6 : 0.8, roughness: 0.5 });
      this.frames.push(mat);
      const edges: [number, number, number, number][] = [
        [0, 1.13, 3.7, 0.06],
        [0, -1.13, 3.7, 0.06],
        [-1.83, 0, 0.06, 2.3],
        [1.83, 0, 0.06, 2.3],
      ];
      for (const [ex, ey, w, h] of edges) {
        const edge = new Mesh(new BoxGeometry(w, h, 0.07), mat);
        edge.position.set(side * 4.55, 1.9 + ey, z - side * ex * 0);
        // Edge lies in the slab plane: x along the hall for the slab's width.
        edge.rotation.y = -side * Math.PI / 2;
        edge.position.z = z + ex;
        g.add(edge);
        f += 1;
      }
    });
    void frames;

    // --- entry tube above the start, pit tube below the end ---------------------------------------
    const tubeMat = darkMetalMaterial(ctx.textures, 0x2a3138);
    tubeMat.side = DoubleSide;
    const entry = new Mesh(new CylinderGeometry(HOLE, HOLE, 30, 48, 1, true), tubeMat);
    entry.position.set(0, 17, 0);
    g.add(entry);
    const pit = new Mesh(new CylinderGeometry(HOLE + 0.3, HOLE + 0.3, 34, 48, 1, true), tubeMat);
    pit.position.set(0, -17, -L + 0.2);
    g.add(pit);
    const band = new MeshStandardMaterial({ color: 0x0a0a0a, emissive: this.accent, emissiveIntensity: 1.5, roughness: 0.5 });
    for (const y of [28, 20, 12, 5]) g.add(this.ring(HOLE - 0.2, y, 0, band, dummy));
    for (const y of [-4, -11, -18, -26]) g.add(this.ring(HOLE + 0.08, y, -L + 0.2, band, dummy));
    g.add(this.ring(HOLE + 0.7, 0.12, -L + 0.2, metal, dummy, 1.1, 0.24));
    g.add(this.ring(HOLE + 0.6, 2.4, 0, metal, dummy, 1.1, 0.24));

    // --- light ------------------------------------------------------------------------------------
    const key = new DirectionalLight(0xd9ecf2, 3.2);
    key.position.set(10, 30, -L / 2 + 8);
    key.target.position.set(0, 0, -L / 2);
    key.castShadow = true;
    key.shadow.mapSize.set(Math.min(ctx.quality.shadowMap, 1024), Math.min(ctx.quality.shadowMap, 1024));
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = L / 2 + 6;
    key.shadow.camera.bottom = -L / 2 - 6;
    key.shadow.camera.near = 4;
    key.shadow.camera.far = 80;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    g.add(key, key.target);
    g.add(new HemisphereLight(this.accent.clone().lerp(new Color(0xffffff), 0.35), 0x0b1014, 1.7));
    const lampA = new PointLight(this.accent, 90, 28, 2);
    lampA.position.set(0, 6, -4);
    const lampB = new PointLight(this.accent, 90, 28, 2);
    lampB.position.set(0, -6, -L + 0.2);
    g.add(lampA, lampB);

    this.shafts = new LightShafts(Math.max(2, ctx.quality.shafts - 3), this.accent.getHex(), 0.4);
    this.shafts.group.position.set(0, 0, -L / 2);
    this.shafts.group.scale.set(1.6, 1, 1.6);
    g.add(this.shafts.group);
  }

  private ring(radius: number, y: number, z: number, mat: MeshStandardMaterial, dummy: Object3D, w = 0.12, h = 0.08): InstancedMesh {
    const count = 48;
    const len = ((Math.PI * 2 * radius) / count) * 1.06;
    const mesh = new InstancedMesh(new BoxGeometry(len, h, w), mat, count);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * radius, y, z + Math.sin(a) * radius);
      dummy.rotation.set(0, -a - Math.PI / 2, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    return mesh;
  }

  override update(_dt: number, _t: number, elapsed: number, _camera: PerspectiveCamera): void {
    this.shafts?.update(elapsed);
    this.frames.forEach((m, i) => {
      m.emissiveIntensity = (this.section.items[i]?.featured ? 1.6 : 0.8) * (0.9 + noise1(elapsed * 0.7, i + 40) * 0.1);
    });
  }
}
