import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { env } from '@/lib/env';

function getClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

export async function generateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  const client = getClient();

  async function attempt(prompt: string): Promise<T> {
    const response = await client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        systemInstruction: systemPrompt,
      },
    });

    const text = response.text ?? '';
    const parsed: unknown = JSON.parse(text);
    return schema.parse(parsed);
  }

  try {
    return await attempt(userPrompt);
  } catch (firstErr) {
    // Retry once on ZodError, appending the validation error message
    if (firstErr instanceof z.ZodError) {
      const retryPrompt =
        userPrompt +
        '\n\nPrevious response did not match the required schema. Validation error: ' +
        firstErr.message;
      try {
        return await attempt(retryPrompt);
      } catch (secondErr) {
        const err = new Error(
          secondErr instanceof Error ? secondErr.message : String(secondErr)
        );
        (err as NodeJS.ErrnoException).code = 'LLM_UNAVAILABLE';
        throw err;
      }
    }

    // Map network/API errors to LLM_UNAVAILABLE
    const err = new Error(
      firstErr instanceof Error ? firstErr.message : String(firstErr)
    );
    (err as NodeJS.ErrnoException).code = 'LLM_UNAVAILABLE';
    throw err;
  }
}
