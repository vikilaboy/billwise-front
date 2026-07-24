import type {InvoiceStatus, Invoice, SpvSubmissionStatus} from "./types";

const ronFmt = new Intl.NumberFormat("ro-RO", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const intFmt = new Intl.NumberFormat("ro-RO");

// Integer cents → "1.234,56" (no currency suffix).
export function cents(value: number | null | undefined): string {
  return ronFmt.format((value ?? 0) / 100);
}

// Integer cents + ISO currency → "1.234,56 RON".
export function money(value: number | null | undefined, currency = "RON"): string {
  return `${cents(value)} ${currency}`;
}

export function integer(value: number | null | undefined): string {
  return intFmt.format(value ?? 0);
}

export function exchangeRate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(Number(value));
}

// "2026-07-10" → "10.07.2026". Passthrough for anything unparseable.
export function date(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

// The API only models draft/issued/cancelled. "overdue" is derived below.
export const statusLabels: Record<InvoiceStatus, string> = {
  draft: "Ciornă",
  issued: "Emisă",
  cancelled: "Anulată",
};

export type DisplayStatus = InvoiceStatus | "overdue";

// Derive an "overdue" display state from an issued invoice past its due date.
export function displayStatus(
  inv: Pick<Invoice, "status" | "due_date" | "payment_status">,
  today = new Date(),
): DisplayStatus {
  if (inv.status === "issued" && inv.payment_status !== "paid" && inv.due_date) {
    const due = new Date(inv.due_date + "T23:59:59");
    if (due < today) return "overdue";
  }
  return inv.status;
}

export const displayStatusLabels: Record<DisplayStatus, string> = {
  ...statusLabels,
  overdue: "Restantă",
};

// Maps a display status to a semantic tone used for chips/pills.
export const statusTone: Record<DisplayStatus, "default" | "success" | "warning" | "danger"> = {
  draft: "default",
  issued: "warning",
  overdue: "danger",
  cancelled: "danger",
};

export const spvStatusLabels: Record<SpvSubmissionStatus, string> = {
  queued: "În coadă",
  sent: "Trimisă",
  processing: "În procesare",
  accepted: "Acceptată",
  rejected: "Respinsă",
  failed: "Eșuată",
};

export const spvStatusTone: Record<SpvSubmissionStatus, "default" | "success" | "warning" | "danger"> = {
  queued: "default",
  sent: "warning",
  processing: "warning",
  accepted: "success",
  rejected: "danger",
  failed: "danger",
};
