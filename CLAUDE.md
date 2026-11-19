# Into the Agent (the 3D site) — read the portfolio's CLAUDE.md first

This is the 3D descent at https://rishabh-hota.vercel.app/3d (deployed as https://into-the-agent.vercel.app, Vercel team
rishabh-099b, project `into-the-agent`; a push to `main` deploys).

Everything about the project, its owner, accounts, deploys, how to verify and the open problems is in the portfolio
repo: https://github.com/rishabhhota19/portfolio — `CLAUDE.md`, `docs/handoff/OPEN-PROBLEMS.md`.

- Clone this repo **next to** `portfolio/`: `tools/content.mjs` reads `../portfolio/content` (projects, papers, roles,
  services) and writes `src/content/site.json` before every dev run and build.
- `npm ci`, `npm run dev` (port 5177), `npm run build`. Add `?tier=high` to the URL in tests to skip the speed gate.
- The gate has no button: it measures (a warm pass, one sweep, a predicted rung) and opens by itself; a test waits for
  `#gate.is-off`. Measured 20 Nov 2026 on an M1 Pro: the descent begins ~6 s after navigation on the live site.
- Chambers: `src/world/chapters/` (Gantry = entry with the hero, the work history and the best work; Well = experience,
  Vault = projects, Sight = research, Archive = writing, Dock = services, Timefold = contact). Any other section is a
  `Hall` (one lit slab per item: this site + Dumbledore, education, achievements, soft skills) or a `Wall` (cards on a
  wall: skills, certificates). Order comes from `tools/content.mjs` `sections`; this site's own words are in `content/`
  (hero.json, about.json, dock.json).
- Every link inside the descent is an address `Experience.follow` understands: `#project:slug`, `#item:chamber/slug`
  (any item's window), `#skill:slug` (a skill and the projects, papers and roles whose `skills:` front matter lists
  it), `#go:chamber`, `#ask`. Skills come from the portfolio's `content/profile/skills.md`; a skill links to work only
  when an item lists it, so a new project should carry a `skills:` list.
- His rule: inside the descent 60 fps and no frame over 50 ms, measured on the live site in real Chrome.
- Project pictures: `public/assets/projects/<slug>.(jpg|webp)` + `<slug>.credit.txt` for a licensed picture.
