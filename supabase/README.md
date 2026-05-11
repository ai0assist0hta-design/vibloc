# Supabase migrations

Each `migrations/NNNN_*.sql` is idempotent — paste the file contents
into the Supabase project's SQL editor (Project → SQL → New query)
and Run. The schema is small enough that we hand-apply rather than
using the Supabase CLI's migration runner.

## Order

1. **0001_shared_likes.sql** — `track_likes` + `playlist_likes`
   tables, RLS policies, and `supabase_realtime` publication entries
   so the client's `sharedLikes` module can subscribe to live INSERT
   / DELETE pushes.

After applying, verify in the SQL editor:

```sql
select count(*) from public.track_likes;
select count(*) from public.playlist_likes;
```

Both should return `0` on first apply. Toggling a heart on the live
site (https://vibloc26.com) afterwards should bump the count and the
INSERT should appear in **Database → Replication → supabase_realtime**.
