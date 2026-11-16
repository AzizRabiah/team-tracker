-- Shared tracker: two tables, Row Level Security, revision counter for conflict detection.

create table public.config (
  id int primary key check (id = 1),
  data jsonb not null check (pg_column_size(data) < 500000),
  rev int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.topics (
  id text primary key check (length(id) between 1 and 64),
  data jsonb not null check (pg_column_size(data) < 100000),
  rev int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- The server owns rev / updated_at / updated_by; whatever the client sends is overwritten.
create function public.config_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.rev := 1; else new.rev := old.rev + 1; new.id := old.id; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create function public.topics_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
    new.created_at := now();
  else
    new.rev := old.rev + 1;
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger config_touch before insert or update on public.config
  for each row execute function public.config_touch();
create trigger topics_touch before insert or update on public.topics
  for each row execute function public.topics_touch();

revoke execute on function public.config_touch() from public, anon, authenticated;
revoke execute on function public.topics_touch() from public, anon, authenticated;

alter table public.config enable row level security;
alter table public.topics enable row level security;

-- Nothing for anon. Signed-in users (only the three accounts exist) can read and write.
revoke all on public.config from anon, authenticated;
revoke all on public.topics from anon, authenticated;
grant select, update on public.config to authenticated;
grant select, insert, update, delete on public.topics to authenticated;

create policy config_read on public.config for select to authenticated
  using ((select auth.uid()) is not null);
create policy config_update on public.config for update to authenticated
  using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

create policy topics_read on public.topics for select to authenticated
  using ((select auth.uid()) is not null);
create policy topics_insert on public.topics for insert to authenticated
  with check ((select auth.uid()) is not null);
create policy topics_update on public.topics for update to authenticated
  using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy topics_delete on public.topics for delete to authenticated
  using ((select auth.uid()) is not null);

-- Second lock on signups (the dashboard switch is the first): new auth users are refused
-- unless the creating transaction sets app.allow_user_create = 'on'.
create function public.block_signups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.allow_user_create', true), '') <> 'on' then
    raise exception 'Sign-ups are closed';
  end if;
  return new;
end $$;
revoke execute on function public.block_signups() from public, anon, authenticated;

create trigger block_signups before insert on auth.users
  for each row execute function public.block_signups();
