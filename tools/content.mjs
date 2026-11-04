// Reads the portfolio's content folder (the same Markdown the live site and the agent use)
// and writes src/content/site.json: the chambers are built from this, nothing is typed twice.
//   node tools/content.mjs [path/to/portfolio/content]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] ?? path.join(here, '..', '..', 'portfolio', 'content'));
const OUT = path.join(here, '..', 'src', 'content', 'site.json');

// On a build machine the portfolio checkout is not beside this one: keep the committed site.json.
if (!fs.existsSync(path.join(ROOT, 'site.json'))) {
  if (fs.existsSync(OUT)) {
    console.log(`content: ${ROOT} not found, keeping ${path.relative(process.cwd(), OUT)}`);
    process.exit(0);
  }
  console.error(`content: ${ROOT} not found and no ${OUT}`);
  process.exit(1);
}

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
const clean = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .trim();

/** Markdown → headings, paragraphs and flat bullet lists. */
function blocks(md) {
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) out.push({ type: 'p', text: para.join(' ') });
    para = [];
  };
  const flush = () => {
    flushPara();
    if (list) out.push({ type: 'list', items: list });
    list = null;
  };
  for (const raw of clean(md).split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      flush();
      out.push({ type: 'h', text: h[2].trim() });
      continue;
    }
    const b = line.match(/^[-*]\s+(.*)/) ?? line.match(/^\d+\.\s+(.*)/);
    if (b) {
      flushPara();
      (list ??= []).push(b[1].trim());
      continue;
    }
    if (list) {
      list[list.length - 1] += ' ' + line;
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

/** This project's own content (what the live site does not carry yet): services and the dock's words. */
const LOCAL = path.join(here, '..', 'content');

const dirAt = (abs) =>
  fs
    .readdirSync(abs)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data, content } = matter(read(path.join(abs, f)));
      return { slug: f.replace(/\.md$/, ''), data, blocks: blocks(content) };
    })
    .sort((a, b) => Number(a.data.order ?? 99) - Number(b.data.order ?? 99));
const dir = (d) => dirAt(path.join(ROOT, d));

const firstText = (bl, n = 2) => {
  const p = bl.find((b) => b.type === 'p');
  if (p) return p.text;
  const l = bl.find((b) => b.type === 'list');
  return l ? l.items.slice(0, n).join(' ') : '';
};
const bullets = (bl, n) => {
  const l = bl.find((b) => b.type === 'list');
  return l ? l.items.slice(0, n) : [];
};
const trim = (s, n = 230) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const str = (v) => (v == null ? '' : String(v));

const site = JSON.parse(read(path.join(ROOT, 'site.json')));
const abs = (p) => (p.startsWith('http') || p.startsWith('mailto:') ? p : site.url.replace(/\/$/, '') + p);

// --- home: the core profile ---------------------------------------------------------------------
const core = blocks(matter(read(path.join(ROOT, 'profile', 'core.md'))).content);
const nowPara = core.find((b) => b.type === 'p' && b.text.startsWith('Now:'))?.text.replace(/^Now:\s*/, '') ?? '';
const winsIdx = core.findIndex((b) => b.type === 'p' && b.text.startsWith('Headline wins'));
const wins = winsIdx >= 0 && core[winsIdx + 1]?.type === 'list' ? core[winsIdx + 1].items : [];
const roles = core.find((b) => b.type === 'p' && b.text.startsWith('Roles he fits:'))?.text.replace(/^Roles he fits:\s*/, '') ?? '';

// --- sections -------------------------------------------------------------------------------------
const projects = dir('projects').map((e) => ({
  slug: e.slug,
  title: str(e.data.title),
  kicker: [str(e.data.org), str(e.data.period)].filter(Boolean).join(' · '),
  summary: str(e.data.summary),
  body: trim(firstText(e.blocks)),
  tags: Array.isArray(e.data.tags) ? e.data.tags.map(String) : [],
  featured: Boolean(e.data.featured),
  link: { label: 'All projects', href: abs('/projects') },
  // The full write-up, for the project window.
  blocks: e.blocks,
}));
// Featured first, each group in the site's own order.
projects.sort((a, b) => Number(b.featured) - Number(a.featured));

const publications = dir('publications').map((e) => ({
  slug: e.slug,
  title: str(e.data.title),
  kicker: [str(e.data.status), trim(str(e.data.venue), 70)].filter(Boolean).join(' · '),
  summary: trim(firstText(e.blocks, 1), 200),
  body: trim(bullets(e.blocks, 3).slice(1).join(' '), 200),
  tags: Array.isArray(e.data.authors) ? [] : [],
  featured: str(e.data.status) === 'Published',
  link: str(e.data.link) ? { label: 'Read the paper', href: str(e.data.link) } : { label: 'All research', href: abs('/publications') },
}));

