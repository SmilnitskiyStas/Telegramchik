# TelegramChick

`TelegramChick` це проєкт для контролю термінів придатності товарів, обліку партій по магазинах і операційної роботи через Telegram.

Документація, з якою потрібно звіряти всі зміни:

- `PROJECT_PROMPT.md`
- `telegram_inventory_app_spec.docx`

## Поточний стан

Репозиторій зараз у перехідному стані:

- `apps/web` вже містить локальний MVP-інтерфейс на `React + TypeScript + Vite`
- `apps/api` містить поточний API-шар на `Express + TypeScript`
- додано базовий `MySQL` scaffold через `docker-compose.yml` і `database/schema.sql`
- додано `packages/shared` для спільних доменних типів під цільову модель
- поточна in-memory модель уже розділяє `stores`, `employees`, `productCatalog` і `productBatches`

Цільова архітектура проєкту:

- `MySQL` як джерело правди
- `n8n` як шар автоматизації
- `Telegram Bot` як основний операційний інтерфейс
- `Web app` як додатковий інтерфейс для керування і перегляду

## Структура

- `apps/web` - web-інтерфейс
- `apps/api` - API і поточна інтеграційна логіка
- `packages/shared` - спільні доменні типи і константи
- `database/schema.sql` - початкова схема `MySQL`
- `docs/current-data-model.md` - опис поточної перехідної in-memory моделі
- `docs/store-layout-mvp.md` - перший інкремент окремого модуля карти магазину
- `docker-compose.yml` - локальний запуск `MySQL`

## Локальний запуск

1. Встановити залежності:

```bash
npm install
```

2. Створити локальний `.env` на основі `.env.example`.

3. Запустити `MySQL`:

```bash
npm run db:up
```

4. Запустити API:

```bash
npm run dev:api
```

5. Запустити web:

```bash
npm run dev:web
```

## Змінні середовища

Базові змінні, які вже підготовлені в `.env.example`:

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `APP_URL`
- `N8N_WEBHOOK_BASE_URL`

## База даних

`database/schema.sql` уже містить стартову схему для цільових сутностей:

- `stores`
- `users`
- `products`
- `product_batches`
- `activity_log`
- `notification_log`
- `user_sessions`

Поточний `api` ще не переведений повністю на `MySQL`; це наступний етап.

## Telegram

Поточний MVP вже підтримує базові Telegram-сценарії:

- перевірка статусу бота
- тестове повідомлення
- надсилання повідомлення по товару
- polling команд `/newproduct` і `/addproduct`

Але повний цільовий flow зі статусами `pending`, `discussion_required`, рішенням адміністратора і журналами ще потрібно перенести на нову модель даних.

## Команди

```bash
npm run db:up
npm run db:down
npm run dev:api
npm run dev:web
npm run build:shared
npm run build:api
npm run build:web
```
