-- ========================================
-- CORE POS TRANSACTION TABLES
-- Updated schema for micromanager smart edge device
-- ========================================

-- Transactions table (main transaction records)
create table public.transactions (
  id uuid not null default gen_random_uuid(),
  cloud_system_id text not null,
  start_time timestamp with time zone not null,
  duration_ms integer null,
  total_amount numeric(10, 2) null,
  cash_amount numeric(10, 2) null,
  pos_txn_number text null,
  store_number text null,
  drawer_number text null,
  other_meta jsonb null,
  raw_description text null,
  deleted_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  camera_id text null,
  pos_source text null,
  credit_amount numeric(10, 2) null,
  debit_amount numeric(10, 2) null,
  preauth_amount numeric(10, 2) null,
  is_void boolean null default false,
  is_no_sale boolean null default false,
  micro_manager_id text null,
  store_id uuid not null,
  frigate_event_id text null,
  constraint transactions_pkey primary key (id),
  constraint transactions_store_id_fkey foreign KEY (store_id) references stores (id) on delete CASCADE
) TABLESPACE pg_default;

-- Transaction lines table (individual receipt lines)
create table public.transaction_lines (
  id bigint generated always as identity not null,
  transaction_id uuid null,
  line_type text null,
  description text null,
  qty numeric(10, 3) null,
  amount numeric(10, 2) null,
  taxable_flag boolean null,
  created_at timestamp with time zone not null default now(),
  camera_id text null,
  cloud_system_id text null,
  pos_terminal_id text null,
  frigate_event_id text null,
  
  -- NEW: Enhanced fields for unknown line analysis
  raw_line text null,
  parsed_successfully boolean default false,
  matched_patterns text[] default '{}',
  extraction_confidence integer default 0,
  pos_parser_version text null,
  
  -- Metadata for pattern analysis
  line_length integer null,
  contains_numbers boolean default false,
  contains_currency boolean default false,
  contains_time boolean default false,
  contains_date boolean default false,
  
  -- Analysis fields
  needs_analysis boolean default false,
  analysis_priority text check (analysis_priority in ('low', 'medium', 'high', 'critical', 'analyzed')) default 'low',
  error_details text null,
  error_stack text null,
  
  constraint transaction_lines_pkey primary key (id),
  constraint transaction_lines_transaction_id_fkey foreign KEY (transaction_id) references transactions (id) on delete CASCADE
) TABLESPACE pg_default;

-- Indexes for efficient querying
create index IF not exists idx_transactions_store_system_time on public.transactions using btree (store_id, cloud_system_id, start_time desc) TABLESPACE pg_default
where (deleted_at is null);

create index IF not exists idx_transactions_pos_txn_number on public.transactions using btree (pos_txn_number) TABLESPACE pg_default;

create index IF not exists idx_transactions_frigate_event on public.transactions using btree (frigate_event_id) TABLESPACE pg_default;

create index IF not exists idx_transaction_lines_txn_id on public.transaction_lines using btree (transaction_id) TABLESPACE pg_default;

create index IF not exists idx_transaction_lines_cloud_system_created on public.transaction_lines using btree (cloud_system_id, created_at desc) TABLESPACE pg_default;

create index IF not exists idx_transaction_lines_cloud_orphaned on public.transaction_lines using btree (cloud_system_id, created_at desc) TABLESPACE pg_default
where (transaction_id is null);

create index IF not exists idx_transaction_lines_camera on public.transaction_lines using btree (camera_id) TABLESPACE pg_default;

create index IF not exists idx_transaction_lines_frigate_event on public.transaction_lines using btree (frigate_event_id) TABLESPACE pg_default;

-- NEW: Indexes for unknown line analysis
create index IF not exists idx_transaction_lines_unknown_analysis on public.transaction_lines using btree (line_type, analysis_priority, created_at desc) TABLESPACE pg_default
where (line_type in ('unknown', 'parse_error') and needs_analysis = true);

