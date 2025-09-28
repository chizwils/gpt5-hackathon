import { db } from './db';

export interface DailySummaryData {
  totalPages: number;
  topicCounts: Array<{ topic: string; count: number; pages: string[] }>;
  readingTime: number;
  highlights: string[];
  timeRange: { start: string; end: string };
}

export const getDailySummaryData = async (date: Date = new Date()): Promise<DailySummaryData> => {
  // Get start and end of the day
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get all pages from today
  const todaysPages = await db.pages
    .where('capturedAt')
    .between(startOfDay.toISOString(), endOfDay.toISOString())
    .toArray();

  // Get timeline entries for highlights
  const todaysHighlights = await db.timelineEntries
    .where('createdAt')
    .between(startOfDay.toISOString(), endOfDay.toISOString())
    .filter(entry => entry.type === 'highlight')
    .toArray();

  // Analyze topics by grouping similar URLs/titles
  const topicMap = new Map<string, { count: number; pages: string[] }>();
  
  for (const page of todaysPages) {
    const topic = extractTopic(page.url, page.title);
    if (!topicMap.has(topic)) {
      topicMap.set(topic, { count: 0, pages: [] });
    }
    const topicData = topicMap.get(topic)!;
    topicData.count++;
    topicData.pages.push(page.title);
  }

  const topicCounts = Array.from(topicMap.entries())
    .map(([topic, data]) => ({ topic, count: data.count, pages: data.pages }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5 topics

  // Calculate total reading time (approximate)
  const totalReadingTime = todaysPages.reduce((total, page) => {
    // Estimate reading time from page length (rough calculation)
    const wordCount = page.rawText?.split(/\s+/).length || 0;
    const estimatedMinutes = Math.max(1, Math.floor(wordCount / 200)); // 200 WPM
    return total + estimatedMinutes;
  }, 0);

  return {
    totalPages: todaysPages.length,
    topicCounts,
    readingTime: totalReadingTime,
    highlights: todaysHighlights
      .map(h => h.description)
      .filter(Boolean)
      .slice(0, 3), // Top 3 highlights
    timeRange: {
      start: startOfDay.toISOString(),
      end: endOfDay.toISOString()
    }
  };
};

// Simple fallback topic extraction (will be enhanced by GPT-5 analysis)
const extractTopic = (url: string, title: string): string => {
  const domain = new URL(url).hostname.replace('www.', '');
  
  // Basic categorization - GPT-5 will provide more intelligent analysis
  if (domain.includes('github')) return 'Code Repository';
  if (domain.includes('stackoverflow')) return 'Technical Q&A';
  if (domain.includes('docs') || title.toLowerCase().includes('documentation')) return 'Documentation';
  
  // Use title as topic, limit to reasonable length
  const cleanTitle = title.replace(/[^\w\s-]/g, '').trim();
  return cleanTitle.slice(0, 50) || domain;
};