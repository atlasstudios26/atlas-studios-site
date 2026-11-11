-- Atlas Studios: Supabase setup
-- Paste this whole file into Supabase > SQL Editor > New query, change the email
-- on the LAST LINE to the email you will log in with, then click Run.
-- Safe to run more than once.

-- 1. Tables ---------------------------------------------------------------
create table if not exists public.case_studies (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  client text,
  category text,
  summary text,
  context text,
  insight text,
  objective text[] not null default '{}',
  execution text[] not null default '{}',
  results text[] not null default '{}',
  cover_url text,
  published boolean not null default true,
  sort_order int not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  case_study_id uuid references public.case_studies(id) on delete set null,
  url text not null,
  kind text not null default 'image' check (kind in ('image', 'video')),
  event_name text,
  caption text,
  sort_order int not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  project_type text,
  budget text,
  timeline text,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

-- Who can edit the site (only emails listed here)
create table if not exists public.admins (email text primary key);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- 2. Security rules -------------------------------------------------------
alter table public.case_studies enable row level security;
alter table public.media enable row level security;
alter table public.inquiries enable row level security;
alter table public.subscribers enable row level security;
alter table public.admins enable row level security;  -- no policies: invisible to the public

drop policy if exists "public reads published case studies" on public.case_studies;
create policy "public reads published case studies" on public.case_studies
  for select using (published or public.is_admin());
drop policy if exists "admin manages case studies" on public.case_studies;
create policy "admin manages case studies" on public.case_studies
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads media" on public.media;
create policy "public reads media" on public.media for select using (true);
drop policy if exists "admin manages media" on public.media;
create policy "admin manages media" on public.media
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "anyone can send an inquiry" on public.inquiries;
create policy "anyone can send an inquiry" on public.inquiries for insert with check (true);
drop policy if exists "admin reads inquiries" on public.inquiries;
create policy "admin reads inquiries" on public.inquiries
  for select to authenticated using (public.is_admin());
drop policy if exists "admin deletes inquiries" on public.inquiries;
create policy "admin deletes inquiries" on public.inquiries
  for delete to authenticated using (public.is_admin());

drop policy if exists "anyone can join the list" on public.subscribers;
create policy "anyone can join the list" on public.subscribers for insert with check (true);
drop policy if exists "admin reads subscribers" on public.subscribers;
create policy "admin reads subscribers" on public.subscribers
  for select to authenticated using (public.is_admin());
drop policy if exists "admin deletes subscribers" on public.subscribers;
create policy "admin deletes subscribers" on public.subscribers
  for delete to authenticated using (public.is_admin());

-- 3. Photo and video storage ---------------------------------------------
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "admin uploads media" on storage.objects;
create policy "admin uploads media" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "admin updates media" on storage.objects;
create policy "admin updates media" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists "admin deletes media" on storage.objects;
create policy "admin deletes media" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());

