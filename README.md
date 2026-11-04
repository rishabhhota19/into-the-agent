# Into the Agent

A descent through the work of Rishabh Hota: a scroll-driven 3D portfolio built with Vite, TypeScript and three.js.
Seven chambers in one scene; the content comes from the portfolio's own Markdown (`tools/content.mjs`) plus the
services copy in `content/`.

## Run

```bash
npm install
npm run dev      # http://localhost:5177
npm run build    # tsc + vite -> dist/
npm run preview  # http://localhost:4177
```

`npm run content` rebuilds `src/content/site.json` from `../portfolio/content` when that checkout is beside this
one; on a build machine the committed file is used as is.

## Credits

- Rabbit: "Bobo" by riddle0104, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), via the Objaverse mirror of Sketchfab.
- Ant: Poly by Google, [CC BY](https://creativecommons.org/licenses/by/4.0/).
- Everything else is drawn in code.
