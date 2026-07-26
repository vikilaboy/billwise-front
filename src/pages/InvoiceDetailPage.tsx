import {useRef, useState, type ReactNode} from "react";
import {useNavigate, useParams} from "react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Card, Chip, Dropdown, Label, Spinner, Tooltip} from "@heroui/react";
import {Timeline} from "@heroui-pro/react/timeline";
import type {TimelineStatus} from "@heroui-pro/react/timeline";
import {Ban, Check, ChevronLeft, Copy, Download, FileCode2, Mail, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Send, Trash2, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {ConfirmDialog} from "../components/ConfirmDialog";
import {AppDatePicker, AppSelect} from "../components/FormControls";
import {InvoiceDocumentPreview} from "../components/InvoiceDocumentPreview";
import {api, downloadApiFile} from "../lib/api";
import type {EfacturaSubmission, Invoice, InvoiceDelivery, InvoicePayment, PaymentMethod} from "../lib/types";
import {
  cents,
  date,
  displayStatus,
  displayStatusLabels,
  money,
  spvStatusLabels,
  statusTone,
} from "../lib/format";

type StepState = "done" | "error" | "pending" | "active";

const STEP_TO_TIMELINE: Record<StepState, TimelineStatus> = {
  done: "success",
  error: "danger",
  pending: "muted",
  active: "current",
};

type Step = {title: string; sub: string; state: StepState};

type DetailConfirmation =
  | {kind: "issue" | "delete" | "cancel" | "settle" | "submit-spv" | "retry-spv"}
  | {kind: "delete-payment"; payment: InvoicePayment}
  | null;

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
        || latest?.status === "delivery_unknown"
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
  const [confirmation, setConfirmation] = useState<DetailConfirmation>(null);
  const [cancellationReason, setCancellationReason] = useState("");

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
      return latestSubmission && ["queued", "sending", "sent", "processing"].includes(latestSubmission.status) ? 5000 : false;
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
  const retryUnknownMutation = useMutation({
    mutationFn: (submissionId: string) =>
      api<EfacturaSubmission>(
        `/companies/${company!.id}/invoices/${id}/efactura/submissions/${submissionId}/retry-unknown`,
        {
          method: "POST",
          body: JSON.stringify({confirmed_absent_in_spv: true}),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id, "submissions"]});
    },
  });
  const syncSubmissionMutation = useMutation({
    mutationFn: (submissionId: string) =>
      api<EfacturaSubmission>(
        `/companies/${company!.id}/invoices/${id}/efactura/submissions/${submissionId}/sync`,
        {method: "POST"},
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ["invoice", company?.id, id, "submissions"]});
    },
  });
  const lifecycleMutation = useMutation({
    mutationFn: async ({action, reason}: {action: "issue" | "cancel" | "delete" | "duplicate"; reason?: string}) => {
      if (action === "delete") {
        await api<void>(`/companies/${company!.id}/invoices/${id}`, {method: "DELETE"});
        return null;
      }
      const body = action === "cancel" ? JSON.stringify({cancellation_reason: reason}) : undefined;
      return api<Invoice>(`/companies/${company!.id}/invoices/${id}/${action}`, {method: "POST", body});
    },
    onSuccess: (result, {action}) => {
      setConfirmation(null);
      setCancellationReason("");
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
  const customer = invoice.customer;
  const submissions = submissionsQuery.data?.data ?? [];
  const latest = submissions[0];
  const steps = buildSteps(invoice, latest);
  const payments = paymentsQuery.data?.data ?? [];
  const isDraft = invoice.status === "draft";
  const formattedNumber = invoice.formatted_number;
  const hasBlockingSubmission = Boolean(latest && ["queued", "sending", "sent", "processing", "accepted", "delivery_unknown"].includes(latest.status));
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

  function confirmDetailAction() {
    if (!confirmation) return;
    if (confirmation.kind === "issue" || confirmation.kind === "delete") {
      lifecycleMutation.mutate({action: confirmation.kind});
    } else if (confirmation.kind === "cancel") {
      lifecycleMutation.mutate({action: "cancel", reason: cancellationReason.trim()});
    } else if (confirmation.kind === "settle") {
      settleInvoice.mutate(undefined, {onSuccess: () => setConfirmation(null)});
    } else if (confirmation.kind === "delete-payment") {
      deletePayment.mutate(confirmation.payment.id, {onSuccess: () => setConfirmation(null)});
    } else if (confirmation.kind === "submit-spv") {
      if (submittingRef.current) return;
      submittingRef.current = true;
      submitMutation.mutate(undefined, {onSuccess: () => setConfirmation(null)});
    } else if (latest) {
      retryUnknownMutation.mutate(latest.id, {onSuccess: () => setConfirmation(null)});
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Cohesive document header and state-aware actions. */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] sm:p-4">
        <Tooltip delay={300}>
          <Button isIconOnly variant="ghost" aria-label="Înapoi la facturi" onPress={() => navigate("/facturi")}>
            <ChevronLeft size={18} />
          </Button>
          <Tooltip.Content>Înapoi la facturi</Tooltip.Content>
        </Tooltip>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight">{formattedNumber}</h1>
            <Chip color={statusTone[ds]} variant="soft" size="sm">
              <Chip.Label>{displayStatusLabels[ds]}</Chip.Label>
            </Chip>
          </div>
          <p className="truncate text-xs text-[var(--text-muted)]">
            {customer?.name ?? "Client necunoscut"} · {date(invoice.issue_date)}
          </p>
        </div>
        <div className="flex-1" />
        {isDraft ? (
          <>
            <Button variant="outline" onPress={() => navigate(`/facturi/${id}/editeaza`)}>
              <Pencil size={16} /> Editează
            </Button>
            <Button variant="primary" isDisabled={lifecycleMutation.isPending} onPress={() => setConfirmation({kind: "issue"})}>
              <Send size={16} /> Emite
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" isDisabled={downloading !== null} onPress={() => void download("pdf")}>
              {downloading === "pdf" ? <Spinner size="sm" /> : <Download size={16} />} Descarcă PDF
            </Button>
            {invoice.status === "issued" ? (
              <Button variant="primary" onPress={() => setEmailOpen(true)}>
                <Mail size={16} /> Trimite pe email
              </Button>
            ) : null}
          </>
        )}
        <Dropdown>
          <Button isIconOnly variant="ghost" aria-label="Mai multe acțiuni">
            <MoreHorizontal size={18} />
          </Button>
          <Dropdown.Popover placement="bottom end" className="min-w-[220px]">
            <Dropdown.Menu onAction={(key) => {
              if (key === "source") navigate("/recurente");
              if (key === "duplicate") lifecycleMutation.mutate({action: "duplicate"});
              if (key === "cancel") setConfirmation({kind: "cancel"});
              if (key === "correction") setCorrectionOpen(true);
              if (key === "delete") setConfirmation({kind: "delete"});
            }}>
              {invoice.recurring_source ? (
                <Dropdown.Item id="source" textValue="Deschide sursa recurentă">
                  <RefreshCw size={15} /><Label>Deschide sursa recurentă</Label>
                </Dropdown.Item>
              ) : null}
              {invoice.document_type === "invoice" ? (
                <Dropdown.Item id="duplicate" textValue="Duplică">
                  <Copy size={15} /><Label>Duplică factura</Label>
                </Dropdown.Item>
              ) : null}
              {invoice.status === "issued" && invoice.document_type === "invoice" ? (
                <Dropdown.Item id="correction" textValue="Stornează">
                  <RotateCcw size={15} /><Label>Creează corecție</Label>
                </Dropdown.Item>
              ) : null}
              {invoice.status === "issued" ? (
                <Dropdown.Item id="cancel" textValue="Anulează" variant="danger">
                  <Ban size={15} /><Label>Anulează factura</Label>
                </Dropdown.Item>
              ) : null}
              {isDraft ? (
                <Dropdown.Item id="delete" textValue="Șterge" variant="danger">
                  <Trash2 size={15} /><Label>Șterge ciorna</Label>
                </Dropdown.Item>
              ) : null}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
      {/* 2-column grid */}
      <div className="invoice-detail-grid">
        {/* LEFT — the paper */}
        <div className="rounded-2xl bg-[var(--bg-muted)] p-4 sm:p-6">
          <InvoiceDocumentPreview invoice={invoice} />
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
                  <div className="text-[12px] font-semibold">Încasări</div>
                  {invoice.balance_cents > 0 ? (
                    <div className="mt-3 grid gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        className="w-full"
                        isDisabled={settleInvoice.isPending}
                        onPress={() => setConfirmation({kind: "settle"})}
                      >
                        <Check size={14} /> Încasează integral
                      </Button>
                      <Button size="sm" variant="outline" className="w-full" onPress={() => setEditingPayment(null)}>
                        <Plus size={14} /> Adaugă încasare parțială
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--success-soft)] px-3 py-2.5 text-xs font-semibold text-[var(--success)]">
                      <Check size={15} /> Factură încasată integral
                    </div>
                  )}
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
                          <Button isIconOnly size="sm" variant="ghost" aria-label="Șterge încasarea" onPress={() => setConfirmation({kind: "delete-payment", payment})}>
                            <Trash2 size={14} className="text-[var(--danger)]" />
                          </Button>
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
                    {latest.status === "delivery_unknown"
                      ? "ANAF poate să fi primit factura, dar Billwise nu a primit răspunsul. Verifică factura în SPV înainte de retransmitere."
                      : latest.error}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-col gap-2">
                  {invoice.efactura_eligibility.eligible && !hasBlockingSubmission ? (
                    <Button
                      size="sm"
                      variant="primary"
                      isDisabled={submitMutation.isPending}
                      onPress={() => {
                        if (!submittingRef.current) setConfirmation({kind: "submit-spv"});
                      }}
                    >
                      {submitMutation.isPending ? <Spinner size="sm" /> : <Send size={14} />}
                      Trimite în SPV
                    </Button>
                  ) : null}
                  {latest?.status === "delivery_unknown" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={retryUnknownMutation.isPending}
                      onPress={() => setConfirmation({kind: "retry-spv"})}
                    >
                      {retryUnknownMutation.isPending ? <Spinner size="sm" /> : <RefreshCw size={14} />}
                      Confirmă absența și retransmite
                    </Button>
                  ) : null}
                  {latest && ["sent", "processing"].includes(latest.status) && latest.upload_index ? (
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={syncSubmissionMutation.isPending}
                      onPress={() => syncSubmissionMutation.mutate(latest.id)}
                    >
                      {syncSubmissionMutation.isPending ? <Spinner size="sm" /> : <RefreshCw size={14} />}
                      Verifică acum în ANAF
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
      <ConfirmDialog
        isOpen={confirmation !== null}
        title={
          confirmation?.kind === "issue" ? "Emiți această factură?"
            : confirmation?.kind === "delete" ? "Ștergi definitiv ciorna?"
              : confirmation?.kind === "cancel" ? "Anulezi factura emisă?"
                : confirmation?.kind === "settle" ? "Înregistrezi încasarea integrală?"
                  : confirmation?.kind === "delete-payment" ? "Ștergi această încasare?"
                    : confirmation?.kind === "retry-spv" ? "Confirmi absența facturii din SPV?"
                      : "Trimiți factura în ANAF SPV?"
        }
        description={
          confirmation?.kind === "issue"
            ? "După emitere, conținutul fiscal nu mai poate fi editat."
            : confirmation?.kind === "delete"
              ? "Ciorna va fi ștearsă definitiv."
              : confirmation?.kind === "cancel"
                ? "Anularea păstrează documentul în istoric și nu creează automat un storno."
                : confirmation?.kind === "settle"
                  ? `Se înregistrează soldul de ${money(invoice.balance_cents, currency)} ca transfer bancar, cu data de azi.`
                  : confirmation?.kind === "delete-payment"
                    ? "Soldul facturii va fi recalculat imediat."
                    : confirmation?.kind === "retry-spv"
                      ? "Retransmite numai după ce ai verificat manual în SPV că ANAF nu a primit factura. Altfel poate apărea un duplicat."
                      : "Aceasta este o acțiune explicită. Billwise va trimite factura în SPV numai după confirmarea ta."
        }
        confirmLabel={
          confirmation?.kind === "issue" ? "Emite factura"
            : confirmation?.kind === "delete" || confirmation?.kind === "delete-payment" ? "Șterge"
              : confirmation?.kind === "cancel" ? "Anulează factura"
                : confirmation?.kind === "settle" ? "Încasează integral"
                  : confirmation?.kind === "retry-spv" ? "Confirmă și retransmite"
                    : "Trimite în SPV"
        }
        tone={
          confirmation?.kind === "delete" || confirmation?.kind === "delete-payment" || confirmation?.kind === "retry-spv"
            ? "danger"
            : confirmation?.kind === "settle" ? "success"
              : confirmation?.kind === "issue" || confirmation?.kind === "cancel" ? "warning" : "accent"
        }
        isPending={
          lifecycleMutation.isPending
          || settleInvoice.isPending
          || deletePayment.isPending
          || submitMutation.isPending
          || retryUnknownMutation.isPending
        }
        isConfirmDisabled={confirmation?.kind === "cancel" && !cancellationReason.trim()}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setConfirmation(null);
            setCancellationReason("");
          }
        }}
        onConfirm={confirmDetailAction}
      >
        {confirmation?.kind === "cancel" ? (
          <label className="mt-4 block text-xs font-semibold text-[var(--text)]">
            Motivul anulării
            <textarea
              autoFocus
              className="mt-2 min-h-24 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-sm font-normal outline-none focus:border-[var(--accent)]"
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
            />
          </label>
        ) : null}
      </ConfirmDialog>

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
        <footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" onPress={onClose}>Anulează</Button><Button variant="primary" isDisabled={create.isPending || !reason.trim() || (mode === "partial" && !Object.values(quantities).some((value) => Number(value) > 0))} onPress={() => create.mutate()}>
          {create.isPending ? <Spinner size="sm" /> : <RotateCcw size={15} />} Creează ciorna
        </Button></footer>
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
        <footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" onPress={onClose}>Anulează</Button><Button variant="primary" isDisabled={send.isPending || !recipient.trim() || !subject.trim()} onPress={() => send.mutate()}>
          {send.isPending ? <Spinner size="sm" /> : <Mail size={15} />} Trimite explicit
        </Button></footer>
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
