# Repository Guidelines

## Project Structure & Module Organization
- `extension/manifest.json` configures MV3 permissions and background entrypoints.
- `src/background/` hosts the service worker, capture scheduler, and worker dispatch under `src/workers/`.
- `src/content/` handles Readability extraction, dwell heuristics, and toolbar injection.
- `src/ui/` stores React + Tailwind surfaces; keep state in `src/ui/state/`.
- `tests/` mirrors `src`; Playwright lives in `tests/e2e/` with fixtures in `tests/fixtures/pages/`.

## Build, Test, & Development Commands
- `pnpm install` bootstraps dependencies (Vite, @crxjs, Tailwind, Dexie).
- `pnpm dev:chrome` hot-reloads to `dist/chrome/`; `pnpm dev:firefox` targets Gecko builds.
- `pnpm build` emits optimized bundles in `dist/`.
- `pnpm test` runs Vitest; add `--coverage` when checking thresholds.
- `pnpm lint` runs ESLint + Prettier + Tailwind sorting.

## Coding Style & Naming Conventions
- Enforce TypeScript strict mode, 2-space indent, camelCase variables, PascalCase components/hooks, kebab-case directories.
- Favor named exports; reserve defaults for manifest entry files (popup, background, content).
- Tailwind utilities stay inline; extract shared recipes to `src/ui/components/tokens/` with `clsx`.
- Name Zustand stores `use<X>Store.ts`; Redux Toolkit slices follow `<feature>.slice.ts`.
- Wrap async capture in `tryResult()` so worker errors surface via the UI badge without leaking logs.

## Testing Guidelines
- Use Vitest + Testing Library for units and Playwright for capture/search flows; stub OCR/embedding services as needed.
- Keep specs `*.test.ts(x)` or `*.e2e.ts`; target ≥85% coverage on background, embeddings, and semantic search.
- Store fixtures in `tests/fixtures/pages/` for semantic replays.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat: semantic clustering`, `fix: captureVisibleTab permissions`) with subjects ≤72 chars.
- PRs include summary, linked issues (`Closes #123`), UI screenshots, toggle notes, and test/coverage evidence.
- Request capture + UI codeowners and merge only after CI (lint, unit, Playwright) succeeds.

## Security & Privacy Notes
- Default builds run with `LOCAL_ONLY=true`; new telemetry or sync features are opt-in and documented in `docs/privacy.md`.
- Do not persist raw page content or prompts; guard debugging with `if (import.meta.env.DEV)` and strip before release.
- Flag new host permissions or GPT-5 calls for review; encrypt Supabase/Cloudflare sync paths.

## Architecture Snapshot
- Web page → Content script: collect URL/title, Readability text, dwell metrics, optional thumbnail/OCR.
- Background service worker: debounce and dedupe events, fan out to embeddings/OCR workers, persist to Dexie or SQLite storage.
- Local DB → UI surfaces (popup/new-tab/options) deliver semantic search, topic clusters, “Remember/Pause” toggles, GPT-5 digests; optional encrypted sync hits cloud functions + GPT-5 APIs.
