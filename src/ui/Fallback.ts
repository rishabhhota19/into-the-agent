import type { SiteContent } from '../content/types';
import type { Chapter } from '../world/Chapter';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The written page: the same content as the descent, as a plain scrolling
 * document. Shown when WebGL is missing, lost, or too slow to be worth it.
 */
export function showFallback(content: SiteContent, chapters: Chapter[], reason: string): void {
  const root = document.getElementById('fallback') as HTMLElement;
  const parts: string[] = [`<p class="mono fallback__why">${esc(reason)}</p>`];
  if (chapters.length) parts.push('<p class="mono fallback__why"><a class="text__link" href="?tier=light">Try the 3D version anyway, at its lightest setting →</a></p>');
  for (const c of chapters) {
    parts.push(`<section class="fallback__chapter"><h2 class="mono">${esc(c.label)}</h2>`);
    for (const t of c.texts) {
      parts.push('<article class="fallback__station">');
      if (t.kicker) parts.push(`<p class="text__kicker mono">${esc(t.kicker)}</p>`);
      parts.push(`<h3>${t.title}</h3>`);
      if (t.body) parts.push(`<p>${esc(t.body)}</p>`);
      if (t.tags?.length) parts.push(`<ul class="text__tags">${t.tags.map((x) => `<li class="chip">${esc(x)}</li>`).join('')}</ul>`);
      if (t.link && !t.link.href.startsWith('#')) parts.push(`<a class="text__link" href="${esc(t.link.href)}" target="_blank" rel="noopener">${esc(t.link.label)} →</a>`);
      parts.push('</article>');
    }
    parts.push('</section>');
  }
  const projects = content.sections.find((s) => s.id === 'projects');
  if (projects) {
    parts.push('<section class="fallback__chapter"><h2 class="mono">Project write-ups</h2>');
    for (const it of projects.items) {
      parts.push(`<article class="fallback__station"><p class="text__kicker mono">${esc(it.kicker)}</p><h3>${esc(it.title)}</h3>`);
      for (const b of it.blocks ?? []) {
        if (b.type === 'h') parts.push(`<h4>${esc(b.text ?? '')}</h4>`);
        else if (b.type === 'list') parts.push(`<ul>${(b.items ?? []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
        else parts.push(`<p>${esc(b.text ?? '')}</p>`);
      }
      parts.push('</article>');
    }
    parts.push('</section>');
  }
  parts.push('<p class="mono fallback__why">Ant: Poly by Google (CC BY) · Everything else is drawn in code.</p>');
  root.innerHTML = parts.join('');
  root.hidden = false;
  document.body.classList.add('is-fallback');
  (document.getElementById('gate') as HTMLElement).hidden = true;
}
