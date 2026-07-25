import {useRef, useState, type ReactNode} from "react";
import {useNavigate, useParams} from "react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Card, Chip, Spinner} from "@heroui/react";
import {Timeline} from "@heroui-pro/react/timeline";
import type {TimelineStatus} from "@heroui-pro/react/timeline";
import {Ban, Banknote, Check, ChevronLeft, Copy, Download, FileCode2, Mail, Pencil, Plus, RefreshCw, RotateCcw, Send, Trash2, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {AppDatePicker, AppSelect} from "../components/FormControls";
import {api, downloadApiFile} from "../lib/api";
import type {Address, EfacturaSubmission, Invoice, InvoiceDelivery, InvoicePayment, PaymentMethod} from "../lib/types";
import {
  cents,
  date,
  displayStatus,
  displayStatusLabels,
  exchangeRate,
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
  const [editingPayment, setEditingPayment] = useState<InvoicePayment | null | undefined>(undefined);
  const [emailOpen, setEmailOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);

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
    enabled: Boolean(company?.id && id && invoiceQuery.data?.data.document_type === "invoice"),
  });
  const deliveriesQuery = useQuery({
    queryKey: ["invoice", company?.id, id, "deliveries"],
    queryFn: () => api<InvoiceDelivery[]>(`/companies/${company!.id}/invoices/${id}/deliveries`),
    enabled: Boolean(company?.id && id),
    refetchInterval: (query) => query.state.data?.data.some((delivery) => ["queued", "sending"].includes(delivery.status)) ? 5000 : false,
  });
  const retryDelivery = useMutation({
    mutationFn: (deliveryId: string) =>
      api<InvoiceDelivery>(`/companies/${company!.id}/invoices/${id}/deliveries/${deliveryId}/retry`, {method: "POST"}),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id, "deliveries"]}),
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
  const lifecycleMutation = useMutation({
    mutationFn: async (action: "issue" | "cancel" | "delete" | "duplicate") => {
      if (action === "delete") {
        await api<void>(`/companies/${company!.id}/invoices/${id}`, {method: "DELETE"});
        return null;
      }
      let body: string | undefined;
      if (action === "cancel") {
        const reason = window.prompt("Motivul anulării (rămâne în istoricul documentului):")?.trim();
        if (!reason) throw new Error("Motivul anulării este obligatoriu.");
        body = JSON.stringify({cancellation_reason: reason});
      }
      return api<Invoice>(`/companies/${company!.id}/invoices/${id}/${action}`, {method: "POST", body});
    },
    onSuccess: (result, action) => {
      void queryClient.invalidateQueries({queryKey: ["invoices", company?.id]});
      void queryClient.invalidateQueries({queryKey: ["dashboard", company?.id]});
      if (action === "delete") navigate("/facturi", {replace: true});
      else if (action === "duplicate" && result) navigate(`/facturi/${result.data.id}`);
      else void queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id]});
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
    } catch {
      // downloadApiFile reports API and network failures through the global toast.
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
        {invoice.recurring_source ? (
          <Button variant="outline" onPress={() => navigate("/recurente")}>
            Sursă: {invoice.recurring_source.template_name ?? "șablon recurent"} · v{invoice.recurring_source.version ?? "—"}
          </Button>
        ) : null}
        <div className="flex-1" />
        {isDraft ? (
          <>
            <Button variant="outline" onPress={() => navigate(`/facturi/${id}/editeaza`)}><Pencil size={16} /> Editează</Button>
            <Button variant="primary" isDisabled={lifecycleMutation.isPending} onPress={() => {
              if (window.confirm("Emiți această ciornă? După emitere conținutul fiscal nu mai poate fi editat.")) lifecycleMutation.mutate("issue");
            }}><Send size={16} /> Emite</Button>
            <Button variant="outline" isDisabled={lifecycleMutation.isPending} onPress={() => {
              if (window.confirm("Ștergi definitiv această ciornă?")) lifecycleMutation.mutate("delete");
            }}><Trash2 size={16} /> Șterge</Button>
          </>
        ) : null}
        {invoice.document_type === "invoice" ? (
          <Button variant="outline" isDisabled={lifecycleMutation.isPending} onPress={() => lifecycleMutation.mutate("duplicate")}><Copy size={16} /> Duplică</Button>
        ) : null}
        {invoice.status === "issued" ? (
          <Button variant="outline" isDisabled={lifecycleMutation.isPending} onPress={() => {
            if (window.confirm("Anularea nu creează un storno și nu modifică documentul original. Continui?")) lifecycleMutation.mutate("cancel");
          }}><Ban size={16} /> Anulează</Button>
        ) : null}
        {invoice.status === "issued" && invoice.document_type === "invoice" ? (
          <Button variant="outline" onPress={() => setCorrectionOpen(true)}><RotateCcw size={16} /> Stornează</Button>
        ) : null}
        {!isDraft ? (
          <Button variant="outline" isDisabled={downloading !== null} onPress={() => void download("pdf")}>
            {downloading === "pdf" ? <Spinner size="sm" /> : <Download size={16} />} Descarcă PDF
          </Button>
        ) : null}
        {invoice.status === "issued" ? <Button variant="outline" onPress={() => setEmailOpen(true)}><Mail size={16} /> Trimite pe email</Button> : null}
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
                {invoice.exchange_rate && <div className="mt-1 text-[12px]" style={{color: PAPER.muted}}>
                  Curs {invoice.exchange_rate_source?.toUpperCase() ?? "BNR"}: 1 {invoice.currency} = {exchangeRate(invoice.exchange_rate)} RON
                  {invoice.exchange_rate_day ? ` (${date(invoice.exchange_rate_day)})` : ""}
                </div>}
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
                        {invoice.exchange_rate && <div className="text-[10px]" style={{color: PAPER.faint}}>
                          {money(Math.round(line.unit_price_cents * Number(invoice.exchange_rate)), "RON")}
                        </div>}
                      </td>
                      <td className="border-b px-2 py-2.5 text-right align-top" style={{borderColor: PAPER.border}}>
                        {Number(line.vat_rate)}%
                      </td>
                      <td
                        className="border-b py-2.5 pl-2 text-right align-top font-medium"
                        style={{borderColor: PAPER.border}}
                      >
                        {money(line.subtotal_cents, currency)}
                        {invoice.exchange_rate && <div className="text-[10px] font-normal" style={{color: PAPER.faint}}>
                          {money(Math.round(line.subtotal_cents * Number(invoice.exchange_rate)), "RON")}
                        </div>}
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
                {invoice.total_cents_ron !== null && invoice.currency !== "RON" && <div className="mt-2 border-t pt-2" style={{borderColor: PAPER.border}}>
                  <div className="flex justify-between py-1" style={{color: PAPER.muted}}><span>Subtotal RON</span><span>{money(invoice.subtotal_cents_ron, "RON")}</span></div>
                  <div className="flex justify-between py-1" style={{color: PAPER.muted}}><span>TVA RON</span><span>{money(invoice.vat_cents_ron, "RON")}</span></div>
                  <div className="flex justify-between py-1 font-bold"><span>Total RON</span><span>{money(invoice.total_cents_ron, "RON")}</span></div>
                </div>}
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
              {!isDraft && invoice.document_type === "invoice" ? (
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
              {(invoice.corrections?.length ?? 0) > 0 ? (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="text-[12px] font-semibold">Documente de corecție</div>
                  {invoice.corrections.map((correction) => (
                    <button key={correction.id} className="mt-2 flex w-full justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-xs" onClick={() => navigate(`/facturi/${correction.id}`)}>
                      <span className="font-semibold">{correction.formatted_number}</span>
                      <span>{money(correction.total_cents, correction.currency)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {invoice.corrected_invoice ? (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="text-[12px] font-semibold">Document original</div>
                  <button className="mt-2 flex w-full justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-xs" onClick={() => navigate(`/facturi/${invoice.corrected_invoice!.id}`)}>
                    <span className="font-semibold">{invoice.corrected_invoice.formatted_number}</span>
                    <span>{money(invoice.corrected_invoice.total_cents, invoice.corrected_invoice.currency)}</span>
                  </button>
                </div>
              ) : null}

              {!isDraft ? (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="text-[12px] font-semibold">Livrări email</div>
                  {(deliveriesQuery.data?.data ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">Documentul nu a fost trimis încă.</p>
                  ) : (
                    <div className="mt-2 flex flex-col">
                      {(deliveriesQuery.data?.data ?? []).map((delivery) => (
                        <div key={delivery.id} className="flex items-center gap-2 border-b border-[var(--border)] py-2.5 text-xs last:border-0">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{delivery.recipient}</div>
                            <div className={delivery.status === "failed" ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}>
                              {delivery.status === "sent" ? `Trimisă ${delivery.sent_at ? date(delivery.sent_at) : ""}` : ["queued", "sending"].includes(delivery.status) ? "În curs de trimitere" : delivery.error ?? "Livrare eșuată"}
                            </div>
                          </div>
                          {delivery.status === "failed" ? (
                            <Button isIconOnly size="sm" variant="ghost" aria-label="Reîncearcă livrarea" onPress={() => retryDelivery.mutate(delivery.id)}><RefreshCw size={14} /></Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {!isDraft && invoice.document_type === "invoice" ? (
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
      {emailOpen && company?.id && id ? (
        <EmailDeliveryModal
          companyId={company.id}
          invoice={invoice}
          onClose={() => setEmailOpen(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({queryKey: ["invoice", company.id, id, "deliveries"]});
            setEmailOpen(false);
          }}
        />
      ) : null}
      {correctionOpen && company?.id ? (
        <CorrectionModal
          companyId={company.id}
          invoice={invoice}
          onClose={() => setCorrectionOpen(false)}
          onCreated={(correction) => {
            void queryClient.invalidateQueries({queryKey: ["invoice", company.id, id]});
            navigate(`/facturi/${correction.id}`);
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

function CorrectionModal({companyId, invoice, onClose, onCreated}: {
  companyId: string;
  invoice: Invoice;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}) {
  const [mode, setMode] = useState<"total" | "partial">("total");
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => api<Invoice>(`/companies/${companyId}/invoices/${invoice.id}/corrections`, {
      method: "POST",
      body: JSON.stringify({
        mode,
        reason: reason.trim(),
        lines: mode === "partial"
          ? invoice.lines.filter((line) => Number(quantities[line.id]) > 0).map((line) => ({
              invoice_line_id: line.id,
              quantity: Number(quantities[line.id]),
            }))
          : undefined,
      }),
    }),
    onSuccess: ({data}) => onCreated(data),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="Creează factură de corecție">
      <div className="w-full max-w-xl rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-lg)]">
        <header className="flex items-center justify-between border-b border-[var(--border)] p-5"><div><h2 className="font-semibold">Creează factură de corecție</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Originalul rămâne nemodificat. Se creează o ciornă separată, cu referință fiscală la {invoice.formatted_number}.</p></div><Button isIconOnly variant="ghost" onPress={onClose}><X size={17} /></Button></header>
        <div className="grid gap-4 p-5">
          <div className="text-xs font-semibold text-[var(--text-muted)]">Tip corecție
            <AppSelect name="mode" ariaLabel="Tip corecție" className="mt-1.5" value={mode} onChange={(value) => setMode(value as "total" | "partial")} options={[
              {id: "total", label: "Stornare totală"},
              {id: "partial", label: "Corecție parțială"},
            ]} />
          </div>
          {mode === "partial" ? (
            <div>
              <div className="text-xs font-semibold text-[var(--text-muted)]">Cantități de corectat</div>
              <div className="mt-2 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {invoice.lines.map((line, index) => (
                  <label key={line.id} className="flex items-center gap-3 p-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{line.description} (max. {Number(line.quantity)})</span>
                    <input name={`lines.${index}.quantity`} className="h-9 w-24 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2" type="number" min="0" max={Number(line.quantity)} step="0.01" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({...current, [line.id]: event.target.value}))} />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <label className="text-xs font-semibold text-[var(--text-muted)]">Motiv<textarea name="reason" className="mt-1.5 min-h-24 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" onPress={onClose}>Anulează</Button><Button variant="primary" isDisabled={create.isPending || !reason.trim() || (mode === "partial" && !Object.values(quantities).some((value) => Number(value) > 0))} onPress={() => {
          if (window.confirm("Creezi ciorna documentului de corecție? Aceasta nu se trimite automat în SPV sau pe email.")) create.mutate();
        }}>{create.isPending ? <Spinner size="sm" /> : <RotateCcw size={15} />} Creează ciorna</Button></footer>
      </div>
    </div>
  );
}

function EmailDeliveryModal({companyId, invoice, onClose, onSaved}: {
  companyId: string;
  invoice: Invoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [recipient, setRecipient] = useState(invoice.customer?.email ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(`Factura ${invoice.formatted_number}`);
  const [message, setMessage] = useState("Bună ziua,\n\nVă transmitem factura atașată.");
  const send = useMutation({
    mutationFn: () => api<InvoiceDelivery>(`/companies/${companyId}/invoices/${invoice.id}/deliveries/email`, {
      method: "POST",
      body: JSON.stringify({
        recipient: recipient.trim(),
        cc: cc.split(",").map((value) => value.trim()).filter(Boolean),
        subject: subject.trim(),
        message: message.trim() || null,
      }),
    }),
    onSuccess: onSaved,
  });
  const input = "h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="Trimite factura pe email">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-lg)]">
        <header className="flex items-center justify-between border-b border-[var(--border)] p-5"><div><h2 className="font-semibold">Trimite factura pe email</h2><p className="mt-1 text-xs text-[var(--text-muted)]">PDF-ul este atașat; trimiterea în SPV nu este afectată.</p></div><Button isIconOnly variant="ghost" aria-label="Închide" onPress={onClose}><X size={17} /></Button></header>
        <div className="grid gap-4 p-5">
          <label className="text-xs font-semibold text-[var(--text-muted)]">Destinatar<input name="recipient" className={`${input} mt-1.5`} type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
          <label className="text-xs font-semibold text-[var(--text-muted)]">CC (separate prin virgulă)<input name="cc" className={`${input} mt-1.5`} value={cc} onChange={(event) => setCc(event.target.value)} /></label>
          <label className="text-xs font-semibold text-[var(--text-muted)]">Subiect<input name="subject" className={`${input} mt-1.5`} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
          <label className="text-xs font-semibold text-[var(--text-muted)]">Mesaj<textarea name="message" className="mt-1.5 min-h-28 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-sm" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" onPress={onClose}>Anulează</Button><Button variant="primary" isDisabled={send.isPending || !recipient.trim() || !subject.trim()} onPress={() => {
          if (window.confirm(`Trimiți explicit factura către ${recipient.trim()}?`)) send.mutate();
        }}>{send.isPending ? <Spinner size="sm" /> : <Mail size={15} />} Trimite</Button></footer>
      </div>
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
            <input name="amount_cents" className={input} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <div className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)]">Data încasării
            <AppDatePicker name="paid_at" ariaLabel="Data încasării" value={paidAt} onChange={setPaidAt} />
          </div>
          <div className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)]">Metodă
            <AppSelect name="method" ariaLabel="Metodă" value={method} onChange={(value) => setMethod(value as PaymentMethod)} options={Object.entries(paymentMethodLabels).map(([value, label]) => ({id: value, label}))} />
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)]">Referință
            <input name="reference" className={input} value={reference} onChange={(event) => setReference(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)] sm:col-span-2">Notițe
            <textarea name="notes" className="min-h-20 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
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
