import { chunkText } from './chunker';
import {
  persistMemoryCapture,
  logEvent,
  getRecentPages,
  db,
  recordTimelineEntry,
  type ConfidenceTag,
  type MemoryEventRecord
} from '@data';
import { requestResponsesStream } from './gpt5-client';
import { registerBehaviourObservers } from './behaviour-observer';
import { registerDownloadObserver } from './download-observer';
import { runSessionAggregation } from './recap-aggregator';
import type { ContentCapturePayload, ContentScriptMessage } from '@/types/capture';
import type { BackgroundRequest, BackgroundPush } from '@/types/background';
import { getCachedDailySummary } from './daily-summary-service';
import { analyzeContentWithGPT5 } from '@data/content-analysis';
import type { EmbeddingResponse } from '@/workers/embedding-worker';

declare global {
  interface Window {
    semanticMemory?: {
      getPage?: (id: string) => Promise<any> | any;
    };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.info('Semantic Memory background worker installed.');
});

// Handle action button click to toggle overlay
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'semantic-memory:toggle-overlay'
    });
  } catch (error) {
    console.warn('[SemanticMemory] Content script not responding. This may happen on certain pages (e.g., chrome://, extension pages, or pages with strict CSP). Try refreshing the page or using the keyboard shortcut instead.', error);
  }
});

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'semantic-memory.close-tabs-to-right') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab.id === undefined) return;
    
    try {
      await chrome.tabs.sendMessage(activeTab.id, {
        type: 'semantic-memory:toggle-overlay'
      });
    } catch (error) {
      console.warn('[SemanticMemory] Failed to toggle overlay via command:', error);
    }
  }
});

registerBehaviourObservers();
registerDownloadObserver();
runSessionAggregation().catch((error) => console.warn('recap aggregation failed', error));
setInterval(() => {
  runSessionAggregation().catch((error) => console.warn('recap aggregation failed', error));
}, 1000 * 60 * 30);

const VECTOR_DIM = 256;

const generateEmbeddingLocal = (text: string) => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text.toLowerCase());
  const buckets = new Array<number>(VECTOR_DIM).fill(0);

  for (let i = 0; i < bytes.length; i += 3) {
    let hash = 2166136261;
    for (let j = i; j < Math.min(i + 3, bytes.length); j += 1) {
      hash ^= bytes[j];
      hash = Math.imul(hash, 16777619);
    }
    const index = Math.abs(hash) % VECTOR_DIM;
    buckets[index] += 1;
  }

  const norm = Math.sqrt(buckets.reduce((sum, value) => sum + value * value, 0) || 1);
  return buckets.map((value) => Number((value / norm).toFixed(6)));
};

const embeddingWorker = typeof Worker !== 'undefined'
  ? new Worker(new URL('../workers/embedding-worker.ts', import.meta.url), { type: 'module' })
  : null;

const pendingEmbeddings = new Map<string, (embedding: number[]) => void>();

if (embeddingWorker) {
  embeddingWorker.addEventListener('message', (event: MessageEvent<EmbeddingResponse>) => {
    const { id, embedding } = event.data;
    const resolver = pendingEmbeddings.get(id);
    if (resolver) {
      resolver(embedding);
      pendingEmbeddings.delete(id);
    }
  });
}

const computeEmbedding = (text: string) => {
  if (!text.trim()) return Promise.resolve(new Array<number>(VECTOR_DIM).fill(0));

  if (!embeddingWorker) {
    return Promise.resolve(generateEmbeddingLocal(text));
  }

  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

  return new Promise<number[]>((resolve) => {
    pendingEmbeddings.set(id, resolve);
    embeddingWorker.postMessage({ id, text });
  });
};

const activeTabs = new Map<number, { startedAt: string; url: string; title: string }>();

const MAX_CONTEXT_CHARS = 1600;
const MAX_CONTEXT_ENTRIES = 8;
const MAX_CHUNKS_TO_SCORE = 400;

const cosineSimilarity = (a: number[], b: number[]) => {
  if (!a.length || !b.length) return 0;
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA || 1) * Math.sqrt(normB || 1);
  return denom === 0 ? 0 : dot / denom;
};

