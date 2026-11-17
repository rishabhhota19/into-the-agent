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
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Sprite,
  Texture,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { LightShafts } from '../../atmosphere/LightShafts';
import type { Section } from '../../content/types';
import { BuildContext, Chapter, Grade } from '../Chapter';
import { DUMMY, ENTRY_POSE, entryTube } from '../chambers/common';
import { concreteMaterial, darkMetalMaterial, metalMaterial } from '../materials';
import { logo } from '../emblems';

const SPACING = 9;
const NEAR = new Color(0x7fd3e0);

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
  private shafts?: LightShafts;
  private readonly windowMat = new MeshBasicMaterial({ color: 0xffffff });
  private readonly slugs: string[];
  private readonly hrefs: string[];
  /** The official logos, one per way to reach him; `shown` eases from 0 to 1 as you come near. */
  private readonly logos: { group: Group; y: number; phase: number; href: string; shown: number }[] = [];
  private readonly ray = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly here = new Vector3();
  private camera?: PerspectiveCamera;
  private live = 0; // when this chamber last drew, so clicks only count while you're in it
  private hover = false;

  constructor(
    section: Section,
    private readonly windowTexture: Texture,
  ) {
    super();
    this.id = section.id;
    this.label = section.label;
    this.slugs = section.items.map((it) => it.slug);
    this.hrefs = section.items.map((it) => it.link?.href ?? '');
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
      this.texts.push({ t: fr[1 + i], slug: it.slug, align: i % 2 === 0 ? 'left' : 'right', kicker: it.kicker, title: it.title, body: it.summary || it.body, link: it.link });
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

    const rows = Math.ceil((L + 6) / 1.9);

    // Arches along the corridor (the glass panes that lined it are gone: the logos are what you look at here).
    const ribs = new InstancedMesh(new TorusGeometry(7.6, 0.08, 6, 48, Math.PI), dark, Math.ceil(rows / 3));
    for (let i = 0; i < Math.ceil(rows / 3); i++) {
      DUMMY.position.set(0, 0.4, 4 - i * 5.7);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.set(1, 0.8, 1);
      DUMMY.updateMatrix();
      ribs.setMatrixAt(i, DUMMY.matrix);
    }
    g.add(ribs);

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

    // Each way to reach him is its official logo, floating free by its station on the side the camera turns to.
    // They appear one at a time as you come near (update), and a click opens it (click).
    const marks = await Promise.all(this.slugs.map((slug) => logo(slug, this.accent, ctx.renderer)));
    marks.forEach((m, i) => {
      if (!m || !this.hrefs[i]) return;
      const side = i % 2 === 0 ? 1 : -1;
      const y = 3.1;
      m.position.set(side * 2.3, y, -(10 + SPACING * i) - 5);
      g.add(m);
      this.logos.push({ group: m, y, phase: i * 1.7, href: this.hrefs[i], shown: 0 });
    });
    window.addEventListener('click', (e) => this.click(e));
    window.addEventListener('pointermove', (e) => this.point(e), { passive: true });

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
  }

  /** True while the window is worth drawing: this chamber is current and its far half is near. */
  windowInView(t: number): boolean {
    return t > 0.35;
  }

  override update(dt: number, _t: number, elapsed: number, camera: PerspectiveCamera): void {
    this.shafts?.update(elapsed);
    this.camera = camera;
    this.live = performance.now();
    for (const l of this.logos) {
      // Hidden until you are within 19 units, solid by 13 (where you stand at its station): one after another.
      const d = l.group.getWorldPosition(this.here).distanceTo(camera.position);
      const target = d < 13 ? 1 : d > 19 ? 0 : (19 - d) / 6;
      l.shown += (target - l.shown) * Math.min(1, dt * 3);
      const [halo, mark] = l.group.children as Sprite[];
      const e = l.shown * l.shown * (3 - 2 * l.shown);
      mark.material.opacity = e;
      halo.material.opacity = 0.12 * e; // a whisper of light only: a strong glow washes the brand colours out
      mark.scale.setScalar(3.6 * (0.6 + 0.4 * e) * (l === this.hovered ? 1.12 : 1));
      // It rises into place as it appears, then floats.
      l.group.position.y = l.y - (1 - e) * 0.8 + Math.sin(elapsed * 0.9 + l.phase) * 0.15;
      mark.material.rotation = Math.sin(elapsed * 0.6 + l.phase) * 0.06;
    }
  }

  private hovered?: (typeof this.logos)[number];

  /** The logo under the pointer, if this chamber is on screen and the logo has appeared. */
  private hit(e: { clientX: number; clientY: number }): (typeof this.logos)[number] | undefined {
    if (!this.camera || performance.now() - this.live > 250) return undefined;
    this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const shown = this.logos.filter((l) => l.shown > 0.5);
    const hits = this.ray.intersectObjects(shown.map((l) => l.group.children[1]), false);
    return hits.length ? shown.find((l) => l.group.children[1] === hits[0].object) : undefined;
  }

  private point(e: PointerEvent): void {
    if (!this.logos.length || performance.now() - this.live > 250) {
      if (this.hover) {
        this.hover = false;
        document.body.style.cursor = '';
      }
      return;
    }
    this.hovered = this.hit(e);
    const now = !!this.hovered;
    if (now !== this.hover) {
      this.hover = now;
      document.body.style.cursor = now ? 'pointer' : '';
    }
  }

  private click(e: MouseEvent): void {
    if ((e.target as HTMLElement | null)?.closest('a, button, input, textarea')) return; // the page's own controls
    const l = this.hit(e);
    if (!l) return;
    if (l.href.startsWith('mailto:')) location.href = l.href;
    else window.open(l.href, '_blank', 'noopener');
  }
}
