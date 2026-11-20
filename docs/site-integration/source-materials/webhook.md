# SEVER — вебхук заказов

Сайт отправляет каждый новый заказ на адрес вашего приложения: HTTP `POST` с JSON и подписью.
Приложение отвечает **любым кодом 2xx** — значит, заказ принят.

## Что нужно с вашей стороны
1. Публичный HTTPS-адрес, который принимает `POST` (например, `https://app.example.com/hooks/sever`).
2. Общий секрет — длинная случайная строка. Его знаем только мы и вы.

Адрес и секрет передайте владельцу сайта — он поставит их на сервер. Менять код сайта для этого не нужно.

## Запрос

```
POST <ваш адрес>
Content-Type: application/json; charset=utf-8
User-Agent: SEVER-Webhook/1
X-Sever-Event: order.created
X-Sever-Delivery: 9f3c…            уникальный номер этой отправки
X-Sever-Timestamp: 1793830000       время отправки, unix-секунды
X-Sever-Signature: sha256=ab12…     подпись
```

### Тело

```json
{
  "id": "ord_20261108_ab12cd",
  "event": "order.created",
  "createdAt": "2026-11-08T12:00:00Z",
  "source": "test",
  "lang": "ru",
  "items": [
    { "id": "behringer-x32", "name": { "sr": "Behringer X32 Compact", "ru": "Behringer X32 Compact", "en": "Behringer X32 Compact" },
      "qty": 1, "pricePerDay": 50 }
  ],
  "rental": { "start": "2026-11-20", "end": "2026-11-22", "pickupTime": "10:00", "returnTime": "10:00",
              "days": 2, "discountPercent": 0 },
  "totals": { "perDay": 50, "total": 100, "currency": "EUR" },
  "delivery": { "type": "delivery", "address": "Knez Mihailova 1, Beograd" },
  "customer": { "name": "Иван", "telegram": "@ivan", "phone": "+381 60 1234567",
                "instagram": "", "other": "", "preferred": ["whatsapp"] }
}
```

| Поле | Значение |
|---|---|
| `id` | номер заказа, уникальный и неизменный при повторах |
| `source` | `test` — тестовый сайт, `live` — боевой. Не смешивайте их в одной базе |
| `lang` | язык, на котором клиент оформлял заказ: `sr`, `ru`, `en` |
| `items[].name` | название на трёх языках |
| `rental.days` | оплачиваемые сутки (от выдачи до возврата, округление вверх, минимум 1) |
| `rental.discountPercent` | скидка за срок: 0, 14 (от 7 суток) или 25 (от 28 суток) |
| `totals.total` | итог за весь срок с учётом скидки, евро. **Посчитан на сервере сайта** по актуальному каталогу |
| `delivery.type` | `delivery` — доставка на `address`, `pickup` — самовывоз |
| `customer.preferred` | как удобнее связаться: `call`, `whatsapp`, `viber`, `other` |

Пустые контакты приходят пустой строкой. Хотя бы один контакт заполнен всегда.

## Подпись

`signature = "sha256=" + HMAC_SHA256(секрет, timestamp + "." + тело)` в hex. Тело — **ровно те байты, что пришли**, до разбора JSON.
Проверяйте подпись и отбрасывайте запросы старше 5 минут: так их нельзя переиграть.

### Python

```python
import hashlib, hmac, time

def verify(secret, timestamp, body: bytes, signature) -> bool:
    if abs(time.time() - int(timestamp)) > 300:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")
```

### Node.js

```js
const crypto = require('crypto');

function verify(secret, timestamp, bodyBuffer, signature) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(timestamp + '.').update(bodyBuffer).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(signature || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Готовый приёмник с проверкой: `python tools/webhook-echo.py --secret <секрет> --port 9000`.

## Повторы и дубли

- Любой ответ кроме 2xx, а также молчание дольше 10 секунд — это неудача, сервер повторит отправку.
- Расписание повторов: через 1 мин, 5 мин, 30 мин, 2 ч, 12 ч. После этого заказ помечается «не доставлен» в админке, и владелец может отправить его вручную.
- Повтор приходит с тем же `id`, поэтому **приложение должно игнорировать дубли по `id`** и всё равно отвечать 2xx.
- Отвечайте быстро: сначала сохраните заказ, ответьте 2xx, остальное делайте после.

## Если вебхук неудобен: опрос

Приложение может забирать заказы само:

```
GET /api/orders?since=<id последнего полученного заказа>
X-Orders-Key: <ключ>
```

Ответ: `{ "ok": true, "orders": [ … ] }`. Каждый заказ — такой же объект, как в вебхуке, плюс поле `webhook` со статусом отправки.
Ключ выдаёт владелец сайта.
