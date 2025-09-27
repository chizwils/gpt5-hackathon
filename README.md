# Semantic Memory Browser Extension

Local-first GPT-5 assisted browsing memory. This repository currently focuses on the popup UI, delivering a ChatGPT-like experience for recalling captured pages.

## Quickstart

```bash
pnpm install
pnpm dev:chrome
```

Load the generated `dist/chrome/` directory in Chrome's extension page with developer mode enabled.

## UI Overview

- **Memory Threads** sidebar mirrors ChatGPT's conversation list and highlights local capture state.
- **Message Board** renders captured history and assistant digests with citations, ready for semantic recalls.
- **Composer** provides quick-prompt chips and a send button styled like ChatGPT's composer.

The UI is powered by React, TailwindCSS, Zustand, and Vite + @crxjs. Replace mock state in `src/ui/state/chat-store.ts` with live semantic memory APIs as they land.
