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
  GROQ_API_KEY: z.string().min(10).optional(),
  SEPOLIA_RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().default(11155111),
  EXPLORER_BASE_URL: z.string().url().default('https://sepolia.etherscan.io'),
  RECORDER_PRIVATE_KEY: z.string().min(64).transform((v) => v.trim()),
  REGISTRY_ADDRESS: z.string().min(40).transform((v) => v.trim()),
});

export type Env = z.infer<typeof schema>;

// Lazily parse env vars on first property access so that importing this module
// at build time (when .env.local is absent) does not throw.
let _parsed: Env | null = null;

function getParsed(): Env {
  if (!_parsed) {
    _parsed = schema.parse(process.env);
  }
  return _parsed;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return getParsed()[prop as keyof Env];
  },
});
