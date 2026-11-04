import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, noise1 } from '../util/noise';

export interface Pose {
  position: Vector3;
  look: Vector3;
}

export const makePose = (): Pose => ({ position: new Vector3(), look: new Vector3() });

/**
 * Turns a pose from the world into the camera: adds a slow hand-held sway,
 * tips the nose with scroll velocity and widens the lens during a travel.
 */
export class Rig {
  readonly camera: PerspectiveCamera;
  baseFov = 50;
  private readonly tmpLook = new Vector3();

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(this.baseFov, aspect, 0.15, 260);
  }

  update(elapsed: number, pose: Pose, velocity: number, smear: number, reducedMotion: boolean): void {
    const cam = this.camera;
    const sway = reducedMotion ? 0 : 1;
    cam.position.set(
      pose.position.x + noise1(elapsed * 0.11, 1) * 0.22 * sway,
      pose.position.y + noise1(elapsed * 0.09, 2) * 0.14 * sway,
      pose.position.z + noise1(elapsed * 0.07, 3) * 0.12 * sway,
    );
    this.tmpLook.set(
      pose.look.x + noise1(elapsed * 0.08, 5) * 0.3 * sway,
      pose.look.y + noise1(elapsed * 0.06, 6) * 0.2 * sway,
      pose.look.z,
    );
    cam.lookAt(this.tmpLook);
    cam.rotateZ(noise1(elapsed * 0.05, 4) * 0.014 * sway);
    cam.rotateX(-clamp(velocity, -1.6, 1.6) * 0.05);

    const fov = this.baseFov + Math.min(Math.abs(velocity) * 3, 6) + smear * 9;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
