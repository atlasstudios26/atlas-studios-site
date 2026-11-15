# Atlas Studios website

Static site for theatlasstudios.com, hosted on Vercel, with Supabase for case studies, photos and videos, inquiries, and the email list. No build step.

## Pages
- `/` home, `/work`, `/case-study?slug=...`, `/capabilities`, `/events`, `/about`, `/contact`
- `/admin` private dashboard (sign in with your Supabase user)

## Settings
Edit `assets/js/config.js`: Supabase Project URL and anon key (both safe to be public), optional hero video, Instagram, LinkedIn, and email.
Never put the service_role / secret key in this repo.

## Database
Run `supabase/setup.sql` once in Supabase > SQL Editor (change the admin email on the last line first).
Until Supabase is connected, the site shows the built-in case studies in `assets/js/data.js`.

## Deploy
Vercel: import this repo, framework "Other", no build command. Every push to `main` goes live.

## Brand
Bone #E5E3DD · Charcoal #292420 · Deep olive #4F5C47 · Logo green #274F39 · Cormorant Garamond + Jost

## Private decks
1. Supabase > SQL Editor: run `supabase/private-decks.sql`.
2. Supabase > Authentication > Sign In / Providers: turn on **Allow anonymous sign-ins**.
3. /admin > Private decks: upload a PDF (pricing removed) and link it to a case study. A locked "Private deck" card appears on that case study.
4. Requests land in the same tab. Approve one to create a personal code, then click **Email code**.
Codes work on up to 3 devices each. Revoke any time. Pages are drawn on-screen with the viewer's email watermarked across them; there is no download link.
