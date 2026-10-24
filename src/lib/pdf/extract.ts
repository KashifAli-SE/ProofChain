export interface ExtractResult {
  text: string;
  pages: number;
  hasText: boolean;
}

export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractResult> {
  if (mimeType === 'text/plain') {
    const text = buffer.toString('utf-8');
    return {
      text,
      pages: 1,
      hasText: text.trim().length > 0,
    };
  }

  if (mimeType === 'application/pdf') {
    try {
      // unpdf's extractText works with Uint8Array; use mergePages to get a single string
      const { extractText: unpdfExtract } = await import('unpdf');
      const { text, totalPages } = await unpdfExtract(new Uint8Array(buffer), {
        mergePages: true,
      });

      if (!text || text.trim().length === 0) {
        return { text: '', pages: totalPages ?? 0, hasText: false };
      }

      return { text, pages: totalPages ?? 0, hasText: true };
    } catch {
      return { text: '', pages: 0, hasText: false };
    }
  }

  return { text: '', pages: 0, hasText: false };
}
