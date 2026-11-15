-- Atlas Studios: private decks
-- Paste into Supabase > SQL Editor > New query and click Run. Safe to run more than once.
-- Also turn on: Authentication > Sign In / Providers > "Allow anonymous sign-ins".

-- 1. Tables -----------------------------------------------------------------
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  case_study_slug text,
  storage_path text not null,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.deck_requests (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  name text not null,
  email text not null,
  company text,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','denied','revoked')),
  code text unique,
  uses int not null default 0,
  max_uses int not null default 3,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.deck_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.deck_requests(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);

create table if not exists public.deck_views (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.deck_requests(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

alter table public.decks enable row level security;
alter table public.deck_requests enable row level security;
alter table public.deck_sessions enable row level security;
alter table public.deck_views enable row level security;

-- 2. Who can do what ---------------------------------------------------------
drop policy if exists "decks: list published" on public.decks;
create policy "decks: list published" on public.decks for select using (published or public.is_admin());
drop policy if exists "decks: admin manage" on public.decks;
create policy "decks: admin manage" on public.decks for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "requests: anyone can ask" on public.deck_requests;
create policy "requests: anyone can ask" on public.deck_requests for insert to anon, authenticated
  with check (status = 'pending' and code is null and uses = 0);
drop policy if exists "requests: admin manage" on public.deck_requests;
create policy "requests: admin manage" on public.deck_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sessions: admin read" on public.deck_sessions;
create policy "sessions: admin read" on public.deck_sessions for select to authenticated using (public.is_admin());
drop policy if exists "views: admin read" on public.deck_views;
create policy "views: admin read" on public.deck_views for select to authenticated using (public.is_admin());

grant select on public.decks to anon, authenticated;
grant insert on public.deck_requests to anon, authenticated;
grant select, insert, update, delete on public.decks, public.deck_requests to authenticated;
grant select on public.deck_sessions, public.deck_views to authenticated;

-- 3. Redeem a code (binds it to this browser) --------------------------------
create or replace function public.claim_deck(p_deck text, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare r public.deck_requests; d public.decks; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into d from public.decks where slug = p_deck and published;
  if d.id is null then return null; end if;
  select * into r from public.deck_requests
    where deck_id = d.id and upper(code) = upper(trim(p_code)) and status = 'approved';
  if r.id is null then return null; end if;
  if not exists (select 1 from public.deck_sessions where request_id = r.id and user_id = uid) then
    if r.uses >= r.max_uses then return json_build_object('error', 'limit'); end if;
    insert into public.deck_sessions (request_id, user_id) values (r.id, uid);
    update public.deck_requests set uses = uses + 1 where id = r.id;
  end if;
  insert into public.deck_views (request_id) values (r.id);
  return json_build_object('title', d.title, 'path', d.storage_path, 'name', r.name, 'email', r.email);
end; $$;

-- 4. Return visits from a browser that already redeemed a code ---------------
create or replace function public.my_deck(p_deck text) returns json
language plpgsql security definer set search_path = public as $$
declare rec record;
begin
  select d.title, d.storage_path, r.name, r.email, r.id as rid into rec
  from public.deck_sessions s
  join public.deck_requests r on r.id = s.request_id
  join public.decks d on d.id = r.deck_id
  where s.user_id = auth.uid() and d.slug = p_deck and d.published and r.status = 'approved'
  limit 1;
  if rec.rid is null then return null; end if;
  insert into public.deck_views (request_id) values (rec.rid);
  return json_build_object('title', rec.title, 'path', rec.storage_path, 'name', rec.name, 'email', rec.email);
end; $$;

grant execute on function public.claim_deck(text, text) to authenticated;
grant execute on function public.my_deck(text) to authenticated;

-- 5. Private storage: only approved viewers can open a deck's file -----------
insert into storage.buckets (id, name, public) values ('decks', 'decks', false)
  on conflict (id) do update set public = false;

drop policy if exists "decks bucket: approved viewers read" on storage.objects;
create policy "decks bucket: approved viewers read" on storage.objects for select to authenticated
  using (bucket_id = 'decks' and (public.is_admin() or exists (
    select 1 from public.deck_sessions s
    join public.deck_requests r on r.id = s.request_id
    join public.decks d on d.id = r.deck_id
    where s.user_id = auth.uid() and r.status = 'approved' and d.published and d.storage_path = storage.objects.name)));
drop policy if exists "decks bucket: admin upload" on storage.objects;
create policy "decks bucket: admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'decks' and public.is_admin());
drop policy if exists "decks bucket: admin update" on storage.objects;
create policy "decks bucket: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'decks' and public.is_admin());
drop policy if exists "decks bucket: admin delete" on storage.objects;
create policy "decks bucket: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'decks' and public.is_admin());
