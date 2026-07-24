import {useRef, useState, type ReactNode} from "react";
import {useNavigate, useParams} from "react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Card, Chip, Spinner} from "@heroui/react";
import {Timeline} from "@heroui-pro/react/timeline";
import type {TimelineStatus} from "@heroui-pro/react/timeline";
import {Banknote, Check, ChevronLeft, Download, FileCode2, Pencil, Plus, Send, Trash2, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {api, ApiError, downloadApiFile} from "../lib/api";
import type {Address, EfacturaSubmission, Invoice, InvoicePayment, PaymentMethod} from "../lib/types";
import {
  cents,
  date,
  displayStatus,
  displayStatusLabels,
  money,
  spvStatusLabels,
  statusTone,
} from "../lib/format";

// The invoice "paper" is always rendered light, regardless of the app theme.
const PAPER = {
  bg: "#ffffff",
  text: "#18181b",
  muted: "#6b7280",
  faint: "#9ca3af",
  border: "#eeeeee",
  boxBg: "#f7f7f8",
} as const;

function addressLine(address: Address | null | undefined): string {
  if (!address) return "";
  return [
    address.street,
    address.street_details,
    address.resolved_city ?? address.city_name,
    address.resolved_region ?? address.region_name,
    address.country_code,
  ]
    .filter(Boolean)
    .join(", ");
}

type StepState = "done" | "error" | "pending" | "active";

const STEP_TO_TIMELINE: Record<StepState, TimelineStatus> = {
  done: "success",
  error: "danger",
  pending: "muted",
  active: "current",
};

type Step = {title: string; sub: string; state: StepState};

// Derive a 4-step e-Factura timeline from the latest submission (submissions[0]).
function buildSteps(invoice: Invoice, latest: EfacturaSubmission | undefined): Step[] {
  const issued = invoice.status !== "draft";
  const sentSet: EfacturaSubmission["status"][] = ["sent", "processing", "accepted", "rejected", "failed"];

  const hasSubmission = Boolean(latest);
  const isSent = latest ? sentSet.includes(latest.status) : false;

  const generated: Step = {
    title: "Generată",
    sub: issued ? "Factura a fost emisă" : "În așteptare",
    state: issued ? "done" : "pending",
  };

  const sent: Step = {
    title: "Trimisă în SPV",
    sub: hasSubmission ? spvStatusLabels[latest!.status] : "În așteptare",
    state: isSent ? "done" : hasSubmission ? "active" : "pending",
  };

  const validatedState: StepState =
    latest?.status === "accepted"
      ? "done"
      : latest?.status === "rejected" || latest?.status === "failed"
        ? "error"
        : "pending";
  const validated: Step = {
    title: "Validată ANAF",
    sub:
      validatedState === "done"
        ? "Acceptată de ANAF"
        : validatedState === "error"
          ? (latest?.error ?? "Respinsă de ANAF")
          : "În așteptare",
    state: validatedState,
  };

  const confirmed: Step = {
    title: "Confirmare descărcată",
    sub: latest?.has_confirmation ? "Confirmare disponibilă" : "În așteptare",
    state: latest?.has_confirmation ? "done" : "pending",
  };

  return [generated, sent, validated, confirmed];
}

function StepIcon({state}: {state: StepState}): ReactNode {
  if (state === "done") return <Check size={13} />;
  if (state === "error") return <X size={13} />;
  return null;
}

export function InvoiceDetailPage() {
  const {id} = useParams();
  const navigate = useNavigate();
  const {company} = useCompany();
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const [downloading, setDownloading] = useState<"pdf" | "xml" | "confirmation" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<InvoicePayment | null | undefined>(undefined);

  const invoiceQuery = useQuery({
    queryKey: ["invoice", company?.id, id],
    queryFn: () => api<Invoice>(`/companies/${company!.id}/invoices/${id}`),
    enabled: Boolean(company?.id && id),
  });

  const submissionsQuery = useQuery({
    queryKey: ["invoice", company?.id, id, "submissions"],
    queryFn: () =>
      api<EfacturaSubmission[]>(`/companies/${company!.id}/invoices/${id}/efactura/submissions`),
    enabled: Boolean(company?.id && id),
    refetchInterval: (query) => {
      const latestSubmission = query.state.data?.data?.[0];
      return latestSubmission && ["queued", "sent", "processing"].includes(latestSubmission.status) ? 5000 : false;
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ["invoice", company?.id, id, "payments"],
    queryFn: () => api<InvoicePayment[]>(`/companies/${company!.id}/invoices/${id}/payments`),
    enabled: Boolean(company?.id && id),
  });
  const deletePayment = useMutation({
    mutationFn: (paymentId: string) =>
      api<void>(`/companies/${company!.id}/invoices/${id}/payments/${paymentId}`, {method: "DELETE"}),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id]});
      void queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id, "payments"]});
      void queryClient.invalidateQueries({queryKey: ["invoices", company?.id]});
      void queryClient.invalidateQueries({queryKey: ["dashboard", company?.id]});
    },
  });
  const settleInvoice = useMutation({
    mutationFn: () =>
      api<InvoicePayment>(`/companies/${company!.id}/invoices/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount_cents: invoiceQuery.data!.data.balance_cents,
          currency: invoiceQuery.data!.data.currency,
          paid_at: new Date().toISOString().slice(0, 10),
          method: "bank_transfer",
          reference: null,
          notes: "Încasare integrală",
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id]});
      void queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id, "payments"]});
      void queryClient.invalidateQueries({queryKey: ["invoices", company?.id]});
      void queryClient.invalidateQueries({queryKey: ["dashboard", company?.id]});
    },
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api<EfacturaSubmission>(`/companies/${company!.id}/invoices/${id}/efactura/submissions`, {method: "POST"}),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id]});
      void queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id, "submissions"]});
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  if (invoiceQuery.isLoading || !company) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (invoiceQuery.isError) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-[var(--danger)]">
        Factura nu a putut fi încărcată.
      </div>
    );
  }

  const invoice = invoiceQuery.data?.data;
  if (!invoice) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-[var(--text-muted)]">
        Factura nu a fost găsită.
      </div>
    );
  }

  const ds = displayStatus(invoice);
  const currency = invoice.currency;
  const seller = invoice.company_profile;
  const customer = invoice.customer;
  const submissions = submissionsQuery.data?.data ?? [];
  const latest = submissions[0];
  const steps = buildSteps(invoice, latest);
  const payments = paymentsQuery.data?.data ?? [];
  const isDraft = invoice.status === "draft";
  const formattedNumber = invoice.formatted_number;
  const hasBlockingSubmission = Boolean(latest && ["queued", "sent", "processing", "accepted"].includes(latest.status));
  const eligibilityMessages = {
    invoice_not_issued: "Factura trebuie emisă înainte de trimiterea în SPV.",
    customer_address_missing: "Completează adresa clientului înainte de trimitere.",
    outside_jurisdiction: "Clientul este în afara jurisdicției e-Factura România.",
  } as const;

  async function download(kind: "pdf" | "xml" | "confirmation") {
    if (!company?.id || !id) return;
    setDownloading(kind);
    setDownloadError(null);
    try {
      if (kind === "pdf") {
        await downloadApiFile(`/companies/${company.id}/invoices/${id}/pdf`, `${formattedNumber}.pdf`);
      } else if (kind === "xml") {
        await downloadApiFile(`/companies/${company.id}/invoices/${id}/efactura`, `${formattedNumber}.xml`);
      } else if (latest) {
        await downloadApiFile(
          `/companies/${company.id}/invoices/${id}/efactura/submissions/${latest.id}/download`,
          `${formattedNumber}.zip`,
        );
      }
    } catch (error) {
      setDownloadError(error instanceof ApiError ? error.problem.detail ?? error.problem.title : "Descărcarea a eșuat.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Top action row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onPress={() => navigate("/facturi")}>
          <ChevronLeft size={16} /> Înapoi
        </Button>
        <Chip color={statusTone[ds]} variant="soft" size="lg">
          <Chip.Label>{displayStatusLabels[ds]}</Chip.Label>
        </Chip>
        <div className="flex-1" />
        {!isDraft ? (
          <Button variant="outline" isDisabled={downloading !== null} onPress={() => void download("pdf")}>
            {downloading === "pdf" ? <Spinner size="sm" /> : <Download size={16} />} Descarcă PDF
          </Button>
        ) : null}
      </div>

      {/* 2-column grid */}
      <div className="invoice-detail-grid">
        {/* LEFT — the paper */}
        <div className="rounded-2xl bg-[var(--bg-muted)] p-4 sm:p-6">
          <div
            className="mx-auto w-full max-w-[640px] rounded-xl p-7 shadow-[0_10px_40px_rgba(24,24,27,.12)] sm:p-9"
            style={{background: PAPER.bg, color: PAPER.text}}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg font-extrabold text-white"
                  style={{background: "var(--accent)"}}
                >
                  B
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold leading-tight">{seller?.legal_name ?? "—"}</div>
                  <div className="mt-1 text-[12px] tabular-nums" style={{color: PAPER.muted}}>
                    CUI {seller?.tax_id ?? "—"} · {seller?.registration_number ?? "—"}
                  </div>
                  <div className="mt-1 text-[12px]" style={{color: PAPER.muted}}>
                    {addressLine(seller?.address) || "—"}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[20px] font-extrabold tracking-tight">FACTURĂ</div>
                <div className="mt-0.5 text-[13px] font-semibold tabular-nums">{invoice.formatted_number}</div>
                <div className="mt-2 text-[12px] tabular-nums" style={{color: PAPER.muted}}>
                  Emitere: {date(invoice.issue_date)}
                </div>
                <div className="text-[12px] tabular-nums" style={{color: PAPER.muted}}>
                  Scadență: {date(invoice.due_date)}
                </div>
              </div>
            </div>

            {/* Client box */}
            <div className="mt-7 rounded-lg p-4" style={{background: PAPER.boxBg}}>
              <div className="text-[10.5px] font-bold uppercase tracking-wide" style={{color: PAPER.faint}}>
                Client
              </div>
              <div className="mt-1.5 text-[14px] font-semibold">{customer?.name ?? "—"}</div>
              {customer?.tax_id && (
                <div className="mt-0.5 text-[12px] tabular-nums" style={{color: PAPER.muted}}>
                  CUI {customer.tax_id}
                  {customer.registration_number ? ` · ${customer.registration_number}` : ""}
                </div>
              )}
              <div className="mt-0.5 text-[12px]" style={{color: PAPER.muted}}>
                {addressLine(customer?.address) || "—"}
              </div>
            </div>

            {/* Lines table */}
            <div className="mt-7 overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px] tabular-nums">
                <thead>
                  <tr style={{color: PAPER.faint}} className="text-[10.5px] uppercase tracking-wide">
                    <th className="border-b py-2 pr-2 text-left font-semibold" style={{borderColor: PAPER.border}}>
                      Descriere
                    </th>
                    <th className="border-b px-2 py-2 text-right font-semibold" style={{borderColor: PAPER.border}}>
                      Cant.
                    </th>
                    <th className="border-b px-2 py-2 text-right font-semibold" style={{borderColor: PAPER.border}}>
                      Preț
                    </th>
                    <th className="border-b px-2 py-2 text-right font-semibold" style={{borderColor: PAPER.border}}>
                      TVA
                    </th>
                    <th className="border-b py-2 pl-2 text-right font-semibold" style={{borderColor: PAPER.border}}>
                      Valoare
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="border-b py-2.5 pr-2 align-top" style={{borderColor: PAPER.border}}>
                        <div className="font-medium" style={{color: PAPER.text}}>
                          {line.description}
                        </div>
                        {line.unit && (
                          <div className="text-[11px]" style={{color: PAPER.faint}}>
                            {line.unit}
                          </div>
                        )}
                      </td>
                      <td className="border-b px-2 py-2.5 text-right align-top" style={{borderColor: PAPER.border}}>
                        {Number(line.quantity)}
                      </td>
                      <td className="border-b px-2 py-2.5 text-right align-top" style={{borderColor: PAPER.border}}>
                        {money(line.unit_price_cents, currency)}
                      </td>
                      <td className="border-b px-2 py-2.5 text-right align-top" style={{borderColor: PAPER.border}}>
                        {Number(line.vat_rate)}%
                      </td>
                      <td
                        className="border-b py-2.5 pl-2 text-right align-top font-medium"
                        style={{borderColor: PAPER.border}}
                      >
                        {money(line.subtotal_cents, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-6 flex justify-end">
              <div className="w-full max-w-[260px] text-[13px] tabular-nums">
                <div className="flex justify-between py-1" style={{color: PAPER.muted}}>
                  <span>Subtotal</span>
                  <span>{money(invoice.subtotal_cents, currency)}</span>
                </div>
                <div className="flex justify-between py-1" style={{color: PAPER.muted}}>
                  <span>TVA</span>
                  <span>{money(invoice.vat_cents, currency)}</span>
                </div>
                <div
                  className="mt-1 flex justify-between border-t pt-2 text-[15px] font-bold"
                  style={{borderColor: PAPER.border, color: PAPER.text}}
                >
                  <span>Total</span>
                  <span>{money(invoice.total_cents, currency)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 border-t pt-4 text-[12px]" style={{borderColor: PAPER.border, color: PAPER.muted}}>
              <div className="flex items-center gap-2">
                <Banknote size={14} style={{color: PAPER.faint}} />
                <span>Plata se face în contul bancar indicat de emitent.</span>
              </div>
              {invoice.notes && (
                <div className="mt-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide" style={{color: PAPER.faint}}>
                    Mențiuni
                  </div>
                  <div className="mt-1 whitespace-pre-line" style={{color: PAPER.text}}>
                    {invoice.notes}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — sticky rail */}
        <div className="invoice-detail-rail flex flex-col gap-4">
          {/* Summary card */}
          <Card className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
            <Card.Content className="p-0">
              <div className="text-[12px] font-medium text-[var(--text-muted)]">Total de plată</div>
              <div className="mt-1 text-[26px] font-extrabold tracking-tight tabular-nums">
                {cents(invoice.total_cents)} {currency}
              </div>
              {!isDraft ? (
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--bg-muted)] p-3 text-sm">
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Încasat</div>
                    <div className="mt-1 font-semibold tabular-nums">{money(invoice.paid_cents, currency)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Sold</div>
                    <div className="mt-1 font-semibold tabular-nums">{money(invoice.balance_cents, currency)}</div>
                  </div>
                </div>
              ) : null}

              {!isDraft ? (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold">Încasări</div>
                    <div className="flex gap-1">
                      {invoice.balance_cents > 0 ? (
                        <>
                          <Button size="sm" variant="ghost" isDisabled={settleInvoice.isPending} onPress={() => {
                            if (window.confirm(`Înregistrezi soldul integral de ${money(invoice.balance_cents, currency)} ca transfer bancar, cu data de azi?`)) settleInvoice.mutate();
                          }}>
                            <Check size={14} /> Încasează integral
                          </Button>
                          <Button size="sm" variant="outline" onPress={() => setEditingPayment(null)}>
                            <Plus size={14} /> Adaugă
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {settleInvoice.isError ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">Încasarea integrală nu a putut fi salvată.</p> : null}
                  {paymentsQuery.isLoading ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]"><Spinner size="sm" /> Se încarcă…</div>
                  ) : payments.length === 0 ? (
                    <p className="mt-3 text-xs text-[var(--text-muted)]">Nu există încasări înregistrate.</p>
                  ) : (
                    <div className="mt-2 flex flex-col">
                      {payments.map((payment) => (
                        <div key={payment.id} className="flex items-center gap-2 border-b border-[var(--border)] py-2.5 text-xs last:border-0">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">{money(payment.amount_cents, payment.currency)}</div>
                            <div className="truncate text-[var(--text-muted)]">{date(payment.paid_at)} · {payment.reference || paymentMethodLabels[payment.method]}</div>
                          </div>
                          <Button isIconOnly size="sm" variant="ghost" aria-label="Editează încasarea" onPress={() => setEditingPayment(payment)}><Pencil size={14} /></Button>
                          <Button isIconOnly size="sm" variant="ghost" aria-label="Șterge încasarea" onPress={() => {
                            if (window.confirm("Ștergi această încasare? Soldul facturii va fi recalculat.")) deletePayment.mutate(payment.id);
                          }}><Trash2 size={14} className="text-[var(--danger)]" /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <div className="text-[12px] font-semibold text-[var(--text)]">Stare e-Factura</div>

                {isDraft ? (
                  <div className="mt-3 rounded-lg bg-[var(--bg-muted)] px-3 py-2.5 text-[12.5px] text-[var(--text-muted)]">
                    Factura este ciornă — nu a fost depusă.
                  </div>
                ) : (
                  <Timeline size="sm" className="mt-3">
                    {steps.map((step, i) => (
                      <Timeline.Item key={step.title} status={STEP_TO_TIMELINE[step.state]}>
                        <Timeline.Marker status={STEP_TO_TIMELINE[step.state]}>
                          <StepIcon state={step.state} />
                        </Timeline.Marker>
                        {i < steps.length - 1 && <Timeline.Connector />}
                        <Timeline.Content>
                          <div className="text-[12.5px] font-semibold text-[var(--text)]">{step.title}</div>
                          <div className="text-[11.5px] text-[var(--text-muted)]">{step.sub}</div>
                        </Timeline.Content>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                )}

                {!invoice.efactura_eligibility.eligible ? (
                  <p className="mt-3 text-[12px] text-[var(--text-muted)]">
                    {invoice.efactura_eligibility.reason
                      ? eligibilityMessages[invoice.efactura_eligibility.reason]
                      : "Factura nu este eligibilă pentru e-Factura."}
                  </p>
                ) : null}

                {latest?.error ? (
                  <p role="alert" className="mt-3 rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-[12px] text-[var(--danger)]">
                    {latest.error}
                  </p>
                ) : null}
                {submitMutation.error ? (
                  <p role="alert" className="mt-3 text-[12px] font-medium text-[var(--danger)]">
                    {submitMutation.error instanceof ApiError
                      ? submitMutation.error.problem.detail ?? submitMutation.error.problem.title
                      : "Trimiterea în SPV nu a putut fi pornită."}
                  </p>
                ) : null}
                {downloadError ? <p role="alert" className="mt-3 text-[12px] font-medium text-[var(--danger)]">{downloadError}</p> : null}

                <div className="mt-4 flex flex-col gap-2">
                  {invoice.efactura_eligibility.eligible && !hasBlockingSubmission ? (
                    <Button
                      size="sm"
                      variant="primary"
                      isDisabled={submitMutation.isPending}
                      onPress={() => {
                        if (submittingRef.current || !window.confirm("Trimiți explicit această factură în ANAF SPV?")) return;
                        submittingRef.current = true;
                        submitMutation.mutate();
                      }}
                    >
                      {submitMutation.isPending ? <Spinner size="sm" /> : <Send size={14} />}
                      Trimite în SPV
                    </Button>
                  ) : null}
                  {invoice.efactura_eligibility.eligible ? (
                    <Button size="sm" variant="outline" isDisabled={downloading !== null} onPress={() => void download("xml")}>
                      {downloading === "xml" ? <Spinner size="sm" /> : <FileCode2 size={14} />}
                      Descarcă XML validat
                    </Button>
                  ) : null}
                  {latest?.has_confirmation ? (
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={downloading !== null}
                      onPress={() => void download("confirmation")}
                    >
                      {downloading === "confirmation" ? <Spinner size="sm" /> : <Download size={14} />}
                      Descarcă confirmarea ZIP
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card.Content>
          </Card>

        </div>
      </div>

      {editingPayment !== undefined && company?.id && id ? (
        <PaymentModal
          companyId={company.id}
          invoice={invoice}
          payment={editingPayment}
          onClose={() => setEditingPayment(undefined)}
          onSaved={() => {
            void queryClient.invalidateQueries({queryKey: ["invoice", company.id, id]});
            void queryClient.invalidateQueries({queryKey: ["invoice", company.id, id, "payments"]});
            void queryClient.invalidateQueries({queryKey: ["invoices", company.id]});
            void queryClient.invalidateQueries({queryKey: ["dashboard", company.id]});
            setEditingPayment(undefined);
          }}
        />
      ) : null}

      {/* Scoped layout: responsive 2-col grid + sticky rail. */}
      <style>{`
        .invoice-detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 18px;
          align-items: start;
        }
        .invoice-detail-rail {
          position: sticky;
          top: 16px;
        }
        @media (max-width: 900px) {
          .invoice-detail-grid { grid-template-columns: 1fr; }
          .invoice-detail-rail { position: static; }
        }
      `}</style>
    </div>
  );
}

const paymentMethodLabels: Record<PaymentMethod, string> = {
  bank_transfer: "Transfer bancar",
  card: "Card",
  cash: "Numerar",
  other: "Altă metodă",
};

function localDate(value?: string | null): string {
  return value?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
}

function PaymentModal({companyId, invoice, payment, onClose, onSaved}: {
  companyId: string;
  invoice: Invoice;
  payment: InvoicePayment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String((payment?.amount_cents ?? invoice.balance_cents) / 100));
  const [paidAt, setPaidAt] = useState(localDate(payment?.paid_at));
  const [method, setMethod] = useState<PaymentMethod>(payment?.method ?? "bank_transfer");
  const [reference, setReference] = useState(payment?.reference ?? "");
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const save = useMutation({
    mutationFn: () => api<InvoicePayment>(
      `/companies/${companyId}/invoices/${invoice.id}/payments${payment ? `/${payment.id}` : ""}`,
      {
        method: payment ? "PUT" : "POST",
        body: JSON.stringify({
          amount_cents: Math.round(Number(amount) * 100),
          currency: invoice.currency,
          paid_at: paidAt,
          method,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      },
    ),
    onSuccess: onSaved,
  });
  const error = save.error instanceof ApiError
    ? save.error.problem.detail ?? Object.values(save.error.problem.errors ?? {})[0]?.[0] ?? save.error.problem.title
    : null;
  const input = "h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label={payment ? "Editează încasarea" : "Încasare nouă"}>
      <div className="w-full max-w-lg rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-lg)]">
        <header className="flex items-center justify-between border-b border-[var(--border)] p-5">
          <div><h2 className="font-semibold">{payment ? "Editează încasarea" : "Înregistrează încasarea"}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Sold curent: {money(invoice.balance_cents, invoice.currency)}</p></div>
          <Button isIconOnly variant="ghost" aria-label="Închide" onPress={onClose}><X size={17} /></Button>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)]">Sumă
            <input className={input} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)]">Data încasării
            <input className={input} type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)]">Metodă
            <select className={input} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
              {Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)]">Referință
            <input className={input} value={reference} onChange={(event) => setReference(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)] sm:col-span-2">Notițe
            <textarea className="min-h-20 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {error ? <p role="alert" className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4">
          <Button variant="outline" onPress={onClose}>Anulează</Button>
          <Button variant="primary" isDisabled={save.isPending || Number(amount) <= 0 || !paidAt} onPress={() => save.mutate()}>
            {save.isPending ? <Spinner size="sm" /> : null} Salvează
          </Button>
        </footer>
      </div>
    </div>
  );
}
