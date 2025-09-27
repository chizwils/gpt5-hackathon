import type { ContentCapturePayload, HighlightCapture, ContentScriptMessage } from '@/types/capture';

const startTimestamp = Date.now();
let maxScrollDepth = 0;
let captureSent = false;
const highlights = new Map<string, HighlightCapture>();

const updateScrollDepth = () => {
  const { scrollHeight, clientHeight, scrollTop } = document.documentElement;
  if (!scrollHeight) return;
  const viewportBottom = scrollTop + clientHeight;
  const depth = scrollHeight <= clientHeight ? 1 : Math.min(1, viewportBottom / scrollHeight);
  maxScrollDepth = Math.max(maxScrollDepth, Number.isFinite(depth) ? depth : 0);
};

let scrollTimeout: number | null = null;
const handleScroll = () => {
  if (scrollTimeout !== null) return;
  scrollTimeout = window.setTimeout(() => {
    updateScrollDepth();
    scrollTimeout && window.clearTimeout(scrollTimeout);
    scrollTimeout = null;
  }, 500);
};

document.addEventListener('scroll', handleScroll, { passive: true });
updateScrollDepth();

const captureSelection = () => {
  const selection = window.getSelection()?.toString().trim();
  if (!selection || selection.length < 24 || selection.length > 480) return;
  if (highlights.has(selection)) return;
  highlights.set(selection, { text: selection });
};

document.addEventListener('mouseup', captureSelection);

type SendMessage = ContentScriptMessage;

const safeSendMessage = (message: SendMessage) => {
  try {
    chrome.runtime.sendMessage(message);
  } catch (error) {
    console.debug('[SemanticMemory] sendMessage failed', error);
  }
};

const getCanonicalUrl = () =>
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || undefined;

const getMetaContent = (selectors: string[]) => {
  for (const selector of selectors) {
    const content = document.querySelector<HTMLMetaElement>(selector)?.content;
    if (content) return content;
  }
  return undefined;
};

const captureReasons = new Set<string>();

const buildCapturePayload = (): ContentCapturePayload => {
  const text = document.body?.innerText?.trim() ?? '';
  const wordCount = text ? text.split(/\s+/).length : 0;
  const finishedAt = new Date().toISOString();
  const startedAt = new Date(startTimestamp).toISOString();

  if (!text || wordCount < 40) {
    captureReasons.add('quick_glance');
  }

  const reasons = captureReasons.size ? Array.from(captureReasons) : ['pagehide'];

  return {
    url: location.href,
    title: document.title,
    canonicalUrl: getCanonicalUrl(),
    description: getMetaContent([
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]'
    ]),
    language: document.documentElement.lang || undefined,
    text,
    wordCount,
    startedAt,
    finishedAt,
    scrollDepth: Number.isFinite(maxScrollDepth) ? Number(maxScrollDepth.toFixed(3)) : 0,
    highlights: Array.from(highlights.values()).slice(0, 8),
    reasons,
    readingTimeSeconds: Math.round((Date.now() - startTimestamp) / 1000)
  };
};

const sendCapture = () => {
  if (captureSent) return;
  captureSent = true;
  const payload = buildCapturePayload();
  safeSendMessage({ type: 'semantic-memory:capture', payload });
};

window.addEventListener('beforeunload', () => {
  captureReasons.add('beforeunload');
  sendCapture();
});

window.addEventListener('pagehide', () => {
  captureReasons.add('pagehide');
  sendCapture();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    captureReasons.add('hidden');
    sendCapture();
  }
});

safeSendMessage({
  type: 'semantic-memory:init',
  payload: {
    url: location.href,
    title: document.title,
    startedAt: new Date(startTimestamp).toISOString()
  }
});
