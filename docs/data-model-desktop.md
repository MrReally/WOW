# Единая модель данных SEVER: mobile + desktop

Дата сверки: 2026-07-13. Источник: фактическая PostgreSQL-схема после миграций.

Desktop Backoffice не создаёт отдельную БД, отдельные таблицы или дублирующие поля. Все добавленные desktop-функции используют те же контракты `@sever/contracts`, API и схемы, что и мобильная версия.

<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:6px"><strong>Отдельных desktop-only сущностей и параметров БД: 0</strong></span> Добавлена одна общая эксплуатационная сущность аудита; она доступна через общий контракт/API и не является копией mobile-данных.

Если в дальнейшем появится desktop-only расширение, его сущность или параметр должен быть отмечен в этой таблице так: <span style="background:#fef08a;color:#713f12;padding:2px 5px">НОВОЕ В DESKTOP</span>. На текущем этапе таких элементов нет.

| Модуль | Сущность | Параметры общей БД | Добавлено desktop |
|---|---|---|---|
| audit | <span style="background:#fef08a;color:#713f12;padding:2px 5px">entries</span> | <span style="background:#fef08a;color:#713f12;padding:2px 5px">id, actor_id, method, path, status_code, created_at</span> | <span style="background:#fef08a;color:#713f12;padding:2px 5px">НОВОЕ В DESKTOP-ЭТАПЕ, ОБЩЕЕ ДЛЯ ВСЕГО ПРИЛОЖЕНИЯ</span> |
| catalog | items | id, sku, name, kind, group_name, base_unit, active, created_at | — |
| catalog | packaging_units | id, item_id, name, coefficient, barcode, supplier_code, active | — |
| catalog | recipe_versions | id, item_id, version, valid_from, valid_to, output_qty, output_unit, technology | — |
| catalog | recipe_lines | id, recipe_id, ingredient_item_id, unit, gross_qty, net_qty, base_qty | — |
| equipment | types | id, name, tracking_mode, created_at | — |
| equipment | settings | id, cable_connectors, cable_name_format | — |
| equipment | models | id, type_id, name, manufacturer, unit_cost_eur, daily_price_eur, attrs, required_component_model_ids, created_at | — |
| equipment | warehouses | id, name, address, is_default, created_at | — |
| equipment | units | id, model_id, asset_tag, serial, warehouse_id, status, current_project_id, created_at, notes | — |
| equipment | journal | id, unit_id, model_id, qty, action, from_status, to_status, project_id, warehouse_id, from_warehouse_id, to_warehouse_id, actor_id, note, at | — |
| equipment | model_stock | model_id, warehouse_id, total_qty | — |
| equipment | contractors | id, name, contacts, created_at | — |
| equipment | repairs | id, unit_id, status, problem, vendor, est_cost_eur, cost_eur, resolution, outcome, opened_by, opened_at, closed_by, closed_at | — |
| equipment | handovers | id, unit_id, contractor_id, status, reason, note, cost_eur, expected_return, sent_by, sent_at, returned_by, returned_at | — |
| equipment | problems | id, kind, severity, title, detail, refs, resolved, created_at, resolved_at | — |
| projects | clients | id, name, contacts, created_at | — |
| projects | projects | id, name, client_id, status, venue_id, operation_stage, starts_at, ends_at, created_at | — |
| projects | reservations | id, project_id, model_id, qty, starts_at, ends_at, resolved_unit_ids, created_at | — |
| projects | timings | id, project_id, title, starts_at, ends_at | — |
| projects | timing_assignees | timing_id, user_id | — |
| projects | project_tasks | id, project_id, title, status, assignee_id, timing_id, created_at, updated_at, completed_at | — |
| projects | project_checklist | id, project_id, group_key, title, done, done_by_user_id, done_at, created_at | — |
| projects | project_roles | id, project_id, title, required_count, rate_eur, created_at | — |
| projects | assignments | id, project_id, user_id, role_note, created_at, status, rate_eur, invited_by, responded_at, telegram_chat_id, telegram_message_id, role_id | — |
| projects | project_reminders | id, project_id, offset_minutes, recipient_mode, user_ids, note, sent_at, created_by_user_id, created_at, title | — |
| projects | project_pings | id, project_id, user_id, reminder_id, message, status, responded_at, created_by_user_id, created_at, title | — |
| projects | contractor_items | id, project_id, contractor_id, kind, name, qty, price_eur, cost_eur, note, returned_at, created_at | — |
| projects | operation_events | id, project_id, from_stage, to_stage, actor_id, created_at | — |
| projects | operation_unit_marks | id, project_id, stage, unit_id, status, actor_id, note, created_at, updated_at | — |
| projects | problems | id, kind, severity, title, detail, refs, resolved, created_at, resolved_at | — |
| finance | accounts | id, name, currency, balance, created_at | — |
| finance | fx_rates | currency, rate_to_eur, updated_at | — |
| finance | transactions | id, account_id, project_id, unit_id, kind, category, amount, currency, fx_rate_to_eur, amount_eur, note, created_at, created_by | — |
| finance | settings | id, projects_to_payback | — |
| finance | invoice_company_settings | id, name, requisites, phone, email, telegram, updated_at | — |
| finance | invoice_versions | id, project_id, number, date, place, client_name, total_eur, currency, lang, lines, note, created_at | — |
| people | roles | id, name, permissions, is_system, is_owner, created_at | — |
| people | users | id, email, telegram_id, display_name, role_id, password_hash, must_change_password, hourly_rate_eur, calendar_token, is_system, active, created_at, document_number, document_photo_url, languages, about, source, photo_url, use_photo_as_avatar, birth_date, first_name, last_name, patronymic, nickname, operations_show_all_projects | — |
| people | sessions | token, user_id, created_at, expires_at | — |
| people | crew_applications | id, telegram_id, telegram_username, language, first_name, last_name, patronymic, nickname, email, birth_date, languages, about, source, photo_file_id, status, reviewed_by_user_id, reviewed_at, created_user_id, created_at | — |
| people | telegram_dialog_messages | id, telegram_id, telegram_username, telegram_display_name, direction, message_type, text, telegram_message_id, deleted_at, created_at | — |
| people | app_settings | key, value, updated_at | — |
| notifications | notifications | id, user_id, kind, title, body, link, read, created_at | — |
| notifications | prefs | user_id, kind, enabled | — |
| operations | documents | id, number, kind, status, payload, created_by, created_at, posted_at, reversed_at | — |
| plans | plans | id, project_id, venue_id, name, version, is_current, stage_w, stage_h, created_at | — |
| plans | elements | id, plan_id, layer, kind, label, x, y, rotation, w, h, model_id, unit_id, attrs, created_at, from_id, to_id | — |
| venues | venues | id, name, address, notes, width_m, depth_m, created_at | — |

## Desktop-функции и используемые общие данные

| Desktop-функция | Общие сущности |
|---|---|
| Полная карточка оборудования | equipment.units, models, types, warehouses, repairs, handovers, journal; projects.projects; people.users |
| Карточка номенклатуры, упаковки и рецептуры | catalog.items, packaging_units, recipe_versions, recipe_lines |
| Полная карточка проекта | projects.projects, reservations, timings, assignments, project_roles, contractor_items, reminders, pings; equipment.units/models; finance.invoice_versions/transactions |
| Документооборот | operations.documents; equipment.units/journal; projects.projects; people.users |
| Сканирование | существующие equipment.units.asset_tag и equipment.units.serial; новых идентификаторов не создаётся |
| Контроль и уведомления | notifications.notifications/prefs; equipment.repairs/handovers/problems; projects.projects/problems; finance.transactions |
| Импорт CSV | существующий endpoint оборудования и существующие equipment.types/models/units/warehouses |

## Правило дальнейшего расширения

Любое новое поле сначала добавляется в профильный модуль и `@sever/contracts`, затем используется обеими версиями интерфейса. Запрещены desktop-таблицы-копии, cross-schema foreign keys и прямые cross-schema JOIN-запросы.
