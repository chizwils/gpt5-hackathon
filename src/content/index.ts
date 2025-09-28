import type {
  ContentCapturePayload,
  ContentScriptMessage,
  FormEventCapture,
  HighlightCapture,
  PipEventCapture
} from '@/types/capture';

const startTimestamp = Date.now();
let maxScrollDepth = 0;
let captureSent = false;
const highlights = new Map<string, HighlightCapture>();
const formEvents: FormEventCapture[] = [];
const pipEvents: PipEventCapture[] = [];
const trackedForms = new Set<string>();

const incognitoContext = typeof chrome !== 'undefined' && Boolean(chrome.extension?.inIncognitoContext);

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

const getFormIdentifier = (form: HTMLFormElement) =>
  form.id || form.getAttribute('name') || form.action || `form-${trackedForms.size + 1}`;

document.addEventListener(
  'focusin',
  (event) => {
    const target = event.target as HTMLElement | null;
    const form = target?.closest('form');
    if (!form) return;
    const id = getFormIdentifier(form);
    if (trackedForms.has(id)) return;
    trackedForms.add(id);
    formEvents.push({
      type: 'start',
      timestamp: new Date().toISOString(),
      formId: id,
      action: form.action,
      fieldCount: typeof form.elements?.length === 'number' ? form.elements.length : undefined
    });
  },
  { capture: true }
);

document.addEventListener(
  'submit',
  (event) => {
    const form = event.target as HTMLFormElement | null;
    if (!form) return;
    const id = getFormIdentifier(form);
    formEvents.push({
      type: 'submit',
      timestamp: new Date().toISOString(),
      formId: id,
      action: form.action,
      fieldCount: typeof form.elements?.length === 'number' ? form.elements.length : undefined
    });
  },
  true
);

const recordPipEvent = (type: PipEventCapture['type'], target: EventTarget | null) => {
  const mediaType = target instanceof HTMLVideoElement ? 'video' : undefined;
  pipEvents.push({
    type,
    timestamp: new Date().toISOString(),
    mediaType
  });
};

document.addEventListener(
  'enterpictureinpicture',
  (event) => {
    recordPipEvent('enter', event.target ?? null);
  },
  true
);

document.addEventListener(
  'leavepictureinpicture',
  (event) => {
    recordPipEvent('leave', event.target ?? null);
  },
  true
);

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
    readingTimeSeconds: Math.round((Date.now() - startTimestamp) / 1000),
    formEvents: [...formEvents],
    pipEvents: [...pipEvents],
    incognitoContext
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

// Modal-style overlay functionality
let overlay: HTMLDivElement | null = null;
let backdrop: HTMLDivElement | null = null;
let isOverlayVisible = false;
let isToggling = false;

const createOverlay = () => {
  if (overlay) return { overlay, backdrop };

  // Create backdrop
  backdrop = document.createElement('div');
  backdrop.id = 'semantic-memory-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2147483646;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
    backdrop-filter: blur(2px);
  `;

  // Create overlay container
  overlay = document.createElement('div');
  overlay.id = 'semantic-memory-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    width: 800px;
    height: 700px;
    z-index: 2147483647;
    background: #1e293b;
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    transform: translate(-50%, -50%) scale(0.95);
    transition: transform 0.3s ease, opacity 0.3s ease;
    opacity: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
  `;

  // Create header with close button
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #374151;
    background: #1f2937;
    border-radius: 12px 12px 0 0;
  `;

  const title = document.createElement('h2');
  title.textContent = 'Semantic Memory';
  title.style.cssText = `
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #f9fafb;
  `;

  const closeButton = document.createElement('button');
  closeButton.innerHTML = '×';
  closeButton.style.cssText = `
    background: none;
    border: none;
    font-size: 24px;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background-color 0.2s ease;
  `;
  
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.backgroundColor = '#374151';
  });
  
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.backgroundColor = 'transparent';
  });

  closeButton.addEventListener('click', toggleOverlay);

  header.appendChild(title);
  header.appendChild(closeButton);

  // Create iframe for the popup content
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    flex: 1;
    border-radius: 0 0 12px 12px;
  `;
  iframe.src = chrome.runtime.getURL('src/ui/popup/index.html');
  
  overlay.appendChild(header);
  overlay.appendChild(iframe);
  
  // Close on backdrop click
  backdrop.addEventListener('click', toggleOverlay);

  document.body.appendChild(backdrop);
  document.body.appendChild(overlay);

  return { overlay, backdrop };
};

const toggleOverlay = () => {
  // Prevent rapid toggling
  if (isToggling) {
    return;
  }
  
  isToggling = true;
  
  const { overlay: overlayElement, backdrop: backdropElement } = createOverlay();
  
  isOverlayVisible = !isOverlayVisible;
  
  if (isOverlayVisible) {
    // Show overlay
    backdropElement.style.visibility = 'visible';
    backdropElement.style.opacity = '1';
    overlayElement.style.opacity = '1';
    overlayElement.style.transform = 'translate(-50%, -50%) scale(1)';
    document.body.style.overflow = 'hidden'; // Prevent body scroll
  } else {
    // Hide overlay
    backdropElement.style.opacity = '0';
    backdropElement.style.visibility = 'hidden';
    overlayElement.style.opacity = '0';
    overlayElement.style.transform = 'translate(-50%, -50%) scale(0.95)';
    document.body.style.overflow = ''; // Restore body scroll
  }
  
  // Reset toggle lock after animation
  setTimeout(() => {
    isToggling = false;
  }, 300);
};

// Listen for toggle messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'semantic-memory:toggle-overlay') {
    toggleOverlay();
  }
});

// Listen for keyboard shortcut - try both Period and the actual dot key
document.addEventListener('keydown', (e) => {
  // Check for Ctrl+Shift+Period (or Cmd+Shift+Period on Mac)
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifierKey = isMac ? e.metaKey : e.ctrlKey;
  
  if (modifierKey && e.shiftKey && (e.code === 'Period' || e.key === '.')) {
    e.preventDefault();
    toggleOverlay();
  }
});

// Listen for ESC key to close overlay
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isOverlayVisible) {
    toggleOverlay();
  }
});
