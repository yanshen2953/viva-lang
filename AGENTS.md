# AGENTS.md

## Cursor Cloud specific instructions

Viva is a single-product, purely local TypeScript toolchain (no backend, DB, secrets, or external services). It ships as a library, a `viva` CLI, and a Vite web playground. Package manager is **npm**; requires Node >= 18 (the VM has Node 22). Dependencies are installed by the startup update script (`npm install`).

Standard commands live in `package.json` `scripts`:
- Dev / run: `npm run dev` — Vite playground at `http://localhost:5173` (edit `.viva` on the left, live SVG render on the right). This is the main end-to-end dev surface.
- Test: `npm test` — Vitest (`vitest run`).
- Preview built app: `npm run preview`.

Non-obvious caveats:
- `npm run build` currently FAILS at its first step (`tsc -p tsconfig.build.json`) due to a pre-existing type error in `src/widgets.ts` (`binary` expression literals missing the required `span` field). This is a source bug, not an environment issue. The dev server (`npm run dev`) and tests do NOT type-check, so they work regardless.
- Because `dist/` is not produced by a successful build, the CLI cannot be run via `node dist/cli.js`. To exercise the CLI without building, run it from source with vite-node, e.g. `npx vite-node src/cli.ts -- compile examples/hello.viva` or `... html examples/hello.viva`.
- No linter is configured (no ESLint/Prettier/Biome, no `lint` script). The only static check is TypeScript; `npx tsc -p tsconfig.json` (noEmit) type-checks the whole workspace but currently surfaces the same `src/widgets.ts` error above.
- Runnable examples are in `examples/*.viva`; the playground loads them via `?raw` imports.
