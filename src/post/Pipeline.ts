import { Color, HalfFloatType, PerspectiveCamera, Scene, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Quality } from '../experience/Quality';
import type { Atmosphere } from '../world/World';
import { LookShader, TravelShader } from './shaders';

/** The bloom's blur chain at half resolution: a quarter of the fill for a glow that is blurry anyway. */
class HalfBloom extends UnrealBloomPass {
  override setSize(width: number, height: number): void {
    super.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
  }
}

/** scene → bloom → travel smear → look → tone map / sRGB. */
export class Pipeline {
  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private bloom!: UnrealBloomPass;
  private travel!: ShaderPass;
  private look!: ShaderPass;
  private quality: Quality;
  /** Render scale: the passes draw at this fraction of the canvas and the last pass fills it. */
  private scale = 1;
  private width = 0;
  private height = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    private scene: Scene,
    private camera: PerspectiveCamera,
    quality: Quality,
  ) {
    this.quality = quality;
    this.build();
  }

  private build(): void {
    const full = this.renderer.getSize(new Vector2());
    this.width = full.x;
    this.height = full.y;
    const width = Math.round(full.x * this.scale);
    const height = Math.round(full.y * this.scale);
    const target = new WebGLRenderTarget(width, height, { type: HalfFloatType, samples: this.quality.msaa });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(this.quality.dpr);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new HalfBloom(new Vector2(Math.ceil(width / 2), Math.ceil(height / 2)), 0.48, 0.72, 0.8);
    this.bloom.enabled = this.quality.bloom;
    this.composer.addPass(this.bloom);

    this.travel = new ShaderPass(TravelShader);
    this.travel.enabled = false;
    this.composer.addPass(this.travel);

    this.look = new ShaderPass(LookShader);
    this.look.uniforms.uWobble.value = this.quality.reducedMotion ? 0 : 1;
    this.composer.addPass(this.look);

    this.composer.addPass(new OutputPass());
    // Every tier gets SMAA on the final image. Hardware MSAA is never used with bloom: resolving a
    // multisampled half-float target put NaNs into the bloom on Intel/D3D11 and blacked out the frame.
    if (this.quality.msaa === 0) this.composer.addPass(new SMAAPass());
  }

  /** Render another scene through the same passes (the project window). */
  setScene(scene: Scene, camera: PerspectiveCamera): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    // Keep whatever scene is showing (the window's, mid-visit) across the rebuild.
    this.scene = this.renderPass.scene;
    this.camera = this.renderPass.camera as PerspectiveCamera;
    this.composer.dispose();
    this.build();
  }

  /** Prepare a scene's shaders as they will be drawn: the render target decides their tone mapping and colour space. */
  compile(scene: Scene, camera: PerspectiveCamera): void {
    const target = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.composer.readBuffer);
    this.renderer.compile(scene, camera);
    this.renderer.setRenderTarget(target);
  }

  /** Render one frame through every pass, travel included, so no shader compiles mid-plunge. */
  warm(atm: Atmosphere): void {
    this.render(0.016, 0, 0.5, atm);
    this.render(0.016, 0.016, 0, atm);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.composer.setPixelRatio(this.quality.dpr);
    this.composer.setSize(Math.round(width * this.scale), Math.round(height * this.scale));
  }

  /** Draw at a fraction of the canvas (settled under the gate; it reallocates the targets, so never mid-descent). */
  setScale(scale: number): void {
    if (scale === this.scale) return;
    this.scale = scale;
    this.resize(this.width, this.height);
  }

  get renderScale(): number {
    return this.scale;
  }

  render(dt: number, elapsed: number, smear: number, atm: Atmosphere): void {
    this.travel.enabled = smear > 0.002;
    this.travel.uniforms.uSmear.value = smear;
    this.travel.uniforms.uTime.value = elapsed;
    const u = this.look.uniforms;
    u.uTime.value = elapsed;
    (u.uShadow.value as Color).copy(atm.grade.shadow);
    (u.uHighlight.value as Color).copy(atm.grade.highlight);
    u.uSaturation.value = atm.grade.saturation;
    this.composer.render(dt);
  }
}