const experience = dir('experience').map((e) => ({
  slug: e.slug,
  title: `${str(e.data.title)}`,
  kicker: [str(e.data.company), [str(e.data.start), str(e.data.end)].filter(Boolean).join(' – ')].filter(Boolean).join(' · '),
  summary: trim(firstText(e.blocks, 1), 200),
  body: trim(bullets(e.blocks, 3).slice(1).join(' '), 220),
  tags: [str(e.data.location)].filter(Boolean),
  featured: str(e.data.end) === 'Present',
  link: { label: 'Full experience', href: abs('/experience') },
}));

const blog = dir('blog').map((e) => ({
  slug: e.slug,
  title: str(e.data.title),
  kicker: ['Writing', e.data.date ? new Date(e.data.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''].filter(Boolean).join(' · '),
  summary: str(e.data.summary),
  body: trim(firstText(e.blocks), 220),
  tags: [],
  featured: true,
  link: { label: 'Read the post', href: abs(`/blog/${e.slug}`) },
}));

const services = dirAt(path.join(LOCAL, 'services')).map((e) => ({
  slug: e.slug.replace(/^\d+-/, ''),
  title: str(e.data.title),
  kicker: str(e.data.kicker) || 'build',
  summary: str(e.data.summary),
  body: trim(firstText(e.blocks), 300),
  tags: Array.isArray(e.data.tags) ? e.data.tags.map(String) : [],
  featured: Boolean(e.data.featured),
  link: { label: 'Ask about this', href: `mailto:${site.email}?subject=${encodeURIComponent(`Build: ${str(e.data.title)}`)}` },
}));
const dock = JSON.parse(read(path.join(LOCAL, 'dock.json')));

const contact = [
  { slug: 'email', title: 'Email', kicker: 'fastest', summary: site.email, body: 'For roles, freelance builds, training and collaborations.', tags: [], featured: true, link: { label: site.email, href: `mailto:${site.email}` } },
  { slug: 'linkedin', title: 'LinkedIn', kicker: 'profile', summary: 'Connect and message.', body: '', tags: [], featured: false, link: { label: 'Open LinkedIn', href: site.linkedin } },
  { slug: 'github', title: 'GitHub', kicker: 'code', summary: 'Open-source work and this site.', body: '', tags: [], featured: false, link: { label: 'Open GitHub', href: site.github } },
  { slug: 'resume', title: 'Résumé', kicker: 'pdf', summary: 'One page, current.', body: roles ? `Roles he fits: ${roles}` : '', tags: [], featured: false, link: { label: 'Download the résumé', href: abs(site.resume) } },
];

const modelsDir = path.join(here, '..', 'public', 'models');
const hasModel = (name) => fs.existsSync(path.join(modelsDir, `${name}.glb`)) || fs.existsSync(path.join(modelsDir, `${name}.glb.txt`));
// Project pictures: drop `public/projects/<slug>.(webp|jpg|jpeg|png)` and the vault screen shows it.
const projectsDir = path.join(here, '..', 'public', 'projects');
const projectImages = {};
for (const p of projects) {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    if (fs.existsSync(path.join(projectsDir, `${p.slug}.${ext}`))) {
      projectImages[p.slug] = `projects/${p.slug}.${ext}`;
      break;
    }
  }
}

const out = {
  site: { name: site.name, role: site.role, tagline: site.tagline, location: site.location, email: site.email, linkedin: site.linkedin, github: site.github, resume: abs(site.resume), url: site.url },
  // Which optional figures exist on disk, so the page never asks for a file that is not there.
  assets: { projects: projectImages },
  home: { now: trim(nowPara, 260), wins, roles },
  dock,
  sections: [
    { id: 'projects', label: 'Projects', path: abs('/projects'), intro: `${projects.length} builds, from a hospital pipeline to the agent on this site.`, items: projects },
    { id: 'research', label: 'Research', path: abs('/publications'), intro: `${publications.length} papers: medical imaging, quantum attention, decision support.`, items: publications },
    { id: 'experience', label: 'Experience', path: abs('/experience'), intro: 'Three years turning research into systems that ship.', items: experience },
    { id: 'writing', label: 'Writing', path: abs('/blog'), intro: 'Notes from building.', items: blog },
    { id: 'services', label: dock.label || 'Services', path: abs('/'), intro: dock.intro, items: services },
    { id: 'contact', label: 'Contact', path: abs('/'), intro: 'Hire him, book a build, or bring a problem.', items: contact },
  ],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`content: ${out.sections.map((s) => `${s.id} ${s.items.length}`).join(', ')} → ${path.relative(process.cwd(), OUT)}`);
