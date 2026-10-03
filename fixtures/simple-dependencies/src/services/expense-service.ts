import { formatCurrency } from "../utils/currency";

export interface Expense {
  amount: number;
  category: string;
  description: string;
}

export class ExpenseService {
  private readonly expenses: Expense[] = [];

  constructor(private readonly currency: string) {}

  get count(): number {
    return this.expenses.length;
  }

  add(expense: Expense): void {
    this.expenses.push(expense);
  }

  total(): number {
    return this.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  }

  totalsByCategory(): Map<string, number> {
    const totals = new Map<string, number>();
    for (const expense of this.expenses) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
    }
    return totals;
  }

  summarize(): string[] {
    const total = this.total();
    const lines = [...this.totalsByCategory()]
      .sort(([, a], [, b]) => b - a)
      .map(([category, amount]) => {
        const share = total === 0 ? 0 : (amount / total) * 100;
        return `${category.padEnd(14)} ${formatCurrency(amount, this.currency).padStart(12)}  ${share.toFixed(1)}%`;
      });
    lines.push(`${"total".padEnd(14)} ${formatCurrency(total, this.currency).padStart(12)}`);
    return lines;
  }
}
