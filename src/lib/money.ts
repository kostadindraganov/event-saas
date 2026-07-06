export function formatEuro(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  return rest === 0 ? `${whole} €` : `${whole},${String(rest).padStart(2, "0")} €`;
}

export function parseEuroToCents(input: string): number | null {
  const m = input.trim().match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const whole = Number(m[1]);
  const cents = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return whole * 100 + cents;
}
