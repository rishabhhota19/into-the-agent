import { ACESFilmicToneMapping, Color, PCFShadowMap, Raycaster, Scene, SRGBColorSpace, Texture, Timer, Vector2, WebGLRenderer } from 'three';
import { Particles } from '../atmosphere/Particles';
import { makePose, Rig } from '../camera/Rig';
import content from '../content/site.json';
import type { Item, SiteContent } from '../content/types';
import { Pipeline } from '../post/Pipeline';
import { VirtualScroll } from '../scroll/VirtualScroll';
import { Overlay } from '../ui/Overlay';
import { Rail } from '../ui/Rail';
import { ProjectWindow } from '../ui/ProjectWindow';
import { presetFor, ProjectStage } from '../windows/ProjectStage';
import type { Atmosphere } from '../world/World';
import type { BuildContext, Chapter } from '../world/Chapter';
import { Archive } from '../world/chapters/Archive';
import { Dock } from '../world/chapters/Dock';
import { Gantry } from '../world/chapters/Gantry';
import { Hall, HallPalette } from '../world/chapters/Hall';
import { Sight } from '../world/chapters/Sight';
import { Timefold } from '../world/chapters/Timefold';
import { Vault } from '../world/chapters/Vault';
import { Well } from '../world/chapters/Well';
import { Village } from '../world/village/Village';
import { makeEnvironment, ProceduralTextures } from '../world/materials';
import { World } from '../world/World';
import { detectQuality, makeQuality, Quality, stepDown } from './Quality';

const WHITE = new Color(0xffffff);
const SITE = content as SiteContent;

/** One look per chamber; the plunge cross-fades between them. */
const PALETTES: Record<string, HallPalette> = {
  projects: { fog: 0x0c2330, accent: 0x7fd3e0, shadow: 0x0a2a33, highlight: 0xf2e6d2 },
  research: { fog: 0x0b1b2c, accent: 0xa6c8ff, shadow: 0x0a1e3a, highlight: 0xeae4ff },
  experience: { fog: 0x1c1410, accent: 0xffb86b, shadow: 0x2a1a0c, highlight: 0xffe7c2 },
  writing: { fog: 0x14101f, accent: 0xc9a6ff, shadow: 0x1c1030, highlight: 0xf0e4ff },
  contact: { fog: 0x1f0609, accent: 0xff3b4a, shadow: 0x2a0810, highlight: 0xf4d7b0 },
};

export class Experience {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly rig: Rig;
  readonly chapters: Chapter[];
  readonly world: World;
  readonly scroll: VirtualScroll;
  readonly overlay: Overlay;
  readonly rail: Rail;
  readonly window: ProjectWindow;
  readonly stage: ProjectStage;
  readonly village: Village;
  readonly content = SITE;
  quality: Quality;
  fps = 0;
  /** Chambers built so far (the rest build ahead of you after the gate opens). */
  built = 0;
  private stopped = false;
  private buildCtx!: BuildContext;
  /** Chambers build one at a time, whoever asks: the build-ahead or a rail click. */
  private buildChain: Promise<void> = Promise.resolve();

  private readonly pipeline: Pipeline;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private pointerDown = { x: 0, y: 0, t: 0 };
  private hoverSlug: string | null = null;
  /** A short smear burst when a window opens or closes. */
  private burst = 0;
  private readonly stageAtmosphere: Atmosphere;
  private readonly particles: Particles;
  private readonly textures: ProceduralTextures;
  private readonly env: Texture;
  private readonly timer = new Timer();
  private readonly pose = makePose();
  private readonly particleColor = new Color();
  private elapsed = 0;
  private probe = { t: 0, frames: 0, busy: 0, done: false };
  private readonly probeOff = new URLSearchParams(location.search).has('tier');

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Count the whole frame (every composer pass), not just the last pass.
    this.renderer.info.autoReset = false;

