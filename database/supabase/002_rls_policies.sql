create or replace function public.current_app_user_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_store_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select u.store_id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.is_active = true
  limit 1;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select u.role
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.is_active = true
  limit 1;
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('manager'::public.user_role, 'admin'::public.user_role), false);
$$;

alter table public.stores enable row level security;
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.product_batches enable row level security;
alter table public.activity_log enable row level security;
alter table public.notification_log enable row level security;
alter table public.user_sessions enable row level security;

revoke all on public.stores from anon, authenticated;
revoke all on public.users from anon, authenticated;
revoke all on public.products from anon, authenticated;
revoke all on public.product_batches from anon, authenticated;
revoke all on public.activity_log from anon, authenticated;
revoke all on public.notification_log from anon, authenticated;
revoke all on public.user_sessions from anon, authenticated;

grant select on public.stores to authenticated;
grant select, update on public.users to authenticated;
grant select, insert, update on public.products to authenticated;
grant select, insert, update on public.product_batches to authenticated;
grant select, insert on public.activity_log to authenticated;
grant select, insert on public.notification_log to authenticated;
grant select, insert, update, delete on public.user_sessions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists stores_select_same_store on public.stores;
create policy stores_select_same_store
on public.stores
for select
to authenticated
using (id = public.current_store_id());

drop policy if exists users_select_same_store on public.users;
create policy users_select_same_store
on public.users
for select
to authenticated
using (store_id = public.current_store_id());

drop policy if exists users_update_self on public.users;
create policy users_update_self
on public.users
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid() and store_id = public.current_store_id());

drop policy if exists products_select_all_authenticated on public.products;
create policy products_select_all_authenticated
on public.products
for select
to authenticated
using (true);

drop policy if exists products_insert_manager_admin on public.products;
create policy products_insert_manager_admin
on public.products
for insert
to authenticated
with check (public.is_manager_or_admin());

drop policy if exists products_update_manager_admin on public.products;
create policy products_update_manager_admin
on public.products
for update
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

drop policy if exists product_batches_select_same_store on public.product_batches;
create policy product_batches_select_same_store
on public.product_batches
for select
to authenticated
using (store_id = public.current_store_id());

drop policy if exists product_batches_insert_same_store on public.product_batches;
create policy product_batches_insert_same_store
on public.product_batches
for insert
to authenticated
with check (
  store_id = public.current_store_id()
  and (
    created_by_user_id is null
    or created_by_user_id = public.current_app_user_id()
  )
);

drop policy if exists product_batches_update_same_store on public.product_batches;
create policy product_batches_update_same_store
on public.product_batches
for update
to authenticated
using (store_id = public.current_store_id())
with check (
  store_id = public.current_store_id()
  and (
    updated_by_user_id is null
    or updated_by_user_id = public.current_app_user_id()
  )
  and (
    checked_by_user_id is null
    or checked_by_user_id = public.current_app_user_id()
    or public.is_manager_or_admin()
  )
  and (
    discussion_requested_by_user_id is null
    or discussion_requested_by_user_id = public.current_app_user_id()
    or public.is_manager_or_admin()
  )
  and (
    admin_decision_by_user_id is null
    or (
      admin_decision_by_user_id = public.current_app_user_id()
      and public.is_manager_or_admin()
    )
  )
);

drop policy if exists activity_log_select_same_store on public.activity_log;
create policy activity_log_select_same_store
on public.activity_log
for select
to authenticated
using (store_id = public.current_store_id());

drop policy if exists activity_log_insert_same_store on public.activity_log;
create policy activity_log_insert_same_store
on public.activity_log
for insert
to authenticated
with check (
  user_id = public.current_app_user_id()
  and (
    store_id is null
    or store_id = public.current_store_id()
  )
);

drop policy if exists notification_log_select_same_store on public.notification_log;
create policy notification_log_select_same_store
on public.notification_log
for select
to authenticated
using (store_id = public.current_store_id());

drop policy if exists notification_log_insert_same_store on public.notification_log;
create policy notification_log_insert_same_store
on public.notification_log
for insert
to authenticated
with check (
  store_id = public.current_store_id()
  and (
    user_id is null
    or exists (
      select 1
      from public.users u
      where u.id = user_id
        and u.store_id = public.current_store_id()
    )
  )
);

drop policy if exists user_sessions_select_own on public.user_sessions;
create policy user_sessions_select_own
on public.user_sessions
for select
to authenticated
using (user_id = public.current_app_user_id());

drop policy if exists user_sessions_insert_own on public.user_sessions;
create policy user_sessions_insert_own
on public.user_sessions
for insert
to authenticated
with check (user_id = public.current_app_user_id());

drop policy if exists user_sessions_update_own on public.user_sessions;
create policy user_sessions_update_own
on public.user_sessions
for update
to authenticated
using (user_id = public.current_app_user_id())
with check (user_id = public.current_app_user_id());

drop policy if exists user_sessions_delete_own on public.user_sessions;
create policy user_sessions_delete_own
on public.user_sessions
for delete
to authenticated
using (user_id = public.current_app_user_id());
