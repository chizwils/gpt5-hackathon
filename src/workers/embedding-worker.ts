const VECTOR_DIM = 256;
const PRIME = 1099511628211n;
const OFFSET = 14695981039346656037n;

const encodeText = (text: string) => {
  const encoder = new TextEncoder();
  return encoder.encode(text.toLowerCase());
};

const hashBytes = (bytes: Uint8Array) => {
  let hash = OFFSET;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash *= PRIME;
  }
  return Number(hash & ((1n << 53n) - 1n));
};

const generateEmbedding = (text: string) => {
  const bytes = encodeText(text);
  const buckets = new Array<number>(VECTOR_DIM).fill(0);

  for (let i = 0; i < bytes.length; i += 3) {
    const slice = bytes.subarray(i, Math.min(i + 3, bytes.length));
    const hash = hashBytes(slice);
    const index = hash % VECTOR_DIM;
    buckets[index] += 1;
  }

  const norm = Math.sqrt(buckets.reduce((sum, value) => sum + value * value, 0) || 1);
  return buckets.map((value) => Number((value / norm).toFixed(6)));
};

export type EmbeddingRequest = {
  id: string;
  text: string;
};

export type EmbeddingResponse = {
  id: string;
  embedding: number[];
};

self.addEventListener('message', (event: MessageEvent<EmbeddingRequest>) => {
  const { id, text } = event.data;
  const embedding = generateEmbedding(text);
  const response: EmbeddingResponse = { id, embedding };
  postMessage(response);
});
