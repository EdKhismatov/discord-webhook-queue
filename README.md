# Discord Webhook Queue

Отказоустойчивый сервис для отправки Discord-вебхуков через очередь RabbitMQ с трекингом доставки в PostgreSQL.

## Стек

| Технология | Назначение |
|---|---|
| NestJS + TypeScript | Фреймворк |
| RabbitMQ (amqp-connection-manager) | Очередь сообщений |
| PostgreSQL + Sequelize | Хранение истории доставки |
| got | HTTP клиент для Discord API |
| Docker Compose | Инфраструктура |

---

## Архитектура

```
POST /webhook/send
       │
       ▼
WebhookController
       │  валидация (ValidationPipe)
       ▼
WebhookService.publish()
       │  создаёт запись в БД (success: null)
       │  кладёт в RabbitMQ
       ▼
   webhook.queue ──── x-dead-letter ──▶ webhook.dlx ──▶ webhook.dlq
       │
       ▼
WebhookProcessor.handleMessage()
       │  rate limit
       ▼
DiscordService.sendWebhook()
       │
       ├── 200 OK     → ack         → success: true
       ├── 429        → nack+requeue → sleep(retryAfter) → повтор
       ├── 400        → nack         → DLQ, success: false
       └── ERROR      → nack+requeue → exponential backoff
                        (после maxRetryCount → DLQ, success: false)
```

---

## Структура проекта

```
src/
├── common/
│   ├── enums/
│   │   └── webhook-event.enum.ts       # WebhookEvent (webhook, order, register, service)
│   └── interceptor/
│       └── logging.interceptor.ts      # логирование HTTP запросов (метод, маршрут, статус, время)
├── config/
│   ├── app-config.ts                   # загрузка и валидация env через class-validator
│   └── dto/
│       ├── app-config.dto.ts           # AppConfigDto
│       ├── discord-config.dto.ts              # DiscordConfigDto
│       ├── rabbit.dto.ts               # RabbitConfigDto
│       └── db-config.dto.ts                   # DbConfigDto
├── module/
│   ├── database/
│   │   ├── database.module.ts
│   │   └── entities/
│   │       └── discord-hook.model.ts   # модель discord_hooks
│   ├── discord/
│   │   └── discord.service.ts          # HTTP запросы к Discord
│   ├── rabbit/
│   │   └── rabbit.module.ts            # глобальный провайдер соединения
│   └── webhook/
│       ├── webhook.controller.ts       # POST /webhook/send
│       ├── webhook.service.ts          # publish в очередь + запись в БД
│       ├── webhook.processor.ts        # consume + обработка статусов
│       ├── webhook.topology.ts         # объявление очередей и exchange (WebhookQueue enum)
│       └── dto/
│           └── send-webhook.dto.ts     # входящий DTO
├── validation/
│   └── validate.dto.ts                 # утилита валидации конфига
└── main.ts
```

---

## Переменные окружения

Создай файл `.env` в корне проекта:

```env
# App
PORT=3000
NODE_ENV=dev

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_RATE_LIMIT=2          # максимум запросов в секунду
DISCORD_MAX_RETRY_COUNT=5     # после N ошибок → DLQ

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_DEFAULT_USER=guest
RABBIT_PASSWORD=guest

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=discord
```

---

## Быстрый старт

### 1. Запуск инфраструктуры

```bash
docker-compose up -d
```

Поднимает:
- RabbitMQ на портах `5672` (AMQP) и `15672` (Management UI)
- PostgreSQL на порту `5432`

### 2. Установка зависимостей

```bash
npm ci
```

### 3. Запуск приложения

```bash
# dev режим с hot-reload
npm run start:dev

# production
npm run start:prod
```

Таблица `discord_hooks` создаётся автоматически при старте (`synchronize: true`).

---

## API

### POST /webhook/send

Принимает вебхук, кладёт в очередь и сразу возвращает `202 Accepted`.

**Request body:**
```json
{
  "title": "Новый пользователь",
  "description": "Пользователь user@example.com зарегистрировался",
  "color": 5814783,
  "footer": {
    "text": "registration-service"
  }
}
```

| Поле | Тип | Обязательное |
|---|---|---|
| title | string | да |
| description | string | да |
| color | number | нет |
| footer.text | string | нет |

**Response `202 Accepted`:**
```json
{
  "message": "Webhook accepted and queued"
}
```

---

## RabbitMQ топология

| Сущность | Тип | Назначение |
|---|---|---|
| `webhook.queue` | queue | основная очередь входящих вебхуков |
| `webhook.dlx` | direct exchange | маршрутизатор "мёртвых" сообщений |
| `webhook.dlq` | queue | хранилище невалидных и исчерпавших retry сообщений |