create index IF not exists idx_transaction_lines_parsing_success on public.transaction_lines using btree (cloud_system_id, parsed_successfully, created_at desc) TABLESPACE pg_default;

-- ========================================
-- STORES TABLE (if not exists)
-- ========================================

create table IF not exists public.stores (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone not null default now(),
  constraint stores_pkey primary key (id)
) TABLESPACE pg_default;

-- Insert a default store for development
insert into public.stores (id, name) 
values ('123e4567-e89b-12d3-a456-426614174000', 'Default Store')
on conflict (id) do nothing;

-- ========================================
-- REAL-TIME SUBSCRIPTIONS
-- ========================================

-- Enable real-time for transaction_lines (for live receipt display)
alter publication supabase_realtime add table transaction_lines;

-- Enable real-time for transactions (for dashboard updates)
alter publication supabase_realtime add table transactions;

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================

-- Enable RLS on tables
alter table public.transactions enable row level security;
alter table public.transaction_lines enable row level security;
alter table public.stores enable row level security;

-- Basic RLS policies (adjust based on your auth setup)
create policy "Allow all operations for authenticated users" on public.transactions
  for all using (auth.role() = 'authenticated');

create policy "Allow all operations for authenticated users" on public.transaction_lines
  for all using (auth.role() = 'authenticated');

create policy "Allow all operations for authenticated users" on public.stores
  for all using (auth.role() = 'authenticated');

-- ========================================
-- FUNCTIONS AND TRIGGERS
-- ========================================

-- Function to automatically populate analysis metadata
create or replace function populate_line_analysis_metadata()
returns trigger as $$
begin
  -- Populate metadata fields
  NEW.line_length := length(NEW.raw_line);
  NEW.contains_numbers := NEW.raw_line ~ '\d';
  NEW.contains_currency := NEW.raw_line ~ '[\$£€¥]|\d+\.\d{2}';
  NEW.contains_time := NEW.raw_line ~ '\d{1,2}:\d{2}';
  NEW.contains_date := NEW.raw_line ~ '\d{1,2}[-/]\d{1,2}[-/]\d{2,4}';
  
  -- Set analysis flag for unknown lines
  IF NEW.line_type = 'unknown' OR NEW.line_type = 'parse_error' THEN
    NEW.needs_analysis := true;
  END IF;
  
  return NEW;
end;
$$ language plpgsql;

-- Trigger to populate metadata on insert
create trigger trigger_populate_line_analysis_metadata
  before insert on transaction_lines
  for each row
  execute function populate_line_analysis_metadata();

-- ========================================
-- EXAMPLE DATA FOR TESTING
-- ========================================

-- Insert some example transaction data for testing
-- (Remove this in production)

-- Example transaction
insert into public.transactions (
  id, 
  cloud_system_id, 
  start_time, 
  total_amount, 
  cash_amount, 
  store_id,
  pos_source,
  frigate_event_id
) values (
  'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  'micromanager-001',
  now() - interval '1 hour',
  25.99,
  30.00,
  '123e4567-e89b-12d3-a456-426614174000',
  'verifone_commander',
  'event-12345'
);

-- Example transaction lines
insert into public.transaction_lines (
  transaction_id, 
  line_type, 
  description, 
  amount, 
  cloud_system_id,
  raw_line,
  parsed_successfully
) values 
(
  'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  'item',
  'COCA COLA',
  2.50,
  'micromanager-001',
  'COCA COLA                    2.50',
  true
),
(
  'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  'unknown',
  'UNKNOWN POS LINE: EMPLOYEE DISCOUNT 10%',
  null,
  'micromanager-001',
  'EMPLOYEE DISCOUNT 10%',
  false
),
(
  'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  'tax',
  'TAX',
  0.25,
  'micromanager-001',
  'TAX                          0.25',
  true
),
(
  'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  'total',
  'TOTAL',
  25.99,
  'micromanager-001',
  'TOTAL                       25.99',
  true
);
