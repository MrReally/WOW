# Подключение мобильного приложения к заказам SEVER

Документ для разработчика приложения (и для его ИИ-помощника). Здесь всё, что нужно, чтобы принимать заказы с сайта: что делает сайт, что должно сделать приложение, готовый код и проверка.

Краткая справка по формату — в [`webhook.md`](webhook.md). Этот документ — пошаговая инструкция.

---

## 1. Что происходит

Клиент оформляет заказ на сайте. Сервер сайта сохраняет его и **сам отправляет** на ваш адрес HTTP-запрос `POST` с данными заказа в JSON и подписью. Вам нужно:

1. Поднять один публичный HTTPS-адрес, который принимает этот `POST`.
2. Проверить подпись.
3. Сохранить заказ (не дублируя по `id`) и ответить кодом `200`.
4. Показать заказ в приложении / отправить пуш — как вам удобно.

```
клиент ──► сайт ──► сервер сайта ──POST + подпись──► ваш адрес ──► база ──► приложение
                          ▲                              │
                          └──── 2xx = принято ◄──────────┘
                          иначе повтор: 1 мин, 5 мин, 30 мин, 2 ч, 12 ч
```

Приложение в этом запросе ничего не отправляет на сайт и ключей сайта не знает — только общий секрет для проверки подписи.

## 2. Что нужно согласовать с владельцем сайта

| Что | Кто даёт | Куда |
|---|---|---|
| Публичный HTTPS-адрес приёмника, например `https://api.myapp.com/hooks/sever` | вы | владельцу сайта |
| Общий секрет — случайная строка от 32 символов (`openssl rand -hex 32`) | вы придумываете | владельцу сайта, **не в чат и не в репозиторий** |
| Ключ для опроса `X-Orders-Key` (нужен только если будете забирать заказы запросом) | владелец сайта | вам |

Владелец вписывает адрес и секрет на сервере сайта — код сайта менять не нужно.

**Тестовый и боевой сайт отдельные.** В теле запроса есть поле `source`: `test` или `live`. Заведите для них разные секреты и не смешивайте заказы в одной таблице без этого поля.

## 3. Формат запроса

```
POST https://<ваш адрес>
Content-Type: application/json; charset=utf-8
User-Agent: SEVER-Webhook/1
X-Sever-Event: order.created
X-Sever-Delivery: 9f3c1a…            уникальный номер этой отправки (для логов)
X-Sever-Timestamp: 1794099157         время отправки, unix-секунды
X-Sever-Signature: sha256=ab12…       подпись
```

Тело:

```json
{
  "id": "ord_20261108_65bf2c",
  "event": "order.created",
  "createdAt": "2026-11-08T00:52:37Z",
  "source": "test",
  "lang": "ru",
  "items": [
    { "id": "behringer-x32",
      "name": { "sr": "Behringer X32 Compact", "ru": "Behringer X32 Compact", "en": "Behringer X32 Compact" },
      "qty": 1, "pricePerDay": 50 },
    { "id": "shure-sm58",
      "name": { "sr": "Shure SM58", "ru": "Shure SM58", "en": "Shure SM58" },
      "qty": 2, "pricePerDay": 7 }
  ],
  "rental": { "start": "2030-05-10", "end": "2030-05-12", "pickupTime": "10:00", "returnTime": "10:00",
              "days": 2, "discountPercent": 0 },
  "totals": { "perDay": 64, "total": 128, "currency": "EUR" },
  "delivery": { "type": "delivery", "address": "Knez Mihailova 1, Beograd" },
  "customer": { "name": "Иван", "telegram": "@ivan", "phone": "+381 60 1234567",
                "instagram": "", "other": "", "preferred": ["whatsapp"] }
}
```

| Поле | Тип | Значение |
|---|---|---|
| `id` | строка | номер заказа. Уникален, при повторе не меняется. **Ключ для защиты от дублей** |
| `event` | строка | сейчас всегда `order.created` |
| `createdAt` | строка | время создания, ISO-8601, UTC |
| `source` | строка | `test` или `live` |
| `lang` | строка | язык клиента: `sr`, `ru`, `en` |
| `items[].id` | строка | идентификатор товара в каталоге сайта |
| `items[].name` | объект | название на трёх языках |
| `items[].qty` | число | количество, 1–99 |
| `items[].pricePerDay` | число | цена за сутки, евро |
| `rental.start`, `rental.end` | строка | даты `ГГГГ-ММ-ДД` |
| `rental.pickupTime`, `rental.returnTime` | строка | время `ЧЧ:ММ` |
| `rental.days` | число | оплачиваемые сутки |
| `rental.discountPercent` | число | `0`, `14` (от 7 суток) или `25` (от 28 суток) |
| `totals.perDay` | число | сумма за сутки |
| `totals.total` | число | **итог за весь срок со скидкой**, посчитан на сервере сайта |
| `totals.currency` | строка | `EUR` |
| `delivery.type` | строка | `delivery` — привезти на `address`; `pickup` — самовывоз (`address` пустой) |
| `customer.name` | строка | имя клиента |
| `customer.telegram/phone/instagram/other` | строка | контакты; **пустые приходят как `""`**, но хотя бы один заполнен |
| `customer.preferred` | массив | как удобнее связаться: `call`, `whatsapp`, `viber`, `other` (может быть пустым) |

