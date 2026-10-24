import { supabase } from '@/lib/supabase/server';

export async function appendAudit(
  batchId: string | null,
  event: string,
  payload: object = {}
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    batch_id: batchId,
    event,
    payload,
  });
  if (error) {
    // Never throw — audit must not break the main path
    console.error('[audit] Failed to write audit log:', error);
  }
}