    this.quality = detectQuality(this.renderer);
    this.renderer.setPixelRatio(this.quality.dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.rig = new Rig(window.innerWidth / window.innerHeight);
    this.textures = new ProceduralTextures();
    this.env = makeEnvironment(this.renderer);
    this.scene.environment = this.env;

    // Each section has its own world; anything new gets the plain hall until it earns one.
    this.village = new Village(this.quality.tier === 'light' ? 640 : 1024, this.quality.tier === 'light' ? 360 : 576);
    const worlds: Record<string, (s: typeof SITE.sections[number]) => Chapter> = {
      projects: (s) => new Vault(s),
      research: (s) => new Sight(s),
      experience: (s) => new Well(s),
      writing: (s) => new Archive(s),
      services: (s) => new Dock(s, SITE.dock),
      contact: (s) => new Timefold(s, this.village.target.texture),
    };
    this.chapters = [new Gantry(SITE), ...SITE.sections.map((s) => (worlds[s.id] ?? ((x) => new Hall(x, PALETTES[x.id] ?? PALETTES.projects)))(s))];
    this.world = new World(this.scene, this.chapters);

    this.scroll = new VirtualScroll(
      canvas,
      this.chapters.map((c) => ({ content: c.contentPx, plunge: c.plungePx, stations: c.stations })),
      this.quality.reducedMotion,
    );

    this.particles = new Particles(this.quality.particles, this.quality.dpr);
    this.scene.add(this.particles.points);

    this.pipeline = new Pipeline(this.renderer, this.scene, this.rig.camera, this.quality);
    this.overlay = new Overlay(this.chapters);
    this.overlay.onProject = (slug) => this.openProject(slug);
    this.overlay.onGo = (id) => {
      const k = this.chapters.findIndex((c) => c.id === id);
      if (k >= 0) void this.travelTo(k);
    };
    this.rail = new Rail(this.chapters, (k) => void this.travelTo(k));

    this.stage = new ProjectStage(window.innerWidth / window.innerHeight, this.env);
    this.stageAtmosphere = { fog: new Color(0x08161c), density: 0.05, grade: this.stage.grade };
    this.window = new ProjectWindow();
    this.window.onClose = () => this.closeProject();
    this.window.onNext = (slug) => this.openProject(slug);

    canvas.addEventListener('pointerdown', (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvas.addEventListener('pointerup', (e) => {
      const moved = Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y);
      if (moved < 8 && performance.now() - this.pointerDown.t < 600) this.onTap(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.pointer.set(e.clientX, e.clientY);
      this.hoverDirty = true;
    });

    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.overlay.fail('The graphics context was lost. Reload to descend again.');
    });
  }

  /** Build the first two chambers before the gate opens; the rest build behind the gate while it waits for you. */
  async load(onProgress: (p: number) => void): Promise<void> {
    this.buildCtx = { quality: this.quality, textures: this.textures, env: this.env, renderer: this.renderer };
    const AHEAD = 2;
    for (let i = 0; i < Math.min(AHEAD, this.chapters.length); i++) {
      await this.buildChapter(i);
      onProgress((i + 1) / AHEAD);
    }
    // Compile every material and every pass once before the gate opens, so nothing hitches later.
    const atm = this.world.applyAtmosphere(this.scroll.state);
    this.world.poseAt(this.scroll.state, this.pose);
    this.rig.update(0, this.pose, 0, 0, true);
    this.particles.update(0, this.rig.camera);
    this.world.update(0, 0, this.scroll.state, this.rig.camera);
    this.pipeline.compile(this.scene, this.rig.camera);
    this.pipeline.warm(atm);
    this.buildAhead();
  }

  private async buildChapter(i: number): Promise<void> {
    const c = this.chapters[i];
    await c.build(this.buildCtx);
    this.built = Math.max(this.built, i + 1);
    // Compile its materials now, while it is still out of sight (compile reaches hidden meshes too).
    this.world.chamberBuilt(c);
    this.pipeline.compile(this.scene, this.rig.camera);
    if (c instanceof Timefold) this.village.warm(this.renderer);
  }

  /** Queue a chamber's build behind whatever is building; a chamber already built is skipped. */
  private enqueueBuild(i: number): Promise<void> {
    this.buildChain = this.buildChain.then(async () => {
      if (this.stopped || i < this.built) return;
      await this.buildChapter(i);
    });
    return this.buildChain.catch((err) => console.warn(`chamber ${this.chapters[i]?.id} failed to build`, err));
  }

  private buildAhead(): void {
    const next = this.built;
    if (next >= this.chapters.length) return;
    window.setTimeout(() => {
      if (this.stopped) return;
      void this.enqueueBuild(next).then(() => this.buildAhead());
    }, 200);
  }

  /** Warp to a chamber from the rail or a station link, building anything on the way first. */
  async travelTo(k: number): Promise<void> {
    const c = this.chapters[k];
    if (!c || this.stopped) return;
    if (this.window.isOpen) this.closeProject();
    for (let i = this.built; i <= k; i++) await this.enqueueBuild(i);
    if (this.stopped) return;
    this.scroll.travel(k, c.texts[0]?.t ?? 0);
  }

  start(): void {
    this.scroll.attach();
    this.scroll.enabled = true;
    this.timer.connect(document);
    this.renderer.setAnimationLoop(this.frame);
    this.rail.show();
  }

  /** Stop rendering for good (the written page takes over). */
  stop(): void {
    this.stopped = true;
    this.renderer.setAnimationLoop(null);
    this.scroll.enabled = false;
    this.scroll.detach();
  }

  // --- project windows ------------------------------------------------------------------------

  private hoverDirty = false;

  private get projects(): Item[] {
    return SITE.sections.find((s) => s.id === 'projects')?.items ?? [];
  }

  /** The gems of the vault, when the vault is the current chamber. */
  private clickable(): import('three').Mesh[] {
    const c = this.chapters[this.scroll.state.chapter] as { gems?: import('three').Mesh[] };
    return c.gems ?? [];
  }

