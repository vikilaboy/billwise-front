import {useMemo, useState} from "react";
import {useNavigate, useSearchParams} from "react-router";
import {useQuery} from "@tanstack/react-query";
import {Button, Card, Chip, Spinner} from "@heroui/react";
import {ComposedChart} from "@heroui-pro/react/composed-chart";
import {KPI} from "@heroui-pro/react/kpi";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleAlert,
  Clock,
  FileCheck2,
  FileText,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {AppDatePicker, AppSelect} from "../components/FormControls";
import {api, apiErrorMessage} from "../lib/api";
import {
  clearDashboardPeriods,
  dashboardPeriodQuery,
  dashboardPreferenceKey,
  DEFAULT_DASHBOARD_PERIOD,
  readDashboardPeriod,
  readDashboardPeriods,
  writeDashboardPeriod,
  type DashboardComparison,
  type DashboardPeriodNamespace,
  type DashboardPeriodPreset,
  type DashboardPeriodSelection,
} from "../lib/dashboardPeriods";
import {date, money} from "../lib/format";
import type {
  DashboardAging,
  DashboardAttention,
  DashboardEfactura,
  DashboardPerformance,
  DashboardPurchases,
  DashboardSummary,
  Invoice,
} from "../lib/types";

const PERIOD_OPTIONS = [
  {id: "current_week", label: "Săptămâna curentă"},
  {id: "previous_week", label: "Săptămâna trecută"},
  {id: "current_month", label: "Luna curentă"},
  {id: "previous_month", label: "Luna trecută"},
  {id: "current_quarter", label: "Trimestrul curent"},
  {id: "previous_quarter", label: "Trimestrul trecut"},
  {id: "current_year", label: "Anul curent"},
  {id: "previous_year", label: "Anul trecut"},
  {id: "last_30_days", label: "Ultimele 30 zile"},
  {id: "last_90_days", label: "Ultimele 90 zile"},
  {id: "custom", label: "Interval personalizat"},
];
const COMPARISON_OPTIONS = [
  {id: "previous_period", label: "vs. perioada anterioară"},
  {id: "previous_year", label: "vs. anul anterior"},
  {id: "none", label: "Fără comparație"},
];
const AGING_LABELS: Record<DashboardAging["buckets"][number]["key"], string> = {
  current: "În termen",
  overdue_1_30: "Restante 1–30 zile",
  overdue_31_60: "Restante 31–60 zile",
  overdue_61_90: "Restante 61–90 zile",
  overdue_over_90: "Restante peste 90 zile",
};
const EFACTURA_LABELS: Record<DashboardEfactura["buckets"][number]["key"], string> = {
  not_submitted: "Netrimise",
  pending: "În curs",
  accepted: "Acceptate",
  problem: "Cu probleme",
};
const EFACTURA_TONES: Record<DashboardEfactura["buckets"][number]["key"], "default" | "warning" | "success" | "danger"> = {
  not_submitted: "default",
  pending: "warning",
  accepted: "success",
  problem: "danger",
};

export function balanceRonCents(invoice: Invoice): number {
  if (invoice.balance_cents <= 0) return 0;
  if (invoice.total_cents_ron != null && invoice.total_cents > 0) {
    return Math.round((invoice.balance_cents * invoice.total_cents_ron) / invoice.total_cents);
  }
  return invoice.balance_cents;
}

export const isOverdue = (invoice: Invoice): boolean => invoice.payment_status === "overdue";

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", {timeZone: "Europe/Bucharest"});
}

function periodLabel(from: string, to: string): string {
  return from === to ? date(from) : `${date(from)} – ${date(to)}`;
}

function seriesLabel(from: string, to: string): string {
  const first = date(from).slice(0, 5);
  const last = date(to).slice(0, 5);
  return from === to ? first : `${first}–${last}`;
}

function paymentLabel(invoice: Invoice): string {
  if (invoice.document_type !== "invoice") return "Corecție";
  return {
    paid: "Încasată",
    partial: "Parțial încasată",
    unpaid: "Neîncasată",
    overdue: "Restantă",
    not_applicable: "Corecție",
  }[invoice.payment_status];
}

