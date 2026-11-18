# Into the Agent (the 3D site) — read the portfolio's CLAUDE.md first

This is the 3D descent at https://rishabh-hota.vercel.app/3d (deployed as https://into-the-agent.vercel.app, Vercel team
rishabh-099b, project `into-the-agent`; a push to `main` deploys).

Everything about the project, its owner, accounts, deploys, how to verify and the open problems is in the portfolio
repo: https://github.com/rishabhhota19/portfolio — `CLAUDE.md`, `docs/handoff/OPEN-PROBLEMS.md`.

- Clone this repo **next to** `portfolio/`: `tools/content.mjs` reads `../portfolio/content` (projects, papers, roles,
  services) and writes `src/content/site.json` before every dev run and build.
- `npm ci`, `npm run dev` (port 5177), `npm run build`. Add `?tier=high` to the URL in tests to skip the speed gate.
- Chambers: `src/world/chapters/` (Gantry = entry, Well = experience, Vault = projects, Sight = research,
  Archive = writing, Dock = services, Timefold = contact). Order comes from `tools/content.mjs` `sections`.
- His rule: inside the descent 60 fps and no frame over 50 ms, measured on the live site in real Chrome.
- Project pictures: `public/assets/projects/<slug>.(jpg|webp)` + `<slug>.credit.txt` for a licensed picture.
