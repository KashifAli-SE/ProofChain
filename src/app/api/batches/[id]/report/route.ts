import { supabase } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const { id } = params;

  const { data, error } = await supabase
    .from('verification_runs')
    .select(
      `
      id,
      batch_id,
      run_number,
      status,
      error_code,
      findings,
      carbon_result,
      audit_report,
      recommendation_ceiling,
      ai_recommendation,
      created_at,
      completed_at
    `
    )
    .eq('batch_id', id)
    .order('run_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return fail('INTERNAL', error.message, 500);
  }

  if (!data) {
    return fail('NOT_FOUND', 'No verification run found for this batch', 404);
  }

  return ok(data);
}
