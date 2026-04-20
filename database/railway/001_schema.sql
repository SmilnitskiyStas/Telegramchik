create type user_role as enum ('user', 'manager', 'admin');
create type check_status as enum (
  'new',
  'pending',
  'reviewed',
  'discussion_required',
  'completed',
  'overdue'
);
create type action_taken as enum (
  'removed',
  'left_on_shelf',
  'discounted',
  'returned',
  'checked_ok',
  'not_found',
  'other'
);
create type delivery_batch_status as enum ('open', 'closed');

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists stores (
  id bigserial primary key,
  store_code text not null unique,
  store_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists users (
  id bigserial primary key,
  store_id bigint not null references stores(id) on update cascade on delete restrict,
  name text not null,
  surname text not null,
  user_chat_id bigint not null unique,
  role user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists products (
  id bigserial primary key,
  article text not null,
  barcode text not null unique,
  product_name text not null,
  units_of_measurement text not null,
  category text not null,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists delivery_batches (
  id bigserial primary key,
  store_id bigint not null references stores(id) on update cascade on delete restrict,
  created_by_user_id bigint references users(id) on update cascade on delete set null,
  delivery_date date not null,
  batch_number integer not null check (batch_number >= 1),
  status delivery_batch_status not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (store_id, delivery_date, batch_number)
);

create table if not exists product_batches (
  id bigserial primary key,
  product_id bigint not null references products(id) on update cascade on delete restrict,
  store_id bigint not null references stores(id) on update cascade on delete restrict,
  delivery_batch_id bigint references delivery_batches(id) on update cascade on delete set null,
  quantity integer not null check (quantity >= 0),
  expiry_date date not null,
  delivery_date date,
  notified boolean not null default false,
  notified_at timestamptz,
  notified_days integer not null default 7 check (notified_days >= 0),
  check_status check_status not null default 'new',
  checked_by_user_id bigint references users(id) on update cascade on delete set null,
  checked_at timestamptz,
  action_taken action_taken,
  action_note text,
  intake_note text,
  discussion_required boolean not null default false,
  discussion_note text,
  discussion_requested_by_user_id bigint references users(id) on update cascade on delete set null,
  discussion_requested_at timestamptz,
  admin_decision text,
  admin_decision_note text,
  admin_decision_by_user_id bigint references users(id) on update cascade on delete set null,
  admin_decision_at timestamptz,
  created_by_user_id bigint references users(id) on update cascade on delete set null,
  updated_by_user_id bigint references users(id) on update cascade on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (product_id, store_id, expiry_date),
  constraint chk_product_batches_other_action_note
    check (action_taken is distinct from 'other'::action_taken or nullif(btrim(action_note), '') is not null),
  constraint chk_product_batches_discussion_note
    check (discussion_required = false or nullif(btrim(discussion_note), '') is not null)
);

create table if not exists activity_log (
  id bigserial primary key,
  user_id bigint not null references users(id) on update cascade on delete restrict,
  action_type text not null,
  batch_id bigint references product_batches(id) on update cascade on delete set null,
  product_id bigint references products(id) on update cascade on delete set null,
  store_id bigint references stores(id) on update cascade on delete set null,
  old_quantity integer,
  new_quantity integer,
  old_expiry_date date,
  new_expiry_date date,
  comment text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists notification_log (
  id bigserial primary key,
  batch_id bigint references product_batches(id) on update cascade on delete set null,
  product_id bigint references products(id) on update cascade on delete set null,
  store_id bigint references stores(id) on update cascade on delete set null,
  user_id bigint references users(id) on update cascade on delete set null,
  notification_type text not null,
  message_text text not null,
  sent_at timestamptz not null default timezone('utc', now())
);

create table if not exists user_sessions (
  id bigserial primary key,
  user_id bigint not null references users(id) on update cascade on delete cascade,
  session_key text not null,
  session_state jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, session_key)
);

create table if not exists app_notification_settings (
  settings_key text primary key default 'default',
  enabled boolean not null default false,
  chat_id text not null default '',
  send_time time not null default '08:00',
  days_before integer not null default 7 check (days_before >= 1 and days_before <= 30),
  last_sent_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists telegram_bot_state (
  state_key text primary key default 'default',
  last_update_id bigint,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_users_store_id on users(store_id);
create index if not exists idx_products_article on products(article);
create index if not exists idx_products_category on products(category);
create index if not exists idx_delivery_batches_store_date on delivery_batches(store_id, delivery_date, batch_number);
create index if not exists idx_delivery_batches_status on delivery_batches(status);
create index if not exists idx_product_batches_store_status on product_batches(store_id, check_status);
create index if not exists idx_product_batches_expiry_date on product_batches(expiry_date);
create index if not exists idx_product_batches_notified on product_batches(notified, notified_days);
create index if not exists idx_activity_log_user_id on activity_log(user_id);
create index if not exists idx_activity_log_batch_id on activity_log(batch_id);
create index if not exists idx_activity_log_product_id on activity_log(product_id);
create index if not exists idx_activity_log_store_id on activity_log(store_id);
create index if not exists idx_notification_log_batch_id on notification_log(batch_id);
create index if not exists idx_notification_log_product_id on notification_log(product_id);
create index if not exists idx_notification_log_store_id on notification_log(store_id);
create index if not exists idx_notification_log_user_id on notification_log(user_id);

drop trigger if exists trg_stores_set_updated_at on stores;
create trigger trg_stores_set_updated_at before update on stores for each row execute function set_updated_at();
drop trigger if exists trg_users_set_updated_at on users;
create trigger trg_users_set_updated_at before update on users for each row execute function set_updated_at();
drop trigger if exists trg_products_set_updated_at on products;
create trigger trg_products_set_updated_at before update on products for each row execute function set_updated_at();
drop trigger if exists trg_delivery_batches_set_updated_at on delivery_batches;
create trigger trg_delivery_batches_set_updated_at before update on delivery_batches for each row execute function set_updated_at();
drop trigger if exists trg_product_batches_set_updated_at on product_batches;
create trigger trg_product_batches_set_updated_at before update on product_batches for each row execute function set_updated_at();
drop trigger if exists trg_user_sessions_set_updated_at on user_sessions;
create trigger trg_user_sessions_set_updated_at before update on user_sessions for each row execute function set_updated_at();
drop trigger if exists trg_app_notification_settings_set_updated_at on app_notification_settings;
create trigger trg_app_notification_settings_set_updated_at before update on app_notification_settings for each row execute function set_updated_at();
drop trigger if exists trg_telegram_bot_state_set_updated_at on telegram_bot_state;
create trigger trg_telegram_bot_state_set_updated_at before update on telegram_bot_state for each row execute function set_updated_at();

insert into app_notification_settings (settings_key) values ('default')
on conflict (settings_key) do nothing;

insert into telegram_bot_state (state_key) values ('default')
on conflict (state_key) do nothing;

create or replace view api_stores_v as
select
  s.id,
  s.store_code as code,
  coalesce(s.store_name, s.store_code) as name,
  s.is_active
from stores s;

create or replace function api_employee_activity_log(p_user_id bigint, p_limit integer default 10)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'at', to_char(src.created_at at time zone 'utc', 'YYYY-MM-DD HH24:MI'),
        'action', coalesce(nullif(btrim(src.comment), ''), src.action_type)
      )
      order by src.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select created_at, action_type, comment
    from activity_log
    where user_id = p_user_id
    order by created_at desc
    limit greatest(coalesce(p_limit, 10), 1)
  ) as src;
$$;

create or replace view api_employees_v as
select
  u.id,
  u.name,
  u.surname,
  concat_ws(' ', u.name, u.surname) as full_name,
  u.role::text as role,
  s.id as store_id,
  coalesce(s.store_name, s.store_code) as store_name,
  u.user_chat_id::text as telegram_client_id,
  case when u.is_active then 'на зміні' else 'відсутній' end as status,
  coalesce(to_char(last_log.created_at at time zone 'utc', 'YYYY-MM-DD HH24:MI'), to_char(u.updated_at at time zone 'utc', 'YYYY-MM-DD HH24:MI')) as last_activity_at,
  coalesce(nullif(btrim(last_log.comment), ''), last_log.action_type, 'Ще немає дій') as last_action,
  api_employee_activity_log(u.id, 10) as activity_log
from users u
join stores s on s.id = u.store_id
left join lateral (
  select created_at, action_type, comment
  from activity_log
  where user_id = u.id
  order by created_at desc
  limit 1
) as last_log on true;

create or replace view api_products_v as
select
  pb.id,
  p.id as product_id,
  pb.delivery_batch_id,
  p.product_name as name,
  p.category,
  p.barcode,
  p.image_url,
  coalesce(to_char(pb.delivery_date, 'YYYY-MM-DD'), to_char(pb.expiry_date, 'YYYY-MM-DD')) as batch,
  pb.store_id,
  coalesce(s.store_name, s.store_code) as store_name,
  pb.quantity,
  coalesce(to_char(pb.delivery_date, 'YYYY-MM-DD'), '') as received_at,
  to_char(pb.expiry_date, 'YYYY-MM-DD') as expires_at,
  case pb.check_status
    when 'new' then 'нове'
    when 'pending' then 'перевірити'
    when 'reviewed' then 'в роботі'
    when 'discussion_required' then 'на погодженні'
    when 'completed' then 'вирішено'
    when 'overdue' then 'списано'
  end as status,
  coalesce(pb.intake_note, pb.action_note, '') as notes,
  coalesce(pb.checked_by_user_id, pb.created_by_user_id, pb.updated_by_user_id) as received_by_user_id,
  concat_ws(' ', ru.name, ru.surname) as receiver_full_name,
  case
    when db.id is null then null
    else concat(to_char(db.delivery_date, 'YYYY-MM-DD'), ' / №', db.batch_number)
  end as delivery_batch_label,
  db.batch_number as delivery_batch_number
from product_batches pb
join products p on p.id = pb.product_id
join stores s on s.id = pb.store_id
left join users ru on ru.id = coalesce(pb.checked_by_user_id, pb.created_by_user_id, pb.updated_by_user_id)
left join delivery_batches db on db.id = pb.delivery_batch_id;

create or replace function ui_status_to_check_status(p_status text)
returns check_status
language sql
immutable
as $$
  select case p_status
    when 'нове' then 'new'::check_status
    when 'перевірити' then 'pending'::check_status
    when 'в роботі' then 'reviewed'::check_status
    when 'на погодженні' then 'discussion_required'::check_status
    when 'вирішено' then 'completed'::check_status
    when 'списано' then 'overdue'::check_status
    else 'new'::check_status
  end;
$$;
