import { createParser } from 'eventsource-parser';
import type { ResponsesRequestBody, FileIndexRequestBody } from '@/backend/proxy/types';

const DEFAULT_PROXY_URL = 'http://localhost:8788';

const getProxyUrl = () => import.meta.env.VITE_GPT5_PROXY_URL ?? DEFAULT_PROXY_URL;

export interface StreamCallbacks {
  onData: (chunk: string) => void;
  onDone: (summary?: { text: string; tokensEstimated?: number }) => void;
  onError: (error: Error) => void;
}

export const requestResponsesStream = async (
  body: ResponsesRequestBody,
  callbacks: StreamCallbacks
) => {
  const response = await fetch(`${getProxyUrl()}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true })
  });

  if (!response.ok) {
    const error = new Error(`GPT-5 proxy failed: ${response.status} ${response.statusText}`);
    callbacks.onError(error);
    return;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('text/event-stream')) {
    const payload = (await response.json()) as {
      text?: string;
      tokensEstimated?: number;
    };
    const textValue = payload.text ?? '';
    if (textValue) {
      callbacks.onData(textValue);
    }
    callbacks.onDone({ text: textValue, tokensEstimated: payload.tokensEstimated });
    return;
  }

  if (!response.body) {
    const error = new Error('GPT-5 proxy returned no body for stream.');
    callbacks.onError(error);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let finalText = '';
  let tokensEstimated: number | undefined;
  let doneSent = false;

  const parser = createParser((event) => {
    if (event.type !== 'event') return;
    if (event.data === '[DONE]') {
      callbacks.onDone({ text: finalText.trim(), tokensEstimated });
      doneSent = true;
      return;
    }
    try {
      const payload = JSON.parse(event.data) as {
        text?: string;
        delta?: string;
        tokensEstimated?: number;
      };
      const chunk = payload.delta ?? payload.text ?? '';
      if (chunk) {
        finalText += chunk;
        callbacks.onData(chunk);
      }
      if (payload.tokensEstimated) {
        tokensEstimated = payload.tokensEstimated;
      }
    } catch (error) {
      console.warn('Failed to parse stream chunk', event.data, error);
    }
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value));
  }

  if (!doneSent) {
    callbacks.onDone({ text: finalText.trim(), tokensEstimated });
  }
};

export const requestFileIndexing = async (body: FileIndexRequestBody) => {
  const response = await fetch(`${getProxyUrl()}/file-search/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`GPT-5 file index request failed: ${response.statusText}`);
  }

  return response.json() as Promise<{ accepted: number; strategy: string; message: string }>;
};
