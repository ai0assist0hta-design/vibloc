-- VIBLOC — Shared pinned tracks
--
-- Multi-user playlists: every authenticated user can SEE every other
-- user's pinned tracks (powering global TOP PLAYLISTS rankings, the
-- right rail's "people you might enjoy" surface, etc.). RLS still
-- gates writes so only the row's user_id can pin / unpin / edit
-- their own track.
--
-- Track metadata is denormalised onto the row so reading a building's
-- pins doesn't need a join to an external track table — keeps the
-- realtime payload self-contained and lets us survive iTunes search
-- API outages.

-- ───────────────────────────────────────────────────────────────
-- pinned_tracks — one row per (building, track, user)
-- ───────────────────────────────────────────────────────────────
create table if not exists public.pinned_tracks (
  id            uuid primary key default gen_random_uuid(),
  building_id   text not null,
  track_id      text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Track metadata snapshot
  track_name         text not null,
  artist_name        text not null,
  artwork_url        text,
  preview_url        text,
  track_view_url     text,
  primary_genre_name text,
  genre              text,
  -- Tagger snapshot (refreshed at read time by the client's live
  -- identity overlay; useful for rendering when the auth.users record
  -- has been deleted or before the client has loaded its profile).
  tagger_name        text,
  tagger_avatar_url  text,
  pinned_at          timestamptz not null default now(),
  unique (building_id, track_id, user_id)
);
create index if not exists pinned_tracks_building
  on public.pinned_tracks (building_id);
create index if not exists pinned_tracks_user
  on public.pinned_tracks (user_id);

-- ───────────────────────────────────────────────────────────────
-- Row-Level Security
--   • SELECT: anyone (anon + authenticated) — global discovery
--   • INSERT / UPDATE / DELETE: actor must own the row
-- ───────────────────────────────────────────────────────────────
alter table public.pinned_tracks enable row level security;

drop policy if exists pinned_tracks_read   on public.pinned_tracks;
drop policy if exists pinned_tracks_insert on public.pinned_tracks;
drop policy if exists pinned_tracks_update on public.pinned_tracks;
drop policy if exists pinned_tracks_delete on public.pinned_tracks;
create policy pinned_tracks_read   on public.pinned_tracks for select using (true);
create policy pinned_tracks_insert on public.pinned_tracks for insert with check (auth.uid() = user_id);
create policy pinned_tracks_update on public.pinned_tracks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy pinned_tracks_delete on public.pinned_tracks for delete using (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────
-- Realtime — broadcast pin / unpin events live
-- ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.pinned_tracks;
