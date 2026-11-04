import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Path,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import type { Section } from '../../content/types';
import type { StationText } from '../Chapter';
import { darkMetalMaterial, metalMaterial, ProceduralTextures } from '../materials';

/** Radius of the tube every chamber is entered through; pits are a touch wider so the tubes nest. */
export const TUBE_R = 7.3;
export const PIT_R = 7.6;
/** Where the camera arrives in every chamber (under the entry tube) and what it first looks at. */
export const ENTRY_POSE: [Vector3, Vector3] = [new Vector3(3.2, 1.8, 0.8), new Vector3(0, 1.3, -9)];

export const DUMMY = new Object3D();

/** A ring built from `count` box segments: one draw call, a real built-up look. */
export function ringSegments(radius: number, y: number, z: number, mat: MeshStandardMaterial, count = 48, w = 0.12, h = 0.08): InstancedMesh {
  const len = ((Math.PI * 2 * radius) / count) * 1.06;
  const mesh = new InstancedMesh(new BoxGeometry(len, h, w), mat, count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    DUMMY.position.set(Math.cos(a) * radius, y, z + Math.sin(a) * radius);
    DUMMY.rotation.set(0, -a - Math.PI / 2, 0);
    DUMMY.scale.set(1, 1, 1);
    DUMMY.updateMatrix();
    mesh.setMatrixAt(i, DUMMY.matrix);
  }
  return mesh;
}

export const bandMaterial = (accent: Color, intensity = 1.5): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: 0x0a0a0a, emissive: accent, emissiveIntensity: intensity, roughness: 0.5 });

/** The tube above a chamber's start: you drop out of it into the room. */
export function entryTube(g: Group, tex: ProceduralTextures, accent: Color): void {
  const mat = darkMetalMaterial(tex, 0x2a3138);
  mat.side = DoubleSide;
  // The tube ends well above head height: you drop out of it, then walk under it.
  const tube = new Mesh(new CylinderGeometry(TUBE_R, TUBE_R, 30, 48, 1, true), mat);
  tube.position.set(0, 19.5, 0);
  g.add(tube);
  const band = bandMaterial(accent);
  for (const y of [30, 22, 14, 7.5]) g.add(ringSegments(TUBE_R - 0.2, y, 0, band));
  g.add(ringSegments(TUBE_R + 0.6, 4.9, 0, metalMaterial(tex), 48, 1.1, 0.24));
}

/** The pit at a chamber's end: the collar on the floor and the tube below it. */
export function exitPit(g: Group, tex: ProceduralTextures, accent: Color, z: number): void {
  const mat = darkMetalMaterial(tex, 0x2a3138);
  mat.side = DoubleSide;
  const tube = new Mesh(new CylinderGeometry(PIT_R, PIT_R, 34, 48, 1, true), mat);
  tube.position.set(0, -17, z);
  g.add(tube);
  const band = bandMaterial(accent);
  for (const y of [-4, -11, -18, -26]) g.add(ringSegments(PIT_R - 0.2, y, z, band));
  g.add(ringSegments(PIT_R + 0.7, 0.12, z, metalMaterial(tex), 48, 1.1, 0.24));
}

/** A floor from +10 to -(L+10) along z, with the pit cut out at z = -L + 0.2. */
export function floorWithHole(L: number, mat: MeshStandardMaterial, halfWidth = 14): Mesh {
  // The shape lies in XY; rotateX(-90°) maps shape +y onto -z, so the hall's depth is drawn as +y here.
  const shape = new Shape();
  shape.moveTo(-halfWidth, -10);
  shape.lineTo(halfWidth, -10);
  shape.lineTo(halfWidth, L + 10);
  shape.lineTo(-halfWidth, L + 10);
  shape.closePath();
  const hole = new Path();
  hole.absarc(0, L - 0.2, PIT_R, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new ShapeGeometry(shape, 40);
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  const floor = new Mesh(geo, mat);
  floor.receiveShadow = true;
  return floor;
}

/** Key light with a shadow fitted to a hall of length L, plus a hemisphere in the chamber's tint. */
export function hallLights(g: Group, L: number, accent: Color, shadowMap: number, keyIntensity = 3.2): void {
  const key = new DirectionalLight(0xd9ecf2, keyIntensity);
  key.position.set(10, 30, -L / 2 + 8);
  key.target.position.set(0, 0, -L / 2);
  key.castShadow = true;
  const size = Math.min(shadowMap, 1024);
  key.shadow.mapSize.set(size, size);
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = L / 2 + 6;
  key.shadow.camera.bottom = -L / 2 - 6;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  g.add(key, key.target);
  g.add(new HemisphereLight(accent.clone().lerp(new Color(0xffffff), 0.35), 0x0b1014, 1.7));
}

/** Station texts for a section: an intro, then one per item, alternating sides. */
export function sectionTexts(section: Section, fractions: number[], firstSide = 1): StationText[] {
  const texts: StationText[] = [
    { t: 0, align: 'left', kicker: `chamber · ${section.label.toLowerCase()}`, title: `${section.label}. <em>${section.intro}</em>` },
  ];
  section.items.forEach((it, i) => {
    const side = i % 2 === 0 ? firstSide : -firstSide;
    texts.push({
      t: fractions[i],
      align: side > 0 ? 'left' : 'right',
      kicker: it.kicker || section.label,
      title: it.title,
      body: it.summary,
      tags: it.tags,
      link: it.link,
    });
  });
  return texts;
}
