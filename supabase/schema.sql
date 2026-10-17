-- Run once in a dedicated Supabase project before enabling the community preview.
create extension if not exists pgcrypto;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  rank integer not null unique,
  can_post boolean not null default true,
  can_organize boolean not null default false,
  can_manage_members boolean not null default false
);
insert into public.roles (name,rank,can_post,can_organize,can_manage_members) values
  ('멤버',10,true,false,false),('모더레이터',20,true,true,false),('운영자',30,true,true,true),('소유자',40,true,true,true)
on conflict (name) do nothing;

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  role_id uuid references public.roles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);
insert into public.rooms (name,description) values
  ('오크 이야기','오크통과 숙성 경험을 나누는 공간'),
  ('질문과 답변','사용법과 관리법을 서로 묻고 답하는 공간')
on conflict (name) do nothing;

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  summary text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  user_id uuid not null references public.memberships(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (id,room_id)
);
create index if not exists messages_room_time on public.messages(room_id,created_at desc);
create index if not exists messages_topic_time on public.messages(topic_id,created_at desc);
create index if not exists messages_search on public.messages using gin (to_tsvector('simple', body));

create or replace function public.is_active_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where user_id = auth.uid() and status = 'active');
$$;
create or replace function public.member_can(permission text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((case permission when 'post' then r.can_post when 'organize' then r.can_organize when 'manage_members' then r.can_manage_members else false end),false)
  from memberships m join roles r on r.id = m.role_id where m.user_id = auth.uid() and m.status = 'active';
$$;
revoke all on function public.is_active_member() from public;
revoke all on function public.member_can(text) from public;
grant execute on function public.is_active_member(),public.member_can(text) to authenticated;

create or replace function public.create_pending_membership() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into memberships(user_id,display_name,status,role_id)
  values (new.id, left(split_part(new.email,'@',1),60), 'pending', (select id from roles where name='멤버'));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_pending_membership();

create or replace function public.guard_membership_change() returns trigger language plpgsql security definer set search_path = public as $$
declare target_rank integer; actor_rank integer;
begin
  if auth.uid() is null then return new; end if; -- trusted service role / SQL editor
  if old.user_id = auth.uid() then raise exception 'Cannot change your own membership'; end if;
  select rank into actor_rank from memberships m join roles r on r.id=m.role_id where m.user_id=auth.uid() and m.status='active';
  select rank into target_rank from roles where id=new.role_id;
  if actor_rank is null or actor_rank <= coalesce(target_rank,0) then raise exception 'Cannot assign an equal or higher role'; end if;
  if actor_rank <= coalesce((select rank from roles where id=old.role_id),0) then raise exception 'Cannot change an equal or higher role'; end if;
  if new.user_id <> old.user_id or new.id <> old.id or new.created_at <> old.created_at or new.display_name <> old.display_name then raise exception 'Only status and role may change'; end if;
  return new;
end;
$$;
drop trigger if exists guard_membership_change on public.memberships;
create trigger guard_membership_change before update on public.memberships for each row execute function public.guard_membership_change();

alter table public.roles enable row level security;
alter table public.memberships enable row level security;
alter table public.rooms enable row level security;
alter table public.topics enable row level security;
alter table public.messages enable row level security;
revoke all on public.roles,public.memberships,public.rooms,public.topics,public.messages from anon;
grant select on public.roles,public.memberships,public.rooms,public.topics,public.messages to authenticated;
grant update on public.memberships to authenticated;
grant insert on public.messages to authenticated;

create policy roles_read on public.roles for select to authenticated using (public.is_active_member());
create policy memberships_read on public.memberships for select to authenticated using (user_id=auth.uid() or public.member_can('manage_members') or (public.is_active_member() and status='active'));
create policy memberships_manage on public.memberships for update to authenticated using (public.member_can('manage_members')) with check (public.member_can('manage_members'));
create policy rooms_read on public.rooms for select to authenticated using (public.is_active_member());
create policy topics_read on public.topics for select to authenticated using (public.is_active_member());
create policy messages_read on public.messages for select to authenticated using (public.is_active_member());
create policy messages_insert on public.messages for insert to authenticated with check (public.member_can('post') and user_id=auth.uid() and (topic_id is null or exists (select 1 from public.topics where id=topic_id and room_id=messages.room_id)));

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.topics;
