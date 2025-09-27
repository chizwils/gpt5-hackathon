import { chunkText } from './chunker';
import {
  persistMemoryCapture,
  logEvent,
  getRecentPages,
  type ConfidenceTag,
  type MemoryEventRecord
} from '@data/index';
import { requestResponses } from './gpt5-client';
import type { ContentCapturePayload, ContentScriptMessage } from '@/types/capture';
import type { BackgroundRequest, BackgroundResponse } from '@/types/background';

chrome.runtime.onInstalled.addListener(() => {
  console.info('Semantic Memory background worker installed.');
});

const activeTabs = new Map<number, { startedAt: string; url: string; title: string }>();

const MAX_CONTEXT_CHARS = 1600;

const buildPromptContext = async (prompt: string) => {
  const pages = await getRecentPages(5);
  if (!pages.length) {
    return {
      prompt,
      contextText: '',
      contextPages: [] as Array<{ id: string; title: string }>
    };
  }

  const contextPieces: string[] = [];
  const contextPages: Array<{ id: string; title: string }> = [];
  let remaining = MAX_CONTEXT_CHARS;

  for (const page of pages) {
    const summary = (page.summary && page.summary.trim()) || page.rawText.replace(/\s+/g, ' ').slice(0, 400);
    const snippet = summary.slice(0, Math.min(remaining, 400));
    if (!snippet) continue;
    contextPieces.push(`- ${page.title}: ${snippet}`);
    remaining -= snippet.length;
    contextPages.push({ id: page.id, title: page.title });
    if (remaining <= 0) break;
  }

  const contextText = contextPieces.join('');
  return { prompt, contextText, contextPages } as const;
};

const inferConfidenceTags = (payload: ContentCapturePayload): ConfidenceTag[] => {
  const tags = new Set<ConfidenceTag>();
  if (payload.highlights.length) tags.add('highlighted');
  if (payload.reasons.includes('quick_glance')) tags.add('quick_glance');
  if (payload.reasons.includes('beforeunload') || payload.reasons.includes('pagehide')) {
    tags.add('window_closed');
  }
  if (payload.readingTimeSeconds > 180 && payload.scrollDepth > 0.6) {
    tags.add('manual_remember');
  }
  return Array.from(tags);
};

const buildEvents = (
  payload: ContentCapturePayload,
  tabId: number,
  sessionId?: string
): Array<Omit<MemoryEventRecord, 'id'>> => {
  const events: Array<Omit<MemoryEventRecord, 'id'>> = [];

  events.push({
    type: 'tab_open',
    timestamp: payload.startedAt,
    pageId: undefined,
    sessionId,
    payload: { url: payload.url, title: payload.title, tabId }
  });

  events.push({
    type: 'scroll_sample',
    timestamp: payload.finishedAt,
    pageId: undefined,
    sessionId,
    payload: { depth: payload.scrollDepth }
  });

  if (payload.highlights.length) {
    events.push({
      type: 'highlight_added',
      timestamp: payload.finishedAt,
      pageId: undefined,
      sessionId,
      payload: { highlights: payload.highlights }
    });
  }

  if (payload.reasons.includes('beforeunload') || payload.reasons.includes('pagehide')) {
    events.push({
      type: 'tab_close',
      timestamp: payload.finishedAt,
      pageId: undefined,
      sessionId,
      payload: { reasons: payload.reasons }
    });
  }

  return events;
};

const SYSTEM_PROMPT = `You are Semantic Memory, a local-first assistant. Answer the user's question using the provided context from their browsing history. Be concise, cite page titles when relevant, and prefer summaries over verbatim quotes.`;

const handleQuery = async (prompt: string) => {
  const { contextText, contextPages } = await buildPromptContext(prompt);
  const composedPrompt = contextText
    ? `${SYSTEM_PROMPT}

Context:
${contextText}

User question: ${prompt}`
    : `${SYSTEM_PROMPT}

No context available yet. User question: ${prompt}`;

  const response = await requestResponses({
    prompt: composedPrompt,
    stream: false,
    temperature: 0.2,
    context: {
      pageIds: contextPages.map((page) => page.id),
      textSnippets: contextText ? contextText.split('\n') : []
    }
  });

  return { response, contextPages } as const;
};

const handleCapture = async (payload: ContentCapturePayload, sender: chrome.runtime.MessageSender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    throw new Error('Missing tab ID for capture.');
  }

  const windowId = sender.tab?.windowId;
  const tabGroupId = sender.tab?.groupId;

  const chunks = chunkText(payload.text).map((chunk) => ({
    order: chunk.order,
    text: chunk.text,
    tokenCount: chunk.tokenCount
  }));

  const tags = inferConfidenceTags(payload);

  const pageId = await persistMemoryCapture({
    page: {
      url: payload.url,
      title: payload.title || sender.tab?.title || payload.url,
      canonicalUrl: payload.canonicalUrl,
      capturedAt: payload.startedAt,
      lastInteractionAt: payload.finishedAt,
      closedAt: payload.reasons.includes('beforeunload') || payload.reasons.includes('pagehide')
        ? payload.finishedAt
        : undefined,
      rawText: payload.text,
      summary: undefined,
      snapshotPath: undefined,
      topicLabel: undefined,
      confidenceTags: tags,
      windowId,
      tabId,
      tabGroupId: typeof tabGroupId === 'number' && tabGroupId >= 0 ? String(tabGroupId) : undefined
    },
    chunks,
    events: buildEvents(payload, tabId)
  });

  return pageId;
};

chrome.runtime.onMessage.addListener((message: ContentScriptMessage | BackgroundRequest, sender, sendResponse) => {
  if (!message?.type) return;

  if (message.type === 'semantic-memory:init') {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) {
      activeTabs.set(tabId, {
        startedAt: message.payload.startedAt,
        url: message.payload.url,
        title: message.payload.title
      });
    }
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'semantic-memory:query') {
    void handleQuery(message.prompt)
      .then(({ response, contextPages }) => {
        const payload: BackgroundResponse = {
          type: 'semantic-memory:query:success',
          data: {
            text: response.text,
            tokensEstimated: response.tokensEstimated,
            contextPages
          }
        };
        sendResponse(payload);
      })
      .catch((error: unknown) => {
        const payload: BackgroundResponse = {
          type: 'semantic-memory:query:error',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        sendResponse(payload);
      });
    return true;
  }

  if (message.type === 'semantic-memory:capture') {
    void handleCapture(message.payload, sender)
      .then(async (pageId) => {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
          activeTabs.delete(tabId);
        }
        await logEvent({
          type: 'manual_capture',
          timestamp: message.payload.finishedAt,
          pageId,
          payload: { reason: message.payload.reasons, scrollDepth: message.payload.scrollDepth }
        });
        sendResponse({ ok: true, pageId });
      })
      .catch((error: unknown) => {
        console.error('[SemanticMemory] persist failed', error);
        sendResponse({ ok: false, error: (error as Error).message });
      });
    return true;
  }
});
