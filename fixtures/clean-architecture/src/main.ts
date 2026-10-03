import { BorrowBook } from "./application/borrow-book.js";
import { ReturnBook } from "./application/return-book.js";
import { SendOverdueReminders } from "./application/send-overdue-reminders.js";
import { SmtpNotifier } from "./infrastructure/notifications/smtp-notifier.js";
import { createPool } from "./infrastructure/persistence/pool.js";
import { SqlBookRepository } from "./infrastructure/persistence/sql-book-repository.js";
import { SqlLoanRepository } from "./infrastructure/persistence/sql-loan-repository.js";
import { SqlMemberRepository } from "./infrastructure/persistence/sql-member-repository.js";
import { SystemClock } from "./infrastructure/system-clock.js";
import { loanRoutes } from "./presentation/http/loan-routes.js";
import { startHttpServer } from "./presentation/http/server.js";

// Composition root: the only place that knows every layer.
const pool = createPool(process.env.DATABASE_URL ?? "postgres://localhost:5432/library");
const clock = new SystemClock();
const books = new SqlBookRepository(pool);
const loans = new SqlLoanRepository(pool);
const members = new SqlMemberRepository(pool);
const notifier = new SmtpNotifier({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  from: process.env.MAIL_FROM ?? "library@example.org",
});

const routes = loanRoutes(new BorrowBook(books, members, loans, notifier, clock), new ReturnBook(books, loans, clock));
startHttpServer(routes, Number(process.env.PORT ?? 8080));

const reminders = new SendOverdueReminders(loans, members, notifier, clock);
const ONE_DAY_MS = 86_400_000;
setInterval(() => {
  reminders.execute().catch((error: unknown) => {
    console.error("Overdue reminder run failed", error);
  });
}, ONE_DAY_MS);
