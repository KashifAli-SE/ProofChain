// Read-only on-chain lookup of a verification record.
// Server-only. Never import from client components.
import { JsonRpcProvider, Contract } from 'ethers';
import { REGISTRY_ABI } from '@/lib/chain/abi';
import { env } from '@/lib/env';

export interface OnChainRecord {
  found: boolean;
  status?: number;
  recorder?: string;
  timestamp?: number;
}

/**
 * Read the latest on-chain record for a batch id hash + record hash pair.
 *
 * `batchIdHash` is the already-hashed `keccak256(utf8(batch_code))` value; the
 * caller computes it via `batchIdHash(batchCode)` so this helper stays
 * pure-ish (no DB access). On any provider/contract error, throws
 * `CHAIN_UNAVAILABLE` — a network error must be distinguishable from a
 * legitimately-not-recorded record (which returns `{ found: false }`).
 */
export async function readOnChainRecord(
  batchIdHash: string,
  recordHash: string
): Promise<OnChainRecord> {
  try {
    const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL);
    const contract = new Contract(env.REGISTRY_ADDRESS, REGISTRY_ABI, provider);

    const recorded: boolean = await contract.isRecorded(batchIdHash, recordHash);
    if (!recorded) {
      return { found: false };
    }

    const count = await contract.getRecordCount(batchIdHash);
    if (count > 0n) {
      const record = await contract.getLatest(batchIdHash);
      // getLatest returns a struct (recordHash, status, recorder, timestamp).
      return {
        found: true,
        status: Number(record.status),
        recorder: String(record.recorder),
        timestamp: Number(record.timestamp),
      };
    }

    // isRecorded is set in the same push as _records, so this branch is
    // effectively unreachable — return found without the extra fields.
    return { found: true };
  } catch {
    throw Object.assign(new Error('Could not read on-chain record'), {
      code: 'CHAIN_UNAVAILABLE',
    });
  }
}
