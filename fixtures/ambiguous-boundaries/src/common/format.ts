export function formatMoney(cents: number, currency = "EUR", locale = "de-DE"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function formatDate(date: Date, locale = "de-DE"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
