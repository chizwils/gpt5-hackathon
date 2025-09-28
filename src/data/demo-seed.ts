import { persistMemoryCapture, createId } from './memory-service';
import type { ConfidenceTag } from './schema';

const loremSummary = `Local-first capture of GDPR enforcement resources including orange fine chart, EU regulators roundup, and compliance playbook.`;

export const seedDemoData = async () => {
  const captureTime = new Date().toISOString();
  const pageId = await persistMemoryCapture({
    page: {
      id: createId(),
      url: 'https://example.com/articles/gdpr-fines-chart',
      title: 'GDPR Fines: 2023 Enforcement Overview',
      canonicalUrl: 'https://example.com/articles/gdpr-fines-chart',
      capturedAt: captureTime,
      rawText:
        'European regulators imposed record GDPR fines in 2023 with Spain and Italy driving a €2.6B total. This chart visualises quarterly penalties by country.',
      summary: loremSummary,
      snapshotPath: 'memory://snapshots/gdpr-fines-chart.png',
      confidenceTags: ['manual_remember', 'highlighted'] satisfies ConfidenceTag[],
      topicLabel: 'EU Privacy Enforcement',
      sessionId: 'demo-session',
      windowId: 1,
      tabId: 10,
      tabGroupId: 'privacy-research',
      visitCount: 1,
      lastInteractionAt: captureTime
    },
    chunks: [
      {
        order: 0,
        text: 'Overview of GDPR fines in 2023 with a focus on cumulative totals reaching €2.6B.',
        tokenCount: 32,
        embeddingModel: 'minilm-l12-v2'
      },
      {
        order: 1,
        text: 'Spain and Italy surged in enforcement, overtaking France for the first time. Chart highlights quarterly growth.',
        tokenCount: 41,
        embeddingModel: 'minilm-l12-v2'
      }
    ],
    events: [
      {
        type: 'tab_open',
        timestamp: captureTime,
        payload: { source: 'search', query: 'orange chart GDPR fines' }
      },
      {
        type: 'scroll_sample',
        timestamp: captureTime,
        payload: { depth: 0.8 }
      },
      {
        type: 'highlight_added',
        timestamp: captureTime,
        payload: { text: 'cumulative GDPR fines reaching €2.6B' }
      },
      {
        type: 'tab_close',
        timestamp: captureTime,
        payload: { action: 'close_to_right' }
      }
    ],
    session: {
      id: 'demo-session',
      title: 'GDPR Enforcement Research',
      origin: 'bulk_close',
      startedAt: captureTime,
      pageIds: ['demo-1', pageId],
      confidenceScore: 0.92,
      topicLabel: 'EU Privacy Enforcement'
    }
  });

  return pageId;
};
