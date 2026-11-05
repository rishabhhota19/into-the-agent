import type { Item } from '../content/types';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The project window: a 3D stage you scroll through, then the write-up. The
 * descent pauses underneath; Escape, the close button or "next" move on.
 */
export class ProjectWindow {
  private readonly root = document.getElementById('proj') as HTMLElement;
  private readonly scroller = document.getElementById('proj-scroll') as HTMLDivElement;
  private readonly closeBtn = document.getElementById('proj-close') as HTMLButtonElement;
  private readonly kicker = document.getElementById('proj-kicker') as HTMLParagraphElement;
  private readonly title = document.getElementById('proj-title') as HTMLHeadingElement;
  private readonly summary = document.getElementById('proj-summary') as HTMLParagraphElement;
  private readonly tags = document.getElementById('proj-tags') as HTMLUListElement;
  private readonly blocks = document.getElementById('proj-blocks') as HTMLDivElement;
  private readonly link = document.getElementById('proj-link') as HTMLAnchorElement;
  private readonly next = document.getElementById('proj-next') as HTMLButtonElement;
  private lastFocus: HTMLElement | null = null;
  current: Item | null = null;
  onClose?: () => void;
  onNext?: (slug: string) => void;

  constructor() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.next.addEventListener('click', () => {
      const slug = this.next.dataset.slug;
      if (slug) this.onNext?.(slug);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.current) this.close();
    });
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  /** 0..1 through the window's whole scroll. */
  get progress(): number {
    const max = this.scroller.scrollHeight - this.scroller.clientHeight;
    return max > 0 ? Math.min(1, Math.max(0, this.scroller.scrollTop / max)) : 0;
  }

  get slug(): string | undefined {
    return this.current?.slug;
  }

  open(item: Item, nextItem: Item | null): void {
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.current = item;
    this.kicker.textContent = item.kicker;
    this.title.textContent = item.title;
    this.summary.textContent = item.summary;
    this.tags.innerHTML = item.tags.map((t) => `<li class="chip">${esc(t)}</li>`).join('');
    this.blocks.innerHTML = (item.blocks ?? [])
      .map((b) => {
        if (b.type === 'h') return `<h3>${esc(b.text ?? '')}</h3>`;
        if (b.type === 'list') return `<ul>${(b.items ?? []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
        return `<p>${esc(b.text ?? '')}</p>`;
      })
      .join('');
    if (item.link) {
      this.link.href = item.link.href;
      this.link.textContent = `${item.link.label} →`;
      this.link.hidden = false;
    } else {
      this.link.hidden = true;
    }
    if (nextItem) {
      this.next.textContent = `Next: ${nextItem.title}`;
      this.next.dataset.slug = nextItem.slug;
      this.next.hidden = false;
    } else {
      this.next.hidden = true;
      delete this.next.dataset.slug;
    }
    this.root.hidden = false;
    this.scroller.scrollTop = 0;
    document.body.classList.add('is-window');
    requestAnimationFrame(() => this.root.classList.add('is-on'));
    // Opened from the chat, the visitor is still typing there: their next Enter must reach Dumbledore, not this button.
    if (document.activeElement?.tagName !== 'IFRAME') this.closeBtn.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.current) return;
    this.current = null;
    this.root.classList.remove('is-on');
    document.body.classList.remove('is-window');
    window.setTimeout(() => {
      if (!this.current) this.root.hidden = true;
    }, 650);
    this.lastFocus?.focus?.({ preventScroll: true });
    this.onClose?.();
  }
}
