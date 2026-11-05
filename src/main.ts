import './style.css';
import { addAction, startAnalytics } from './analytics';
import { Experience } from './experience/Experience';
import { Agent } from './ui/Agent';

/** The written site: where every visitor goes when the descent cannot run. */
const PORTFOLIO = 'https://rishabh-hota.vercel.app/';
const leave = (): void => location.replace(PORTFOLIO);

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const note = document.getElementById('gate-note') as HTMLParagraphElement;
const btn = document.getElementById('gate-btn') as HTMLButtonElement;

startAnalytics();
const pill = document.getElementById('ask') as HTMLAnchorElement;
pill.addEventListener('click', () => addAction('ask_dumbledore'));

let experience: Experience | undefined;
try {
  experience = new Experience(canvas);
} catch (err) {
  console.error(err);
  btn.textContent = 'unavailable';
  note.textContent = 'This browser cannot run WebGL. Taking you to the written site.';
  leave();
}

/**
 * Where the chat sends the visitor, with no click anywhere: a path on the written site becomes a
 * warp to the chamber that holds it; a page this descent has no room for opens on the written site.
 */
function navigate(exp: Experience, path: string): void {
  exp.overlay.enter();
  const clean = path.split(/[?#]/)[0] ?? '';
  const seg = clean.split('/').filter(Boolean);
  const item = path.split('#')[1];
  const go = (id: string, slug = item): void => {
    const k = exp.chapters.findIndex((c) => c.id === id);
    if (k >= 0) void exp.travelTo(k, slug);
  };
  if (seg.length === 0 || clean === '/3d') go('home');
  else if (seg[0] === 'projects') {
    if (seg[1]) void exp.goToProject(seg[1]);
    else go('projects');
  } else if (seg[0] === 'publications') go('research');
  else if (seg[0] === 'experience') go('experience');
  else if (seg[0] === 'services') go('services');
  else if (seg[0] === 'blog') go('writing', seg[1]);
  else if (seg[0] === 'resume') go('contact');
  else location.assign(PORTFOLIO.replace(/\/$/, '') + path);
}

if (experience) {
  const exp = experience;
  const agent = new Agent(
    pill,
    (path) => navigate(exp, path),
    (what) => {
      if (what === 'written') return location.assign(PORTFOLIO);
      exp.overlay.enter();
      exp.move(what);
    },
  );
  exp.onChapter = (id) => agent.page(`/3d#${id}`);
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
  // Read-only handles for the test harness.
  (window as unknown as { __ita: Experience }).__ita = exp;
  (window as unknown as { __agent: Agent }).__agent = agent;
}
