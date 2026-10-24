-- ProofChain AI schema. Run once in the Supabase SQL editor.
-- All access is server-side with the service-role key. RLS is on with no public policies.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  product_name  text not null,
  category      text not null default 'textile',
  supplier_name text not null,
  created_at    timestamptz not null default now()
);

create table if not exists batches (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id),
  batch_code      text not null unique,
  production_date date,
  claims          jsonb not null default '[]'::jsonb,   -- e.g. [{"claim_type":"recycled_content","value":100,"unit":"percent"}]
  activity_data   jsonb,                                -- ActivityData (design.md)
  status          text not null default 'DRAFT'
    check (status in ('DRAFT','ANALYZING','NEEDS_EVIDENCE','IN_REVIEW','VERIFIED','REJECTED','RECHECK_REQUIRED')),
  is_demo         boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists evidence_documents (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references batches(id),
  filename       text not null,
  mime_type      text not null check (mime_type in ('application/pdf','text/plain')),
  size_bytes     integer not null,
  storage_path   text not null,
  sha256_hash    text not null check (sha256_hash ~ '^[0-9a-f]{64}$'),
  document_type  text,
  extraction_status text not null default 'PENDING'
    check (extraction_status in ('PENDING','EXTRACTED','EXTRACTION_FAILED','NO_TEXT')),
  extracted_data jsonb,
  created_at     timestamptz not null default now(),
  unique (batch_id, sha256_hash)
);

create table if not exists verification_runs (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references batches(id),
  run_number        integer not null,
  status            text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED','FAILED')),
  error_code        text,
  agent_results     jsonb,       -- per-document extractions
  findings          jsonb,       -- Finding[]
  carbon_result     jsonb,       -- CarbonResult
  audit_report      jsonb,       -- AuditReport
  recommendation_ceiling text check (recommendation_ceiling in ('APPROVE','REQUEST_EVIDENCE','REJECT')),
  ai_recommendation text check (ai_recommendation in ('APPROVE','REQUEST_EVIDENCE','REJECT')),
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  unique (batch_id, run_number)
);
-- only one run may be in progress per batch
create unique index if not exists one_running_run_per_batch
  on verification_runs (batch_id) where status = 'RUNNING';

create table if not exists review_decisions (
  id                   uuid primary key default gen_random_uuid(),
  batch_id             uuid not null references batches(id),
  verification_run_id  uuid not null unique references verification_runs(id),
  decision             text not null check (decision in ('VERIFIED','REJECTED','NEEDS_EVIDENCE')),
  reviewer_note        text not null check (char_length(reviewer_note) >= 10),
  override_confirmed   boolean not null default false,
  record_json          jsonb not null,   -- exact canonical record that was hashed
  record_hash          text not null check (record_hash ~ '^0x[0-9a-f]{64}$'),
  decided_at           timestamptz not null default now()
);

create table if not exists blockchain_records (
  id                  uuid primary key default gen_random_uuid(),
  review_decision_id  uuid not null unique references review_decisions(id),
  chain_id            bigint not null,
  contract_address    text not null,
  transaction_hash    text not null unique,
  record_hash         text not null,
  block_number        bigint not null,
  created_at          timestamptz not null default now()
);

create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  batch_id   uuid references batches(id),
  event      text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_batch_idx on audit_log (batch_id, created_at);

-- ---------- append-only enforcement ----------
create or replace function forbid_mutation() returns trigger as $$
begin
  raise exception '% is append-only (% not allowed)', tg_table_name, tg_op;
end;
$$ language plpgsql;

drop trigger if exists audit_log_append_only on audit_log;
create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function forbid_mutation();

drop trigger if exists review_decisions_append_only on review_decisions;
create trigger review_decisions_append_only
  before update or delete on review_decisions
  for each row execute function forbid_mutation();

drop trigger if exists blockchain_records_append_only on blockchain_records;
create trigger blockchain_records_append_only
  before update or delete on blockchain_records
  for each row execute function forbid_mutation();

-- ---------- RLS: on, no policies => only the service-role key can access ----------
alter table products            enable row level security;
alter table batches             enable row level security;
alter table evidence_documents  enable row level security;
alter table verification_runs   enable row level security;
alter table review_decisions    enable row level security;
alter table blockchain_records  enable row level security;
alter table audit_log           enable row level security;

-- ---------- private storage bucket ----------
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do update set public = false;
