-- Supabase SQL Editor: Auth 用 profiles と、業務テーブルの RLS（要ログイン）
-- 1) Auth でユーザーを作成するとき、User Metadata に JSON で "role": "admin" または "role": "driver" を設定
-- 2) 既存の open ポリシーを置き換え、配送管理アプリはログイン後のみアクセス可
-- 3) delivery-app.html 用: orders への anon INSERT のみ（payload.source = delivery-app）を許可

-- ----- profiles -----
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null check (role in ('admin', 'driver')),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated
using (auth.uid() = id);

-- 新規ユーザー → profiles へ（metadata.role が無ければ driver）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
begin
  r := coalesce(new.raw_user_meta_data ->> 'role', 'driver');
  if r not in ('admin', 'driver') then
    r := 'driver';
  end if;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, r);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 既存ユーザーに profiles が無い場合の手動投入例:
-- insert into public.profiles (id, email, role)
-- select id, email, 'admin' from auth.users where email = 'you@example.com'
-- on conflict (id) do update set role = excluded.role;

-- ----- 業務テーブル: anon 全廃、authenticated のみ -----
drop policy if exists "customers_all_access" on public.customers;
drop policy if exists "orders_all_access" on public.orders;
drop policy if exists "drivers_all_access" on public.drivers;
drop policy if exists "vehicles_all_access" on public.vehicles;
drop policy if exists "invoices_all_access" on public.invoices;
drop policy if exists "bank_transactions_all_access" on public.bank_transactions;
drop policy if exists "events_all_access" on public.events;
drop policy if exists "payables_all_access" on public.payables;

create policy "customers_auth_all" on public.customers
for all to authenticated using (true) with check (true);

create policy "drivers_auth_all" on public.drivers
for all to authenticated using (true) with check (true);

create policy "vehicles_auth_all" on public.vehicles
for all to authenticated using (true) with check (true);

create policy "invoices_auth_all" on public.invoices
for all to authenticated using (true) with check (true);

create policy "bank_transactions_auth_all" on public.bank_transactions
for all to authenticated using (true) with check (true);

create policy "events_auth_all" on public.events
for all to authenticated using (true) with check (true);

create policy "payables_auth_all" on public.payables
for all to authenticated using (true) with check (true);

-- orders: ログインユーザーはすべて、anon は delivery-app からの INSERT のみ
create policy "orders_auth_all" on public.orders
for all to authenticated using (true) with check (true);

drop policy if exists "orders_anon_insert_delivery_app" on public.orders;
create policy "orders_anon_insert_delivery_app" on public.orders
for insert to anon
with check (coalesce(payload ->> 'source', '') = 'delivery-app');
