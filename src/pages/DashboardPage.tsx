import {useMemo} from "react";
import {useNavigate, useSearchParams} from "react-router";
import {useQuery} from "@tanstack/react-query";
import {Button, Card, Chip, Spinner} from "@heroui/react";
import {KPI} from "@heroui-pro/react/kpi";
import {BarChart} from "@heroui-pro/react/bar-chart";
import {AlertTriangle, ArrowRight, CheckCircle2, Clock, FileText, TrendingUp} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {api} from "../lib/api";
import type {DashboardSummary, Invoice} from "../lib/types";
import {date, displayStatus, displayStatusLabels, money, statusTone} from "../lib/format";

// ---------------------------------------------------------------------------
// Derivation helpers (module scope, pure).
// Money is INTEGER CENTS; mixed-currency invoices are aggregated in RON via
// `total_cents_ron ?? total_cents` so every total lands in the local currency.
// ---------------------------------------------------------------------------

const RO_MONTHS = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"] as const;

type SparkPoint = {value: number};
type MonthPoint = {month: string; value: number};
type Bucket = {key: string; label: string; value: number; color: string; dot: string};

// RON-equivalent total in integer cents.
function ronCents(inv: Invoice): number {
  return inv.total_cents_ron ?? inv.total_cents;
}

export function balanceRonCents(inv: Invoice): number {
  if (inv.balance_cents <= 0) return 0;
  if (inv.total_cents_ron != null && inv.total_cents > 0) {
    return Math.round((inv.balance_cents * inv.total_cents_ron) / inv.total_cents);
  }
  return inv.balance_cents;
}

export const isOverdue = (inv: Invoice): boolean => inv.payment_status === "overdue";

// Running sum of a weekly series — a monotonic sparkline for cumulative KPIs.
function cumulative(series: SparkPoint[]): SparkPoint[] {
  let acc = 0;
  return series.map((p) => ({value: (acc += p.value)}));
}

