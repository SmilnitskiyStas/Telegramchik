insert into public.stores (store_code, store_name)
values
  ('M1/1', 'Магазин Поділ'),
  ('M2', 'Магазин Оболонь'),
  ('M3', 'Магазин Лівобережна')
on conflict (store_code) do update
set store_name = excluded.store_name;

insert into public.users (store_id, name, surname, user_chat_id, role)
select s.id, v.name, v.surname, v.user_chat_id, v.role::public.user_role
from (
  values
    ('M1/1', 'Ірина', 'Мельник', 591179640::bigint, 'manager'),
    ('M2', 'Олег', 'Ткачук', 5358869619::bigint, 'user'),
    ('M3', 'Наталія', 'Бойко', 700112233::bigint, 'admin')
) as v(store_code, name, surname, user_chat_id, role)
join public.stores s on s.store_code = v.store_code
on conflict (user_chat_id) do update
set
  store_id = excluded.store_id,
  name = excluded.name,
  surname = excluded.surname,
  role = excluded.role;

insert into public.products (article, barcode, product_name, units_of_measurement, category)
values
  ('MILK-25', '4820000012345', 'Молоко 2.5%', 'pcs', 'Молочні продукти'),
  ('YOG-STRAW', '4820000098765', 'Йогурт полуниця', 'pcs', 'Йогурти')
on conflict (barcode) do update
set
  article = excluded.article,
  product_name = excluded.product_name,
  units_of_measurement = excluded.units_of_measurement,
  category = excluded.category;

insert into public.product_batches (
  product_id,
  store_id,
  quantity,
  expiry_date,
  delivery_date,
  notified,
  notified_days,
  check_status,
  action_note,
  created_by_user_id,
  updated_by_user_id
)
select
  p.id,
  s.id,
  v.quantity,
  v.expiry_date,
  v.delivery_date,
  v.notified,
  v.notified_days,
  v.check_status::public.check_status,
  v.action_note,
  u.id,
  u.id
from (
  values
    ('4820000012345', 'M2', 18, date '2026-04-20', date '2026-04-10', false, 7, 'pending', 'Тестова партія для MVP', 5358869619::bigint),
    ('4820000098765', 'M2', 9, date '2026-04-14', date '2026-04-08', true, 7, 'reviewed', 'Потрібно узгодити акцію', 5358869619::bigint)
) as v(barcode, store_code, quantity, expiry_date, delivery_date, notified, notified_days, check_status, action_note, user_chat_id)
join public.products p on p.barcode = v.barcode
join public.stores s on s.store_code = v.store_code
join public.users u on u.user_chat_id = v.user_chat_id
on conflict (product_id, store_id, expiry_date) do update
set
  quantity = excluded.quantity,
  delivery_date = excluded.delivery_date,
  notified = excluded.notified,
  notified_days = excluded.notified_days,
  check_status = excluded.check_status,
  action_note = excluded.action_note,
  updated_by_user_id = excluded.updated_by_user_id;
