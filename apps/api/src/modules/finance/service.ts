import type { Finance, Currency } from "@sever/contracts";
import { BASE_CURRENCY } from "@sever/contracts";
import { one, query, tx, type Sql } from "../../core/db.js";
import { BadRequest, NotFound } from "../../core/errors.js";
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
  account_id: string;
  project_id: string | null;
  unit_id: string | null;
  kind: Finance.TxKind;
  category: Finance.TxCategory;
  amount: string;
  currency: Currency;
  fx_rate_to_eur: string;
  amount_eur: string;
  note: string | null;
  created_at: Date;
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
  accountId: r.account_id,
  projectId: r.project_id,
  unitId: r.unit_id,
  kind: r.kind,
  category: r.category,
  amount: Number(r.amount),
  currency: r.currency,
  fxRateToEUR: Number(r.fx_rate_to_eur),
  amountEUR: Number(r.amount_eur),
  note: r.note,
  createdAt: r.created_at.toISOString(),
});

export function createFinanceService(db: Sql, bus: EventBus): Finance.FinanceService {
  async function currentRate(currency: Currency): Promise<number> {
    if (currency === BASE_CURRENCY) return 1;
    const row = await one<FxRow>(db, `SELECT * FROM finance.fx_rates WHERE currency=$1`, [currency]);
    if (!row) throw BadRequest(`no FX rate set for ${currency}`);
    return Number(row.rate_to_eur);
  }

  return {
    // ── FX ──
    async listFxRates() {
      const rows = await query<FxRow>(db, `SELECT * FROM finance.fx_rates ORDER BY currency`);
      return rows.map(fxDTO);
    },
    async setFxRate(currency, rateToEUR) {
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
      const row = await one<AccountRow>(
        db,
        `INSERT INTO finance.accounts (name, currency) VALUES ($1,$2) RETURNING *`,
        [input.name, input.currency]
      );
      return accountDTO(row!);
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
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const rows = await query<TxRow>(
        db,
        `SELECT * FROM finance.transactions ${where} ORDER BY created_at DESC`,
        params
      );
      return rows.map(txDTO);
    },
    async createTransaction(input) {
      const account = await one<AccountRow>(db, `SELECT * FROM finance.accounts WHERE id=$1`, [input.accountId]);
      if (!account) throw NotFound("account", input.accountId);
      const rate = await currentRate(input.currency);
      const amountEUR = Math.round(input.amount * rate * 100) / 100;

      const created = await tx(async (client) => {
        const row = await one<TxRow>(
          client,
          `INSERT INTO finance.transactions
             (account_id, project_id, unit_id, kind, category, amount, currency, fx_rate_to_eur, amount_eur, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [
            input.accountId,
            input.projectId ?? null,
            input.unitId ?? null,
            input.kind,
            input.category,
            input.amount,
            input.currency,
            rate,
            amountEUR,
            input.note ?? null,
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
        at: new Date().toISOString(),
      });
      return dto;
    },

    // ── Aggregates (EUR via frozen snapshots) ──
    async unitPayback(unitId, unitCostEUR) {
      const row = await one<{ earned: string | null }>(
        db,
        `SELECT COALESCE(SUM(amount_eur),0)::text AS earned
         FROM finance.transactions
         WHERE unit_id=$1 AND kind='income' AND category='rental_revenue'`,
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
         WHERE project_id=$1`,
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
         WHERE project_id IS NOT NULL
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
  };
}
