create table if not exists public.itineraries (
  id text primary key,
  title text not null,
  destination text not null,
  trip_type text not null default 'solo',
  start_date date,
  end_date date,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists itineraries_created_at_idx on public.itineraries (created_at desc);
-- This starter uses the backend service-role key. Keep it server-side only.
