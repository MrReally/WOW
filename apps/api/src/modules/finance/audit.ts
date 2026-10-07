import { query, type Sql } from "../../core/db.js";

/** Read-only reconciliation. Never repairs historical financial data implicitly. */
export async function auditFinance(db: Sql) {
  const [counts] = await query(db, `SELECT (SELECT COUNT(*)::int FROM finance.accounts) AS accounts, (SELECT COUNT(*)::int FROM finance.transactions) AS transactions`);
  const currencyMismatches = await query(db, `
    SELECT t.id, t.account_id, t.currency AS transaction_currency, a.currency AS account_currency
    FROM finance.transactions t JOIN finance.accounts a ON a.id=t.account_id
    WHERE t.currency <> a.currency`);
  const balanceMismatches = await query(db, `
    SELECT a.id, a.currency, a.balance::text AS stored_balance,
      COALESCE(SUM(CASE WHEN t.kind='income' THEN t.amount ELSE -t.amount END)
        FILTER (WHERE t.voided_at IS NULL AND t.category <> 'rental_revenue'),0)::text AS ledger_balance
    FROM finance.accounts a LEFT JOIN finance.transactions t ON t.account_id=a.id
    GROUP BY a.id HAVING a.balance <> COALESCE(SUM(CASE WHEN t.kind='income' THEN t.amount ELSE -t.amount END)
      FILTER (WHERE t.voided_at IS NULL AND t.category <> 'rental_revenue'),0)`);
  const invalidSnapshots = await query(db, `
    SELECT id FROM finance.transactions
    WHERE amount <= 0 OR fx_rate_to_eur <= 0 OR amount_eur <> ROUND(amount*fx_rate_to_eur,2)
      OR (currency='EUR' AND fx_rate_to_eur <> 1)`);
  return { ok: !currencyMismatches.length && !balanceMismatches.length && !invalidSnapshots.length, checked: counts, currencyMismatches, balanceMismatches, invalidSnapshots };
}
