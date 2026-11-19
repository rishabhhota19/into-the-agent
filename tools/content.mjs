import crypto from 'node:crypto';
// Reads the portfolio's content folder (the same Markdown the live site and the agent use)
// and writes src/content/site.json: the chambers are built from this, nothing is typed twice.
//   node tools/content.mjs [path/to/portfolio/content]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const here = path.dirname(fileURLToPath(import.meta.url));
let ROOT = path.resolve(process.argv[2] ?? path.join(here, '..', '..', 'portfolio', 'content'));
const OUT = path.join(here, '..', 'src', 'content', 'site.json');

// On a build machine the portfolio checkout is not beside this one: fetch just its content folder from
// the public repo (a shallow, sparse clone into a gitignored folder). If even that fails, the committed
// site.json stands.
if (!fs.existsSync(path.join(ROOT, 'site.json'))) {
  const clone = path.join(here, 'portfolio-src');
  try {
    fs.rmSync(clone, { recursive: true, force: true });
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/rishabhhota19/portfolio.git', clone], { stdio: 'inherit' });
    execFileSync('git', ['-C', clone, 'sparse-checkout', 'set', 'content'], { stdio: 'inherit' });
    ROOT = path.join(clone, 'content');
    console.log(`content: reading the portfolio repo at ${path.relative(process.cwd(), ROOT)}`);
  } catch (err) {
    if (fs.existsSync(OUT)) {
      console.log(`content: portfolio not found and the clone failed (${err?.message ?? err}); keeping ${path.relative(process.cwd(), OUT)}`);
      process.exit(0);
    }
    console.error(`content: portfolio not found, clone failed and no ${OUT}`);
    process.exit(1);
  }
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

/** This project's own content: the dock's words. */
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
const corePara = (start) => core.find((b) => b.type === 'p' && b.text.startsWith(start))?.text.replace(new RegExp(`^${start}\\s*`), '') ?? '';
const nowPara = corePara('Now:');
const winsIdx = core.findIndex((b) => b.type === 'p' && b.text.startsWith('Headline wins'));
const wins = winsIdx >= 0 && core[winsIdx + 1]?.type === 'list' ? core[winsIdx + 1].items : [];
const roles = corePara('Roles he fits:');

// --- addresses inside the descent -----------------------------------------------------------------
// Chambers that hold a written-site section, by the section's folder.
const CHAMBER_OF = { projects: 'projects', publications: 'research', experience: 'experience', blog: 'writing', services: 'services' };
/** A path on the written site as an address in this descent: a chamber, or an item's window. */
function hrefFor(p) {
  const [, dir, slug] = p.match(/^\/([^/#?]+)(?:\/([^/#?]+))?/) ?? [];
  const id = CHAMBER_OF[dir];
  if (!id) return abs(p);
  if (!slug) return `#go:${id}`;
  return id === 'projects' ? `#project:${slug}` : `#item:${id}/${slug}`;
}
const itemHref = (id, slug) => (id === 'projects' ? `#project:${slug}` : `#item:${id}/${slug}`);
/** The first link to the written site inside a raw Markdown line, before `clean` drops it. */
const internalLink = (raw) => raw.match(/\]\((\/[^)\s]+)\)/)?.[1] ?? null;
const slugify = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const skillList = (data) => (Array.isArray(data.skills) ? data.skills.map(String) : []);

/** Raw bullet lines (continuations joined) under a heading, or of the first list when no heading is given. */
function rawList(md, heading) {
  const lines = md.split('\n');
  const out = [];
  let on = !heading;
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      if (on && out.length) break;
      on = !heading || h[2].trim().toLowerCase().startsWith(heading.toLowerCase());
      continue;
    }
    if (!on) continue;
    const b = line.match(/^\s*[-*]\s+(.*)/);
    if (b) out.push(b[1].trim());
    else if (line.trim() && out.length) out[out.length - 1] += ' ' + line.trim();
  }
  return out;
}
/** `**Title** — the rest` → [title, rest]; a line without the dash is all title. */
function split(raw) {
  const text = clean(raw);
  const i = text.indexOf(' — ');
  return i < 0 ? [text, ''] : [text.slice(0, i).trim(), text.slice(i + 3).trim()];
}

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
  skills: skillList(e.data),
}));
// Best first: the order a recruiter should meet them in (the entry chamber's showcase is the first three).
// Anything not listed keeps its place after these.
const BEST = ['product-launch-system', 'oa-classification', 'portfolio-agent', 'turbotrade', 'gemma-3n-on-device', 'sales-training-chatbot',
  'claude-health-doctor', 'ai-teddy-bear', 'news-research-tool', 'edtech-platform', 'covid-decision-support'];
