# Team Tracker

Single-file shared tracker. `index.html` is the built page (vanilla JS, no libraries).
Data and login live in a Supabase project; Row Level Security limits access to signed-in users.

- Build: `python build.py --cloud` (needs `src/cloud.json` with the project URL and public key)
- Database: `supabase/schema.sql`
