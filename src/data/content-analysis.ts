export interface IntelligentContentAnalysis {
  id: string;
  pageId: string;
  analyzedAt: string;
  
  // Core content extraction
  mainContent: string;
  title: string;
  summary: string;
  
  // Intelligent categorization
  contentType: ContentType;
  primaryTopic: string;
  subTopics: string[];
  knowledgeDomain: KnowledgeDomain;
  
  // Semantic structure
  keyInsights: string[];
  actionableItems: string[];
  references: ContentReference[];
  codeSnippets: CodeSnippet[];
  
  // Learning context
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  learningObjectives: string[];
  prerequisites: string[];
  nextSteps: string[];
  
  // Research context
  researchPhase: 'exploration' | 'deep_dive' | 'implementation' | 'debugging' | 'optimization';
  problemSolving: ProblemContext | null;
  
  // Quality metrics
  contentQuality: number; // 0-1 score
  relevanceToUser: number; // 0-1 score
  informationDensity: number; // 0-1 score
}

export type ContentType = 
  | 'documentation'
  | 'tutorial'
  | 'code_repository'
  | 'technical_article'
  | 'reference_guide'
  | 'forum_discussion'
  | 'video_content'
  | 'news_article'
  | 'research_paper'
  | 'tool_interface'
  | 'social_media'
  | 'other';

export type KnowledgeDomain = 
  | 'software_development'
  | 'data_science'
  | 'machine_learning'
  | 'web_development'
  | 'mobile_development'
  | 'devops'
  | 'design'
  | 'business'
  | 'research'
  | 'education'
  | 'other';

export interface ContentReference {
  type: 'citation' | 'related_link' | 'dependency' | 'tool';
  title: string;
  url?: string;
  description: string;
}

export interface CodeSnippet {
  language: string;
  code: string;
  purpose: string;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface ProblemContext {
  problemStatement: string;
  solutionApproach: string;
  alternativeApproaches: string[];
  potentialIssues: string[];
}

export const analyzeContentWithGPT5 = async (
  url: string,
  title: string,
  rawContent: string
): Promise<IntelligentContentAnalysis> => {
  
  const analysisPrompt = `Analyze this web content and provide structured intelligence. Extract meaningful information while filtering UI noise.

URL: ${url}
Title: ${title}
Content: ${rawContent.slice(0, 3000)}...

Respond with ONLY a JSON object matching this exact structure:
{
  "mainContent": "cleaned meaningful content without UI elements",
  "summary": "2-3 sentence summary of core information",
  "contentType": "one of: documentation|tutorial|code_repository|technical_article|reference_guide|forum_discussion|video_content|news_article|research_paper|tool_interface|social_media|other",
  "primaryTopic": "main subject/technology discussed",
  "subTopics": ["specific", "topics", "covered"],
  "knowledgeDomain": "one of: software_development|data_science|machine_learning|web_development|mobile_development|devops|design|business|research|education|other",
  "keyInsights": ["important", "insights", "or", "facts"],
  "actionableItems": ["things", "user", "can", "do"],
  "references": [{"type": "citation|related_link|dependency|tool", "title": "ref title", "description": "what it is"}],
  "codeSnippets": [{"language": "js", "code": "snippet", "purpose": "what it does", "complexity": "simple|moderate|complex"}],
  "difficultyLevel": "beginner|intermediate|advanced|expert",
  "learningObjectives": ["what", "you", "learn"],
  "prerequisites": ["what", "you", "need", "to", "know"],
  "nextSteps": ["suggested", "follow", "up", "actions"],
  "researchPhase": "exploration|deep_dive|implementation|debugging|optimization",
  "problemSolving": null or {"problemStatement": "issue", "solutionApproach": "method", "alternativeApproaches": ["other ways"], "potentialIssues": ["watch out for"]},
  "contentQuality": 0.8,
  "relevanceToUser": 0.9,
  "informationDensity": 0.7
}

Focus on extracting value, not describing UI elements.`;

  try {
    const response = await fetch('http://localhost:8788/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: analysisPrompt,
        stream: false,
        reasoning: { effort: "medium" },
        text: { verbosity: "low" }
      })
    });

    if (response.ok) {
      const result = await response.json();
      const analysisText = result.text || '';
      
      try {
        // Extract JSON from GPT-5 response
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          
          return {
            id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            pageId: '', // Will be set by caller
            analyzedAt: new Date().toISOString(),
            ...analysis
          };
        }
      } catch (parseError) {
        console.warn('Failed to parse GPT-5 content analysis:', parseError);
      }
    }
  } catch (error) {
    console.warn('GPT-5 content analysis failed:', error);
  }

  // Fallback to basic analysis
  return createFallbackAnalysis(url, title, rawContent);
};

const createFallbackAnalysis = (
  url: string, 
  title: string, 
  rawContent: string
): IntelligentContentAnalysis => {
  const domain = new URL(url).hostname;
  
  return {
    id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    pageId: '',
    analyzedAt: new Date().toISOString(),
    mainContent: rawContent.slice(0, 1000),
    title,
    summary: `Content from ${domain}`,
    contentType: domain.includes('github') ? 'code_repository' : 'other',
    primaryTopic: title.split(' ').slice(0, 3).join(' '),
    subTopics: [],
    knowledgeDomain: 'software_development',
    keyInsights: [],
    actionableItems: [],
    references: [],
    codeSnippets: [],
    difficultyLevel: 'intermediate',
    learningObjectives: [],
    prerequisites: [],
    nextSteps: [],
    researchPhase: 'exploration',
    problemSolving: null,
    contentQuality: 0.5,
    relevanceToUser: 0.5,
    informationDensity: 0.5
  };
};