const rank = (slug) => (BEST.includes(slug) ? BEST.indexOf(slug) : BEST.length);
projects.sort((a, b) => rank(a.slug) - rank(b.slug));

const publications = dir('publications').map((e) => ({
  slug: e.slug,
  title: str(e.data.title),
  kicker: [str(e.data.status), trim(str(e.data.venue), 70)].filter(Boolean).join(' · '),
  summary: trim(firstText(e.blocks, 1), 200),
  body: trim(bullets(e.blocks, 3).slice(1).join(' '), 200),
  tags: [],
  featured: str(e.data.status) === 'Published',
  link: str(e.data.link) ? { label: 'Read the paper', href: str(e.data.link) } : { label: 'All research', href: abs('/publications') },
  blocks: e.blocks,
  skills: skillList(e.data),
}));

const experience = dir('experience').map((e) => ({
  slug: e.slug,
  title: `${str(e.data.title)}`,
  kicker: [str(e.data.company), [str(e.data.start), str(e.data.end)].filter(Boolean).join(' – ')].filter(Boolean).join(' · '),
  summary: trim(firstText(e.blocks, 1), 200),
  body: trim(bullets(e.blocks, 3).slice(1).join(' '), 220),
  tags: [str(e.data.location)].filter(Boolean),
  featured: str(e.data.end) === 'Present',
  // The role in detail opens in a window, like a project; the window itself points at the written timeline.
  link: { label: 'The role in detail', href: itemHref('experience', e.slug) },
  related: { label: 'The written timeline', href: abs('/experience') },
  blocks: e.blocks,
  skills: skillList(e.data),
  company: str(e.data.company),
  start: str(e.data.start),
  end: str(e.data.end),
}));
// The one-glance work history for the entry chamber: role, company, years.
const years = (start, end) => `${start.slice(-4)}–${end === 'Present' ? 'now' : end.slice(-2)}`;
const history = {
  body: corePara('Experience:'),
  roles: experience.map((e) => ({ title: e.title, company: e.company, years: years(e.start, e.end) })),
};

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