Не рассчитывайте на фиксированный набор полей: сайт может добавить новые. Лишние поля игнорируйте.

## 4. Подпись

```
signature = "sha256=" + hex( HMAC_SHA256( секрет, timestamp + "." + тело ) )
```

- `timestamp` — значение заголовка `X-Sever-Timestamp`, как строка.
- `тело` — **те самые байты, которые пришли**. Считайте подпись до разбора JSON и не пересериализуйте тело: пробелы и порядок полей изменят подпись.
- Сравнивайте в постоянное время (`hmac.compare_digest`, `crypto.timingSafeEqual`), а не через `==`.
- Отбрасывайте запросы, у которых `timestamp` отличается от текущего времени больше чем на 5 минут.

Неверная подпись → ответ `401`. Сайт посчитает это неудачей и повторит отправку, поэтому при настоящей ошибке в вашем коде заказ не потеряется, а придёт позже.

## 5. Ответы приложения

| Ответ | Смысл для сайта |
|---|---|
| любой `2xx` | заказ принят, больше не отправлять |
| любой другой код | не принят, повторить по расписанию |
| нет ответа за 10 секунд | не принят, повторить |

Правила для приёмника:
1. **Сначала сохранить, потом отвечать.** Тяжёлую работу (пуш, письма) делайте после ответа.
2. **Дубли — это нормально.** Заказ с тем же `id` может прийти несколько раз (повтор после вашего таймаута). Если `id` уже есть — ничего не добавляйте, но **всё равно ответьте `200`**.
3. Отвечайте быстро — укладывайтесь в пару секунд.

## 6. Готовый приёмник

Любой из вариантов можно взять как есть. Секрет — из переменной окружения `SEVER_WEBHOOK_SECRET`.

### 6.1 Node.js (Express)

```bash
npm init -y && npm i express
export SEVER_WEBHOOK_SECRET="ваш_секрет"
node server.js
```

`server.js`:

```js
const express = require('express');
const crypto = require('crypto');

const SECRET = process.env.SEVER_WEBHOOK_SECRET;
if (!SECRET) throw new Error('Задайте SEVER_WEBHOOK_SECRET');

const app = express();
// ВАЖНО: нужны сырые байты тела — подпись считается по ним
app.post('/hooks/sever', express.raw({ type: '*/*', limit: '256kb' }), (req, res) => {
  const ts = req.get('X-Sever-Timestamp');
  const sig = req.get('X-Sever-Signature') || '';
  const body = req.body; // Buffer

  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.sendStatus(401);
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET)
    .update(ts + '.').update(body).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);

  const order = JSON.parse(body.toString('utf8'));
  saveOrderOnce(order);            // см. ниже — сохранить и не дублировать по id
  res.sendStatus(200);             // сначала ответ…
  setImmediate(() => notify(order)); // …потом пуши и прочее
});

// ── замените на вашу базу ──
const seen = new Map();
function saveOrderOnce(order) {
  if (seen.has(order.id)) return;  // дубль — просто игнорируем
  seen.set(order.id, order);
  console.log('новый заказ', order.id, order.customer.name, order.totals.total, order.totals.currency);
}
function notify(order) { /* отправить пуш в приложение */ }

app.listen(process.env.PORT || 3000);
```

### 6.2 Python (FastAPI)

```bash
pip install fastapi uvicorn
export SEVER_WEBHOOK_SECRET="ваш_секрет"
uvicorn main:app --port 3000
```

`main.py`:

```python
import hashlib
import hmac
import json
import os
import time

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, Response

SECRET = os.environ["SEVER_WEBHOOK_SECRET"]
app = FastAPI()
seen = {}  # замените на вашу базу


def verify(timestamp: str, body: bytes, signature: str) -> bool:
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except (TypeError, ValueError):
        return False
    expected = "sha256=" + hmac.new(SECRET.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def notify(order: dict):
    pass  # отправить пуш в приложение


@app.post("/hooks/sever")
async def hook(request: Request, background: BackgroundTasks):
    body = await request.body()  # сырые байты
    if not verify(request.headers.get("X-Sever-Timestamp"), body, request.headers.get("X-Sever-Signature")):
        raise HTTPException(status_code=401)
    order = json.loads(body)
    if order["id"] not in seen:          # дубль — игнорируем, но отвечаем 200
        seen[order["id"]] = order
        print("новый заказ", order["id"], order["customer"]["name"], order["totals"]["total"])
        background.add_task(notify, order)
    return Response(status_code=200)
```

### 6.3 PHP

```php
<?php
$secret = getenv('SEVER_WEBHOOK_SECRET');
$body = file_get_contents('php://input');                // сырые байты
$ts   = $_SERVER['HTTP_X_SEVER_TIMESTAMP'] ?? '';
$sig  = $_SERVER['HTTP_X_SEVER_SIGNATURE'] ?? '';

$expected = 'sha256=' . hash_hmac('sha256', $ts . '.' . $body, $secret);
if (!ctype_digit($ts) || abs(time() - (int)$ts) > 300 || !hash_equals($expected, $sig)) {
    http_response_code(401); exit;
}
$order = json_decode($body, true);
// INSERT ... ON CONFLICT (id) DO NOTHING — сохранить один раз по $order['id']
http_response_code(200);
```

### 6.4 Kotlin / Android-бэкенд, Firebase, Supabase

Если бэкенда у приложения нет, проще всего поднять приёмник как облачную функцию (Firebase Cloud Functions, Supabase Edge Function, Cloudflare Worker) и использовать ту же логику: прочитать сырое тело → проверить подпись → записать в базу по `id` → ответить `200`. Для приложения заказы тогда приходят из этой базы или пушем.

Проверка подписи на других языках — по формуле из раздела 4.

## 7. Проверка

### 7.1 Тестовый заказ без сайта

Скрипт в репозитории шлёт на ваш адрес заказ с настоящей подписью:

```bash
python tools/send-test-webhook.py --url https://api.myapp.com/hooks/sever --secret ваш_секрет
```

Ожидаемо: `ответ приложения: HTTP 200`.

Что ещё проверить:

| Проверка | Команда | Ожидаемо |
|---|---|---|
| дубль | запустить дважды с `--id ord_test_dup` | оба раза `200`, в базе одна запись |
| неверная подпись | добавить `--bad-signature` | `401`, заказ не сохранён |
| старый запрос | подпись с timestamp 10 минут назад | `401` |

### 7.2 Локально без интернета

Тестовый приёмник из репозитория показывает, как должен выглядеть правильный ответ:

```bash
python tools/webhook-echo.py --secret ваш_секрет --port 9000
python tools/send-test-webhook.py --url http://127.0.0.1:9000/hook --secret ваш_секрет
```

### 7.3 Проверка повторов

`python tools/webhook-echo.py --secret ваш_секрет --fail 2` отвечает ошибкой `500` на первые два запроса — удобно убедиться, что ваш код ведёт себя правильно при сбоях.

### 7.4 Настоящий заказ с тестового сайта

Когда владелец подключит ваш адрес к тестовому сайту, оформите заказ на `https://nginx53826.hostkey.in/sever-test/` (логин и пароль даст владелец). В админке тестового сайта, вкладка «Заказы», видно статус доставки: «Доставлен приложению», «В очереди» или «Не доставлен», и есть кнопка «Повторить».

## 8. Вариант без вебхука: опрос

Если принять входящий запрос приложению неудобно, оно может само забирать заказы:

```
GET https://nginx53826.hostkey.in/sever-test/api/orders?since=<id последнего полученного заказа>
X-Orders-Key: <ключ от владельца>
```

(Для тестового сайта адрес именно такой — он под паролем и откроется только с логином. Адрес боевого сайта владелец сообщит отдельно.)

Ответ:

```json
{ "ok": true, "orders": [ { "id": "ord_…", "…": "…", "webhook": { "status": "delivered", "attempts": 1 } } ] }
```

Заказы идут от старых к новым. Без `since` вернутся последние 100. Храните `id` последнего полученного заказа и передавайте его в следующем запросе. Каждый заказ — тот же объект, что в вебхуке, плюс поле `webhook`, которое для опроса можно игнорировать.

Опрос и вебхук можно использовать вместе: вебхук даёт мгновенность, опрос — подстраховку на случай, если ваш приёмник был недоступен дольше 12 часов (после этого сайт перестаёт повторять).

## 9. Безопасность