-- 4. Starter case studies (from the Atlas deck; edit them later in /admin) --
insert into public.case_studies (slug, title, client, category, summary, context, insight, objective, execution, results, sort_order) values
  ('the-art-of-blending', 'The Art of Blending', 'Just Add Honey Tea Company × Edmond''s Honor Bourbon', 'Experience Design', 'An intimate, ticketed gathering exploring where tea and bourbon meet.', 'An intimate experiential gathering exploring the intersection of tea and bourbon, in partnership with Just Add Honey Tea Company and Edmond''s Honor Bourbon.', 'Tea and spirits are both rooted in ritual and community, yet they are rarely positioned together in a premium, story driven context.', array['Introduce Edmond''s Honor to new consumers through a culturally relevant experience', 'Reinforce Just Add Honey''s versatility beyond traditional tea service', 'Extend an existing tea cocktail campaign through live, immersive storytelling']::text[], array['Curated a guest list rooted in cultural proximity and taste alignment', 'Designed a guided tasting pairing tea blends with bourbon expressions', 'Integrated founder storytelling, highlighting the two Black women behind each brand', 'Built an environment centered on warmth, discovery, and intentional connection']::text[], array['45+ paid attendees with no sponsor funding, proving demand for curated, story driven events', 'Organic engagement and conversation around tea based cocktails', 'A new on premise partnership: The James Room added a Just Add Honey and Edmond''s Honor cocktail to its menu', 'A repeatable experiential format bridging adjacent categories']::text[], 1),
  ('black-history-month-campaign', 'Black History Month Campaign', 'The James Room × Edmond''s Honor Bourbon', 'Creative Direction', 'A spirits led content campaign celebrating Black creatives in Atlanta.', 'Creative direction for a spirits led content campaign highlighting Black creatives in Atlanta for Black History Month, in partnership with The James Room and Edmond''s Honor Bourbon.', 'Premium spirits brands need more than product visibility. They need aspirational, culturally grounded storytelling that reflects how the brand lives within its community.', array['Develop high quality visual assets for social, email, and digital platforms', 'Position Edmond''s Honor within a premium, lifestyle driven context', 'Highlight Black creatives across visual art, mixology, and culinary disciplines']::text[], array['Led creative direction across visual storytelling, shot composition, and the on set experience', 'Built a shot list capturing both product integrity and lifestyle integration', 'Directed talent and hand models for natural, aspirational interactions with the brand', 'Styled environments, props, and cocktail presentation for a refined, lived in feel']::text[], array['A full suite of brand assets across social, email, and digital', 'Powered a Black History Month campaign centered on culture and community', 'Elevated brand perception through premium, lifestyle driven visuals', 'Scalable visual direction for future brand storytelling']::text[], 2),
  ('legacy-class-varsity-jacket', 'The Legacy Class Jacket', 'Emerging 100 of Atlanta, Class of 2025', 'Product & Design', 'A commemorative varsity jacket celebrating 15 years of legacy.', 'A commemorative varsity jacket for the Class of 2025, celebrating the organization''s 15 year legacy and its connection to Atlanta''s cultural history.', 'Memorable brand experiences extend beyond moments. They live on through the objects people keep, wear, and tie to identity and belonging.', array['Create a physical artifact that reflects the identity of the Legacy Class', 'Reinforce connection to both the organization and the city of Atlanta', 'Design a piece members would wear with pride for years']::text[], array['Translated the idea of legacy into a visual system rooted in Atlanta''s 1996 Olympic history', 'Designed custom elements blending organizational identity with cultural references', 'Built a cohesive aesthetic across typography, symbols, and garment structure', 'Created a piece meant for both memorability and everyday wear']::text[], array['A wearable artifact that reinforced identity, belonging, and shared experience', 'Extended the organization''s story beyond a single moment', 'A repeatable framework for translating narrative into physical product']::text[], 3),
  ('women-who-set-the-bar', 'Women Who Set the Bar', 'Women''s Appreciation Month', 'Experiential Programming', 'A panel reimagined as an intimate, hospitality driven experience.', 'Co created and moderated Women Who Set the Bar, an intimate Women''s Appreciation Month panel celebrating women across spirits, hospitality, entrepreneurship, and culture.', 'Professional audiences are drawn to experiences that feel intentional, emotionally resonant, and rooted in real connection rather than transactional networking.', array['Transform a traditional panel into a hospitality driven experience', 'Foster authentic connection among professional women across industries', 'Celebrate women shaping culture, hospitality, entrepreneurship, and spirits']::text[], array['Moderated a live conversation with women across spirits, entrepreneurship, and culture', 'Curated hospitality moments: floral gifting, branded scarves, and live watercolor portraits', 'Designed an intimate atmosphere built for real conversation and community']::text[], array['Nearly double the RSVP interest relative to venue capacity', 'Meaningful connections across business, hospitality, and culture', 'Overwhelmingly positive feedback on the intimacy and intention of the experience']::text[], 4)
on conflict (slug) do nothing;

-- 5. Your admin login: CHANGE THIS to the email you'll use in Authentication > Users
insert into public.admins (email) values ('YOUR_EMAIL_HERE') on conflict do nothing;
