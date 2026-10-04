import type { AppSettings } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import type { EventBus } from "../../core/eventBus.js";

interface DateTimeSettingsRow {
  date_format: AppSettings.DateFormat;
  time_format: AppSettings.TimeFormat;
}
interface DressCodeRow { id: string; label: string; active: boolean; sort_order: number }
const dressCodeDTO = (row: DressCodeRow): AppSettings.DressCodeOptionDTO => ({ id: row.id, label: row.label, active: row.active, sortOrder: row.sort_order });

const dto = (row: DateTimeSettingsRow): AppSettings.DateTimeSettingsDTO => ({
  dateFormat: row.date_format,
  timeFormat: row.time_format,
});

export function createAppSettingsService(db: Sql, bus: EventBus): AppSettings.AppSettingsService {
  return {
    async getDateTimeSettings() {
      const row = await one<DateTimeSettingsRow>(db, `SELECT date_format, time_format FROM app_settings.date_time WHERE id=1`);
      return row ? dto(row) : { dateFormat: "DD.MM.YYYY", timeFormat: "24h" };
    },
    async updateDateTimeSettings(input) {
      const row = await one<DateTimeSettingsRow>(db,
        `INSERT INTO app_settings.date_time (id, date_format, time_format, updated_at)
         VALUES (1,$1,$2,now())
         ON CONFLICT (id) DO UPDATE SET date_format=EXCLUDED.date_format, time_format=EXCLUDED.time_format, updated_at=now()
         RETURNING date_format, time_format`,
        [input.dateFormat, input.timeFormat]
      );
      await bus.publish({ type: "app_settings.project_name_template.updated", at: new Date().toISOString() });
      return dto(row!);
    },
    async getProjectNameTemplateSettings() {
      const row = await one<{ template: string }>(db, `SELECT template FROM app_settings.project_name_template WHERE id=1`);
      return { template: row?.template ?? "[name]" };
    },
    async updateProjectNameTemplateSettings(input) {
      const row = await one<{ template: string }>(db, `INSERT INTO app_settings.project_name_template (id,template,updated_at) VALUES (1,$1,now()) ON CONFLICT(id) DO UPDATE SET template=EXCLUDED.template,updated_at=now() RETURNING template`, [input.template]);
      await bus.publish({ type: "app_settings.project_name_template.updated", at: new Date().toISOString() });
      return row!;
    },
    async getProjectProblemNotificationSettings() {
      const row = await one<{ intervals_minutes: number[] }>(db, `SELECT intervals_minutes FROM app_settings.project_problem_notifications WHERE id=1`);
      return { intervalsMinutes: row?.intervals_minutes.map(Number) ?? [10080, 4320, 1440, 720] };
    },
    async updateProjectProblemNotificationSettings(input) {
      const intervals = [...new Set(input.intervalsMinutes)].sort((a, b) => b - a);
      const row = await one<{ intervals_minutes: number[] }>(db, `INSERT INTO app_settings.project_problem_notifications(id,intervals_minutes,updated_at) VALUES(1,$1,now()) ON CONFLICT(id) DO UPDATE SET intervals_minutes=EXCLUDED.intervals_minutes,updated_at=now() RETURNING intervals_minutes`, [intervals]);
      return { intervalsMinutes: row!.intervals_minutes.map(Number) };
    },
    async claimProjectProblemNotification(projectId, projectStartsAt, intervalMinutes) {
      const row = await one<{ project_id: string }>(db, `INSERT INTO app_settings.project_problem_notification_deliveries(project_id,project_starts_at,interval_minutes) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING project_id`, [projectId, projectStartsAt, intervalMinutes]);
      return !!row;
    },
    async listDressCodeOptions(includeArchived = false) {
      return (await query<DressCodeRow>(db, `SELECT id,label,active,sort_order FROM app_settings.dress_code_options ${includeArchived ? "" : "WHERE active"} ORDER BY sort_order,label`)).map(dressCodeDTO);
    },
    async createDressCodeOption(input) {
      const row = await one<DressCodeRow>(db, `INSERT INTO app_settings.dress_code_options(label,sort_order) VALUES ($1,(SELECT COALESCE(MAX(sort_order),0)+10 FROM app_settings.dress_code_options)) RETURNING id,label,active,sort_order`, [input.label]);
      return dressCodeDTO(row!);
    },
    async updateDressCodeOption(id, input) {
      const row = await one<DressCodeRow>(db, `UPDATE app_settings.dress_code_options SET label=COALESCE($2,label),active=COALESCE($3,active),sort_order=COALESCE($4,sort_order) WHERE id=$1 RETURNING id,label,active,sort_order`, [id,input.label??null,input.active??null,input.sortOrder??null]);
      if (!row) throw new Error("dress code option not found");
      return dressCodeDTO(row);
    },
  };
}