// ---------------------------------------------------------------------------

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {company} = useCompany();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", company?.id],
    queryFn: () => api<DashboardSummary>(`/companies/${company!.id}/dashboard`),
    enabled: Boolean(company?.id),
  });

  const summary = dashboardQuery.data?.data;

  const model = useMemo(() => {
    const billedThisMonth = summary?.billed_this_month_ron_cents ?? 0;
    const billedPrevMonth = summary?.previous_month_invoiced_ron_cents ?? 0;
    const momPct = billedPrevMonth > 0 ? Math.round(((billedThisMonth - billedPrevMonth) / billedPrevMonth) * 100) : null;
    const toCollect = summary?.balance_ron_cents ?? 0;
    const overdueAmount = summary?.overdue_balance_ron_cents ?? 0;
    const overduePct = toCollect > 0 ? Math.round((overdueAmount / toCollect) * 100) : null;
    const lastYearMonth = summary?.same_month_last_year_invoiced_ron_cents ?? 0;
    const yoyPct = lastYearMonth > 0 ? Math.round(((billedThisMonth - lastYearMonth) / lastYearMonth) * 100) : null;
    const spark: SparkPoint[] = (summary?.weekly_invoiced_ron_cents ?? []).map((value) => ({
      value: Math.round(value / 100),
    }));
    const overdueSpark: SparkPoint[] = (summary?.weekly_overdue_balance_ron_cents ?? []).map((value) => ({
      value: Math.round(value / 100),
    }));

    const buckets: Bucket[] = [
      {key: "in-termen", label: "În termen", value: summary?.outstanding_balance_ron_cents ?? 0, color: "var(--success)", dot: "var(--success)"},
      {key: "restante", label: "Restante", value: overdueAmount, color: "var(--danger)", dot: "var(--danger)"},
      {key: "ciorne", label: "Ciorne", value: summary?.draft_total_ron_cents ?? 0, color: "var(--warning)", dot: "var(--warning)"},
    ];

    return {
      billedThisMonth,
      totalBilled: summary?.total_invoiced_ron_cents ?? 0,
      toCollect,
      overdueAmount,
      issuedThisMonthCount: summary?.issued_this_month_count ?? 0,
      outstandingCount: summary?.outstanding_count ?? 0,
      momPct,
      overduePct,
      yoyPct,
      spark,
      cumulativeSpark: cumulative(spark),
      overdueSpark,
      monthly: (summary?.monthly_invoiced_ron_cents ?? []).map(({month, total_ron_cents}): MonthPoint => ({
        month: RO_MONTHS[Number(month.slice(5, 7)) - 1] ?? month,
        value: Math.round(total_ron_cents / 100 / 1000),
      })),
      buckets,
      bucketTotal: buckets.reduce((acc, b) => acc + b.value, 0),
    };
  }, [summary]);

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-[var(--text-muted)]">
        <Spinner size="sm" /> Se încarcă datele…
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-5 py-4 text-sm font-medium text-[var(--danger)]">
        Datele nu au putut fi încărcate.
      </div>
    );
  }

  const kpiValueStyle: React.CSSProperties = {
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    fontVariantNumeric: "tabular-nums",
  };
  const recent = summary?.recent_invoices ?? [];

  return (
    <div className="flex flex-col gap-4">
      {searchParams.get("onboarding") === "complete" ? (
        <section className="rounded-2xl border border-[var(--success)]/30 bg-[var(--success-soft)] p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={21} className="mt-0.5 shrink-0 text-[var(--success)]" />
            <div>
              <h2 className="font-bold text-[var(--success)]">Firma este configurată</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Poți continua cu pașii neblocanți de mai jos.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onPress={() => navigate("/serii")}>
                  Configurează seria
                </Button>
                <Button size="sm" variant="outline" onPress={() => navigate("/conturi")}>
                  Adaugă un cont bancar
                </Button>
                <span className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--text-muted)]">
                  Conectarea SPV urmează în setările integrării
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* 1. KPI grid ------------------------------------------------------ */}
      <section
        style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16}}
      >
        <KPI className="p-4">
          <KPI.Header className="flex items-center gap-2.5">
            <KPI.Icon status="success">
              <TrendingUp size={18} />
            </KPI.Icon>
            <KPI.Title className="text-[13px] text-[var(--text-muted)]">Facturat luna aceasta</KPI.Title>
          </KPI.Header>
          <KPI.Content className="mt-3 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span style={kpiValueStyle}>{money(model.billedThisMonth)}</span>
              {model.momPct != null && (
                <KPI.Trend trend={model.momPct >= 0 ? "up" : "down"} size="sm">
                  {`${model.momPct >= 0 ? "+" : ""}${model.momPct}%`}
                </KPI.Trend>
              )}
            </div>
            <span className="text-xs text-[var(--text-muted)]">{model.issuedThisMonthCount} facturi emise</span>
          </KPI.Content>
          <KPI.Chart data={model.spark} color="var(--accent)" height={40} />
        </KPI>

        <KPI className="p-4">
          <KPI.Header className="flex items-center gap-2.5">
            <KPI.Icon>
              <FileText size={18} />
            </KPI.Icon>
            <KPI.Title className="text-[13px] text-[var(--text-muted)]">Total facturat</KPI.Title>
          </KPI.Header>
          <KPI.Content className="mt-3 flex flex-col gap-1">
              <span style={kpiValueStyle}>{money(model.totalBilled)}</span>
            <span className="text-xs text-[var(--text-muted)]">total emis</span>
          </KPI.Content>
          <KPI.Chart data={model.cumulativeSpark} color="var(--accent)" height={40} />
        </KPI>

        <KPI className="p-4">
          <KPI.Header className="flex items-center gap-2.5">
            <KPI.Icon status="warning">
              <Clock size={18} />
            </KPI.Icon>
            <KPI.Title className="text-[13px] text-[var(--text-muted)]">De încasat</KPI.Title>
          </KPI.Header>
          <KPI.Content className="mt-3 flex flex-col gap-1">
            <span style={kpiValueStyle}>{money(model.toCollect)}</span>
            <span className="text-xs text-[var(--text-muted)]">sold deschis</span>
          </KPI.Content>
          <KPI.Chart data={model.spark} color="var(--warning)" height={40} />
        </KPI>

        <KPI className="p-4">
          <KPI.Header className="flex items-center gap-2.5">
            <KPI.Icon status="danger">
              <AlertTriangle size={18} />
            </KPI.Icon>
            <KPI.Title className="text-[13px] text-[var(--text-muted)]">Restant</KPI.Title>
          </KPI.Header>
          <KPI.Content className="mt-3 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span style={kpiValueStyle}>{summary?.overdue_count ?? 0}</span>
              {model.overduePct != null && (
                <KPI.Trend trend="down" size="sm">
                  {`${model.overduePct}%`}
                </KPI.Trend>
              )}
            </div>
            <span className="text-xs text-[var(--text-muted)]">facturi peste termen</span>
          </KPI.Content>
          <KPI.Chart data={model.overdueSpark} color="var(--danger)" height={40} />
        </KPI>
      </section>

      {/* 2. Revenue chart + invoice status ------------------------------- */}
      <section
        style={{display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(280px,1fr)", gap: 16}}
        className="[@media(max-width:900px)]:!grid-cols-1"
      >
        <Card className="p-5">
          <Card.Header className="flex items-start justify-between gap-3">
            <div>
              <Card.Title className="text-[15px]">Facturat lunar</Card.Title>
              <Card.Description className="text-[12.5px]">Ultimele 6 luni · mii RON</Card.Description>
            </div>
            {model.yoyPct != null && (
              <span className="text-[13px] font-semibold text-[var(--success)]">
                {`${model.yoyPct >= 0 ? "+" : ""}${model.yoyPct}% vs. an trecut`}
              </span>
            )}
          </Card.Header>
          <Card.Content className="mt-2">
            <BarChart data={model.monthly} height={220}>
              <BarChart.Grid vertical={false} />
              <BarChart.XAxis dataKey="month" />
              <BarChart.YAxis />
              <BarChart.Tooltip content={<BarChart.TooltipContent />} />
              <BarChart.Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 2, 2]} />
            </BarChart>
          </Card.Content>
        </Card>

        <Card className="flex flex-col p-5">
          <Card.Header>
            <Card.Title className="text-[15px]">Stare facturi</Card.Title>
            <Card.Description className="text-[12.5px]">Distribuția pe valoare</Card.Description>
          </Card.Header>
          <Card.Content className="mt-1 flex flex-1 flex-col">
            <div
              className="my-5 flex overflow-hidden rounded-md"
              style={{height: 12, background: "var(--bg-muted)"}}
            >
              {model.bucketTotal > 0 &&
                model.buckets
                  .filter((b) => b.value > 0)
                  .map((b) => <div key={b.key} style={{flexGrow: b.value, background: b.color}} />)}
            </div>

            {model.buckets.map((b) => (
              <div key={b.key} className="flex items-center gap-2.5 py-2 text-[13px]">
                <span
                  style={{width: 9, height: 9, borderRadius: 3, background: b.dot}}
                  className="shrink-0"
                />
                <span className="flex-1 text-[var(--text-muted)]">{b.label}</span>
                <b className="tabular-nums">{money(b.value)}</b>
              </div>
            ))}

          </Card.Content>
        </Card>
      </section>

      {/* 3. Recent invoices ---------------------------------------------- */}
      <Card className="overflow-hidden">
        <Card.Header className="flex items-center justify-between px-5 py-4">
          <Card.Title className="text-[16px]">Facturi recente</Card.Title>
          <button
            onClick={() => navigate("/facturi")}
            className="flex items-center gap-1 text-[13px] font-semibold text-[var(--accent)] transition-opacity hover:opacity-80"
          >
            Vezi toate <ArrowRight size={15} />
          </button>
        </Card.Header>
        <Card.Content className="p-0">
          {recent.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-[var(--text-muted)]">
              Nu există facturi încă. Emite prima ta factură pentru a începe.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" style={{minWidth: 720}}>
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--faint)]">
                    <th className="border-b border-[var(--border)] px-5 py-3 font-semibold">Număr</th>
                    <th className="border-b border-[var(--border)] px-5 py-3 font-semibold">Client</th>
                    <th className="border-b border-[var(--border)] px-5 py-3 font-semibold">Scadență</th>
                    <th className="border-b border-[var(--border)] px-5 py-3 text-right font-semibold">Valoare</th>
                    <th className="border-b border-[var(--border)] px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((inv) => {
                    const ds = displayStatus(inv);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => navigate(`/facturi/${inv.id}`)}
                        className="cursor-pointer transition-colors hover:bg-[var(--bg-muted)]"
                      >
                        <td className="border-b border-[var(--border)] px-5 py-3">
                          <b className="tabular-nums">{inv.formatted_number}</b>
                        </td>
                        <td className="border-b border-[var(--border)] px-5 py-3 text-[var(--text-muted)]">
                          {inv.customer?.name ?? "—"}
                        </td>
                        <td className="border-b border-[var(--border)] px-5 py-3 text-[var(--text-muted)]">
                          {date(inv.due_date)}
                        </td>
                        <td className="border-b border-[var(--border)] px-5 py-3 text-right tabular-nums">
                          {money(inv.total_cents, inv.currency)}
                        </td>
                        <td className="border-b border-[var(--border)] px-5 py-3">
                          <Chip color={statusTone[ds]} variant="soft" size="sm">
                            <Chip.Label>{displayStatusLabels[ds]}</Chip.Label>
                          </Chip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
