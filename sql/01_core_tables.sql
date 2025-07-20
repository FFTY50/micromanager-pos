-- ========================================
-- CORE POS TRANSACTION TABLES - V1 SIMPLIFIED
-- Micromanager-centric schema without pattern analysis
-- ========================================

-- Transactions table (main transaction records)
create table public.transactions (
  id uuid not null default gen_random_uuid(),
  micromanager_id text not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone null,
  duration_ms integer null,
  total_amount numeric(10, 2) null,
  cash_amount numeric(10, 2) null,
  credit_amount numeric(10, 2) null,
  debit_amount numeric(10, 2) null,
  preauth_amount numeric(10, 2) null,
  pos_txn_number text null,
  is_void boolean null default false,
  is_no_sale boolean null default false,
  frigate_event_id text null,
  store_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint transactions_pkey primary key (id),
  constraint transactions_store_id_fkey foreign KEY (store_id) references stores (id) on delete CASCADE
) TABLESPACE pg_default;

-- Transaction lines table (individual receipt lines)
create table public.transaction_lines (
  id bigint generated always as identity not null,
  transaction_id uuid null,
  micromanager_id text null,
  line_type text null,
  description text null,
  qty numeric(10, 3) null,
  amount numeric(10, 2) null,
  taxable_flag boolean null,
  raw_line text null,
  parsed_successfully boolean default false,
  frigate_event_id text null,
  created_at timestamp with time zone not null default now(),
  constraint transaction_lines_pkey primary key (id),
  constraint transaction_lines_transaction_id_fkey foreign KEY (transaction_id) references transactions (id) on delete CASCADE
) TABLESPACE pg_default;

-- Indexes for efficient querying
create index IF not exists idx_transactions_micromanager_time on public.transactions using btree (micromanager_id, start_time desc) TABLESPACE pg_default;

create index IF not exists idx_transactions_store_time on public.transactions using btree (store_id, start_time desc) TABLESPACE pg_default;

create index IF not exists idx_transactions_pos_txn_number on public.transactions using btree (pos_txn_number) TABLESPACE pg_default;

create index IF not exists idx_transactions_frigate_event on public.transactions using btree (frigate_event_id) TABLESPACE pg_default;

create index IF not exists idx_transaction_lines_transaction_id on public.transaction_lines using btree (transaction_id) TABLESPACE pg_default;

create index IF not exists idx_transaction_lines_micromanager_time on public.transaction_lines using btree (micromanager_id, created_at desc) TABLESPACE pg_default;

create index IF not exists idx_transaction_lines_unknown on public.transaction_lines using btree (line_type, created_at desc) TABLESPACE pg_default
where (line_type = 'unknown');

create index IF not exists idx_transaction_lines_parse_errors on public.transaction_lines using btree (line_type, created_at desc) TABLESPACE pg_default
where (line_type = 'parse_error');

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
