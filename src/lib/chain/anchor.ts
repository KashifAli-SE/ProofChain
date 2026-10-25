// Idempotent Sepolia anchoring of a review decision's record hash.
// Server-only. Never import from client components.
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  type ContractTransactionResponse,
  type TransactionReceipt,
} from 'ethers';
import { REGISTRY_ABI } from '@/lib/chain/abi';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase/server';
import { appendAudit } from '@/lib/audit/log';
import { batchIdHash } from '@/lib/hash/record';
import { statusToChain, type Status } from '@/lib/status';

export interface AnchorResult {
  id: string;
  chain_id: number;
  contract_address: string;
  transaction_hash: string;
  record_hash: string;
  block_number: number;
  created_at: string;
  explorer_url: string;
}

interface BlockchainRow {
  id: string;
  chain_id: number;
  contract_address: string;
  transaction_hash: string;
  record_hash: string;
  block_number: number;
  created_at: string;
}

interface ReviewDecisionRow {
  id: string;
  batch_id: string;
  decision: string;
  record_hash: string;
  decided_at: string;
  verification_run_id: string;
}

const BC_FIELDS =
  'id, chain_id, contract_address, transaction_hash, record_hash, block_number, created_at';

function anchorError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

function explorerUrlFor(txHash: string): string {
  return `${env.EXPLORER_BASE_URL}/tx/${txHash}`;
}

/**
 * Race a transaction's `wait()` against a timeout. On timeout, poll the
 * provider for a receipt for a short window before giving up. This preserves
 * idempotency against the contract's `DuplicateRecord` revert: if the tx mined
 * just after the timeout, the recovery poll finds the receipt and we still
 * persist the row.
 */
async function waitForOneConfirmation(
  provider: JsonRpcProvider,
  tx: ContractTransactionResponse,
  timeoutMs: number
): Promise<TransactionReceipt> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(Object.assign(new Error('Confirmation timed out'), { code: 'TIMEOUT' })),
      timeoutMs
    );
  });

  try {
    const receipt = await Promise.race([tx.wait(1), timeout]);
    if (!receipt) {
      // tx was dropped/replaced before it could be confirmed.
      throw new Error('Transaction was dropped before confirmation');
    }
    return receipt;
  } catch (err) {
    if ((err as { code?: string }).code !== 'TIMEOUT') {
      // A real failure from wait() (revert, replacement, etc.) — propagate.
      throw err;
    }
    // Timed out waiting: poll for a short window in case it mines just after.
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (receipt) return receipt;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw Object.assign(new Error('Confirmation timed out'), { code: 'TIMEOUT' });
  }
}

/**
 * Anchor a review decision's record hash to the Sepolia registry contract.
 * Idempotent: if a blockchain record already exists for the decision, it is
 * returned without sending a new transaction. On any failure, the batch status
 * is never changed and an `anchor_failed` audit entry is written.
 */
export async function anchorDecision(decisionId: string): Promise<AnchorResult> {
  // (a) Load the review decision.
  const { data: decision, error: decError } = await supabase
    .from('review_decisions')
    .select('id, batch_id, decision, record_hash, decided_at, verification_run_id')
    .eq('id', decisionId)
    .maybeSingle();

  if (decError || !decision) {
    throw anchorError('Review decision not found', 'NO_DECISION');
  }

  const decisionRow = decision as ReviewDecisionRow;

  // (b) Idempotency — return an existing blockchain record without re-anchoring.
  const { data: existing } = await supabase
    .from('blockchain_records')
    .select(BC_FIELDS)
    .eq('review_decision_id', decisionId)
    .maybeSingle();

  if (existing) {
    const row = existing as BlockchainRow;
    return { ...row, explorer_url: explorerUrlFor(row.transaction_hash) };
  }

  // (c) Load the batch for the batch code.
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('batch_code')
    .eq('id', decisionRow.batch_id)
    .single();

  if (batchError || !batch) {
    throw anchorError('Review decision not found', 'NO_DECISION');
  }

  // (d) Compute the on-chain parameters.
  const batchId = batchIdHash(batch.batch_code);
  const recordHash = decisionRow.record_hash;
  const statusEnum = statusToChain(decisionRow.decision as Status);

  // (e) Build provider/wallet/contract inside the function (no module-level
  // instances) so build-time page-data collection does not fail without .env.
  const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL);
  const wallet = new Wallet(env.RECORDER_PRIVATE_KEY, provider);
  const contract = new Contract(env.REGISTRY_ADDRESS, REGISTRY_ABI, wallet);

  // (f) Send the transaction.
  let tx: ContractTransactionResponse;
  try {
    tx = await contract.recordVerification(batchId, recordHash, statusEnum);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A DuplicateRecord revert means a prior attempt already recorded this on
    // chain. Re-check the DB (concurrent anchoring race) before failing.
    if (message.includes('DuplicateRecord')) {
      const { data: raced } = await supabase
        .from('blockchain_records')
        .select(BC_FIELDS)
        .eq('review_decision_id', decisionId)
        .maybeSingle();
      if (raced) {
        const row = raced as BlockchainRow;
        return { ...row, explorer_url: explorerUrlFor(row.transaction_hash) };
      }
    }
    await appendAudit(decisionRow.batch_id, 'anchor_failed', {
      review_decision_id: decisionId,
      transaction_hash: null,
      error: message,
    });
    throw anchorError('Could not reach the blockchain network', 'CHAIN_UNAVAILABLE');
  }

  // (g) Wait for one confirmation with a 60s timeout (+ short recovery poll).
  let receipt: TransactionReceipt;
  try {
    receipt = await waitForOneConfirmation(provider, tx, 60000);
  } catch (err) {
    await appendAudit(decisionRow.batch_id, 'anchor_failed', {
      review_decision_id: decisionId,
      transaction_hash: tx.hash,
      error: err instanceof Error ? err.message : String(err),
    });
    throw anchorError('Anchor failed', 'ANCHOR_FAILED');
  }

  // A reverted transaction is a failure.
  if (receipt.status !== 1) {
    await appendAudit(decisionRow.batch_id, 'anchor_failed', {
      review_decision_id: decisionId,
      transaction_hash: receipt.hash,
      error: 'Transaction reverted on chain',
    });
    throw anchorError('Anchor failed: transaction reverted', 'ANCHOR_FAILED');
  }

  // (i) Persist the blockchain record.
  const { data: inserted, error: insertError } = await supabase
    .from('blockchain_records')
    .insert({
      review_decision_id: decisionId,
      chain_id: env.CHAIN_ID,
      contract_address: env.REGISTRY_ADDRESS,
      transaction_hash: receipt.hash,
      record_hash: recordHash,
      block_number: receipt.blockNumber,
    })
    .select(BC_FIELDS)
    .single();

  if (insertError || !inserted) {
    console.error('[anchor] blockchain_records insert failed:', insertError);
    await appendAudit(decisionRow.batch_id, 'anchor_failed', {
      review_decision_id: decisionId,
      transaction_hash: receipt.hash,
      error: 'Failed to save blockchain record',
    });
    throw anchorError('Failed to save blockchain record', 'INTERNAL');
  }

  // (j) Audit the success.
  await appendAudit(decisionRow.batch_id, 'anchor_recorded', {
    review_decision_id: decisionId,
    transaction_hash: receipt.hash,
    block_number: receipt.blockNumber,
  });

  // (k) Return the persisted row plus the explorer URL.
  const row = inserted as BlockchainRow;
  return { ...row, explorer_url: explorerUrlFor(receipt.hash) };
}
