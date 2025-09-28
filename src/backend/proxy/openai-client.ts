import OpenAI from 'openai';

let cachedClient: OpenAI | null = null;

export const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('[OpenAI] API Key present:', !!apiKey, 'Length:', apiKey?.length || 0);
  console.log('[OpenAI] Environment keys:', Object.keys(process.env).filter(k => k.includes('OPENAI')));
  if (!apiKey) {
    console.log('[OpenAI] No API key found, returning null');
    return null;
  }
  if (!cachedClient) {
    console.log('[OpenAI] Creating new OpenAI client...');
    cachedClient = new OpenAI({ apiKey });
    console.log('[OpenAI] Client created successfully');
  }
  return cachedClient;
};
