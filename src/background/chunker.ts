interface ChunkOptions {
  maxChunkSize?: number;
}

const DEFAULT_MAX_CHARS = 1200;

export const chunkText = (text: string, { maxChunkSize = DEFAULT_MAX_CHARS }: ChunkOptions = {}) => {
  if (!text.trim()) return [] as Array<{ text: string; tokenCount: number; order: number }>;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: Array<{ text: string; tokenCount: number; order: number }> = [];
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) return;
    const wordCount = trimmed.split(/\s+/).length;
    chunks.push({
      text: trimmed,
      tokenCount: Math.ceil(wordCount * 1.3),
      order: chunks.length
    });
    buffer = '';
  };

  for (const paragraph of paragraphs) {
    if ((buffer + '\n\n' + paragraph).length > maxChunkSize && buffer) {
      flush();
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }

  flush();

  if (!chunks.length) {
    const fallback = text.slice(0, maxChunkSize);
    const wordCount = fallback.split(/\s+/).length;
    chunks.push({
      text: fallback,
      tokenCount: Math.ceil(wordCount * 1.3),
      order: 0
    });
  }

  return chunks;
};
