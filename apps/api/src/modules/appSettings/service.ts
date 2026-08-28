import type { AppSettings } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";

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

export function createAppSettingsService(db: Sql): AppSettings.AppSettingsService {
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
      return dto(row!);
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