function paymentTone(invoice: Invoice): "default" | "success" | "warning" | "danger" {
  if (invoice.payment_status === "paid") return "success";
  if (invoice.payment_status === "overdue") return "danger";
  if (invoice.payment_status === "partial") return "warning";
  return "default";
}

function QueryError({error, retry}: {error: unknown; retry: () => void}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-3 p-5 text-center">
      <p className="text-sm text-[var(--danger)]">{apiErrorMessage(error, "Datele nu au putut fi încărcate.")}</p>
      <Button size="sm" variant="outline" onPress={retry}>Reîncearcă</Button>
    </div>
  );
}

function LoadingBlock({label = "Se încarcă…"}: {label?: string}) {
  return <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-[var(--text-muted)]"><Spinner size="sm" /> {label}</div>;
}

function PeriodControl({
  value,
  comparison = true,
  label,
  onChange,
}: {
  value: DashboardPeriodSelection;
  comparison?: boolean;
  label: string;
  onChange: (next: DashboardPeriodSelection) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from ?? todayIso());
  const [draftTo, setDraftTo] = useState(value.to ?? todayIso());
  const invalid = !draftFrom || !draftTo || draftFrom > draftTo || draftTo > todayIso();

  const choosePreset = (preset: string) => {
    if (preset === "custom") {
      setDraftFrom(value.from ?? todayIso());
      setDraftTo(value.to ?? todayIso());
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange({...value, preset: preset as DashboardPeriodPreset, from: undefined, to: undefined});
  };

  return (
    <div className="relative flex flex-wrap items-end gap-2">
      <AppSelect
        ariaLabel={`Perioadă ${label}`}
        className="min-w-48"
        value={value.preset}
        options={PERIOD_OPTIONS}
        onChange={choosePreset}
      />
      {comparison ? (
        <AppSelect
          ariaLabel={`Comparație ${label}`}
          className="min-w-48"
          value={value.comparison}
          options={COMPARISON_OPTIONS}
          onChange={(next) => onChange({...value, comparison: next as DashboardComparison})}
        />
      ) : null}
      {customOpen ? (
        <div className="absolute right-0 top-12 z-20 w-[min(440px,calc(100vw-3rem))] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
          <p className="mb-3 text-sm font-semibold">Interval personalizat</p>
          <div className="grid grid-cols-2 gap-3">
            <AppDatePicker name="dashboard_from" ariaLabel="De la" label="De la" value={draftFrom} maxValue={draftTo || todayIso()} onChange={setDraftFrom} />
            <AppDatePicker name="dashboard_to" ariaLabel="Până la" label="Până la" value={draftTo} minValue={draftFrom} maxValue={todayIso()} onChange={setDraftTo} />
          </div>
          {invalid ? <p className="mt-2 text-xs text-[var(--danger)]">Alege un interval valid, care nu depășește data de azi.</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={() => setCustomOpen(false)}>Renunță</Button>
            <Button
              size="sm"
              variant="primary"
              isDisabled={invalid}
              onPress={() => {
                onChange({...value, preset: "custom", from: draftFrom, to: draftTo});
                setCustomOpen(false);
              }}
            >
              Aplică
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
  chart,
  visual,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning" | "danger";
  chart?: {value: number}[];
  visual?: React.ReactNode;
  onPress?: () => void;
}) {
  const colors = {default: "text-[var(--text)]", success: "text-[var(--success)]", warning: "text-[var(--warning)]", danger: "text-[var(--danger)]"};
  const chartColors = {default: "var(--accent)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)"};
  return (
    <button type="button" onClick={onPress} className="min-w-0 text-left disabled:cursor-default" disabled={!onPress}>
      <KPI className="h-full min-h-44 overflow-hidden p-4 transition-colors hover:border-[var(--border-strong)]">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">{icon}{label}</div>
        <div className={`mt-4 text-2xl font-bold tabular-nums ${colors[tone]}`}>{value}</div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">{detail}</div>
        {chart?.length ? (
          <KPI.Chart
            aria-label={`Evoluție ${label.toLowerCase()}`}
            className="-mx-4 -mb-4 mt-auto pt-3"
            color={chartColors[tone]}
            data={chart}
            height={54}
            strokeWidth={2.5}
          />
        ) : visual ? <div className="mt-auto pt-5">{visual}</div> : null}
      </KPI>
    </button>
  );
}

export function DashboardPage() {
  const {company, can} = useCompany();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const stored = useMemo(() => readDashboardPeriods(company?.id), [company?.id]);
  const periods = {
    performance: readDashboardPeriod(params, "performance", stored.performance ?? DEFAULT_DASHBOARD_PERIOD),
    efactura: readDashboardPeriod(params, "efactura", stored.efactura ?? {...DEFAULT_DASHBOARD_PERIOD, comparison: "none"}),
    purchases: readDashboardPeriod(params, "purchases", stored.purchases ?? DEFAULT_DASHBOARD_PERIOD),
  };

  const setPeriod = (namespace: DashboardPeriodNamespace, value: DashboardPeriodSelection) => {
    setParams(writeDashboardPeriod(params, namespace, value));
    if (company?.id) {
      localStorage.setItem(dashboardPreferenceKey(company.id), JSON.stringify({...readDashboardPeriods(company.id), [namespace]: value}));
    }
  };
  const resetPeriods = () => {
    setParams(clearDashboardPeriods(params));
    if (company?.id) localStorage.removeItem(dashboardPreferenceKey(company.id));
  };

  const overview = useQuery({
    queryKey: ["dashboard", company?.id, "overview"],
    queryFn: () => api<DashboardSummary>(`/companies/${company!.id}/dashboard`),
    enabled: Boolean(company?.id),
  });
  const performance = useQuery({
    queryKey: ["dashboard", company?.id, "performance", periods.performance],
    queryFn: () => api<DashboardPerformance>(`/companies/${company!.id}/dashboard/performance${dashboardPeriodQuery(periods.performance)}`),
    enabled: Boolean(company?.id),
  });
  const aging = useQuery({
    queryKey: ["dashboard", company?.id, "aging"],
    queryFn: () => api<DashboardAging>(`/companies/${company!.id}/dashboard/receivables-aging`),
    enabled: Boolean(company?.id),
  });
  const efactura = useQuery({
    queryKey: ["dashboard", company?.id, "efactura", periods.efactura],
    queryFn: () => api<DashboardEfactura>(`/companies/${company!.id}/dashboard/efactura${dashboardPeriodQuery(periods.efactura)}`),
    enabled: Boolean(company?.id),
  });
  const purchases = useQuery({
    queryKey: ["dashboard", company?.id, "purchases", periods.purchases],
    queryFn: () => api<DashboardPurchases>(`/companies/${company!.id}/dashboard/purchases${dashboardPeriodQuery(periods.purchases)}`),
    enabled: Boolean(company?.id && can("purchase_invoice.view")),
  });
  const attention = useQuery({
    queryKey: ["dashboard", company?.id, "attention"],
    queryFn: () => api<DashboardAttention>(`/companies/${company!.id}/dashboard/attention?_limit=10`),
    enabled: Boolean(company?.id),
  });

  const performanceData = performance.data?.data;
  const overviewData = overview.data?.data;
  const chartData = performanceData?.series.map((point) => ({
    label: seriesLabel(point.from, point.to),
    facturat: point.invoiced_ron_cents / 100,
    incasat: point.collected_ron_cents / 100,
  })) ?? [];
  const invoicedSparkline = chartData.map((point) => ({value: point.facturat}));
  const collectedSparkline = chartData.map((point) => ({value: point.incasat}));
  const overdueShare = Math.min(100, Math.max(0, overviewData?.overdue.share_percent ?? 0));
  const periodIsDirty = ["performance", "efactura", "purchases"].some((namespace) => params.has(`${namespace}_preset`))
    || Object.keys(stored).length > 0;

  return (
    <div className="flex flex-col gap-4">
      {params.get("onboarding") === "complete" ? (
        <section className="rounded-2xl border border-[var(--success)]/30 bg-[var(--success-soft)] p-5">
          <div className="flex items-start gap-3"><CheckCircle2 size={21} className="mt-0.5 text-[var(--success)]" /><div><h2 className="font-bold text-[var(--success)]">Firma este configurată</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Poți emite prima factură sau continua configurarea.</p></div></div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Performanță comercială</h2>
          <p className="text-sm text-[var(--text-muted)]">Facturarea urmează data emiterii; încasările urmează data plății.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControl label="performanță" value={periods.performance} onChange={(value) => setPeriod("performance", value)} />
          <Button size="sm" variant="ghost" isDisabled={!periodIsDirty} onPress={resetPeriods}><RotateCcw size={15} /> Resetează perioadele</Button>
        </div>
      </div>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {performance.isLoading ? <LoadingBlock /> : performance.isError ? <QueryError error={performance.error} retry={() => void performance.refetch()} /> : (
          <>
            <MetricCard icon={<TrendingUp size={17} />} label="Facturat" value={money(performanceData?.summary.invoiced_ron_cents)} detail={`${performanceData?.summary.issued_document_count ?? 0} documente · ${periodLabel(performanceData!.period.from, performanceData!.period.to)}`} tone="success" chart={invoicedSparkline} />
            <MetricCard icon={<Banknote size={17} />} label="Încasat" value={money(performanceData?.summary.collected_ron_cents)} detail={`${performanceData?.summary.invoice_with_payment_count ?? 0} facturi cu încasări`} tone="success" chart={collectedSparkline} />
          </>
        )}
        {overview.isLoading ? <LoadingBlock /> : overview.isError ? <QueryError error={overview.error} retry={() => void overview.refetch()} /> : (
          <>
            <MetricCard
              icon={<Clock size={17} />}
              label="De încasat acum"
              value={money(overviewData?.outstanding.balance_ron_cents)}
              detail={`${overviewData?.outstanding.invoice_count ?? 0} facturi cu sold`}
              tone="warning"
              visual={(
                <div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                    <span className="bg-[var(--warning)]" style={{width: `${100 - overdueShare}%`}} />
                    <span className="bg-[var(--danger)]" style={{width: `${overdueShare}%`}} />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-[var(--text-muted)]">
                    <span>În termen {100 - overdueShare}%</span>
                    <span>Restant {overdueShare}%</span>
                  </div>
                </div>
              )}
              onPress={() => navigate("/facturi?payment_status=outstanding")}
            />
            <MetricCard
              icon={<AlertTriangle size={17} />}
              label="Restant acum"
              value={money(overviewData?.overdue.balance_ron_cents)}
              detail={`${overviewData?.overdue.invoice_count ?? 0} facturi · ${overdueShare}% din sold`}
              tone="danger"
              visual={(
                <div>
                  <div className="mb-2 flex justify-between text-[10px] text-[var(--text-muted)]">
                    <span>Pondere restantă</span>
                    <span>{overdueShare}%</span>
                  </div>
                  <KPI.Progress aria-label="Pondere restantă din sold" status="danger" value={overdueShare} />
                </div>
              )}
              onPress={() => navigate("/facturi?payment_status=overdue")}
            />
          </>
        )}
      </section>

      <Card className="p-5">
        <Card.Header className="flex flex-wrap items-start justify-between gap-3">
          <div><Card.Title>Facturat vs. încasat</Card.Title><Card.Description>{performanceData ? periodLabel(performanceData.period.from, performanceData.period.to) : "Perioada selectată"}</Card.Description></div>
          {performanceData?.comparison ? <div className="flex gap-2 text-xs"><Chip size="sm" variant="soft" color={(performanceData.comparison.invoiced_change_percent ?? 0) >= 0 ? "success" : "danger"}><Chip.Label>Facturat {performanceData.comparison.invoiced_change_percent == null ? "—" : `${performanceData.comparison.invoiced_change_percent > 0 ? "+" : ""}${performanceData.comparison.invoiced_change_percent}%`}</Chip.Label></Chip><Chip size="sm" variant="soft" color={(performanceData.comparison.collected_change_percent ?? 0) >= 0 ? "success" : "danger"}><Chip.Label>Încasat {performanceData.comparison.collected_change_percent == null ? "—" : `${performanceData.comparison.collected_change_percent > 0 ? "+" : ""}${performanceData.comparison.collected_change_percent}%`}</Chip.Label></Chip></div> : null}
        </Card.Header>
        <Card.Content>
          {performance.isLoading ? <LoadingBlock /> : performance.isError ? <QueryError error={performance.error} retry={() => void performance.refetch()} /> : chartData.length === 0 ? <p className="py-16 text-center text-sm text-[var(--text-muted)]">Nu există date în intervalul ales.</p> : (
            <ComposedChart data={chartData} height={260}>
              <ComposedChart.Grid vertical={false} />
              <ComposedChart.XAxis dataKey="label" interval="preserveStartEnd" minTickGap={28} />
              <ComposedChart.YAxis tickFormatter={(value) => new Intl.NumberFormat("ro-RO", {notation: "compact"}).format(Number(value))} />
              <ComposedChart.Tooltip content={<ComposedChart.TooltipContent />} />
              <ComposedChart.Bar dataKey="facturat" name="Facturat (RON)" fill="var(--accent)" radius={[5, 5, 1, 1]} />
              <ComposedChart.Line dataKey="incasat" name="Încasat (RON)" stroke="var(--success)" strokeWidth={3} dot={false} />
            </ComposedChart>
          )}
        </Card.Content>
      </Card>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <Card.Header><Card.Title>Vechimea soldurilor</Card.Title><Card.Description>Situație live, la zi</Card.Description></Card.Header>
          <Card.Content>
            {aging.isLoading ? <LoadingBlock /> : aging.isError ? <QueryError error={aging.error} retry={() => void aging.refetch()} /> : (
              <div className="mt-3">
                <div className="mb-4 flex items-end justify-between"><div><div className="text-2xl font-bold">{money(aging.data?.data.total_balance_ron_cents)}</div><div className="text-xs text-[var(--text-muted)]">{aging.data?.data.invoice_count} facturi cu sold</div></div><span className="text-xs text-[var(--text-muted)]">la {date(aging.data?.data.as_of)}</span></div>
                <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-[var(--bg-muted)]">{aging.data?.data.buckets.filter((bucket) => bucket.balance_ron_cents > 0).map((bucket, index) => <div key={bucket.key} style={{width: `${bucket.share_percent}%`, background: ["var(--success)", "var(--warning)", "#f97316", "#ef4444", "#991b1b"][index]}} />)}</div>
                {aging.data?.data.buckets.map((bucket) => <button key={bucket.key} type="button" onClick={() => navigate(`/facturi?aging=${bucket.key}`)} className="flex w-full items-center gap-3 border-t border-[var(--border)] py-3 text-left hover:bg-[var(--bg-muted)]"><span className="flex-1 text-sm">{AGING_LABELS[bucket.key]}</span><span className="text-xs text-[var(--text-muted)]">{bucket.invoice_count} facturi</span><b className="min-w-32 text-right text-sm tabular-nums">{money(bucket.balance_ron_cents)}</b><ArrowRight size={15} className="text-[var(--faint)]" /></button>)}
              </div>
            )}
          </Card.Content>
        </Card>

        <Card className="p-5">
          <Card.Header className="flex flex-wrap items-start justify-between gap-3">
            <div><Card.Title>ANAF e-Factura</Card.Title><Card.Description>Doar documentele eligibile din perioada aleasă</Card.Description></div>
            <PeriodControl label="e-Factura" value={periods.efactura} comparison={false} onChange={(value) => setPeriod("efactura", {...value, comparison: "none"})} />
          </Card.Header>
          <Card.Content>
            {efactura.isLoading ? <LoadingBlock /> : efactura.isError ? <QueryError error={efactura.error} retry={() => void efactura.refetch()} /> : (
              <div className="mt-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="text-2xl font-bold">{efactura.data?.data.eligible_document_count} documente</div><div className="text-xs text-[var(--text-muted)]">{money(efactura.data?.data.eligible_value_ron_cents)} eligibil · {efactura.data?.data.accepted_percent}% acceptate</div></div><Chip size="sm" variant="soft" color={efactura.data?.data.connection.connected ? "success" : efactura.data?.data.connection.reauthorization_required ? "danger" : "warning"}><Chip.Label>{efactura.data?.data.connection.connected ? "SPV conectat" : efactura.data?.data.connection.reauthorization_required ? "Reconectare necesară" : "SPV neconectat"}</Chip.Label></Chip></div>
                <div className="grid grid-cols-2 gap-3">
                  {efactura.data?.data.buckets.map((bucket) => <button key={bucket.key} type="button" onClick={() => navigate(`/facturi?efactura_status=${bucket.key}&issue_from=${efactura.data!.data.period.from}&issue_to=${efactura.data!.data.period.to}`)} className="rounded-xl border border-[var(--border)] p-3 text-left hover:border-[var(--border-strong)]"><div className="flex items-center justify-between gap-2"><span className="text-sm">{EFACTURA_LABELS[bucket.key]}</span><Chip size="sm" variant="soft" color={EFACTURA_TONES[bucket.key]}><Chip.Label>{bucket.document_count}</Chip.Label></Chip></div><div className="mt-2 text-xs font-semibold tabular-nums">{money(bucket.value_ron_cents)}</div></button>)}
                </div>
                <p className="mt-4 text-xs text-[var(--text-muted)]">Dashboardul nu transmite automat documente în SPV.</p>
              </div>
            )}
          </Card.Content>
        </Card>
      </section>

      {can("purchase_invoice.view") ? (
        <Card className="p-5">
          <Card.Header className="flex flex-wrap items-start justify-between gap-3">
            <div><Card.Title>Achiziții</Card.Title><Card.Description>Facturi primite din ANAF, fără amestecarea valutelor</Card.Description></div>
            <PeriodControl label="achiziții" value={periods.purchases} onChange={(value) => setPeriod("purchases", value)} />
          </Card.Header>
          <Card.Content>
            {purchases.isLoading ? <LoadingBlock /> : purchases.isError ? <QueryError error={purchases.error} retry={() => void purchases.refetch()} /> : (
              <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Documente", purchases.data?.data.summary.document_count ?? 0, "toate"],
                    ["De verificat", purchases.data?.data.summary.unreviewed_count ?? 0, "nevalidate"],
                    ["Necesită atenție", purchases.data?.data.summary.needs_attention_count ?? 0, "atentie"],
                    ["Furnizori", purchases.data?.data.summary.supplier_count ?? 0, "toate"],
                  ].map(([label, count, status]) => <button key={String(label)} type="button" onClick={() => navigate(`/achizitii?status=${status}&issue_from=${purchases.data!.data.period.from}&issue_to=${purchases.data!.data.period.to}`)} className="rounded-xl border border-[var(--border)] p-3 text-left hover:border-[var(--border-strong)]"><span className="text-xs text-[var(--text-muted)]">{label}</span><div className="mt-2 text-2xl font-bold">{count}</div></button>)}
                </div>
                <div className="rounded-xl bg-[var(--bg-muted)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Totaluri pe monedă</p>
                  {purchases.data?.data.summary.totals_by_currency.length ? purchases.data.data.summary.totals_by_currency.map((total) => <div key={total.currency} className="mt-3 flex items-center justify-between text-sm"><span>{total.document_count} documente · {total.currency}</span><b>{money(total.total_cents, total.currency)}</b></div>) : <p className="mt-3 text-sm text-[var(--text-muted)]">Nicio achiziție în perioadă.</p>}
                </div>
              </div>
            )}
          </Card.Content>
        </Card>
      ) : null}

      <Card className="p-5">
        <Card.Header className="flex items-start justify-between gap-3"><div><Card.Title>Necesită atenție</Card.Title><Card.Description>Acțiuni curente, ordonate după severitate</Card.Description></div>{attention.data?.data.total ? <Chip size="sm" variant="soft" color={attention.data.data.critical ? "danger" : "warning"}><Chip.Label>{attention.data.data.total}</Chip.Label></Chip> : null}</Card.Header>
        <Card.Content>
          {attention.isLoading ? <LoadingBlock /> : attention.isError ? <QueryError error={attention.error} retry={() => void attention.refetch()} /> : attention.data?.data.items.length ? (
            <div className="mt-3 divide-y divide-[var(--border)]">{attention.data.data.items.map((item, index) => <button key={`${item.kind}-${item.invoice_id ?? item.target}-${index}`} type="button" onClick={() => navigate(item.target)} className="flex w-full items-start gap-3 py-3 text-left hover:bg-[var(--bg-muted)]">{item.severity === "critical" ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" /> : item.severity === "warning" ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--warning)]" /> : <Clock size={18} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />}<span className="flex-1"><b className="block text-sm">{item.title}</b><span className="text-xs text-[var(--text-muted)]">{item.message}</span></span>{item.amount_cents != null && item.currency ? <b className="text-sm tabular-nums">{money(item.amount_cents, item.currency)}</b> : null}<ArrowRight size={15} className="mt-1 text-[var(--faint)]" /></button>)}</div>
          ) : <div className="flex flex-col items-center py-10 text-center"><FileCheck2 size={28} className="text-[var(--success)]" /><p className="mt-2 text-sm font-semibold">Totul este în regulă</p><p className="text-xs text-[var(--text-muted)]">Nu există acțiuni urgente în acest moment.</p></div>}
        </Card.Content>
      </Card>

      <Card className="overflow-hidden">
        <Card.Header className="flex items-center justify-between px-5 py-4"><div><Card.Title>Facturi recente</Card.Title><Card.Description>Ultimele 5 documente</Card.Description></div><Button size="sm" variant="ghost" onPress={() => navigate("/facturi")}>Vezi toate <ArrowRight size={15} /></Button></Card.Header>
        <Card.Content className="p-0">
          {overview.isLoading ? <LoadingBlock /> : overview.isError ? <QueryError error={overview.error} retry={() => void overview.refetch()} /> : overviewData?.recent_invoices.length ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-sm"><thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="border-b border-[var(--border)] px-5 py-3">Număr</th><th className="border-b border-[var(--border)] px-5 py-3">Client</th><th className="border-b border-[var(--border)] px-5 py-3">Scadență</th><th className="border-b border-[var(--border)] px-5 py-3 text-right">Valoare</th><th className="border-b border-[var(--border)] px-5 py-3">Încasare</th></tr></thead><tbody>{overviewData.recent_invoices.map((invoice) => <tr key={invoice.id} onClick={() => navigate(`/facturi/${invoice.id}`)} className="cursor-pointer hover:bg-[var(--bg-muted)]"><td className="border-b border-[var(--border)] px-5 py-3 font-semibold">{invoice.formatted_number}</td><td className="border-b border-[var(--border)] px-5 py-3">{invoice.customer?.name ?? "—"}</td><td className="border-b border-[var(--border)] px-5 py-3">{date(invoice.due_date)}</td><td className="border-b border-[var(--border)] px-5 py-3 text-right">{money(invoice.total_cents, invoice.currency)}</td><td className="border-b border-[var(--border)] px-5 py-3"><Chip size="sm" variant="soft" color={paymentTone(invoice)}><Chip.Label>{paymentLabel(invoice)}</Chip.Label></Chip></td></tr>)}</tbody></table></div>
          ) : <p className="px-5 py-12 text-center text-sm text-[var(--text-muted)]">Nu există facturi încă.</p>}
        </Card.Content>
      </Card>
    </div>
  );
}
