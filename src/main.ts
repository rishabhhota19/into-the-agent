import './style.css';
import { Experience } from './experience/Experience';
import { showFallback } from './ui/Fallback';
import content from './content/site.json';
import type { SiteContent } from './content/types';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const note = document.getElementById('gate-note') as HTMLParagraphElement;
const btn = document.getElementById('gate-btn') as HTMLButtonElement;
const read = document.getElementById('gate-read') as HTMLAnchorElement;

let experience: Experience | undefined;
try {
  experience = new Experience(canvas);
} catch (err) {
  console.error(err);
  btn.textContent = 'unavailable';
  note.textContent = 'This browser cannot run WebGL.';
  showFallback(content as SiteContent, [], 'This browser cannot run the 3D version, so here it is as a page.');
}

if (experience) {
  const exp = experience;
  read.addEventListener('click', (e) => {
    e.preventDefault();
    exp.stop();
    showFallback(exp.content, exp.chapters, 'The written version. The descent is one reload away.');
  });
  exp.onTooSlow = (fps) => {
    exp.stop();
    showFallback(exp.content, exp.chapters, `This device drew ${Math.round(fps)} frames a second at the lightest setting, so here it is as a page.`);
  };
  exp
    .load((p) => exp.overlay.progress(p))
    .then(() => exp.overlay.ready(() => exp.start()))
    .catch((err) => {
      console.error(err);
      exp.overlay.fail('The scene could not load.');
      showFallback(exp.content, exp.chapters, 'The 3D scene could not load on this device, so here it is as a page.');
    });
  // Read-only handle for the test harness.
  (window as unknown as { __ita: Experience }).__ita = exp;
}
