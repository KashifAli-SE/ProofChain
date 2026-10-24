// This file is server-only. Never import from client components.
import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  REVIEWER_PASSCODE: z.string().min(8),
  SESSION_SECRET: z.string().min(32),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  EVIDENCE_BUCKET: z.string().default('evidence'),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().min(3),
  SEPOLIA_RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().default(11155111),
  EXPLORER_BASE_URL: z.string().url().default('https://sepolia.etherscan.io'),
  RECORDER_PRIVATE_KEY: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
  REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

export const env = schema.parse(process.env); // import only from server code