  private pick(x: number, y: number): string | null {
    const gems = this.clickable();
    if (!gems.length) return null;
    this.raycaster.setFromCamera(new Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), this.rig.camera);
    const hit = this.raycaster.intersectObjects(gems, false)[0];
    return hit ? (hit.object.userData.slug as string) : null;
  }

  private onTap(x: number, y: number): void {
    if (this.window.isOpen) return;
    const slug = this.pick(x, y);
    if (slug) this.openProject(slug);
  }

  private updateHover(): void {
    if (!this.hoverDirty || this.window.isOpen) return;
    this.hoverDirty = false;
    const slug = this.pick(this.pointer.x, this.pointer.y);
    if (slug !== this.hoverSlug) {
      this.hoverSlug = slug;
      this.renderer.domElement.classList.toggle('is-hover', slug !== null);
    }
  }

  openProject(slug: string): void {
    const items = this.projects;
    const i = items.findIndex((p) => p.slug === slug);
    if (i < 0) return;
    this.stage.open(presetFor(slug));
    this.stage.resize(window.innerWidth / window.innerHeight);
    this.window.open(items[i], items[(i + 1) % items.length] ?? null);
    this.scroll.enabled = false;
    this.pipeline.setScene(this.stage.scene, this.stage.camera);
    this.burst = 1;
    this.rail.setCovered(true);
    this.renderer.domElement.classList.remove('is-hover');
  }

  closeProject(): void {
    this.stage.close();
    this.pipeline.setScene(this.scene, this.rig.camera);
    this.scroll.enabled = true;
    this.rail.setCovered(false);
    this.burst = 1;
  }

  private frame = (): void => {
    this.renderer.info.reset();
    this.timer.update();
    const raw = this.timer.getDelta();
    const dt = Math.min(raw, 0.1);
    this.elapsed += dt;

    this.burst = Math.max(0, this.burst - dt * 2.2);
    const burstSmear = this.quality.reducedMotion ? 0 : Math.sin(Math.PI * Math.min(1, 1 - this.burst)) * 0.9 * (this.burst > 0 ? 1 : 0);

    if (this.window.isOpen) {
      this.stage.update(this.window.progress, dt, this.elapsed);
      this.particles.update(this.elapsed, this.stage.camera);
      this.pipeline.render(dt, this.elapsed, burstSmear, this.stageAtmosphere);
      this.probeFps();
      return;
    }

    this.scroll.update(dt, raw);
    const st = this.scroll.state;
    this.updateHover();
    this.world.poseAt(st, this.pose);
    // Velocity in chambers-per-second terms for the rig's tilt: scale px/s down.
    this.rig.update(this.elapsed, this.pose, this.scroll.velocity / 1800, this.scroll.smear, this.quality.reducedMotion);

    const atm = this.world.applyAtmosphere(st);
    this.particles.setColor(this.particleColor.copy(atm.fog).lerp(WHITE, 0.72));
    this.particles.update(this.elapsed, this.rig.camera);
    this.world.update(dt, this.elapsed, st, this.rig.camera);

    // The village lives in the last chamber's window: draw it only while that window can be seen.
    const last = this.chapters[st.chapter];
    if (last instanceof Timefold && last.windowInView(st.t)) this.village.render(this.renderer, this.elapsed);

    this.pipeline.render(dt, this.elapsed, Math.max(this.scroll.smear, burstSmear), atm);
    this.overlay.update(st, this.scroll.touched);
    this.rail.update(st, this.overlay.active);
    this.probeFps();
  };

  /**
   * Measure the first seconds; while the frame rate cannot hold, step the tier down and measure again.
   * A throttled tab (hidden, or a background pane) is not a slow device: a long gap restarts the probe.
   */
  private probeFps(): void {
    if (this.probe.done || this.probeOff) return;
    const raw = this.timer.getDelta();
    // Not the device's speed: a hidden tab, a long gap, or chambers still building and compiling.
    if (raw > 0.25 || document.hidden || this.built < this.chapters.length) {
      this.probe.t = 0;
      this.probe.frames = 0;
      this.probe.busy = 0;
      return;
    }
    this.probe.t += raw;
    if (this.probe.t < 1.0) return;
    // Measure the steady frames only; a hitch (a compile, a collection) is not the frame rate.
    if (raw <= 0.1) {
      this.probe.frames += 1;
      this.probe.busy += raw;
    }
    if (this.probe.t < 4.0) return;
    this.fps = this.probe.busy > 0 ? this.probe.frames / this.probe.busy : 60;
    const next = stepDown(this.quality.tier);
    if (this.fps < 45 && next) {
      this.setTier(next);
      this.probe = { t: 0, frames: 0, busy: 0, done: false };
      return;
    }
    this.probe.done = true;
    // Only when even the light tier cannot hold a readable frame does the written page take over.
    if (this.fps < 14 && !next) this.onTooSlow?.(this.fps);
  }

  /** Set by main: what to do when the device cannot keep up. */
  onTooSlow?: (fps: number) => void;

  setTier(tier: Quality['tier']): void {
    this.quality = makeQuality(tier, this.quality.reducedMotion);
    this.renderer.setPixelRatio(this.quality.dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.pipeline.setQuality(this.quality);
    this.particles.points.geometry.setDrawRange(0, this.quality.particles);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w / h);
    this.stage.resize(w / h);
    this.pipeline.resize(w, h);
  };
}
