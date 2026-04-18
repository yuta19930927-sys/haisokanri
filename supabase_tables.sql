-- Run this in Supabase SQL Editor
-- It creates 8 tables used by the app and enables browser read/write.

create table if not exists public.customers (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payables (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.invoices enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.events enable row level security;
alter table public.payables enable row level security;

drop policy if exists "customers_all_access" on public.customers;
create policy "customers_all_access" on public.customers
for all to anon, authenticated
using (true) with check (true);

drop policy if exists "orders_all_access" on public.orders;
create policy "orders_all_access" on public.orders
for all to anon, authenticated
using (true) with check (true);

drop policy if exists "drivers_all_access" on public.drivers;
create policy "drivers_all_access" on public.drivers
for all to anon, authenticated
using (true) with check (true);

drop policy if exists "vehicles_all_access" on public.vehicles;
create policy "vehicles_all_access" on public.vehicles
for all to anon, authenticated
using (true) with check (true);

drop policy if exists "invoices_all_access" on public.invoices;
create policy "invoices_all_access" on public.invoices
for all to anon, authenticated
using (true) with check (true);

drop policy if exists "bank_transactions_all_access" on public.bank_transactions;
create policy "bank_transactions_all_access" on public.bank_transactions
for all to anon, authenticated
using (true) with check (true);

drop policy if exists "events_all_access" on public.events;
create policy "events_all_access" on public.events
for all to anon, authenticated
using (true) with check (true);

drop policy if exists "payables_all_access" on public.payables;
create policy "payables_all_access" on public.payables
for all to anon, authenticated
using (true) with check (true);
