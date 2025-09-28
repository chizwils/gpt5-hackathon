import { getDailySummaryData, type DailySummaryData } from '@data/daily-summary';
import { db } from '@data/db';

export interface DailySummary {
  data: DailySummaryData;
  aiInsights: string;
  generatedAt: string;
}

export const generateDailySummary = async (): Promise<DailySummary> => {
  const data = await getDailySummaryData();
  
  // First, let GPT-5 intelligently analyze and categorize the content
  const enhancedData = await enhanceDataWithGPT5Analysis(data);
  
  // Then generate insights
  const prompt = buildSummaryPrompt(enhancedData);
  
  const response = await fetch('http://localhost:8788/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      stream: false,
      reasoning: { effort: "medium" },
      text: { verbosity: "medium" }
    })
  });

  if (!response.ok) {
    throw new Error(`Summary generation failed: ${response.statusText}`);
  }

  const result = await response.json();
  
  return {
    data: enhancedData,
    aiInsights: result.text || 'Unable to generate insights at this time.',
    generatedAt: new Date().toISOString()
  };
};

const enhanceDataWithGPT5Analysis = async (data: DailySummaryData): Promise<DailySummaryData> => {
  // Get recent pages for analysis
  const pages = await db.pages
    .orderBy('capturedAt')
    .reverse()
    .limit(20)
    .toArray();

  if (pages.length === 0) return data;

  // Create analysis prompt for GPT-5
  const analysisPrompt = `Analyze these web pages visited today and categorize them into meaningful research topics. Focus on the core content and purpose, not UI elements.

Pages visited:
${pages.map((page, i) => `${i + 1}. "${page.title}" - ${page.url}`).join('\n')}

Please respond with ONLY a JSON array of topics, where each topic has:
- "name": clear, descriptive topic name
- "pages": array of page numbers that belong to this topic
- "description": one sentence describing what was being researched

Example format:
[
  {
    "name": "Chrome Extension Development", 
    "pages": [1, 3, 5],
    "description": "Building browser extensions with manifest v3"
  }
]`;

  try {
    const response = await fetch('http://localhost:8788/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: analysisPrompt,
        stream: false,
        reasoning: { effort: "low" },
        text: { verbosity: "low" }
      })
    });

    if (response.ok) {
      const result = await response.json();
      const analysisText = result.text || '';
      
      // Try to parse GPT-5's JSON response
      try {
        const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const topics = JSON.parse(jsonMatch[0]);
          
          // Convert GPT-5 analysis back to our format
          const topicCounts = topics.map((topic: any) => ({
            topic: topic.name,
            count: topic.pages?.length || 0,
            pages: topic.pages?.map((pageNum: number) => pages[pageNum - 1]?.title).filter(Boolean) || []
          }));

          return {
            ...data,
            topicCounts: topicCounts.slice(0, 8) // Limit to top topics
          };
        }
      } catch (parseError) {
        console.warn('Failed to parse GPT-5 topic analysis:', parseError);
      }
    }
  } catch (error) {
    console.warn('GPT-5 topic analysis failed, using fallback:', error);
  }

  // Fallback to original data if GPT-5 analysis fails
  return data;
};

const buildSummaryPrompt = (data: DailySummaryData): string => {
  const topicsText = data.topicCounts
    .map(t => `${t.topic} (${t.count} pages)`)
    .join(', ');

  const highlightsText = data.highlights.length > 0 
    ? `Key highlights: ${data.highlights.join('; ')}`
    : 'No highlights captured today.';

  return `You're Semantic Memory, helping someone remember what they browsed today.

Today's activity:
- ${data.totalPages} pages visited, about ${data.readingTime} minutes of reading
- Main topics: ${topicsText}
- ${highlightsText}

Give a friendly, casual summary in 2-3 sentences about what they were looking at today. Focus on:
- What they spent time on
- Any obvious themes or interests
- A simple, encouraging wrap-up

Keep it conversational and helpful - like telling a friend "here's what you were up to today." No need for deep analysis or complicated insights.`;
};

// Cache daily summaries to avoid regenerating
const summaryCache = new Map<string, DailySummary>();

export const getCachedDailySummary = async (date: Date = new Date()): Promise<DailySummary> => {
  const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
  
  if (summaryCache.has(dateKey)) {
    return summaryCache.get(dateKey)!;
  }

  const summary = await generateDailySummary();
  summaryCache.set(dateKey, summary);
  
  return summary;
};