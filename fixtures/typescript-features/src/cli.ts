import { billing, createShop, formatMoney } from "./index.js";

interface CliArguments {
  readonly country: string;
  readonly customerId: string;
  readonly skus: readonly string[];
}

function parseArguments(argv: readonly string[]): CliArguments {
  const option = (name: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return {
    country: option("country") ?? "DE",
    customerId: option("customer") ?? "walk-in",
    skus: argv.filter((arg) => !arg.startsWith("--")),
  };
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { country, customerId, skus } = parseArguments(argv);
  if (skus.length === 0) {
    console.error("usage: shop-core [--country=DE] [--customer=<id>] <sku>...");
    return 2;
  }

  const shop = createShop({ country });
  const invoice = await shop.checkout({
    customerId,
    lines: skus.map((sku) => ({ sku, quantity: 1, unitPrice: { amountCents: 1000, currency: "EUR" } })),
  });
  console.log(invoice.render());
  console.log(`Tax rate for ${country}: ${(billing.Tax.rateFor(country) * 100).toFixed(1)}%`);
  console.log(`Gross: ${formatMoney(invoice.gross)}`);
  return 0;
}

void main().then((code) => {
  process.exitCode = code;
});
