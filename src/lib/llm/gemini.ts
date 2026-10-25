import { z } from 'zod';
import { env } from '@/lib/env';

// ── Groq client (preferred when GROQ_API_KEY is set) ─────────────────────────
async function callGroq<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  const Groq = (await import('groq-sdk')).default;
  const client = new Groq({ apiKey: env.GROQ_API_KEY });

  // Use gpt-oss-120b — best available model on this Groq key
  const GROQ_MODEL = 'openai/gpt-oss-120b';

  async function attempt(prompt: string): Promise<T> {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? '';
    if (!text) throw new Error('Empty response from Groq');

    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed: unknown = JSON.parse(clean);
    return schema.parse(parsed);
  }

  try {
    return await attempt(userPrompt);
  } catch (firstErr) {
    if (firstErr instanceof z.ZodError) {
      const retryPrompt =
        userPrompt +
        '\n\nPrevious response did not match the required schema. Fix these fields:\n' +
        firstErr.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n') +
        '\n\nReturn valid JSON only.';
      try {
        return await attempt(retryPrompt);
      } catch (secondErr) {
        const err = new Error(secondErr instanceof Error ? secondErr.message : String(secondErr));
        (err as NodeJS.ErrnoException).code = 'LLM_UNAVAILABLE';
        throw err;
      }
    }
    const err = new Error(firstErr instanceof Error ? firstErr.message : String(firstErr));
    (err as NodeJS.ErrnoException).code = 'LLM_UNAVAILABLE';
    throw err;
  }
}

// ── Gemini client (fallback) ──────────────────────────────────────────────────
async function callGemini<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  function extractText(response: Awaited<ReturnType<InstanceType<typeof GoogleGenAI>['models']['generateContent']>>): string {
    try {
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .filter((p: { text?: string }) => typeof p.text === 'string')
        .map((p: { text?: string }) => p.text as string)
        .join('');
      if (text) return text;
    } catch { /* fall through */ }
    return response.text ?? '';
  }

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

    const text = extractText(response);
    if (!text) throw new Error('Empty response from Gemini');

    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed: unknown = JSON.parse(clean);
    return schema.parse(parsed);
  }

  try {
    return await attempt(userPrompt);
  } catch (firstErr) {
    if (firstErr instanceof z.ZodError) {
      const retryPrompt =
        userPrompt +
        '\n\nPrevious response did not match the required schema. Fix these fields:\n' +
        firstErr.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n') +
        '\n\nReturn valid JSON only.';
      try {
        return await attempt(retryPrompt);
      } catch (secondErr) {
        const err = new Error(secondErr instanceof Error ? secondErr.message : String(secondErr));
        (err as NodeJS.ErrnoException).code = 'LLM_UNAVAILABLE';
        throw err;
      }
    }
    const err = new Error(firstErr instanceof Error ? firstErr.message : String(firstErr));
    (err as NodeJS.ErrnoException).code = 'LLM_UNAVAILABLE';
    throw err;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function generateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  // Use Groq if key is available, otherwise fall back to Gemini
  if (env.GROQ_API_KEY) {
    return callGroq(systemPrompt, userPrompt, schema);
  }
  return callGemini(systemPrompt, userPrompt, schema);
}
