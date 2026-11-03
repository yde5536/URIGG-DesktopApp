-- 허브(Security.log HUB)의 할 일·메모를 여러 PC가 같이 쓰기 위한 표
-- 코워크 캘린더와 같은 Supabase 프로젝트에서 실행: 대시보드 > SQL Editor 에 붙여넣고 Run
-- 로그인한 본인 것만 보고 고칠 수 있다 (ddays 표와 같은 규칙). 타이머·알람·공부 시간은 PC마다 따로라 여기 없다.

create table public.hub_items (
  id          uuid primary key,                       -- 허브가 만든 id (어느 PC에서 만들었든 같은 줄)
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('todo', 'memo')),
  text        text not null check (char_length(text) between 1 and 2000),
  done        boolean not null default false,          -- 할 일만 씀
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index hub_items_user_kind_idx on public.hub_items (user_id, kind);

alter table public.hub_items enable row level security;

create policy "hub_items: owner only" on public.hub_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.hub_items to authenticated;
grant all on public.hub_items to service_role;
