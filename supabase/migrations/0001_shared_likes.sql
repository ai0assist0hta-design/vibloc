-- VIBLOC — Shared track + playlist likes
--
-- Multi-user persistence: every authenticated user can READ every
-- like (so heart counts on RankRow / TrackRow / detail view reflect
-- the entire community), but each user can only INSERT/DELETE their
-- own row. Realtime is enabled so likes propagate to every connected
-- client without polling.
--
-- Apply once: paste this whole file into Supabase project's
-- SQL editor (Project → SQL → New query) and Run.

-- ───────────────────────────────────────────────────────────────
-- track_likes — one row per (building, track, user). Decoupled from
-- a "pinned_tracks" table on purpose: a track can be liked even when
-- the current user has not pinned it themselves.
-- ───────────────────────────────────────────────────────────────
create table if not exists public.track_likes (
  building_id text not null,
  track_id    text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  liked_at    timestamptz not null default now(),
  primary key (building_id, track_id, user_id)
);
create index if not exists track_likes_lookup
  on public.track_likes (building_id, track_id);

-- ───────────────────────────────────────────────────────────────
-- playlist_likes — one row per (building, tagger, user). The tagger
-- is the curator whose playlist is being liked; user is the actor.
-- tagger_id is uuid because playlists in the shared world are owned
-- by Supabase auth users (dev-admin local persona is DEV-only and
-- never reaches Supabase).
-- ───────────────────────────────────────────────────────────────
create table if not exists public.playlist_likes (
  building_id text not null,
  tagger_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  liked_at    timestamptz not null default now(),
  primary key (building_id, tagger_id, user_id)
);
create index if not exists playlist_likes_lookup
  on public.playlist_likes (building_id, tagger_id);

-- ───────────────────────────────────────────────────────────────
-- Row-Level Security
--   • SELECT: anyone (anon + authenticated)
--   • INSERT: the actor must be the row's user_id
--   • DELETE: the actor must be the row's user_id
-- No UPDATE policy — toggling is delete-then-insert, never an UPDATE.
-- ───────────────────────────────────────────────────────────────
alter table public.track_likes    enable row level security;
alter table public.playlist_likes enable row level security;

drop policy if exists track_likes_read    on public.track_likes;
drop policy if exists track_likes_insert  on public.track_likes;
drop policy if exists track_likes_delete  on public.track_likes;
create policy track_likes_read   on public.track_likes for select using (true);
create policy track_likes_insert on public.track_likes for insert with check (auth.uid() = user_id);
create policy track_likes_delete on public.track_likes for delete using (auth.uid() = user_id);

drop policy if exists playlist_likes_read    on public.playlist_likes;
drop policy if exists playlist_likes_insert  on public.playlist_likes;
drop policy if exists playlist_likes_delete  on public.playlist_likes;
create policy playlist_likes_read   on public.playlist_likes for select using (true);
create policy playlist_likes_insert on public.playlist_likes for insert with check (auth.uid() = user_id);
create policy playlist_likes_delete on public.playlist_likes for delete using (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────
-- Realtime — broadcast INSERT/DELETE on these tables to every
-- subscribed client. Required for the live heart counts on the
-- right-rail RankRow / TrackRow without polling.
-- ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.track_likes;
alter publication supabase_realtime add table public.playlist_likes;
