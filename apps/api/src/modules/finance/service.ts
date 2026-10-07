import type { Finance, Currency } from "@sever/contracts";
import { BASE_CURRENCY } from "@sever/contracts";
import { one, query, tx, type Sql } from "../../core/db.js";
import { BadRequest, Conflict, NotFound } from "../../core/errors.js";
import type { EventBus } from "../../core/eventBus.js";

// Categories that move real cash through an account. `rental_revenue` is the
// billed/earned value of a rental and is recorded for revenue + per-unit
// payback, but does NOT move account cash — only actual client payments
// (prepayment, debt_settlement) and expenses do. This gives a meaningful
// debt = revenue − payments.
const CASH_CATEGORIES = new Set<Finance.TxCategory>([
  "prepayment",
  "debt_settlement",
  "purchase",
  "repair",
  "salary",
  "other",
]);

interface FxRow {
  currency: Currency;
  rate_to_eur: string;
  updated_at: Date;
}
interface AccountRow {
  id: string;
  name: string;
  currency: Currency;
  balance: string;
  created_at: Date;
}
interface TxRow {
  id: string;
  replaces_transaction_id: string | null;
  account_id: string;
  project_id: string | null;
  unit_id: string | null;
  assignment_id: string | null;
  contractor_id: string | null;
  kind: Finance.TxKind;
  category: Finance.TxCategory;
  amount: string;
  currency: Currency;
  fx_rate_to_eur: string;
  amount_eur: string;
  note: string | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: Date | null;
  voided_by: string | null;
  voided_at: Date | null;
  created_at: Date;
}
interface InvoiceCompanySettingsRow {
  name: string;
  requisites: string;
  phone: string;
  email: string;
  telegram: string;
  logo_data_url: string | null;
}
interface InvoiceVersionRow {
  id: string;
  project_id: string;
  number: string;
  date: string;
  place: string;
  client_name: string;
  total_eur: string;
  rate_to_eur: string | null;
  company: Finance.InvoiceCompanySettingsDTO | null;
  currency: Currency;
  lang: Finance.InvoiceLang;
  lines: Finance.EstimatePdfLineDTO[];
  total_discount_type: Finance.DiscountType;
  total_discount_value: string;
  note: string;
  created_at: Date;
}
interface ProjectEstimateLineRow {
  id: string;
  project_id: string;
  source: Finance.ProjectEstimateLineSource;
  source_ref_id: string | null;
  section: string;
  name: string;
  qty: string;
  price_eur: string;
  cost_eur: string;
  discount_type: Finance.DiscountType;
  discount_value: string;
  comment: string;
  is_hidden: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}
interface ProjectEstimateSettingsRow {
  project_id: string;
  total_discount_type: Finance.DiscountType;
  total_discount_value: string;
}

const fxDTO = (r: FxRow): Finance.FxRateDTO => ({
  currency: r.currency,
  rateToEUR: Number(r.rate_to_eur),
  updatedAt: r.updated_at.toISOString(),
});
const accountDTO = (r: AccountRow): Finance.AccountDTO => ({
  id: r.id,
  name: r.name,
  currency: r.currency,
  balance: Number(r.balance),
  createdAt: r.created_at.toISOString(),
});
const txDTO = (r: TxRow): Finance.TransactionDTO => ({
  id: r.id,
  replacesTransactionId: r.replaces_transaction_id ?? null,
  accountId: r.account_id,
  projectId: r.project_id,
  unitId: r.unit_id,
  assignmentId: r.assignment_id,
  contractorId: r.contractor_id,
  kind: r.kind,
  category: r.category,
  amount: Number(r.amount),
  currency: r.currency,
  fxRateToEUR: Number(r.fx_rate_to_eur),
  amountEUR: Number(r.amount_eur),
  note: r.note,
  createdByUserId: r.created_by,
  updatedByUserId: r.updated_by,
  updatedAt: r.updated_at?.toISOString() ?? null,
  voidedByUserId: r.voided_by,
  voidedAt: r.voided_at?.toISOString() ?? null,
  createdAt: r.created_at.toISOString(),
});
const invoiceCompanyDTO = (r: InvoiceCompanySettingsRow): Finance.InvoiceCompanySettingsDTO => ({
  name: r.name,
  requisites: r.requisites,
  phone: r.phone,
  email: r.email,
  telegram: r.telegram,
  logoDataUrl: r.logo_data_url,
});
const invoiceVersionDTO = (r: InvoiceVersionRow): Finance.InvoiceVersionDTO => ({
  id: r.id,
  projectId: r.project_id,
  number: r.number,
  date: r.date,
  place: r.place,
  clientName: r.client_name,
  totalEUR: Number(r.total_eur),
  rateToEUR: r.rate_to_eur == null ? null : Number(r.rate_to_eur),
  company: r.company ?? null,
  currency: r.currency,
  lang: r.lang,
  lines: r.lines,
  totalDiscountType: r.total_discount_type,
  totalDiscountValue: Number(r.total_discount_value),
  note: r.note,
  createdAt: r.created_at.toISOString(),
});
const estimateLineDTO = (r: ProjectEstimateLineRow): Finance.ProjectEstimateLineDTO => ({
  id: r.id,
  projectId: r.project_id,
  source: r.source,
  sourceRefId: r.source_ref_id,
  section: r.section,
  name: r.name,
  qty: Number(r.qty),
  priceEUR: Number(r.price_eur),
  costEUR: Number(r.cost_eur),
  discountType: r.discount_type,
  discountValue: Number(r.discount_value),
  comment: r.comment,
  hidden: r.is_hidden,
  sortOrder: r.sort_order,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});
