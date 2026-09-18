-- Mallorca-Kasse: Datenmodell, RLS, sichere Schreibfunktionen und Fotozugriff
-- Diese Datei wird einmal vollständig im Supabase SQL Editor ausgeführt.

create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 60),
  avatar_configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint participants_trip_name_unique unique (trip_id, name),
  constraint participants_trip_user_unique unique (trip_id, user_id),
  constraint participants_trip_id_id_unique unique (trip_id, id)
);

create table if not exists public.trip_versions (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  payer_id uuid not null,
  description text not null check (char_length(trim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_trip_id_id_unique unique (trip_id, id),
  constraint expenses_payer_same_trip
    foreign key (trip_id, payer_id)
    references public.participants(trip_id, id)
    on delete restrict
);

create table if not exists public.expense_participants (
  expense_id uuid not null,
  trip_id uuid not null,
  participant_id uuid not null,
  share_cents bigint not null check (share_cents >= 0),
  primary key (expense_id, participant_id),
  constraint expense_participants_expense_same_trip
    foreign key (trip_id, expense_id)
    references public.expenses(trip_id, id)
    on delete cascade,
  constraint expense_participants_participant_same_trip
    foreign key (trip_id, participant_id)
    references public.participants(trip_id, id)
    on delete restrict
);

create index if not exists participants_trip_id_idx on public.participants(trip_id);
create index if not exists participants_user_id_idx on public.participants(user_id);
create index if not exists expenses_trip_created_idx on public.expenses(trip_id, created_at desc);
create index if not exists expense_participants_trip_idx on public.expense_participants(trip_id);

alter table public.trips enable row level security;
alter table public.participants enable row level security;
alter table public.trip_versions enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;

create or replace function public.is_trip_member(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.participants
      where trip_id = target_trip_id
        and user_id = auth.uid()
    );
$$;

revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;

drop policy if exists "Reisemitglieder lesen Reisen" on public.trips;
create policy "Reisemitglieder lesen Reisen"
on public.trips
for select
to authenticated
using (public.is_trip_member(id));

drop policy if exists "Reisemitglieder lesen Teilnehmerinnen" on public.participants;
create policy "Reisemitglieder lesen Teilnehmerinnen"
on public.participants
for select
to authenticated
using (public.is_trip_member(trip_id));

drop policy if exists "Reisemitglieder lesen Versionsstand" on public.trip_versions;
create policy "Reisemitglieder lesen Versionsstand"
on public.trip_versions
for select
to authenticated
using (public.is_trip_member(trip_id));

drop policy if exists "Reisemitglieder lesen Ausgaben" on public.expenses;
create policy "Reisemitglieder lesen Ausgaben"
on public.expenses
for select
to authenticated
using (public.is_trip_member(trip_id));

drop policy if exists "Reisemitglieder lesen Anteile" on public.expense_participants;
create policy "Reisemitglieder lesen Anteile"
on public.expense_participants
for select
to authenticated
using (public.is_trip_member(trip_id));

revoke all on public.trips, public.participants, public.trip_versions, public.expenses, public.expense_participants from anon;
revoke insert, update, delete on public.trips, public.participants, public.trip_versions, public.expenses, public.expense_participants from authenticated;
grant select on public.trips, public.participants, public.trip_versions, public.expenses, public.expense_participants to authenticated;

create or replace function public.save_expense(
  p_trip_id uuid,
  p_payer_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_participant_ids uuid[],
  p_share_cents bigint[],
  p_expense_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_expense_id uuid;
  existing_trip_id uuid;
  participant_count integer;
  share_total bigint;
begin
  if auth.uid() is null or not public.is_trip_member(p_trip_id) then
    raise exception 'Zugriff verweigert';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'Ungültiger Betrag';
  end if;

  if p_description is null or char_length(trim(p_description)) < 1 or char_length(trim(p_description)) > 120 then
    raise exception 'Ungültige Beschreibung';
  end if;

  participant_count := coalesce(array_length(p_participant_ids, 1), 0);
  if participant_count = 0 or participant_count <> coalesce(array_length(p_share_cents, 1), 0) then
    raise exception 'Ungültige Beteiligung';
  end if;

  if (select count(distinct item) from unnest(p_participant_ids) as item) <> participant_count then
    raise exception 'Teilnehmerinnen dürfen nicht doppelt vorkommen';
  end if;

  select coalesce(sum(item), 0) into share_total from unnest(p_share_cents) as item;
  if exists (select 1 from unnest(p_share_cents) as item where item < 0)
     or share_total <> p_amount_cents then
    raise exception 'Die Anteile ergeben nicht den Betrag';
  end if;

  if not exists (
    select 1 from public.participants
    where id = p_payer_id and trip_id = p_trip_id
  ) then
    raise exception 'Ungültige zahlende Person';
  end if;

  if (
    select count(*) from public.participants
    where trip_id = p_trip_id and id = any(p_participant_ids)
  ) <> participant_count then
    raise exception 'Ungültige beteiligte Person';
  end if;

  if p_expense_id is null then
    target_expense_id := gen_random_uuid();
    insert into public.expenses (id, trip_id, payer_id, description, amount_cents)
    values (target_expense_id, p_trip_id, p_payer_id, trim(p_description), p_amount_cents);
  else
    select trip_id into existing_trip_id
    from public.expenses
    where id = p_expense_id;

    if existing_trip_id is null or existing_trip_id <> p_trip_id then
      raise exception 'Ausgabe nicht gefunden';
    end if;

    target_expense_id := p_expense_id;
    update public.expenses
    set payer_id = p_payer_id,
        description = trim(p_description),
        amount_cents = p_amount_cents,
        updated_at = now()
    where id = target_expense_id;

    delete from public.expense_participants where expense_id = target_expense_id;
  end if;

  insert into public.expense_participants (
    expense_id,
    trip_id,
    participant_id,
    share_cents
  )
  select target_expense_id, p_trip_id, item.participant_id, item.share_cents
  from unnest(p_participant_ids, p_share_cents) as item(participant_id, share_cents);

  insert into public.trip_versions (trip_id, version, updated_at)
  values (p_trip_id, 1, now())
  on conflict (trip_id) do update
  set version = public.trip_versions.version + 1,
      updated_at = now();

  return target_expense_id;
end;
$$;

revoke all on function public.save_expense(uuid, uuid, text, bigint, uuid[], bigint[], uuid) from public;
grant execute on function public.save_expense(uuid, uuid, text, bigint, uuid[], bigint[], uuid) to authenticated;

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_trip_id uuid;
begin
  select trip_id into target_trip_id
  from public.expenses
  where id = p_expense_id;

  if target_trip_id is null then
    raise exception 'Ausgabe nicht gefunden';
  end if;

  if auth.uid() is null or not public.is_trip_member(target_trip_id) then
    raise exception 'Zugriff verweigert';
  end if;

  delete from public.expenses where id = p_expense_id;

  insert into public.trip_versions (trip_id, version, updated_at)
  values (target_trip_id, 1, now())
  on conflict (trip_id) do update
  set version = public.trip_versions.version + 1,
      updated_at = now();
end;
$$;

revoke all on function public.delete_expense(uuid) from public;
grant execute on function public.delete_expense(uuid) to authenticated;

create or replace function public.can_read_trip_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.participants
      where user_id = auth.uid()
        and trip_id::text = split_part(object_name, '/', 1)
    );
$$;

revoke all on function public.can_read_trip_photo(text) from public;
grant execute on function public.can_read_trip_photo(text) to authenticated;

drop policy if exists "Reisemitglieder lesen privates Gruppenfoto" on storage.objects;
create policy "Reisemitglieder lesen privates Gruppenfoto"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trip-photos'
  and public.can_read_trip_photo(name)
);

-- Ein geschützter Versionszähler löst Live-Aktualisierungen aus. Dadurch müssen
-- keine DELETE-Ereignisse der eigentlichen Ausgabentabellen übertragen werden.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trip_versions'
  ) then
    alter publication supabase_realtime add table public.trip_versions;
  end if;
end;
$$;

-- Feste technische IDs erleichtern die Einrichtung; sie sind keine Geheimnisse.
insert into public.trips (id, name)
values ('b1bf864e-1228-4fe8-8f93-e2bb909875a1', 'Mallorca')
on conflict (id) do update set name = excluded.name;

insert into public.trip_versions (trip_id, version)
values ('b1bf864e-1228-4fe8-8f93-e2bb909875a1', 0)
on conflict (trip_id) do nothing;

insert into public.participants (id, trip_id, name, avatar_configuration)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'b1bf864e-1228-4fe8-8f93-e2bb909875a1',
    'Yvonne',
    '{"size":"300% auto","position":"22% 69%"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'b1bf864e-1228-4fe8-8f93-e2bb909875a1',
    'Alice',
    '{"size":"300% auto","position":"98% 57%"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'b1bf864e-1228-4fe8-8f93-e2bb909875a1',
    'Birgit',
    '{"size":"300% auto","position":"34% 26%"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'b1bf864e-1228-4fe8-8f93-e2bb909875a1',
    'Svenja',
    '{"size":"300% auto","position":"67% 30%"}'::jsonb
  )
on conflict (id) do update
set name = excluded.name,
    avatar_configuration = excluded.avatar_configuration;