Сообщения помечены как **persistent** (`deliveryMode: 2`) — не теряются при перезапуске RabbitMQ.

**prefetch(1)** — процессор берёт только одно сообщение за раз, обеспечивая соблюдение rate limit.

---

## Обработка ошибок

| Статус Discord | Действие | БД |
|---|---|---|
| 200 OK | `ack` — сообщение удалено из очереди | `success: true` |
| 429 Rate Limited | `nack(requeue=true)` + `sleep(retryAfter)` | `failedTries++`, `nextRetryAt` |
| 400 Bad Request | `nack(requeue=false)` → DLQ | `success: false`, `failedTries++` |
| Сетевая ошибка | `nack(requeue=true)` + exponential backoff | `failedTries++`, `nextRetryAt` |
| Ошибка > maxRetryCount | `nack(requeue=false)` → DLQ | `success: false` |

### Exponential backoff при ошибках

```
попытка 0 → ждём  1с
попытка 1 → ждём  2с
попытка 2 → ждём  4с
попытка 3 → ждём  8с
попытка 4 → ждём 16с
попытка 5 → DLQ  (при maxRetryCount=5)

максимум: 30с
```

---

## База данных

### Таблица `discord_hooks`

| Колонка | Тип | Описание                                                          |
|---|---|-------------------------------------------------------------------|
| id | UUID | первичный ключ                                                    |
| messageId | UUID | уникальный ID из RabbitMQ                                         |
| event | string | тип события (например: `webhook`, `register`, `order`, `service`) |
| payload | JSONB | тело вебхука                                                      |
| success | boolean / null | `null` — в работе, `true` — доставлен, `false` — провал           |
| failedTries | integer | количество неудачных попыток                                      |
| lastTryAt | timestamptz | время последней попытки                                           |
| nextRetryAt | timestamptz | запланированное время следующей попытки                           |
| createdAt | timestamptz | время создания записи                                             |
| updatedAt | timestamptz | время последнего обновления                                       |

---

## Логирование

Все HTTP запросы логируются глобальным `LoggingInterceptor`:

```
[HTTP] POST /webhook/send 202 — 14ms
[HTTP] POST /webhook/send 400 — 3ms
```

Процессор логирует каждый этап обработки:
```
[WebhookProcessor] Processing webhook: Новый пользователь
[WebhookProcessor] Webhook sent: Новый пользователь
[WebhookProcessor] Rate limited, waiting 2000ms
[WebhookProcessor] Invalid webhook sent to DLQ: Новый пользователь
```

---

## Типы событий (WebhookEvent)

Поле `event` в таблице `discord_hooks` использует enum `WebhookEvent`:

| Значение | Описание |
|---|---|
| `webhook` | общий вебхук |
| `register` | регистрация пользователя |
| `order` | событие заказа |
| `service` | служебное событие |

---

## Мониторинг

### RabbitMQ Management UI

```
http://localhost:15672
```

Логин: `RABBITMQ_DEFAULT_USER` / `RABBIT_PASSWORD` из `.env`

Полезные разделы:
- **Queues** → состояние очередей, количество сообщений
- **webhook.dlq** → Get Messages → просмотр невалидных вебхуков с историей `x-death`

---

## Нагрузочное тестирование

```bash
# 60 запросов (по умолчанию)
node scripts/load-test.mjs

# 200 запросов
node scripts/load-test.mjs 200
```

Скрипт отправляет три типа запросов:
- **VALID** — корректные вебхуки → `webhook.queue`
- **DLQ_TRIGGER** (каждый 5-й) — пустые поля, Discord вернёт 400 → `webhook.dlq`
- **INVALID** (каждый 7-й) — нет обязательных полей → наш `ValidationPipe` → `400`

Пример вывода:
```
=== Results ===
Total time  : 312ms
Req/sec     : 192
Avg latency : 48ms | Min: 12ms | Max: 203ms

--- By type ---
VALID        total: 41 | 202: 41 | 400: 0  | other: 0
DLQ_TRIGGER  total: 11 | 202: 11 | 400: 0  | other: 0
INVALID      total: 8  | 202: 0  | 400: 8  | other: 0

--- Expected in RabbitMQ ---
Queued total  : 52
→ webhook.queue (VALID)   : 41
→ DLQ bound (DLQ_TRIGGER) : 11 (after Discord rejects them)
Rejected by us (INVALID)  : 8
```

---

## CI/CD

GitHub Actions (`.github/workflows/check.yml`) при каждом push:

1. Checkout
2. Setup Node.js
3. `npm ci`
4. `npm run build`
5. `npm run lint`