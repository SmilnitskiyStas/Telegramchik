do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'delivery_batch_status'
  ) then
    create type delivery_batch_status as enum ('open', 'closed');
  end if;
end
$$;

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

alter table product_batches
  add column if not exists delivery_batch_id bigint references delivery_batches(id) on update cascade on delete set null;

create index if not exists idx_delivery_batches_store_date on delivery_batches(store_id, delivery_date, batch_number);
create index if not exists idx_delivery_batches_status on delivery_batches(status);

drop trigger if exists trg_delivery_batches_set_updated_at on delivery_batches;
create trigger trg_delivery_batches_set_updated_at before update on delivery_batches for each row execute function set_updated_at();

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
    when 'new' then U&'\043d\043e\0432\0435'
    when 'pending' then U&'\043f\0435\0440\0435\0432\0456\0440\0438\0442\0438'
    when 'reviewed' then U&'\0432 \0440\043e\0431\043e\0442\0456'
    when 'discussion_required' then U&'\043d\0430 \043f\043e\0433\043e\0434\0436\0435\043d\043d\0456'
    when 'completed' then U&'\0432\0438\0440\0456\0448\0435\043d\043e'
    when 'overdue' then U&'\0441\043f\0438\0441\0430\043d\043e'
  end as status,
  coalesce(pb.intake_note, pb.action_note, '') as notes,
  coalesce(pb.checked_by_user_id, pb.created_by_user_id, pb.updated_by_user_id) as received_by_user_id,
  concat_ws(' ', ru.name, ru.surname) as receiver_full_name,
  case
    when db.id is null then null
    else concat(to_char(db.delivery_date, 'YYYY-MM-DD'), U&' / \2116', db.batch_number)
  end as delivery_batch_label,
  db.batch_number as delivery_batch_number
from product_batches pb
join products p on p.id = pb.product_id
join stores s on s.id = pb.store_id
left join users ru on ru.id = coalesce(pb.checked_by_user_id, pb.created_by_user_id, pb.updated_by_user_id)
left join delivery_batches db on db.id = pb.delivery_batch_id;
