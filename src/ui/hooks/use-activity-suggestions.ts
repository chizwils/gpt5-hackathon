import { useEffect, useState } from 'react';
import { db } from '@data';

interface ActivitySuggestion {
  text: string;
  category: 'recent' | 'highlights' | 'forms' | 'domains' | 'topics';
}

const callOpenAI = async (prompt: string): Promise<string> => {
  try {
    const response = await fetch('http://localhost:8000/api/openai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates concise, relevant questions based on browsing history. Generate exactly 3 questions that would be useful for exploring the provided browsing data. Each question should be under 60 characters and start with an action word like "Show", "Find", "What", "How", "Summarize", etc.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 200
      }),
    });

    if (!response.ok) {
      throw new Error('OpenAI API call failed');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('[SemanticMemory] OpenAI API call failed:', error);
    throw error;
  }
};

export const useActivitySuggestions = () => {
  const [suggestions, setSuggestions] = useState<ActivitySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const generateSuggestions = async () => {
      try {
        setIsLoading(true);
        
        // Get recent timeline entries
        const recentEntries = await db.timeline
          .orderBy('createdAt')
          .reverse()
          .limit(15)
          .toArray();

        // Get recent pages
        const recentPages = await db.pages
          .orderBy('capturedAt')
          .reverse()
          .limit(10)
          .toArray();

        // Build context for OpenAI
        const pageContext = recentPages.map(page => ({
          title: page.title,
          url: new URL(page.url).hostname.replace('www.', ''),
          capturedAt: page.capturedAt
        }));

        const activityContext = recentEntries.map(entry => ({
          type: entry.type,
          title: entry.title,
          createdAt: entry.createdAt
        }));

        // Create prompt for OpenAI
        const prompt = `Based on this browsing history data, suggest 3 relevant questions:

Recent Pages:
${pageContext.map(p => `- ${p.title} (${p.url})`).join('\n')}

Recent Activity:
${activityContext.map(a => `- ${a.type}: ${a.title}`).join('\n')}

Please provide exactly 3 concise questions (under 60 chars each) that would help explore this data. Format as a numbered list.`;

        try {
          // Try to get OpenAI-powered suggestions
          const aiResponse = await callOpenAI(prompt);
          const suggestions = aiResponse
            .split('\n')
            .filter(line => line.match(/^\d+\./))
            .map(line => line.replace(/^\d+\.\s*/, '').trim())
            .filter(suggestion => suggestion.length > 0 && suggestion.length <= 80)
            .slice(0, 3);

          if (suggestions.length >= 2) {
            const activitySuggestions: ActivitySuggestion[] = suggestions.map((text, index) => {
              // Categorize based on content
              let category: ActivitySuggestion['category'] = 'recent';
              
              if (text.toLowerCase().includes('highlight')) {
                category = 'highlights';
              } else if (text.toLowerCase().includes('form')) {
                category = 'forms';
              } else if (pageContext.length > 0 && text.toLowerCase().includes(pageContext[0].url.toLowerCase())) {
                category = 'domains';
              } else if (text.toLowerCase().includes('topic') || text.toLowerCase().includes('about')) {
                category = 'topics';
              }

              return { text, category };
            });

            setSuggestions(activitySuggestions);
            return;
          }
        } catch (error) {
          console.warn('[SemanticMemory] Failed to get AI suggestions, falling back to static ones');
        }

        // Fallback to rule-based suggestions
        const activitySuggestions: ActivitySuggestion[] = [];

        // Recent activity based suggestions
        if (recentEntries.length > 0) {
          activitySuggestions.push({
            text: 'Summarize my recent activity',
            category: 'recent'
          });
        }

        // Highlight-based suggestions
        const highlightEntries = recentEntries.filter(entry => entry.type === 'highlight');
        if (highlightEntries.length > 0) {
          activitySuggestions.push({
            text: 'What did I highlight recently?',
            category: 'highlights'
          });
        }

        // Domain-based suggestions from recent pages
        const domains = new Map<string, number>();
        recentPages.forEach(page => {
          try {
            const domain = new URL(page.url).hostname.replace('www.', '');
            domains.set(domain, (domains.get(domain) || 0) + 1);
          } catch {
            // Skip invalid URLs
          }
        });

        const topDomain = Array.from(domains.entries())
          .sort(([, a], [, b]) => b - a)[0];
        
        if (topDomain && topDomain[1] > 1) {
          activitySuggestions.push({
            text: `Show pages from ${topDomain[0]}`,
            category: 'domains'
          });
        }

        // Add generic suggestions if we don't have enough
        if (activitySuggestions.length < 3) {
          const genericSuggestions = [
            { text: 'Show my browsing patterns', category: 'recent' as const },
            { text: 'What did I research today?', category: 'topics' as const },
            { text: 'Find pages I spent time on', category: 'recent' as const }
          ];
          
          genericSuggestions.forEach(suggestion => {
            if (activitySuggestions.length < 3 && !activitySuggestions.some(s => s.text === suggestion.text)) {
              activitySuggestions.push(suggestion);
            }
          });
        }

        setSuggestions(activitySuggestions.slice(0, 3));
      } catch (error) {
        console.error('[SemanticMemory] Failed to generate activity suggestions:', error);
        // Final fallback suggestions
        setSuggestions([
          { text: 'Summarize the last 24h', category: 'recent' },
          { text: 'Show my browsing patterns', category: 'recent' },
          { text: 'What did I research today?', category: 'recent' }
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    generateSuggestions();

    // Refresh suggestions every 5 minutes
    const interval = setInterval(generateSuggestions, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return { suggestions, isLoading };
};