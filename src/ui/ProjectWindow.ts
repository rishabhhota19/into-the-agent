import content from '../content/site.json';
import type { Item, Link, SiteContent } from '../content/types';
import { chipHtml } from './Overlay';

const ASSETS = (content as SiteContent).assets;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The window: a 3D stage you scroll through, then the write-up of a project, a
 * role, a story or a skill. The descent pauses underneath; Escape, the close
 * button or "next" move on, and every link inside it stays inside the descent.
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
  /** A link inside the window that points inside the descent: the next button, a skill chip, a use of a skill. */
  onLink?: (href: string) => void;

  constructor() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.next.addEventListener('click', () => {
      const href = this.next.dataset.href;
      if (href) this.onLink?.(href);
    });
    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      this.onLink?.(a.getAttribute('href') ?? '');
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

  open(item: Item, next: Link | null): void {
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.current = item;
    this.kicker.textContent = item.kicker;
    this.title.textContent = item.title;
    this.summary.textContent = item.summary;
    // Its words, then its skills: each skill opens onto everything else that used it.
    this.tags.innerHTML = [...item.tags, ...(item.skills ?? [])].map(chipHtml).join('');
    // The project's picture, when it has one, opens the write-up, with its credit (a licensed picture must carry it).
    const image = ASSETS.projects[item.slug];
    const credit = ASSETS.credits?.[item.slug];
    const figure = image
      ? `<figure class="proj__figure"><img src="${esc(image)}" alt="${esc(item.title)}" loading="lazy" decoding="async">` +
        (credit ? `<figcaption class="mono">${esc(credit)}</figcaption>` : '') +
        '</figure>'
      : '';
    this.blocks.innerHTML = figure + (item.blocks ?? [])
      .map((b) => {
        if (b.type === 'h') return `<h3>${esc(b.text ?? '')}</h3>`;
        if (b.type === 'list') return `<ul>${(b.items ?? []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
        if (b.type === 'links')
          return `<ul class="proj__uses">${(b.links ?? [])
            .map((l) => `<li><a class="text__link" href="${esc(l.href ?? '#')}">${esc(l.label)} →</a>${l.note ? `<span class="mono">${esc(l.note)}</span>` : ''}</li>`)
            .join('')}</ul>`;
        return `<p>${esc(b.text ?? '')}</p>`;
      })
      .join('');
    // The window's link: the work behind a story when there is one, else the item's own.
    const link = item.related ?? item.link;
    if (link) {
      const internal = link.href.startsWith('#');
      this.link.href = link.href;
      this.link.textContent = `${link.label} →`;
      if (internal) {
        this.link.removeAttribute('target');
        this.link.removeAttribute('rel');
      } else {
        this.link.target = '_blank';
        this.link.rel = 'noopener';
      }
      this.link.hidden = false;
    } else {
      this.link.hidden = true;
    }
    if (next) {
      this.next.textContent = `Next: ${next.label}`;
      this.next.dataset.href = next.href;
      this.next.hidden = false;
    } else {
      this.next.hidden = true;
      delete this.next.dataset.href;
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
