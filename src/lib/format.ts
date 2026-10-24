const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function manualPrice(n: number): string {
  const negative = n < 0;
  const fixed = Math.abs(n).toFixed(2);
  const [whole, pence] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}£${grouped}.${pence}`;
}

let formatter: Intl.NumberFormat | null | undefined;

function getFormatter(): Intl.NumberFormat | null {
  if (formatter !== undefined) return formatter;
  try {
    const f = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
    // Hermes can ship a limited Intl; verify the output before trusting it.
    formatter = f.format(9.5) === '£9.50' ? f : null;
  } catch {
    formatter = null;
  }
  return formatter;
}

/** 9.5 -> "£9.50" */
export function formatPrice(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  const f = getFormatter();
  if (f) {
    try {
      return f.format(value);
    } catch {
      /* fall through */
    }
  }
  return manualPrice(value);
}

/** ISO date -> "24 Oct 2026" (manual so it is identical on every engine). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
