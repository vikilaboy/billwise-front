import {useMemo} from "react";
import {useNavigate} from "react-router";
import {useQuery} from "@tanstack/react-query";
import {Button, Card, Chip, Spinner} from "@heroui/react";
import {KPI} from "@heroui-pro/react/kpi";
import {BarChart} from "@heroui-pro/react/bar-chart";
import {AlertTriangle, ArrowRight, Check, Clock, FileText, TrendingUp} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {api, listQuery} from "../lib/api";
import type {Invoice} from "../lib/types";
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

// Parse a "YYYY-MM-DD" prefix into a UTC timestamp, ignoring time/zone noise.
function dateMs(value: string | null): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// Parse the calendar year/month (0-based) from a "YYYY-MM-DD" prefix.
function yearMonth(value: string | null): {y: number; m: number} | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return m ? {y: Number(m[1]), m: Number(m[2]) - 1} : null;
}

const isIssued = (inv: Invoice): boolean => inv.status === "issued";
const isDraft = (inv: Invoice): boolean => inv.status === "draft";
const isOverdue = (inv: Invoice, today: Date): boolean => displayStatus(inv, today) === "overdue";

function sumRon(invoices: Invoice[]): number {
  return invoices.reduce((acc, inv) => acc + ronCents(inv), 0);
}

// Issued RON totals bucketed into the last `weeks` weekly windows ending today.
function weeklySpark(issued: Invoice[], today: Date, weeks = 8): SparkPoint[] {
  const week = 7 * 24 * 3600 * 1000;
  const now = today.getTime();
  const buckets = Array.from({length: weeks}, () => 0);
  for (const inv of issued) {
    const t = dateMs(inv.issue_date);
    if (t == null) continue;
    const diff = Math.floor((now - t) / week);
    if (diff >= 0 && diff < weeks) buckets[weeks - 1 - diff] += ronCents(inv) / 100;
  }
  return buckets.map((v) => ({value: Math.round(v)}));
}

// Running sum of a weekly series — a monotonic sparkline for cumulative KPIs.
function cumulative(series: SparkPoint[]): SparkPoint[] {
  let acc = 0;
  return series.map((p) => ({value: (acc += p.value)}));
}

// Issued RON totals grouped by calendar month for the last `count` months (in thousands RON).
function monthlyRevenue(issued: Invoice[], today: Date, count = 6): MonthPoint[] {
  const y = today.getFullYear();
  const mo = today.getMonth();
  const out: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, mo - i, 1);
    const dy = d.getFullYear();
    const dm = d.getMonth();
    let sum = 0;
    for (const inv of issued) {
      const ym = yearMonth(inv.issue_date);
      if (ym && ym.y === dy && ym.m === dm) sum += ronCents(inv);
    }
    out.push({month: RO_MONTHS[dm], value: Math.round(sum / 100 / 1000)});
  }
  return out;
}

function monthTotal(issued: Invoice[], y: number, m: number): number {
  let sum = 0;
  for (const inv of issued) {
    const ym = yearMonth(inv.issue_date);
    if (ym && ym.y === y && ym.m === m) sum += ronCents(inv);
  }
  return sum;
}

// ---------------------------------------------------------------------------