const buildPromptContext = async (prompt: string) => {
  const questionEmbedding = await computeEmbedding(prompt);

  const candidateChunks = await db.chunks
    .filter((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0)
    .limit(MAX_CHUNKS_TO_SCORE)
    .toArray();

  const scoredChunks = candidateChunks
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(questionEmbedding, chunk.embedding ?? [])
    }))
    .filter(({ score }) => Number.isFinite(score) && score > 0.08)
    .sort((a, b) => b.score - a.score);

  const topChunks = scoredChunks.slice(0, MAX_CONTEXT_ENTRIES);
  const pageIds = Array.from(new Set(topChunks.map(({ chunk }) => chunk.pageId)));
  const pages = await db.pages.bulkGet(pageIds);
  const pageMap = new Map<string, (typeof pages)[number]>();
  pageIds.forEach((id, index) => {
    const page = pages[index];
    if (page) pageMap.set(id, page);
  });

  const contextPieces: string[] = [];
  const contextPages: Array<{ id: string; title: string }> = [];
  const contextSummaries: Array<{ id: string; title: string; snippet: string }> = [];
  let remaining = MAX_CONTEXT_CHARS;

  const normalise = (value: string) => value.replace(/\s+/g, ' ').trim();

  for (const { chunk } of topChunks) {
    const page = pageMap.get(chunk.pageId);
    if (!page) continue;
    const snippet = normalise(chunk.text).slice(0, 400);
    if (!snippet) continue;
    const line = `- ${page.title}: ${snippet}`;
    if (line.length > remaining) break;
    remaining -= line.length;
    contextPieces.push(line);
    if (!contextPages.some((entry) => entry.id === page.id)) {
      contextPages.push({ id: page.id, title: page.title });
    }
    contextSummaries.push({ id: page.id, title: page.title, snippet });
  }

  if (!contextPieces.length) {
    const fallbackPages = await getRecentPages(5);
    for (const page of fallbackPages) {
      const summary = (page.summary && page.summary.trim()) || page.rawText.replace(/\s+/g, ' ').slice(0, 400);
      const snippet = summary.slice(0, Math.min(remaining, 400));
      if (!snippet) continue;
      contextPieces.push(`- ${page.title}: ${snippet}`);
      contextPages.push({ id: page.id, title: page.title });
      contextSummaries.push({ id: page.id, title: page.title, snippet });
      remaining -= snippet.length;
      if (remaining <= 0) break;
    }
  }

  const contextText = contextPieces.join('\n');
  return { prompt, contextText, contextPages, contextSummaries } as const;
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
  if (payload.formEvents?.length) {
    tags.add('form_in_progress');
  }
  if (payload.pipEvents?.some((event) => event.type === 'enter')) {
    tags.add('media_session');
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

  if (payload.formEvents?.length) {
    for (const formEvent of payload.formEvents) {
      events.push({
        type: formEvent.type === 'submit' ? 'form_submit' : 'form_start',
        timestamp: formEvent.timestamp,
        pageId: undefined,
        sessionId,
        payload: {
          formId: formEvent.formId,
          action: formEvent.action,
          fieldCount: formEvent.fieldCount
        }
      });
    }
  }

  if (payload.pipEvents?.length) {
    for (const pipEvent of payload.pipEvents) {
      events.push({
        type: pipEvent.type === 'enter' ? 'pip_enter' : 'pip_leave',
        timestamp: pipEvent.timestamp,
        pageId: undefined,
        sessionId,
        payload: {
          mediaType: pipEvent.mediaType
        }
      });
    }
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

const SYSTEM_PROMPT = `You are Semantic Memory, a friendly assistant that helps people remember what they were browsing.

Your job is simple: help users quickly recall their browsing activity in a natural, conversational way. Be like a helpful friend who was looking over their shoulder.

Guidelines:
- Keep responses short and casual (2-3 sentences)
- Focus on what they actually looked at, not deep psychological analysis
- Use friendly, everyday language
- Help them feel confident about closing tabs by summarizing what they found
- Only mention patterns if they're obvious and helpful
- Skip the academic analysis - just be helpful and clear

Remember: People just want to remember "what was I looking at?" and "is it safe to close this tab?"`;

const pushMessage = (message: BackgroundPush) => {
  try {
    void chrome.runtime.sendMessage(message);
  } catch (error) {
    console.warn('[SemanticMemory] push message failed', error);
  }
};

const handleQueryStream = async ({ prompt, threadId, assistantMessageId }: Extract<BackgroundRequest, { type: 'semantic-memory:query' }>) => {
  try {
    const { contextText, contextPages, contextSummaries } = await buildPromptContext(prompt);
    
    // Filter context to only include truly relevant sources
    const relevantSummaries = contextSummaries.filter(summary => {
      const queryLower = prompt.toLowerCase();
      const titleLower = summary.title.toLowerCase();
      const snippetLower = summary.snippet.toLowerCase();
      
      // Extract key terms from the query
      const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
      
      // Check if the content is actually relevant to the query
      return queryTerms.some(term => 
        titleLower.includes(term) || snippetLower.includes(term)
      );
    });
    
    const composedPrompt = contextText
      ? `${SYSTEM_PROMPT}

Context (${relevantSummaries.length} relevant sources):
${contextText}

User question: ${prompt}`
      : `${SYSTEM_PROMPT}

No context available yet. User question: ${prompt}`;

    await requestResponsesStream(
      {
        prompt: composedPrompt,
        stream: true,
        context: {
          pageIds: contextPages.map((page) => page.id),
          textSnippets: contextText ? contextText.split('\n') : []
        }
      },
      {
        onData: (delta) => {
          pushMessage({
            type: 'semantic-memory:query:chunk',
            threadId,
            assistantMessageId,
            delta
          });
        },
        onDone: (summary) => {
          pushMessage({
            type: 'semantic-memory:query:done',
            threadId,
            assistantMessageId,
            text: summary?.text ?? '',
            tokensEstimated: summary?.tokensEstimated,
            contextPages,
            contextItems: relevantSummaries
          });
        },
        onError: (error) => {
          pushMessage({
            type: 'semantic-memory:query:error',
            threadId,
            assistantMessageId,
            error: error.message
          });
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    pushMessage({
      type: 'semantic-memory:query:error',
      threadId,
      assistantMessageId,
      error: message
    });
  }
};

const handleCapture = async (payload: ContentCapturePayload, sender: chrome.runtime.MessageSender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    throw new Error('Missing tab ID for capture.');
  }

  const windowId = sender.tab?.windowId;
  const tabGroupId = sender.tab?.groupId;

  const chunkOutputs = chunkText(payload.text);
  const embeddings = await Promise.all(chunkOutputs.map((chunk) => computeEmbedding(chunk.text)));
  const chunks = chunkOutputs.map((chunk, index) => ({
    order: chunk.order,
    text: chunk.text,
    tokenCount: chunk.tokenCount,
    embedding: embeddings[index]
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

  // Perform intelligent content analysis with GPT-5
  try {
    const contentAnalysis = await analyzeContentWithGPT5(
      payload.url,
      payload.title || sender.tab?.title || payload.url,
      payload.text
    );
    
    // Store the analysis
    contentAnalysis.pageId = pageId;
    await db.contentAnalyses.add(contentAnalysis);
    
    console.log('[SemanticMemory] GPT-5 content analysis completed:', {
      pageId,
      contentType: contentAnalysis.contentType,
      primaryTopic: contentAnalysis.primaryTopic,
      quality: contentAnalysis.contentQuality
    });
  } catch (error) {
    console.warn('[SemanticMemory] GPT-5 content analysis failed:', error);
  }

  if (payload.highlights.length) {
    const highlights = payload.highlights.slice(0, 3);
    for (const highlight of highlights) {
      await recordTimelineEntry({
        type: 'highlight',
        title: `Highlighted on ${payload.title || sender.tab?.title || payload.url}`,
        description: highlight.text,
        tags: ['highlight'],
        relatedPageIds: [pageId],
        metadata: { url: payload.url, highlight: highlight.text }
      });
    }
  }

  if (payload.formEvents.length) {
    const submitted = payload.formEvents.filter((event) => event.type === 'submit');
    if (submitted.length) {
      await recordTimelineEntry({
        type: 'form_activity',
        title: submitted.length === 1 ? 'Submitted a form' : `Submitted ${submitted.length} forms`,
        description: payload.title,
        tags: ['form'],
        relatedPageIds: [pageId],
        metadata: { forms: submitted.slice(0, 3) }
      });
    } else {
      await recordTimelineEntry({
        type: 'form_activity',
        title: 'Interacted with a form',
        description: payload.title,
        tags: ['form'],
        relatedPageIds: [pageId],
        metadata: { forms: payload.formEvents.slice(0, 3) }
      });
    }
  }

  if (payload.pipEvents.some((event) => event.type === 'enter')) {
    await recordTimelineEntry({
      type: 'media_activity',
      title: 'Opened Picture-in-Picture',
      description: payload.title,
      tags: ['pip', 'media'],
      relatedPageIds: [pageId],
      metadata: { events: payload.pipEvents.slice(0, 4) }
    });
  }

  if (payload.incognitoContext) {
    await recordTimelineEntry({
      type: 'privacy',
      title: 'Captured from an incognito tab',
      description: payload.title,
      tags: ['incognito'],
      relatedPageIds: [pageId],
      metadata: { url: payload.url }
    });
  }

  return pageId;
};

chrome.runtime.onMessage.addListener((message: ContentScriptMessage | BackgroundRequest, sender, sendResponse) => {
  if (!message?.type) return false;

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
    return false;
  }

  if (message.type === 'semantic-memory:query') {
    const request = message;
    void handleQueryStream(request);
    sendResponse({ type: 'semantic-memory:query:accepted' });
    return false;
  }

  if (message.type === 'semantic-memory:daily-summary') {
    void getCachedDailySummary()
      .then((summary) => {
        sendResponse({ type: 'semantic-memory:daily-summary:success', summary });
      })
      .catch((error) => {
        sendResponse({ 
          type: 'semantic-memory:daily-summary:error', 
          error: error.message 
        });
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

  return false;
});
