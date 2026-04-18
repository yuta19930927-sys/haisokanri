-- Supabase SQL Editor: bucket for delivery-app.html photo uploads.
-- Run after supabase_tables.sql (orders table + RLS already exist).

insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "delivery_photos_insert_anon" on storage.objects;
create policy "delivery_photos_insert_anon"
on storage.objects for insert to anon
with check (bucket_id = 'delivery-photos');

drop policy if exists "delivery_photos_select_anon" on storage.objects;
create policy "delivery_photos_select_anon"
on storage.objects for select to anon
using (bucket_id = 'delivery-photos');

drop policy if exists "delivery_photos_update_anon" on storage.objects;
create policy "delivery_photos_update_anon"
on storage.objects for update to anon
using (bucket_id = 'delivery-photos')
with check (bucket_id = 'delivery-photos');
