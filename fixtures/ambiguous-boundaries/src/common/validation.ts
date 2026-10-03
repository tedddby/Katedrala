const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const POSTAL_CODES: Readonly<Record<string, RegExp>> = {
  AT: /^\d{4}$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  NL: /^\d{4}[A-Z]{2}$/,
};

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function isValidPostalCode(code: string, country: string): boolean {
  const pattern = POSTAL_CODES[country];
  return pattern === undefined ? code.trim() !== "" : pattern.test(code.replace(/\s+/g, "").toUpperCase());
}
