import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Finance } from "@sever/contracts";
import { useFinanceJournal } from "../src/features/finance/hooks.ts";
import { TransactionActions } from "../src/features/finance/components/TransactionActions.tsx";

const row = (patch: Partial<Finance.TransactionDTO> = {}) => ({ id: "tx", accountId: "cash", kind: "income", category: "prepayment", amount: 100, amountEUR: 100, currency: "EUR", createdAt: "2026-10-01T12:00:00Z", note: "Wedding", voidedAt: null, ...patch } as Finance.TransactionDTO);

describe("financial register", () => {
  it("excludes accruals and cancelled payments from cash totals", () => {
    const rows = [row(), row({ category: "rental_revenue", amountEUR: 500 }), row({ kind: "expense", amountEUR: 30 }), row({ voidedAt: "2026-10-02", amountEUR: 200 })];
    const { result } = renderHook(() => useFinanceJournal(rows));
    expect(result.current.count).toBe(3);
    expect(result.current.totals).toEqual({ income: 100, expense: 30 });
    act(() => result.current.setIncludeVoided(true));
    expect(result.current.count).toBe(4);
    expect(result.current.totals).toEqual({ income: 100, expense: 30 });
  });
  it("filters account, period and search while allowing access beyond 30 rows", () => {
    const rows = Array.from({ length: 45 }, (_, i) => row({ id: String(i) }));
    const { result } = renderHook(() => useFinanceJournal(rows));
    expect(result.current.rows).toHaveLength(30);
    act(() => result.current.showMore());
    expect(result.current.rows).toHaveLength(45);
    act(() => result.current.setAccountId("bank"));
    expect(result.current.count).toBe(0);
    act(() => { result.current.setAccountId(""); result.current.setSearch("wedding"); result.current.setFrom("2026-10-01"); result.current.setTo("2026-10-01"); });
    expect(result.current.count).toBe(45);
    act(() => result.current.setFrom("2026-10-02"));
    expect(result.current.count).toBe(0);
  });
  it("keeps correction input open if saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Сеть недоступна"));
    render(<TransactionActions transaction={row()} accounts={[{ id: "cash", currency: "EUR", name: "Касса" } as Finance.AccountDTO]} pending={false} onSave={onSave} onVoid={vi.fn()} />);
    fireEvent.click(screen.getByText("Исправить"));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "150" } });
    fireEvent.click(screen.getByText("Сохранить исправление"));
    expect((await screen.findByRole("alert")).textContent).toContain("Сеть недоступна");
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("150");
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 150 }));
  });
});
