import type { AppSettings } from "@sever/contracts";
import { one, type Sql } from "../../core/db.js";

interface DateTimeSettingsRow {
  date_format: AppSettings.DateFormat;
  time_format: AppSettings.TimeFormat;
}

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
  };
}
