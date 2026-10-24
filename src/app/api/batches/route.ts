import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/api/respond';
import { appendAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const claimSchema = z.union([
  z.object({
    claim_type: z.literal('recycled_content'),
    value: z.number().min(0).max(100),
    unit: z.literal('percent'),
  }),
  z.object({
    claim_type: z.enum(['low_carbon_manufacturing', 'certificate_provided']),
  }),
]);

const createBatchSchema = z.object({
  productName: z.string().min(1),
  supplierName: z.string().min(1),
  category: z.string().min(1).default('textile'),
  batchCode: z.string().min(1),
  productionDate: z.string().optional(),
  claims: z.array(claimSchema).default([]),
  isDemo: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('INVALID_JSON', 'Request body must be valid JSON');
  }

  const parsed = createBatchSchema.safeParse(body);
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const { productName, supplierName, category, batchCode, productionDate, claims, isDemo } =
    parsed.data;

  // Insert product
  const { data: product, error: productError } = await supabase
    .from('products')
    .insert({ product_name: productName, supplier_name: supplierName, category })
    .select('id')
    .single();

  if (productError || !product) {
    return fail('DB_ERROR', 'Failed to create product record', 500);
  }

  // Insert batch
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .insert({
      product_id: product.id,
      batch_code: batchCode,
      production_date: productionDate ?? null,
      claims,
      is_demo: isDemo,
      status: 'DRAFT',
    })
    .select('id, batch_code, status, created_at')
    .single();

  if (batchError) {
    // Supabase returns code 23505 for unique violations
    if (batchError.code === '23505') {
      return fail('BATCH_CODE_TAKEN', `Batch code '${batchCode}' is already in use`, 409);
    }
    return fail('DB_ERROR', 'Failed to create batch record', 500);
  }

  await appendAudit(batch.id, 'batch_created', { batchCode, productName, supplierName });

  return ok({ id: batch.id, batchCode: batch.batch_code, status: batch.status, createdAt: batch.created_at }, 201);
}

export async function GET() {
  const { data, error } = await supabase
    .from('batches')
    .select(
      `
      id,
      batch_code,
      status,
      is_demo,
      created_at,
      production_date,
      claims,
      products (
        product_name,
        supplier_name,
        category
      ),
      verification_runs (
        id,
        status,
        run_number,
        created_at
      )
    `
    )
    .order('created_at', { ascending: false });

  if (error) {
    return fail('DB_ERROR', 'Failed to load batches', 500);
  }

  // Attach latest run status to each batch
  const batches = (data ?? []).map((b) => {
    const runs = Array.isArray(b.verification_runs) ? b.verification_runs : [];
    const latestRun = runs.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] ?? null;
    return {
      ...b,
      latestRunStatus: latestRun?.status ?? null,
    };
  });

  return ok(batches);
}
