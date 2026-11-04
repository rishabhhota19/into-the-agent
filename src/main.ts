import './style.css';
import { addAction, startAnalytics } from './analytics';
import { Experience } from './experience/Experience';

/** The written site: where every visitor goes when the descent cannot run. */
const PORTFOLIO = 'https://rishabh-hota.vercel.app/';
const leave = (): void => location.replace(PORTFOLIO);

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const note = document.getElementById('gate-note') as HTMLParagraphElement;
const btn = document.getElementById('gate-btn') as HTMLButtonElement;

startAnalytics();
document.getElementById('ask')?.addEventListener('click', () => addAction('ask_dumbledore'));

let experience: Experience | undefined;
try {
  experience = new Experience(canvas);
} catch (err) {
  console.error(err);
  btn.textContent = 'unavailable';
  note.textContent = 'This browser cannot run WebGL. Taking you to the written site.';
  leave();
}

if (experience) {
  const exp = experience;
  exp.onTooSlow = () => {
    exp.stop();
    leave();
  };
  exp
    .load((p) => exp.overlay.progress(p))
    .then(() =>
      exp.overlay.ready(() => {
        addAction('descend');
        exp.start();
      }),
    )
    .catch((err) => {
      console.error(err);
      exp.overlay.fail('The scene could not load.');
      leave();
    });
  // Read-only handle for the test harness.
  (window as unknown as { __ita: Experience }).__ita = exp;
}
