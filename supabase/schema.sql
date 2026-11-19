-- Lab writing challenge: shared database.
-- Paste this whole file once into the Supabase SQL editor (see README).
-- Then set your own join code at the bottom.

-- Each person may set their own daily goal (minutes), or leave it empty.
-- lab.daily_goal_min is only the goal the app suggests.

-- ── Tables ───────────────────────────────────────────────────────────────

-- One row: the rules of the challenge. Readable by everyone who has the app.
create table if not exists public.lab (
  id             int primary key default 1 check (id = 1),
  name           text    not null default 'Our lab',
  daily_goal_min int     not null default 30 check (daily_goal_min > 0),
  weekdays_only  boolean not null default true,
  start_day      date    not null default current_date
);

-- The join code. No policy below gives access to it: only join_lab() reads it.
create table if not exists public.lab_secret (
  id        int primary key default 1 check (id = 1),
  join_code text not null
);

create table if not exists public.members (
  id        uuid primary key references auth.users (id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 30),
  joined_at timestamptz not null default now()
);

-- Profile photo: a small square picture, shrunk in the browser before sending.
alter table public.members add column if not exists goal_min int
  check (goal_min is null or goal_min between 1 and 600);

alter table public.members add column if not exists avatar text
  check (avatar is null or (avatar like 'data:image/%' and char_length(avatar) < 100000));

-- Writing sessions only. `day` is the writer's own local calendar day.
create table if not exists public.sessions (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references public.members (id) on delete cascade,
  day        date not null,
  started_at timestamptz,
  duration   int  not null check (duration > 0 and duration <= 86400),
  end_type   text,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_day on public.sessions (user_id, day);

-- ── Functions ────────────────────────────────────────────────────────────

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from members where id = auth.uid()) $$;

-- Join (or rename yourself) with the lab's code.
create or replace function public.join_lab(p_name text, p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from lab_secret where join_code = p_code) then
    raise exception 'Wrong lab code';
  end if;
  insert into members (id, name) values (auth.uid(), btrim(p_name))
  on conflict (id) do update set name = excluded.name;
end $$;

revoke all on function public.join_lab(text, text) from public, anon;
grant execute on function public.join_lab(text, text) to authenticated;
grant execute on function public.is_member() to authenticated;

-- ── Who can see and change what ──────────────────────────────────────────

alter table public.lab        enable row level security;
alter table public.lab_secret enable row level security;
alter table public.members    enable row level security;
alter table public.sessions   enable row level security;

grant select on public.lab to anon, authenticated;
grant select, delete on public.members to authenticated;
grant update (avatar, goal_min) on public.members to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
revoke all on public.lab_secret from anon, authenticated;

drop policy if exists "rules are public" on public.lab;
create policy "rules are public" on public.lab
  for select to anon, authenticated using (true);

drop policy if exists "members see members" on public.members;
create policy "members see members" on public.members
  for select to authenticated using (public.is_member());

drop policy if exists "leave the lab" on public.members;
create policy "leave the lab" on public.members
  for delete to authenticated using (id = auth.uid());

drop policy if exists "change own photo" on public.members;
drop policy if exists "change own profile" on public.members;
create policy "change own profile" on public.members
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members see sessions" on public.sessions;
create policy "members see sessions" on public.sessions
  for select to authenticated using (public.is_member());

drop policy if exists "add own sessions" on public.sessions;
create policy "add own sessions" on public.sessions
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());

drop policy if exists "change own sessions" on public.sessions;
create policy "change own sessions" on public.sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own sessions" on public.sessions;
create policy "delete own sessions" on public.sessions
  for delete to authenticated using (user_id = auth.uid());

-- Seconds of writing per member per day: what the Lab page reads.
create or replace view public.daily_totals
with (security_invoker = on) as
  select user_id, day, sum(duration)::int as seconds
  from public.sessions
  group by user_id, day;

grant select on public.daily_totals to authenticated;

-- ── Your lab ─────────────────────────────────────────────────────────────
-- Edit these three lines, then run the file. Change them again any time.

insert into public.lab (id, name, daily_goal_min, weekdays_only, start_day)
values (1, 'Our lab', 30, true, current_date)
on conflict (id) do nothing;

insert into public.lab_secret (id, join_code)
values (1, 'change-this-code')
on conflict (id) do nothing;
