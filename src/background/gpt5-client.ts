import type { ResponsesRequestBody, ResponsesReplyBody, FileIndexRequestBody } from '@/backend/proxy/types';

const DEFAULT_PROXY_URL = 'http://localhost:8788';

const getProxyUrl = () => import.meta.env.VITE_GPT5_PROXY_URL ?? DEFAULT_PROXY_URL;

const jsonHeaders = {
  'Content-Type': 'application/json'
};

export const requestResponses = async (body: ResponsesRequestBody): Promise<ResponsesReplyBody> => {
  const response = await fetch(`${getProxyUrl()}/responses`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`GPT-5 proxy failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ResponsesReplyBody;
  return data;
};

export const requestFileIndexing = async (body: FileIndexRequestBody) => {
  const response = await fetch(`${getProxyUrl()}/file-search/index`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`GPT-5 file index request failed: ${response.statusText}`);
  }

  return response.json() as Promise<{ accepted: number; strategy: string; message: string }>;
};