export function DashboardPage() {
  const navigate = useNavigate();
  const {company} = useCompany();

  const invoicesQuery = useQuery({
    queryKey: ["invoices", company?.id, "dashboard"],
    queryFn: () =>
      api<Invoice[]>(`/companies/${company!.id}/invoices${listQuery({perPage: 100, sort: "-issue_date"})}`),
    enabled: Boolean(company?.id),
  });

  const invoices = useMemo<Invoice[]>(() => invoicesQuery.data?.data ?? [], [invoicesQuery.data]);

  const model = useMemo(() => {
    const today = new Date();
    const curY = today.getFullYear();
    const curM = today.getMonth();

    const issued = invoices.filter(isIssued);
    const overdue = issued.filter((inv) => isOverdue(inv, today));
    const outstanding = issued.filter((inv) => !isOverdue(inv, today));
    const drafts = invoices.filter(isDraft);
    const issuedThisMonth = issued.filter((inv) => {
      const ym = yearMonth(inv.issue_date);
      return ym != null && ym.y === curY && ym.m === curM;
    });

    // KPI figures (all RON cents).
    const billedThisMonth = sumRon(issuedThisMonth);
    const totalBilled = sumRon(issued);
    const toCollect = sumRon(outstanding);
    const overdueAmount = sumRon(overdue);

    // Real month-over-month growth for "Facturat luna aceasta".
    const prev = new Date(curY, curM - 1, 1);
    const billedPrevMonth = monthTotal(issued, prev.getFullYear(), prev.getMonth());
    const momPct = billedPrevMonth > 0 ? Math.round(((billedThisMonth - billedPrevMonth) / billedPrevMonth) * 100) : null;

    // Real overdue share of everything billed — signals the "Restant" danger trend.
    const overduePct = totalBilled > 0 ? Math.round((overdueAmount / totalBilled) * 100) : null;

    // Real year-over-year delta for the revenue chart (same month, previous year).
    const lastYearMonth = monthTotal(issued, curY - 1, curM);
    const yoyPct = lastYearMonth > 0 ? Math.round(((billedThisMonth - lastYearMonth) / lastYearMonth) * 100) : null;

    const spark = weeklySpark(issued, today);
    const overdueSpark = weeklySpark(overdue, today);

    const buckets: Bucket[] = [
      {key: "in-termen", label: "În termen", value: toCollect, color: "var(--success)", dot: "var(--success)"},
      {key: "restante", label: "Restante", value: overdueAmount, color: "var(--danger)", dot: "var(--danger)"},
      {key: "ciorne", label: "Ciorne", value: sumRon(drafts), color: "var(--warning)", dot: "var(--warning)"},
    ];

    return {
      billedThisMonth,
      totalBilled,
      toCollect,
      overdueAmount,
      issuedThisMonthCount: issuedThisMonth.length,
      outstandingCount: outstanding.length,
      momPct,
      overduePct,
      yoyPct,
      spark,
      cumulativeSpark: cumulative(spark),
      overdueSpark,
      monthly: monthlyRevenue(issued, today),
      buckets,
      bucketTotal: buckets.reduce((acc, b) => acc + b.value, 0),
      recent: invoices.slice(0, 5),
    };
  }, [invoices]);

  if (invoicesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-[var(--text-muted)]">
        <Spinner size="sm" /> Se încarcă datele…
      </div>
    );
  }

  if (invoicesQuery.isError) {
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

  return (
    <div className="flex flex-col gap-4">
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
            <span className="text-xs text-[var(--text-muted)]">de la începutul anului</span>
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
            <span className="text-xs text-[var(--text-muted)]">{model.outstandingCount} deschise</span>
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
              <span style={kpiValueStyle}>{money(model.overdueAmount)}</span>
              {model.overduePct != null && (
                <KPI.Trend trend="down" size="sm">
                  {`${model.overduePct}%`}
                </KPI.Trend>
              )}
            </div>
            <span className="text-xs text-[var(--text-muted)]">peste termen</span>
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
              <Card.Title className="text-[15px]">Venituri lunare</Card.Title>
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
              style={{height: 12, background: "var(--muted)"}}
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

            <div className="mt-auto flex items-center gap-2 border-t border-[var(--border)] pt-4">
              <Chip color="success" variant="soft" size="sm">
                <Chip.Label className="flex items-center gap-1.5">
                  <Check size={14} /> Conectat la SPV / e-Factura
                </Chip.Label>
              </Chip>
            </div>
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
          {model.recent.length === 0 ? (
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
                  {model.recent.map((inv) => {
                    const ds = displayStatus(inv);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => navigate(`/facturi/${inv.id}`)}
                        className="cursor-pointer transition-colors hover:bg-[var(--muted)]"
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