- Секрет хранится только в переменных окружения сервера, не в коде приложения и не в репозитории.
- Адрес приёмника должен быть HTTPS.
- Всегда проверяйте подпись **и** возраст запроса. Без этого любой, кто узнал адрес, сможет «создать заказ».
- Ограничьте размер тела (256 КБ достаточно).
- Если секрет утёк — придумайте новый и сообщите владельцу: смена занимает одну строку на сервере сайта.

## 10. Что нужно сделать — чек-лист

- [ ] Поднять приёмник по одному из примеров раздела 6 за публичным HTTPS-адресом.
- [ ] Придумать секрет (`openssl rand -hex 32`) и передать вместе с адресом владельцу сайта безопасным путём.
- [ ] Пройти проверки раздела 7.1: `200`, дубль, неверная подпись.
- [ ] Хранить заказы с уникальным индексом по `id` и полем `source`.
- [ ] Показывать в приложении: клиента и способ связи (`customer`), позиции, даты и время выдачи/возврата, доставку или самовывоз, итог.
- [ ] Сообщить владельцу, что готовы — он подключит адрес к тестовому сайту, затем к боевому.

---

## Приложение: промпт для ИИ-помощника

Скопируйте целиком в свой инструмент (Cursor, Claude Code, ChatGPT и т.п.), подставив стек приложения.

```text
Мне нужно подключить мобильное приложение к заказам с сайта аренды оборудования SEVER.

Задача: сделать приёмник вебхука и показать заказы в приложении.

ЧТО ДЕЛАЕТ САЙТ
Когда клиент оформляет заказ, сервер сайта отправляет на мой публичный HTTPS-адрес POST с JSON.
Заголовки:
  X-Sever-Event: order.created
  X-Sever-Delivery: <uuid отправки>
  X-Sever-Timestamp: <unix-секунды>
  X-Sever-Signature: sha256=<hex>
Подпись: "sha256=" + hex(HMAC_SHA256(secret, timestamp + "." + сырое_тело)). Считать по СЫРЫМ байтам тела
до разбора JSON. Сравнивать в постоянное время. Отбрасывать запросы старше 5 минут (401).
Приложение отвечает любым 2xx = принято. Любой другой ответ или молчание больше 10 секунд = сайт повторит
(через 1 мин, 5 мин, 30 мин, 2 ч, 12 ч).

ТЕЛО (пример)
{
  "id": "ord_20261108_65bf2c", "event": "order.created", "createdAt": "2026-11-08T00:52:37Z",
  "source": "test", "lang": "ru",
  "items": [{ "id": "behringer-x32", "name": {"sr": "...", "ru": "...", "en": "..."}, "qty": 1, "pricePerDay": 50 }],
  "rental": { "start": "2030-05-10", "end": "2030-05-12", "pickupTime": "10:00", "returnTime": "10:00", "days": 2, "discountPercent": 0 },
  "totals": { "perDay": 64, "total": 128, "currency": "EUR" },
  "delivery": { "type": "delivery", "address": "Knez Mihailova 1, Beograd" },
  "customer": { "name": "Иван", "telegram": "@ivan", "phone": "+381 60 1234567", "instagram": "", "other": "", "preferred": ["whatsapp"] }
}
Пустые контакты приходят как "". delivery.type: "delivery" | "pickup". source: "test" | "live". Лишние поля игнорировать.

ТРЕБОВАНИЯ
1. Эндпоинт POST /hooks/sever. Секрет — из переменной окружения SEVER_WEBHOOK_SECRET.
2. Проверка подписи по сырому телу и возраста запроса. Неверно — 401.
3. Сохранение заказа в базу с УНИКАЛЬНЫМ индексом по id. Дубль не добавлять, но отвечать 200.
4. Сначала сохранить и ответить 200, потом (в фоне) отправить пуш-уведомление в приложение.
5. Хранить поле source; тестовые и боевые заказы не смешивать в выдаче.
6. В приложении: список заказов (новые сверху), экран заказа с клиентом и способом связи
   (кнопки "позвонить" / "WhatsApp" / "Telegram" по полям customer и customer.preferred), позициями,
   датами и временем выдачи/возврата, доставкой или самовывозом, итогом. Названия товаров показывать
   на языке интерфейса (items[].name.<язык>).
7. Тесты: верная подпись -> 200; неверная подпись -> 401; запрос старше 5 минут -> 401; дубль -> 200 и одна запись.

СТЕК: <подставьте — например "Flutter + Firebase Cloud Functions + Firestore" / "React Native + Node/Express + Postgres">

Начни с приёмника и тестов, потом экран списка и экран заказа.
```
