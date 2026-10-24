import { runPipeline } from '@/lib/agents/orchestrator';
import { ok, fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const { id } = params;

  try {
    const result = await runPipeline(id);
    return ok(result);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'INTERNAL';
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (code === 'RUN_IN_PROGRESS') {
      return fail(code, message, 409);
    }
    if (code === 'NO_EVIDENCE') {
      return fail(code, message, 400);
    }
    if (code === 'BATCH_NOT_FOUND') {
      return fail(code, message, 404);
    }

    return fail('INTERNAL', message, 500);
  }
}