// Services live with the rest of the content in the portfolio repo; the dock's own words stay here.
const servicesDir = path.join(ROOT, 'services');
if (!fs.existsSync(servicesDir)) console.warn(`content: no services folder at ${servicesDir}`);
const services = (fs.existsSync(servicesDir) ? dirAt(servicesDir) : []).map((e) => ({
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
// The entry chamber's hero: this site's own words (what he has done, what he is open to), beside the dock's.
const hero = JSON.parse(read(path.join(LOCAL, 'hero.json')));
// The chamber about this site and Dumbledore: this site's own words too.
const about = JSON.parse(read(path.join(LOCAL, 'about.json')));
const agent = about.items.map((it, i) => ({ ...it, body: str(it.body), tags: it.tags ?? [], featured: i < 2 }));

// --- skills: the groups in skills.md, each skill joined to the work that lists it ------------------
// A skill's address is its slug; a project, paper or role that names the skill in its `skills:` list is a use.
const splitSkills = (s) => s.replace(/\.$/, '').split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean);
const groups = [];
for (const b of blocks(matter(read(path.join(ROOT, 'profile', 'skills.md'))).content)) {
  if (b.type === 'h') groups.push({ title: b.text, skills: [] });
  else if (b.type === 'p' && groups.length) groups[groups.length - 1].skills.push(...splitSkills(b.text));
}
const uses = {};
const known = new Set(groups.flatMap((g) => g.skills.map(slugify)));
const unknown = new Set();
for (const [id, items, kind] of [['projects', projects, 'project'], ['research', publications, 'paper'], ['experience', experience, 'role']]) {
  for (const it of items) {
    for (const s of it.skills) {
      const key = slugify(s);
      if (!known.has(key)) unknown.add(s);
      (uses[key] ??= { label: s, uses: [] }).uses.push({ label: it.title, href: itemHref(id, it.slug), note: kind });
    }
    // The item's own skills, as chips that open the skill (and from there everything else that used it).
    it.skills = it.skills.map((s) => ({ label: s, href: `#skill:${slugify(s)}` }));
  }
}
if (unknown.size) console.warn(`content: skills listed on items but not in skills.md: ${[...unknown].join('; ')}`);
const chip = (s) => {
  const key = slugify(s);
  const u = uses[key];
  return u ? { label: s, href: `#skill:${key}`, n: u.uses.length } : { label: s };
};
const technical = groups.filter((g) => g.title !== 'Soft skills');
const skills = technical.map((g, i) => {
  const chips = g.skills.map(chip);
  const linked = chips.filter((c) => c.href).length;
  return {
    slug: slugify(g.title),
    title: g.title,
    kicker: `skills · ${i + 1} of ${technical.length}`,
    summary: linked ? `${chips.length} skills; ${linked} open the work that used them.` : `${chips.length} skills.`,
    body: '',
    tags: [],
    chips,
    featured: i === 0,
  };
});
const skillCount = technical.reduce((n, g) => n + g.skills.length, 0);
const linkedCount = technical.reduce((n, g) => n + g.skills.filter((s) => uses[slugify(s)]).length, 0);

// --- education, certifications, achievements, soft skills ------------------------------------------
const eduMd = matter(read(path.join(ROOT, 'profile', 'education.md'))).content;
const education = rawList(eduMd, 'education').map((raw, i) => {
  const [title, rest] = split(raw);
  // "School, City (dates). Grade."
  const m = rest.match(/^(.*?)\s*\(([^)]*)\)\.?\s*(.*)$/);
  const grade = m ? m[3].replace(/\.$/, '') : '';
  return {
    slug: slugify(title),
    title,
    kicker: m ? m[2] : 'education',
    summary: m ? m[1] : rest,
    body: '',
    tags: grade ? [grade] : [],
    featured: i === 0,
    link: i === 0 ? { label: 'The written timeline', href: abs('/experience') } : undefined,
  };
});

const certificates = rawList(eduMd, 'certifications').map((raw) => {
  let [title, issuer] = split(raw);
  const year = (issuer || title).match(/\((\d{4})\)/)?.[1] ?? '';
  issuer = issuer.replace(/\s*\(\d{4}\)/, '').trim();
  title = title.replace(/\s*\(\d{4}\)/, '').trim();
  if (!issuer && title.includes(':')) [issuer, title] = title.split(':').map((s) => s.trim());
  return { title, issuer, year };
});
// Three to a wall, in the file's order.
const certifications = [];
for (let i = 0; i < certificates.length; i += 3) {
  const trio = certificates.slice(i, i + 3);
  const k = certifications.length;
  certifications.push({
    slug: `certificates-${k + 1}`,
    title: trio.map((c) => c.issuer || c.title).join(' · '),
    kicker: `certifications · ${i + 1}–${i + trio.length} of ${certificates.length}`,
    summary: '',
    body: '',
    tags: [],
    chips: trio.map((c) => ({ label: c.title, note: [c.issuer, c.year].filter(Boolean).join(' · ') })),
    featured: k === 0,
  });
}

const achMd = matter(read(path.join(ROOT, 'profile', 'achievements.md'))).content;
const achievements = rawList(achMd).map((raw, i, all) => {
  const [title, story] = split(raw);
  const related = internalLink(raw);
  const href = related ? hrefFor(related) : null;
  const label = href?.startsWith('#project:') ? 'Open the project' : href?.startsWith('#item:research/') ? 'Open the paper' : 'Open';
  const slug = slugify(title);
  const long = story.length > 230;
  return {
    slug,
    title,
    kicker: `achievement · ${i + 1} of ${all.length}`,
    summary: trim(story, 230),
    body: '',
    tags: [],
    featured: i < 3,
    // A long story opens in full; a short one links straight to the work behind it, if there is any.
    link: long ? { label: 'The story', href: itemHref('achievements', slug) } : href ? { label, href } : undefined,
    blocks: [{ type: 'p', text: story }],
    // The work behind the story, for the window's link.
    related: href ? { label, href } : undefined,
  };
});

const softMd = matter(read(path.join(ROOT, 'profile', 'soft-skills.md'))).content;
const softskills = rawList(softMd).map((raw, i) => {
  const [title, proof] = split(raw);
  return { slug: slugify(title), title, kicker: `soft skill · ${i + 1} of 5`, summary: proof, body: '', tags: [], featured: i === 0 };
});
const softBlocks = blocks(softMd);
const interestsIdx = softBlocks.findIndex((b) => b.type === 'h' && /interests/i.test(b.text));
const interests = interestsIdx >= 0 ? softBlocks[interestsIdx + 1]?.text ?? '' : '';

// "Book a call" opens the 2D site with its booking card already open (the 3D page can't book by itself: the
// booking API sits behind the 2D site's bot check).
const BOOK = abs('/?book=3d');
const contact = [
  { slug: 'book', title: 'Book a 30-min call', kicker: 'best', summary: 'Pick a time on his calendar; he confirms it and Google sends the Meet invite.', body: 'Weekdays, 10 am to 9 pm India time.', tags: [], featured: true, link: { label: 'Pick a time', href: BOOK } },
  { slug: 'email', title: 'Email', kicker: 'fastest', summary: site.email, body: 'For roles, freelance builds, training and collaborations.', tags: [], featured: true, link: { label: site.email, href: `mailto:${site.email}` } },
  { slug: 'linkedin', title: 'LinkedIn', kicker: 'profile', summary: 'Connect and message.', body: '', tags: [], featured: false, link: { label: 'Open LinkedIn', href: site.linkedin } },
  { slug: 'github', title: 'GitHub', kicker: 'code', summary: 'Open-source work and this site.', body: '', tags: [], featured: false, link: { label: 'Open GitHub', href: site.github } },
  { slug: 'resume', title: 'Résumé', kicker: 'pdf', summary: 'One page, current.', body: roles ? `Roles he fits: ${roles}` : '', tags: [], featured: false, link: { label: 'Download the résumé', href: abs(site.resume) } },
];

const modelsDir = path.join(here, '..', 'public', 'models');
const hasModel = (name) => fs.existsSync(path.join(modelsDir, `${name}.glb`)) || fs.existsSync(path.join(modelsDir, `${name}.glb.txt`));
// Project pictures: drop `public/assets/projects/<slug>.(webp|jpg|jpeg|png)` and the vault screen and project window show it.
// Under assets/: the main site forwards /assets/* to this one, while /projects/* is the main site's own section.
const projectsDir = path.join(here, '..', 'public', 'assets', 'projects');
const projectImages = {};
const projectCredits = {};
for (const p of projects) {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    if (fs.existsSync(path.join(projectsDir, `${p.slug}.${ext}`))) {
      // Its content hash in the address: a new or changed picture never meets a cached copy (or a cached 404).
      const hash = crypto.createHash('sha1').update(fs.readFileSync(path.join(projectsDir, `${p.slug}.${ext}`))).digest('hex').slice(0, 10);
      projectImages[p.slug] = `assets/projects/${p.slug}.${ext}?v=${hash}`;
      break;
    }
  }
  // A picture under licence carries its credit beside it: `public/assets/projects/<slug>.credit.txt`.
  const credit = path.join(projectsDir, `${p.slug}.credit.txt`);
  if (projectImages[p.slug] && fs.existsSync(credit)) projectCredits[p.slug] = fs.readFileSync(credit, 'utf8').trim();
}

