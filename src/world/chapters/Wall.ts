import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three';
import type { Chip, Item } from '../../content/types';
import { lacquerMaterial } from '../materials';
import { Hall } from './Hall';

/**
 * A hall whose stops are walls of cards rather than slabs: one card per chip
 * (a skill, a certificate). Cards that open something burn with the chamber's
 * light; the rest are dark lacquer. The words themselves are in the overlay,
 * where they can be read and clicked.
 */
export class Wall extends Hall {
  private readonly dummy = new Object3D();

  constructor(...args: ConstructorParameters<typeof Hall>) {
    const [section, palette, options] = args;
    super(section, palette, { spacing: 8, pace: 800, ...options });
  }

  protected override furnish(g: Group, it: Item, _i: number, side: number, z: number): void {
    const chips: Chip[] = it.chips ?? it.tags.map((label) => ({ label }));
    const n = Math.max(1, chips.length);
    // A grid a little wider than tall, filling a 5.4 × 3.4 panel; few cards are big, many are small.
    const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 1.6))));
    const rows = Math.ceil(n / cols);
    const gap = 0.1;
    const w = Math.min(1.6, (5.4 - gap * (cols - 1)) / cols);
    const h = Math.min(1.0, (3.4 - gap * (rows - 1)) / rows);
    const lit = chips.filter((c) => c.href).length;
    const dark = n - lit;

    // Two instanced meshes per wall: the cards that open something, and the rest.
    const base = it.featured ? 0.42 : 0.3;
    const glow = new MeshStandardMaterial({ color: 0x0a0a0a, emissive: this.accent, emissiveIntensity: base, roughness: 0.45 });
    this.frames.push({ mat: glow, base });
    const litMesh = lit ? new InstancedMesh(new BoxGeometry(w, h, 0.08), glow, lit) : null;
    const darkMesh = dark ? new InstancedMesh(new BoxGeometry(w, h, 0.08), lacquerMaterial(0x0a1014), dark) : null;
    let a = 0;
    let b = 0;
    const x0 = -((cols - 1) * (w + gap)) / 2;
    const y0 = 1.9 + ((rows - 1) * (h + gap)) / 2;
    chips.forEach((c, k) => {
      const col = k % cols;
      const row = Math.floor(k / cols);
      // The panel lies in the wall's plane: along the hall (z) for its width, up (y) for its height.
      this.dummy.position.set(side * 4.55, y0 - row * (h + gap), z + side * (x0 + col * (w + gap)));
      this.dummy.rotation.set(0, -side * Math.PI / 2, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      if (c.href) litMesh!.setMatrixAt(a++, this.dummy.matrix);
      else darkMesh!.setMatrixAt(b++, this.dummy.matrix);
    });
    for (const m of [litMesh, darkMesh]) {
      if (!m) continue;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    // The backing slab the cards hang on.
    const back = new Mesh(new BoxGeometry(5.8, 3.8, 0.1), lacquerMaterial(0x080b0e));
    back.position.set(side * 4.65, 1.9, z);
    back.rotation.y = -side * Math.PI / 2;
    back.receiveShadow = true;
    g.add(back);
  }
}
