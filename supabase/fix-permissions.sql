-- Atlas Studios: permissions fix (safe to run more than once)
-- Lets the public website read case studies and media, and submit the
-- contact form and email signup. Editing stays limited to admins.
grant usage on schema public to anon, authenticated;
grant select on public.case_studies, public.media to anon, authenticated;
grant insert on public.inquiries, public.subscribers to anon, authenticated;
grant select, insert, update, delete on public.case_studies, public.media, public.inquiries, public.subscribers to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
notify pgrst, 'reload schema';

-- Check: this should list your admin email. If it returns no rows, fix the email
-- (replace YOUR_EMAIL_HERE) and run the next line on its own.
select email from public.admins;
-- insert into public.admins (email) values ('YOUR_EMAIL_HERE') on conflict do nothing;