// Build-only fields stay out of the file.
const pub = ({ company, start, end, ...it }) => it;

const out = {
  site: { name: site.name, role: site.role, tagline: site.tagline, location: site.location, email: site.email, linkedin: site.linkedin, github: site.github, resume: abs(site.resume), url: site.url },
  // Which optional figures exist on disk, so the page never asks for a file that is not there.
  assets: { projects: projectImages, credits: projectCredits },
  home: { now: trim(nowPara, 260), wins, roles, hero, history },
  dock,
  // Every skill by slug, with the work that lists it: the skill window.
  skills: uses,
  sections: [
    // His order: the site and its agent, the roles in detail, education, the skills (each opening the work that used
    // it), the builds, the papers, certificates, achievements with their stories, how he works, notes, what he sells, reach him.
    { id: 'agent', label: 'This site', path: abs('/'), intro: about.intro, items: agent },
    { id: 'experience', label: 'Experience', path: abs('/experience'), intro: 'Three years turning research into systems that ship.', items: experience.map(pub) },
    { id: 'education', label: 'Education', path: abs('/experience'), intro: 'An engineer by degree; everything after it, by building.', items: education },
    { id: 'skills', label: 'Skills', path: abs('/experience'), intro: `${skillCount} skills in ${technical.length} areas; ${linkedCount} open the work that used them.`, items: skills },
    { id: 'projects', label: 'Projects', path: abs('/projects'), intro: `${projects.length} builds, from a hospital pipeline to the agent on this site.`, items: projects },
    { id: 'research', label: 'Research', path: abs('/publications'), intro: `${publications.length} papers: medical imaging, quantum attention, decision support.`, items: publications },
    { id: 'certifications', label: 'Certificates', path: abs('/experience'), intro: `${certificates.length} certifications, from LLM fine-tuning to the foundations.`, items: certifications },
    { id: 'achievements', label: 'Achievements', path: abs('/experience'), intro: `${achievements.length} things he is proud of, and the stories behind them.`, items: achievements },
    { id: 'softskills', label: 'Soft skills', path: abs('/experience'), intro: `How he works, each with its proof.${interests ? ` Off the clock: ${interests.replace(/\.$/, '')}.` : ''}`, items: softskills },
    { id: 'writing', label: 'Writing', path: abs('/blog'), intro: 'Notes from building.', items: blog },
    { id: 'services', label: dock.label || 'Services', path: abs('/'), intro: dock.intro, items: services },
    { id: 'contact', label: 'Contact', path: abs('/'), intro: 'Hire him, book a build, or bring a problem.', items: contact },
  ],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`content: ${out.sections.map((s) => `${s.id} ${s.items.length}`).join(', ')}; ${Object.keys(uses).length} skills with uses → ${path.relative(process.cwd(), OUT)}`);
