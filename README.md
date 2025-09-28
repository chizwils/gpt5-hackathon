# Semantic Memory Browser Extension

Semantic Memory is a local-first browser co-pilot that captures the pages you read, annotates your browsing behaviour, and lets you chat with a GPT-5 powered memory of recent activity. The project ships as a Manifest V3 extension built with React + Tailwind for the UI, a background service worker orchestrating capture, and a lightweight Fastify proxy to broker GPT-5 requests.

> Hackathon note: everything runs locally by default. The GPT-5 proxy can be pointed at real APIs if you provide credentials, but the shipped configuration returns mock responses so the extension is safe to demo offline.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Repository Layout](#repository-layout)
- [Getting Started](#getting-started)
  - [1. Install Dependencies](#1-install-dependencies)
  - [2. (Optional) Configure Environment](#2-optional-configure-environment)
  - [3. Run the GPT-5 Proxy](#3-run-the-gpt-5-proxy)
  - [4. Launch the Extension in Development](#4-launch-the-extension-in-development)
  - [5. Load the Extension in Chrome](#5-load-the-extension-in-chrome)
- [Build for Release](#build-for-release)
- [Running Tests and Linting](#running-tests-and-linting)
- [How the Extension Works](#how-the-extension-works)
  - [Background Service Worker](#background-service-worker)
  - [Content Capture Pipeline](#content-capture-pipeline)
  - [Semantic Search & Embeddings](#semantic-search--embeddings)
  - [Timeline & Observers](#timeline--observers)
  - [UI Surfaces](#ui-surfaces)
- [Proxy API Details](#proxy-api-details)
- [Permissions & Privacy](#permissions--privacy)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

## Prerequisites

- Node.js >= 18 (Node 20 recommended).
- [pnpm](https://pnpm.io/) >= 8.
- Chrome or Chromium-based browser with developer mode enabled.
- (Optional) An OpenAI API key if you want to proxy traffic to GPT-5 instead of using the mock responses.

## Repository Layout

```
├── extension/manifest.json      # Manifest V3 definition and permissions
├── src/
│   ├── background/              # Service worker, observers, GPT-5 client
│   ├── content/                 # Content script that captures page metadata & signals
│   ├── data/                    # Dexie schema + memory service helpers
│   ├── ui/                      # React surfaces (popup) and Zustand state
│   ├── workers/                 # Web workers (e.g. local embedding generator)
│   └── backend/proxy/           # Local Fastify proxy for GPT-5
├── tests/                       # Vitest unit coverage for new modules
└── vite.config.ts               # Vite + @crxjs configuration for MV3 bundles
```

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. (Optional) Configure Environment

Create a `.env.local` file at the project root if you plan to hit the real GPT-5 API via the proxy.

```bash
cp .env.example .env.local  # if an example exists, otherwise create manually
```

Minimum variables:

```
OPENAI_API_KEY=sk-...
GPT5_PROXY_PORT=8788      # optional override
GPT5_PROXY_HOST=0.0.0.0   # optional override
```

If `OPENAI_API_KEY` is omitted the proxy will stream deterministic mock data, which is perfect for hackathon demos without external dependencies.

### 3. Run the GPT-5 Proxy

In a dedicated terminal:

```bash
pnpm dev:proxy
```

- Exposes `POST /responses` for chat completions and `POST /file-search/index` for future file ingestion.
- Accepts CORS from the extension (`chrome-extension://*`) and the Vite dev server.
- Streams Server-Sent Events (SSE) back to the extension for incremental chat updates.

### 4. Launch the Extension in Development

In another terminal:

```bash
pnpm dev:chrome
```

- Vite + @crxjs emits live bundles to `dist/chrome/` and watches for changes.
- For Firefox testing run `pnpm dev:firefox` instead, which targets `dist/firefox/` with the right browser-specific tweaks.

### 5. Load the Extension in Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode**.
3. Click **Load unpacked** and choose the `dist/chrome/` directory generated in the previous step.
4. Pin the extension icon to make opening the popup easier.

You should now see the Semantic Memory popup with demo threads and live streaming chat once the proxy is running.

## Build for Release

To produce optimized bundles:

```bash
pnpm build
```

Artifacts land in `dist/`:

- `dist/chrome/` – Chrome MV3 package (load unpacked or zip for distribution).
- `dist/firefox/` – Firefox build (if `manifest.browser_specific_settings` is configured in Vite).

Zip the respective directory for submission or store distribution; remember to review permissions before publishing.

## Running Tests and Linting

We rely on Vitest, Testing Library, and ESLint.

```bash
pnpm test            # run unit tests in tests/unit
pnpm test --coverage # include coverage reports
pnpm lint            # eslint + prettier + tailwind order rules
```

CI expectations: unit coverage focuses on the background observers, recap aggregator, and download logic introduced under `src/background/` and `src/data/`.

## How the Extension Works

### Background Service Worker

`src/background/index.ts` is the MV3 service worker entry point. It:

- Registers observers for tab, window, bookmark, download, and reading list events (`registerBehaviourObservers`, `registerDownloadObserver`).
- Periodically aggregates browsing sessions into recap timeline entries (`runSessionAggregation`).
- Streams GPT-5 responses via `requestResponsesStream`, pushing partial results to the UI.
- Handles capture messages from the content script, persisting pages, chunks, embeddings, and timeline metadata to IndexedDB via Dexie.

### Content Capture Pipeline

`src/content/index.ts` runs on every page (per permissions) and sends `semantic-memory:capture` messages containing:

- Cleaned Readability text, highlights, and dwell signals.
- Form interactions, Picture-in-Picture events, and incognito hints.
- Tab context (title, URL, window, group IDs).

The background worker ingests these payloads, associates them with sessions, and stores them in Dexie (`src/data`).

### Semantic Search & Embeddings

- `src/workers/embedding-worker.ts` is a module web worker that generates deterministic 256-dim embeddings locally (FNV-based hashing) to avoid network calls.
- `computeEmbedding` in the background worker falls back to an inline generator when workers are unavailable.
- Prompt routing (`buildPromptContext`) scores stored chunks against the latest question using cosine similarity, providing relevant context snippets and references to GPT-5.

### Timeline & Observers

Rich timeline events are captured through:

- Tab lifecycle hooks (pin, discard, detach, move, mass-close hints).
- Bookmark and reading list listeners.
- Download observer tracking start/completion events.
- Session aggregator summarising clusters of recent browsing.

Entries are written via `recordTimelineEntry` (`src/data/memory-service.ts`) and broadcast to the UI so components like `SessionRecapPanel` stay live.

### UI Surfaces

- Popup UI lives in `src/ui` with React + Tailwind.
- Zustand store (`src/ui/state/chat-store.ts`) hydrates from Dexie, sends chat requests, and applies streaming GPT-5 updates pushed from the background worker.
- Components such as `ChatLayout`, `MessageList`, `MessageBubble`, and `SessionRecapPanel` provide the chat experience, citations, and recent highlight panels.

## Proxy API Details

The proxy lives in `src/backend/proxy` and is optional when using mock data.

- `POST /responses` accepts `{ prompt, temperature?, context?, stream? }` and returns either a JSON payload or an SSE stream. Metadata fields (page IDs, snippets, highlights) are forwarded via OpenAI request metadata for auditing.
- `POST /file-search/index` is scaffolded for future document ingestion; it currently validates payloads and returns a placeholder.
- `OPENAI_API_KEY` enables real GPT-5 calls using the `openai` SDK (`responses.create`). Without it the proxy emits mock text and token estimates so UI flows can be exercised offline.

## Permissions & Privacy

Manifest highlights (`extension/manifest.json`):

- `"<all_urls>"` host permissions so the content script can capture any visited page during demos.
- Chrome APIs: `tabs`, `tabGroups`, `sessions`, `downloads`, `bookmarks`, `readingList`, `scripting`, `storage`, `activeTab`.
- Keyboard commands for tracking close-an-others actions (`Ctrl+Shift+K` / `Command+Shift+K`, `Ctrl+Shift+O` / `Command+Shift+O`).

For hackathon usage this broad scope is acceptable, but document it when sharing builds. To publish, promote non-essential APIs to optional permissions and restrict host access if capture surfaces become opt-in.

Data is stored locally in IndexedDB (Dexie). No telemetry leaves the machine unless you configure the GPT-5 proxy with real credentials.

## Troubleshooting

- **Manifest load error for commands** – Chrome only accepts certain default shortcut combinations. The manifest already uses valid defaults; if you customise them, prefer alphanumeric keys.
- **Proxy connection refused** – Ensure `pnpm dev:proxy` is running. The background worker logs proxy failures in the console (`chrome://extensions` → “service worker” link).
- **No streaming responses** – Confirm the proxy responded with `text/event-stream`. Mock mode also streams via SSE; if you see JSON, check that the request wasn’t flagged as streaming (`stream: true`).
- **Dexie upgrade errors** – During schema changes, clear the extension’s storage: open `chrome://extensions`, click **service worker**, run `indexedDB.deleteDatabase('semantic_memory')` in the console, then reload the extension.

## Next Steps

- Replace mock GPT-5 responses by supplying `OPENAI_API_KEY`.
- Tighten permissions once feature scope stabilises (e.g. move bookmarks/readingList to optional prompts).
- Extend Playwright coverage under `tests/e2e/` for end-to-end capture and chat flows.
- Package and sign builds if you plan to distribute outside hackathon demos.

Happy hacking!
