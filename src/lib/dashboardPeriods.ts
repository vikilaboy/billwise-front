export const DASHBOARD_PERIOD_PRESETS = [
  "current_week",
  "previous_week",
  "current_month",
  "previous_month",
  "current_quarter",
  "previous_quarter",
  "current_year",
  "previous_year",
  "last_30_days",
  "last_90_days",
  "custom",
] as const;

export type DashboardPeriodPreset = (typeof DASHBOARD_PERIOD_PRESETS)[number];
export type DashboardComparison = "previous_period" | "previous_year" | "none";
export type DashboardPeriodSelection = {
  preset: DashboardPeriodPreset;
  comparison: DashboardComparison;
  from?: string;
  to?: string;
};
export type DashboardPeriodNamespace = "performance" | "efactura" | "purchases";

export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriodSelection = {
  preset: "current_month",
  comparison: "previous_period",
};

const isPreset = (value: string | null): value is DashboardPeriodPreset =>
  DASHBOARD_PERIOD_PRESETS.includes(value as DashboardPeriodPreset);
const isComparison = (value: string | null): value is DashboardComparison =>
  value === "previous_period" || value === "previous_year" || value === "none";

export function dashboardPreferenceKey(companyId: string): string {
  return `billwise_dashboard_periods:${companyId}`;
}

export function readDashboardPeriods(companyId?: string): Partial<Record<DashboardPeriodNamespace, DashboardPeriodSelection>> {
  if (!companyId || typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(dashboardPreferenceKey(companyId)) ?? "{}");
  } catch {
    return {};
  }
}

export function readDashboardPeriod(
  params: URLSearchParams,
  namespace: DashboardPeriodNamespace,
  fallback: DashboardPeriodSelection = DEFAULT_DASHBOARD_PERIOD,
): DashboardPeriodSelection {
  const preset = params.get(`${namespace}_preset`);
  const comparison = params.get(`${namespace}_compare`);
  const from = params.get(`${namespace}_from`) ?? undefined;
  const to = params.get(`${namespace}_to`) ?? undefined;

  if (!isPreset(preset)) return fallback;
  if (preset === "custom" && (!from || !to)) return fallback;

  return {
    preset,
    comparison: isComparison(comparison) ? comparison : fallback.comparison,
    ...(preset === "custom" ? {from, to} : {}),
  };
}

export function writeDashboardPeriod(
  params: URLSearchParams,
  namespace: DashboardPeriodNamespace,
  selection: DashboardPeriodSelection,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(`${namespace}_preset`, selection.preset);
  next.set(`${namespace}_compare`, selection.comparison);
  if (selection.preset === "custom" && selection.from && selection.to) {
    next.set(`${namespace}_from`, selection.from);
    next.set(`${namespace}_to`, selection.to);
  } else {
    next.delete(`${namespace}_from`);
    next.delete(`${namespace}_to`);
  }
  return next;
}

export function dashboardPeriodQuery(selection: DashboardPeriodSelection): string {
  const params = new URLSearchParams({
    _preset: selection.preset,
    _compare: selection.comparison,
  });
  if (selection.preset === "custom" && selection.from && selection.to) {
    params.set("_from", selection.from);
    params.set("_to", selection.to);
  }
  return `?${params.toString()}`;
}

export function clearDashboardPeriods(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const namespace of ["performance", "efactura", "purchases"] as const) {
    for (const suffix of ["preset", "compare", "from", "to"]) next.delete(`${namespace}_${suffix}`);
  }
  return next;
}
