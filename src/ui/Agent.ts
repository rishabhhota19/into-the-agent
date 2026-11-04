/** The portfolio's origin: only there does the chat exist as a page this one may frame. */
const SITE = 'https://rishabh-hota.vercel.app';

/** A command about where the visitor already is, with no page named (the agent's pages.MOVES). */
export type Move = 'back' | 'next' | 'previous' | 'top' | 'bottom' | 'down' | 'up' | 'written';

type FromChat =
  | { source: 'dumbledore'; type: 'ready' }
  | { source: 'dumbledore'; type: 'minimize' }
  | { source: 'dumbledore'; type: 'navigate'; path: string; focus?: boolean }
  | { source: 'dumbledore'; type: 'ui'; move: Move };
type ToChat = { type: 'ask'; question: string } | { type: 'page'; path: string };

/**
 * Dumbledore inside the descent: the portfolio's chat, served on its own at /agent-embed, framed in
 * a glass window over the scene. The pill at the top right opens and closes it; the frame is made
 * on the first open and kept, so a conversation survives closing. The two sides talk with
 * postMessage, each checking the other's origin.
 */
export class Agent {
  /** True only when the page is served at the portfolio's address; elsewhere the pill stays a link. */
  readonly enabled = location.origin === SITE;
  private readonly panel = document.getElementById('agent') as HTMLElement;
  private frame: HTMLIFrameElement | null = null;
  private ready = false;
  private open = false;
  private readonly queue: ToChat[] = [];

  constructor(
    private readonly pill: HTMLAnchorElement,
    private readonly onNavigate: (path: string) => void,
    private readonly onMove: (what: Move) => void,
  ) {
    if (!this.enabled) return;
    pill.setAttribute('role', 'button');
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute('aria-controls', 'agent');
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      this.setOpen(!this.open);
    });
    window.addEventListener('message', (e: MessageEvent<FromChat>) => {
      if (e.origin !== location.origin) return;
      const d = e.data;
      if (!d || d.source !== 'dumbledore') return;
      if (d.type === 'ready') {
        this.ready = true;
        for (const m of this.queue.splice(0)) this.post(m);
      } else if (d.type === 'minimize') {
        this.setOpen(false);
      } else if (d.type === 'navigate' && typeof d.path === 'string') {
        this.onNavigate(d.path);
        if (d.focus) this.stepAside();
      } else if (d.type === 'ui') {
        this.onMove(d.move);
        this.stepAside();
      }
    });
  }

  /** The chat covers a phone: when it moves the visitor, it gets out of the way so they see where they went. */
  private stepAside(): void {
    if (window.matchMedia('(max-width: 639px)').matches) this.setOpen(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (!this.enabled) return;
    if (open && !this.frame) {
      const f = document.createElement('iframe');
      f.src = '/agent-embed';
      f.title = "Dumbledore, Rishabh's AI agent";
      f.setAttribute('allow', '');
      f.referrerPolicy = 'same-origin';
      this.panel.appendChild(f);
      this.frame = f;
    }
    this.open = open;
    this.panel.classList.toggle('is-open', open);
    this.pill.classList.toggle('is-open', open);
    this.pill.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-agent', open);
    if (open) this.frame?.focus();
  }

  /** Hand the chat a question (opens the window). */
  ask(question: string): void {
    this.setOpen(true);
    this.post({ type: 'ask', question });
  }

  /** Tell the chat where the visitor is, so a turn is logged against the right place. */
  page(path: string): void {
    if (!this.frame) return;
    this.post({ type: 'page', path });
  }

  private post(msg: ToChat): void {
    if (!this.frame?.contentWindow) return;
    if (!this.ready) {
      this.queue.push(msg);
      return;
    }
    this.frame.contentWindow.postMessage({ source: 'into-the-agent', ...msg }, location.origin);
  }
}
