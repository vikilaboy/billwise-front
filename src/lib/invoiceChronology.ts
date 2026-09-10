export function invoiceDateError(value: string | null, minimum: string | null | undefined, today: string): string | null {
  if (!value) return "Completează data emiterii.";
  if (minimum && value < minimum) return `Data emiterii trebuie să fie cel puțin ${minimum.split("-").reverse().join(".")}, ultima dată emisă în această serie.`;
  if (value > today) return "Data emiterii nu poate fi în viitor.";
  return null;
}

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
