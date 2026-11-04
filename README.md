# Into the Agent

A descent through the work of Rishabh Hota: a scroll-driven 3D portfolio built with Vite, TypeScript and three.js.
Seven chambers in one scene; the content comes from the portfolio's own Markdown (`tools/content.mjs`), plus the
services chamber's closing words in `content/dock.json`. The written site serves it at https://rishabh-hota.vercel.app/3d.

## Run

```bash
npm install
npm run dev      # http://localhost:5177
npm run build    # tsc + vite -> dist/
npm run preview  # http://localhost:4177
```

`npm run content` rebuilds `src/content/site.json` from `../portfolio/content` when that checkout is beside this
one; on a build machine it makes a shallow sparse clone of the public portfolio repo's `content` folder instead, and
falls back to the committed file if that fails.

## Credits

- Ant: Poly by Google, [CC BY](https://creativecommons.org/licenses/by/4.0/).
- Everything else is drawn in code.