const estimateSettingsDTO = (projectId: string, r?: ProjectEstimateSettingsRow | null): Finance.ProjectEstimateSettingsDTO => ({
  projectId,
  totalDiscountType: r?.total_discount_type ?? "percent",
  totalDiscountValue: Number(r?.total_discount_value ?? 0),
});

export function createFinanceService(db: Sql, bus: EventBus, validateReferences?: (input: Finance.CreateTransactionInput) => Promise<void>): Finance.FinanceService {
  async function currentRate(currency: Currency): Promise<number> {
    if (currency === BASE_CURRENCY) return 1;
    const row = await one<FxRow>(db, `SELECT * FROM finance.fx_rates WHERE currency=$1`, [currency]);
    if (!row) throw BadRequest(`no FX rate set for ${currency}`);
    const rate = Number(row.rate_to_eur);
    if (!Number.isFinite(rate) || rate <= 0) throw BadRequest(`invalid FX rate for ${currency}`);
    return rate;
  }

  return {
    // ── FX ──
    async listFxRates() {
      const rows = await query<FxRow>(db, `SELECT * FROM finance.fx_rates ORDER BY currency`);
      return rows.map(fxDTO);
    },
    async setFxRate(currency, rateToEUR) {
      if (!Number.isFinite(rateToEUR) || rateToEUR < 0.00000001 || rateToEUR >= 10_000_000_000) throw BadRequest("курс должен быть положительным и помещаться в точность 18,8");
      if (currency === BASE_CURRENCY && rateToEUR !== 1) {
        throw BadRequest("EUR rate is always 1");
      }
      const row = await one<FxRow>(
        db,
        `INSERT INTO finance.fx_rates (currency, rate_to_eur, updated_at)
         VALUES ($1,$2,now())
         ON CONFLICT (currency) DO UPDATE SET rate_to_eur=$2, updated_at=now()
         RETURNING *`,
        [currency, rateToEUR]
      );
      return fxDTO(row!);
    },

    // ── Accounts ──
    async listAccounts() {
      const rows = await query<AccountRow>(db, `SELECT * FROM finance.accounts ORDER BY name`);
      return rows.map(accountDTO);
    },
    async createAccount(input) {
      if (!input.name.trim()) throw BadRequest("укажите название счёта");
      const row = await one<AccountRow>(
        db,
        `INSERT INTO finance.accounts (name, currency) VALUES ($1,$2) RETURNING *`,
        [input.name.trim(), input.currency]
      );
      return accountDTO(row!);
    },
    async updateAccount(id, input) {
      const row = await one<AccountRow>(db, `UPDATE finance.accounts SET name=$2 WHERE id=$1 RETURNING *`, [id, input.name.trim()]);
      if (!row) throw NotFound("account", id);
      return accountDTO(row);
    },

    // ── Transactions ──
    async listTransactions(filter) {
      const conds: string[] = [];
      const params: unknown[] = [];
      if (filter?.projectId) {
        params.push(filter.projectId);
        conds.push(`project_id=$${params.length}`);
      }
      if (filter?.unitId) {
        params.push(filter.unitId);
        conds.push(`unit_id=$${params.length}`);
      }
      if (!filter?.includeVoided) conds.push(`voided_at IS NULL`);
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const rows = await query<TxRow>(
        db,
        `SELECT * FROM finance.transactions ${where} ORDER BY created_at DESC`,
        params
      );
      return rows.map(txDTO);
    },
    async createTransaction(input) {
      if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount >= 1_000_000_000_000 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) throw BadRequest("сумма должна быть положительной, не более двух знаков после запятой");
      const incomeCategories = ["rental_revenue", "prepayment", "debt_settlement"];
      if (input.category !== "other" && (incomeCategories.includes(input.category) ? input.kind !== "income" : input.kind !== "expense")) throw BadRequest("категория не соответствует направлению операции");
      if (input.assignmentId && (input.category !== "salary" || !input.projectId || input.contractorId)) throw BadRequest("выплата команде требует проекта и категории зарплата");
      if (input.contractorId && (input.kind !== "expense" || !input.projectId)) throw BadRequest("выплата подрядчику требует проекта и расходной операции");
      await validateReferences?.(input);
      const account = await one<AccountRow>(db, `SELECT * FROM finance.accounts WHERE id=$1`, [input.accountId]);
      if (!account) throw NotFound("account", input.accountId);
      if (account.currency !== input.currency) throw BadRequest("валюта операции должна совпадать с валютой счёта");
      const rate = await currentRate(input.currency);
      const amountEUR = Math.round(input.amount * rate * 100) / 100;
      if (amountEUR >= 1_000_000_000_000) throw BadRequest("сумма в EUR превышает допустимый размер");

      const created = await tx(async (client) => {
        if (input.requestKey) {
          await query(client, `SELECT pg_advisory_xact_lock(hashtextextended($1, 1))`, [input.requestKey]);
          const existing = await one<TxRow>(client, `SELECT * FROM finance.transactions WHERE request_key=$1`, [input.requestKey]);
          if (existing) {
            if (existing.account_id !== input.accountId || existing.kind !== input.kind || existing.category !== input.category || Number(existing.amount) !== input.amount || existing.currency !== input.currency
              || existing.project_id !== (input.projectId ?? null) || existing.assignment_id !== (input.assignmentId ?? null) || existing.contractor_id !== (input.contractorId ?? null)
              || existing.unit_id !== (input.unitId ?? null) || existing.note !== (input.note ?? null) || existing.created_by !== (input.createdByUserId ?? null)) throw Conflict("ключ повторной операции уже использован с другими данными");
            return existing;
          }
        }
        const row = await one<TxRow>(
          client,
          `INSERT INTO finance.transactions
             (account_id, project_id, unit_id, assignment_id, contractor_id, kind, category, amount, currency, fx_rate_to_eur, amount_eur, note, created_by, request_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,ROUND($8::numeric*$10::numeric,2),$11,$12,$13)
           RETURNING *`,
          [
            input.accountId,
            input.projectId ?? null,
            input.unitId ?? null,
            input.assignmentId ?? null,
            input.contractorId ?? null,
            input.kind,
            input.category,
            input.amount,
            input.currency,
            rate,
            input.note ?? null,
            input.createdByUserId ?? null,
            input.requestKey ?? null,
          ]
        );
        if (CASH_CATEGORIES.has(input.category)) {
          const delta = input.kind === "income" ? input.amount : -input.amount;
          await query(client, `UPDATE finance.accounts SET balance = balance + $2 WHERE id=$1`, [
            input.accountId,
            delta,
          ]);
        }
        return row!;
      });

      const dto = txDTO(created);
      await bus.publish({
        type: "finance.transaction.created",
        transactionId: dto.id,
        projectId: dto.projectId,
        unitId: dto.unitId,
        amountEUR: dto.amountEUR,
        assignmentId: dto.assignmentId,
        contractorId: dto.contractorId,
        at: new Date().toISOString(),
      });
      return dto;
    },
    async updateTransaction(id, input, actorId) {
      if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount >= 1_000_000_000_000 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) throw BadRequest("сумма должна быть положительной, не более двух знаков после запятой");
      const updated = await tx(async (client) => {
        const previous = await one<TxRow>(client, `SELECT * FROM finance.transactions WHERE id=$1 FOR UPDATE`, [id]);
        if (!previous) throw NotFound("transaction", id);
        if (previous.voided_at) throw BadRequest("отменённую транзакцию нельзя редактировать");
        if (input.amount * Number(previous.fx_rate_to_eur) >= 1_000_000_000_000) throw BadRequest("сумма в EUR превышает допустимый размер");
        const account = await one<AccountRow>(client, `SELECT * FROM finance.accounts WHERE id=$1`, [input.accountId]);
        if (!account) throw NotFound("account", input.accountId);
        if (account.currency !== previous.currency) throw BadRequest("счёт при редактировании должен быть в той же валюте");
        // Acquire account locks in a stable order before moving the balance.
        await query(client, `SELECT id FROM finance.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [[previous.account_id, input.accountId]]);
        if (CASH_CATEGORIES.has(previous.category)) {
          const oldDelta = previous.kind === "income" ? Number(previous.amount) : -Number(previous.amount);
          const newDelta = previous.kind === "income" ? input.amount : -input.amount;
          await query(client, `UPDATE finance.accounts SET balance=balance-$2 WHERE id=$1`, [previous.account_id, oldDelta]);
          await query(client, `UPDATE finance.accounts SET balance=balance+$2 WHERE id=$1`, [input.accountId, newDelta]);
        }
        // Corrections preserve the original amount and FX snapshot permanently.
        await query(client, `UPDATE finance.transactions SET voided_by=$2, voided_at=now() WHERE id=$1`, [id, actorId]);
        return one<TxRow>(client,
          `INSERT INTO finance.transactions
            (account_id, project_id, unit_id, assignment_id, contractor_id, kind, category, amount, currency,
             fx_rate_to_eur, amount_eur, note, created_by, updated_by, updated_at, replaces_transaction_id)
           SELECT $2, project_id, unit_id, assignment_id, contractor_id, kind, category, $3, currency,
             fx_rate_to_eur, ROUND($3*fx_rate_to_eur,2), $4, $5, $5, now(), id
           FROM finance.transactions WHERE id=$1 RETURNING *`,
          [id, input.accountId, input.amount, input.note ?? null, actorId]
        );
      });
      const dto = txDTO(updated!);
      await bus.publish({ type: "finance.transaction.changed", transactionId: dto.id, projectId: dto.projectId, assignmentId: dto.assignmentId, contractorId: dto.contractorId, at: new Date().toISOString() });
      return dto;
    },
    async voidTransaction(id, actorId) {
      const voided = await tx(async (client) => {
        const previous = await one<TxRow>(client, `SELECT * FROM finance.transactions WHERE id=$1 FOR UPDATE`, [id]);
        if (!previous) throw NotFound("transaction", id);
        if (previous.voided_at) return previous;
        if (CASH_CATEGORIES.has(previous.category)) {
          const delta = previous.kind === "income" ? Number(previous.amount) : -Number(previous.amount);
          await query(client, `UPDATE finance.accounts SET balance=balance-$2 WHERE id=$1`, [previous.account_id, delta]);
        }
        return one<TxRow>(client, `UPDATE finance.transactions SET voided_by=$2, voided_at=now() WHERE id=$1 RETURNING *`, [id, actorId]);
      });
      const dto = txDTO(voided!);
      await bus.publish({ type: "finance.transaction.changed", transactionId: dto.id, projectId: dto.projectId, assignmentId: dto.assignmentId, contractorId: dto.contractorId, at: new Date().toISOString() });
      return dto;
    },

    // ── Aggregates (EUR via frozen snapshots) ──
    async unitPayback(unitId, unitCostEUR) {
      const row = await one<{ earned: string | null }>(
        db,
        `SELECT COALESCE(SUM(amount_eur),0)::text AS earned
         FROM finance.transactions
         WHERE unit_id=$1 AND kind='income' AND category='rental_revenue' AND voided_at IS NULL`,
        [unitId]
      );
      const earnedEUR = Number(row?.earned ?? 0);
      const ratio = unitCostEUR > 0 ? earnedEUR / unitCostEUR : 0;
      const stage: Finance.PaybackStage =
        ratio >= 2 ? "earned_extra" : ratio >= 1 ? "paid_back" : "not_paid_back";
      return { unitId, unitCostEUR, earnedEUR, stage, ratio: Math.round(ratio * 100) / 100 };
    },

    async projectFinance(projectId) {
      const row = await one<{ revenue: string; paid: string; cost: string }>(
        db,
        `SELECT
           COALESCE(SUM(amount_eur) FILTER (WHERE kind='income' AND category='rental_revenue'),0)::text AS revenue,
           COALESCE(SUM(amount_eur) FILTER (WHERE kind='income' AND category IN ('prepayment','debt_settlement')),0)::text AS paid,
           COALESCE(SUM(amount_eur) FILTER (WHERE kind='expense'),0)::text AS cost
         FROM finance.transactions
         WHERE project_id=$1 AND voided_at IS NULL`,
        [projectId]
      );
      const revenueEUR = Number(row?.revenue ?? 0);
      const prepaidEUR = Number(row?.paid ?? 0);
      const costEUR = Number(row?.cost ?? 0);
      return {
        projectId,
        revenueEUR,
        prepaidEUR,
        costEUR,
        debtEUR: Math.round((revenueEUR - prepaidEUR) * 100) / 100,
      };
    },

    async outstandingDebts() {
      const rows = await query<{ project_id: string; revenue: string; paid: string; cost: string }>(
        db,
        `SELECT project_id,
           COALESCE(SUM(amount_eur) FILTER (WHERE kind='income' AND category='rental_revenue'),0)::text AS revenue,
           COALESCE(SUM(amount_eur) FILTER (WHERE kind='income' AND category IN ('prepayment','debt_settlement')),0)::text AS paid,
           COALESCE(SUM(amount_eur) FILTER (WHERE kind='expense'),0)::text AS cost
         FROM finance.transactions
         WHERE project_id IS NOT NULL AND voided_at IS NULL
         GROUP BY project_id`
      );
      return rows
        .map((r) => {
          const revenueEUR = Number(r.revenue);
          const prepaidEUR = Number(r.paid);
          return {
            projectId: r.project_id,
            revenueEUR,
            prepaidEUR,
            costEUR: Number(r.cost),
            debtEUR: Math.round((revenueEUR - prepaidEUR) * 100) / 100,
          };
        })
        .filter((f) => f.debtEUR > 0);
    },

    async listProjectEstimateLines(projectId) {
      const rows = await query<ProjectEstimateLineRow>(db, `SELECT * FROM finance.project_estimate_lines WHERE project_id=$1 ORDER BY sort_order, created_at`, [projectId]);
      return rows.map(estimateLineDTO);
    },

    async replaceProjectEstimateLines(projectId, lines, settings) {
      if (lines.some(line => (line.discountType ?? "percent") === "percent" && (line.discountValue ?? 0) > 100)) throw BadRequest("процент скидки не может превышать 100");
      if (settings?.totalDiscountType === "percent" && settings.totalDiscountValue > 100) throw BadRequest("процент скидки не может превышать 100");
      const refs = lines.flatMap(line => line.sourceRefId ? [line.sourceRefId] : []);
      if (new Set(refs).size !== refs.length) throw BadRequest("источник не может повторяться в смете");
      if (lines.some(line => line.priceEUR < 0 || line.costEUR < 0)) throw BadRequest("цена и себестоимость не могут быть отрицательными");
      if (lines.some(line => line.discountType === "fixed_rsd" && (line.discountValue ?? 0) > 0) || (settings?.totalDiscountType === "fixed_rsd" && settings.totalDiscountValue > 0)) await currentRate("RSD");
      return tx(async (client) => {
        // Serialize complete replacements of the same project's economics.
        await query(client, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [projectId]);
        await query(client, `DELETE FROM finance.project_estimate_lines WHERE project_id=$1`, [projectId]);
        const saved: ProjectEstimateLineRow[] = [];
        for (const [sortOrder, line] of lines.entries()) {
          const row = await one<ProjectEstimateLineRow>(client,
            `INSERT INTO finance.project_estimate_lines
               (id, project_id, source, source_ref_id, section, name, qty, price_eur, cost_eur, discount_type, discount_value, comment, sort_order, is_hidden)
             VALUES (COALESCE($1::uuid, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
            [line.id ?? null, projectId, line.source ?? "manual", line.sourceRefId ?? null, line.section.trim() || "Прочее", line.name.trim(), line.qty, line.priceEUR, line.costEUR, line.discountType ?? "percent", line.discountValue ?? 0, line.comment?.trim() ?? "", sortOrder, line.hidden ?? false]
          );
          saved.push(row!);
        }
        if (settings) await query(client,
          `INSERT INTO finance.project_estimate_settings (project_id, total_discount_type, total_discount_value, updated_at)
           VALUES ($1,$2,$3,now()) ON CONFLICT (project_id) DO UPDATE SET total_discount_type=$2, total_discount_value=$3, updated_at=now()`,
          [projectId, settings.totalDiscountType, settings.totalDiscountValue]);
        return saved.map(estimateLineDTO);
      });
    },

    async removeProjectEstimateLinesBySourceRef(sourceRefId) {
      await query(db, `DELETE FROM finance.project_estimate_lines WHERE source_ref_id=$1`, [sourceRefId]);
    },

    async copyProjectEstimateLines(sourceProjectId, projectId, sourceRefMap = {}) {
      const [source, settings] = await Promise.all([
        this.listProjectEstimateLines(sourceProjectId),
        this.getProjectEstimateSettings(sourceProjectId),
      ]);
      const copied = await this.replaceProjectEstimateLines(projectId, source.map((line) => ({
        source: line.source,
        sourceRefId: line.sourceRefId ? sourceRefMap[line.sourceRefId] ?? null : null,
        section: line.section,
        name: line.name,
        qty: line.qty,
        priceEUR: line.priceEUR,
        costEUR: line.costEUR,
        discountType: line.discountType,
        discountValue: line.discountValue,
        comment: line.comment,
        hidden: line.hidden,
      })));
      await this.setProjectEstimateSettings(projectId, {
        totalDiscountType: settings.totalDiscountType,
        totalDiscountValue: settings.totalDiscountValue,
      });
      return copied;
    },

    async getProjectEstimateSettings(projectId) {
      const row = await one<ProjectEstimateSettingsRow>(db, `SELECT * FROM finance.project_estimate_settings WHERE project_id=$1`, [projectId]);
      return estimateSettingsDTO(projectId, row);
    },

    async setProjectEstimateSettings(projectId, input) {
      if (input.totalDiscountType === "percent" && input.totalDiscountValue > 100) throw BadRequest("процент скидки не может превышать 100");
      if (input.totalDiscountType === "fixed_rsd" && input.totalDiscountValue > 0) await currentRate("RSD");
      const row = await one<ProjectEstimateSettingsRow>(db,
        `INSERT INTO finance.project_estimate_settings (project_id, total_discount_type, total_discount_value, updated_at)
         VALUES ($1,$2,$3,now())
         ON CONFLICT (project_id) DO UPDATE SET total_discount_type=$2, total_discount_value=$3, updated_at=now()
         RETURNING *`,
        [projectId, input.totalDiscountType, input.totalDiscountValue]
      );
      return estimateSettingsDTO(projectId, row);
    },

    async getInvoiceCompanySettings() {
      const row = await one<InvoiceCompanySettingsRow>(db, `SELECT * FROM finance.invoice_company_settings WHERE id=1`);
      if (!row) {
        return { name: "SEVER", requisites: "", phone: "+381 62 852 5240", email: "sever.beo.contact@gmail.com", telegram: "@sever_contact", logoDataUrl: null };
      }
      return invoiceCompanyDTO(row);
    },

    async setInvoiceCompanySettings(input) {
      const row = await one<InvoiceCompanySettingsRow>(
        db,
        `INSERT INTO finance.invoice_company_settings (id, name, requisites, phone, email, telegram, logo_data_url, updated_at)
         VALUES (1,$1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (id) DO UPDATE SET
           name=$1,
           requisites=$2,
           phone=$3,
           email=$4,
           telegram=$5,
           logo_data_url=$6,
           updated_at=now()
         RETURNING *`,
        [input.name, input.requisites, input.phone, input.email, input.telegram, input.logoDataUrl]
      );
      return invoiceCompanyDTO(row!);
    },

    async listInvoiceVersions(projectId) {
      const rows = await query<InvoiceVersionRow>(
        db,
        `SELECT * FROM finance.invoice_versions WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20`,
        [projectId]
      );
      return rows.map(invoiceVersionDTO);
    },

    async createInvoiceVersion(input) {
      const rate = input.currency === "EUR" ? 1 : input.rateToEUR ?? await currentRate(input.currency);
      const company = input.company ?? await this.getInvoiceCompanySettings();
      const row = await one<InvoiceVersionRow>(
        db,
        `INSERT INTO finance.invoice_versions
           (project_id, number, date, place, client_name, total_eur, currency, lang, lines, total_discount_type, total_discount_value, note, rate_to_eur, company)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14::jsonb)
         RETURNING *`,
        [
          input.projectId,
          input.number,
          input.date,
          input.place,
          input.clientName,
          input.totalEUR,
          input.currency,
          input.lang,
          JSON.stringify(input.lines),
          input.totalDiscountType,
          input.totalDiscountValue,
          input.note ?? "",
          rate,
          JSON.stringify(company),
        ]
      );
      return invoiceVersionDTO(row!);
    },
  };
}
