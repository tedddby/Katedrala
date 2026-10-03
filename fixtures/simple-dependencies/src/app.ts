import { ExpenseService, type Expense } from "./services/expense-service";
import { createLogger, type LogLevel } from "./utils/logger";

export interface AppOptions {
  currency?: string;
  logLevel?: LogLevel;
}

/** Parses `amount:category[:description]`, e.g. `12.50:food:lunch with the team`. */
export function parseExpense(argument: string): Expense | undefined {
  const [amountText, category, ...descriptionParts] = argument.split(":");
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0 || !category) {
    return undefined;
  }
  return {
    amount,
    category: category.trim().toLowerCase(),
    description: descriptionParts.join(":").trim() || category,
  };
}

export function runApp(args: string[], options: AppOptions = {}): number {
  const logger = createLogger(options.logLevel ?? "info");
  const service = new ExpenseService(options.currency ?? "EUR");

  for (const argument of args) {
    const expense = parseExpense(argument);
    if (expense === undefined) {
      logger.warn(`Skipping malformed expense "${argument}" (expected amount:category[:description])`);
      continue;
    }
    logger.debug(`Recorded ${expense.amount} for ${expense.category}`);
    service.add(expense);
  }

  if (service.count === 0) {
    logger.error("No valid expenses given.");
    return 1;
  }

  for (const line of service.summarize()) {
    logger.info(line);
  }
  return 0;
}
