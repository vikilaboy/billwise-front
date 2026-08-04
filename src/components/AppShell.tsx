import {createContext, useContext, useEffect, useState} from "react";
import {Navigate, Outlet, useLocation, useNavigate} from "react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Avatar, Button, Dropdown, Spinner} from "@heroui/react";
import {CspSidebar as Sidebar} from "./CspSidebar";
import {
  Check,
  Bell,
  ChevronsUpDown,
  CircleGauge,
  CreditCard,
  FileText,
  FileSignature,
  Archive,
  ShoppingCart,
  Hash,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Repeat,
  Settings,
  Sun,
  Users,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import {api, AUTH_EXPIRED_EVENT, type ApiEnvelope} from "../lib/api";
import {useSession} from "./SessionProvider";
import type {ActivityNotificationFeed, CompanyProfile, User} from "../lib/types";

type NavItem = {to: string; label: string; icon: typeof FileText; group: string; badge?: number; permission?: string};

const NAV: NavItem[] = [
  {to: "/dashboard", label: "Dashboard", icon: CircleGauge, group: "Principal"},
  {to: "/facturi", label: "Facturi", icon: FileText, group: "Principal"},
  {to: "/achizitii", label: "Facturi furnizori", icon: ShoppingCart, group: "Principal", permission: "purchase_invoice.view"},
  {to: "/seif-fiscal", label: "Seif fiscal", icon: Archive, group: "Principal", permission: "fiscal_vault.view"},
  {to: "/recurente", label: "Facturi recurente", icon: Repeat, group: "Principal"},
  {to: "/contracte", label: "Contracte", icon: FileSignature, group: "Date firmă", permission: "contract.view"},
  {to: "/clienti", label: "Clienți", icon: Users, group: "Date firmă"},
  {to: "/produse", label: "Produse și servicii", icon: Package, group: "Date firmă"},
  {to: "/conturi", label: "Conturi bancare", icon: CreditCard, group: "Date firmă"},
  {to: "/serii", label: "Serii de facturare", icon: Hash, group: "Date firmă"},
  {to: "/setari", label: "Setări", icon: Settings, group: "Date firmă"},
];

const META: Record<string, [string, string]> = {
  "/dashboard": ["Dashboard", "Sumarul activității firmei tale"],
  "/facturi": ["Facturi", "Toate documentele emise"],
  "/achizitii": ["Facturi furnizori", "Documente primite din SPV prin RO e-Factura"],
  "/seif-fiscal": ["Seif fiscal", "Originalele ANAF păstrate în spațiul privat al firmei"],
  "/recurente": ["Facturi recurente", "Generare controlată de ciorne"],
  "/contracte": ["Contracte", "Termeni comerciali și facturare dinamică"],
  "/clienti": ["Clienți", "Firmele cu care lucrezi"],
  "/produse": ["Produse și servicii", "Catalogul firmei selectate"],
  "/conturi": ["Conturi bancare", "Conturile afișate pe facturi"],
  "/serii": ["Serii de facturare", "Prefixe și numerotare"],
  "/setari": ["Setări", "Date firmă și preferințe"],
  "/profil": ["Profil", "Datele personale ale contului"],
  "/securitate": ["Securitate", "Parolă, MFA, sesiuni și activitate"],
};

// Current tenant company shared with every page (invoices/customers are scoped to it).
type ShellContext = {company?: CompanyProfile; user?: User; can: (permission: string) => boolean};
const CompanyContext = createContext<ShellContext>({can: () => false});
export const useCompany = () => useContext(CompanyContext);
export const archivedCompanyLandingPath = (can: (permission: string) => boolean): string | null => {
  if (can("fiscal_vault.view")) return "/seif-fiscal";
  if (can("purchase_invoice.view")) return "/achizitii";
  return null;
};
export const selectableCompanies = (
  companies: CompanyProfile[],
  can: (permission: string) => boolean,
): CompanyProfile[] => {
  const canAccessArchivedCompanies = archivedCompanyLandingPath(can) !== null;

  return companies.filter((company) => !company.archived_at || canAccessArchivedCompanies);
};
export const canAccessArchivedCompanyPath = (
  pathname: string,
  can: (permission: string) => boolean,
): boolean => {
  const matchesRoute = (route: string) => pathname === route || pathname.startsWith(`${route}/`);

  if (matchesRoute("/seif-fiscal")) return can("fiscal_vault.view");
  if (matchesRoute("/achizitii")) return can("purchase_invoice.view");
  return false;
};

function initials(name?: string | null): string {
  if (!name) return "BW";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function pageMeta(pathname: string): [string, string] {
  const key = Object.keys(META).find((k) => pathname.startsWith(k));
  return (key && META[key]) || ["BillWise", "Administrare firmă"];
}

export function activityNotificationTime(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Dată necunoscută";

  const time = date.toLocaleTimeString("ro-RO", {hour: "2-digit", minute: "2-digit"});
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000);

  if (dayDifference === 0) {
    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
    if (elapsedMinutes < 1) return "Acum";
    if (elapsedMinutes < 60) return `Acum ${elapsedMinutes} min`;
    return `Astăzi · ${time}`;
  }
  if (dayDifference === 1) return `Ieri · ${time}`;

  const dateLabel = date.toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : {year: "numeric"}),
  });
  return `${dateLabel} · ${time}`;
}

function activityNotificationExactTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Dată necunoscută";
  return date.toLocaleString("ro-RO", {dateStyle: "medium", timeStyle: "short"});
}

type AccountFooterProps = {
  user?: User;
  companyName?: string;
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
};

function AccountFooter({user, companyName, currentPath, onNavigate, onLogout}: AccountFooterProps) {
  const actionClass = (active: boolean) => [
    "group flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
    active
      ? "bg-[var(--bg-subtle)] font-semibold text-[var(--text)]"
      : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
  ].join(" ");
  const iconClass = (active: boolean) => active
    ? "text-[var(--accent)]"
    : "text-[var(--text-muted)] group-hover:text-[var(--text)]";

  return (
    <div className="px-1">
      <div className="flex items-center gap-2.5 px-2 pb-2.5">
        <Avatar className="h-8 w-8 shrink-0 rounded-lg bg-[var(--bg-muted)] text-[var(--text)]">
          <Avatar.Fallback className="text-[11px] font-bold">{initials(user?.name)}</Avatar.Fallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold">{user?.name ?? "Cont BillWise"}</div>
          <div className="truncate text-[10.5px] text-[var(--text-muted)]">{companyName ?? user?.email}</div>
        </div>
      </div>

      <div className="grid gap-0.5 border-t border-[var(--border)] py-2">
        <button
          type="button"
          aria-label="Contul meu"
          aria-current={currentPath === "/profil" ? "page" : undefined}
          onClick={() => onNavigate("/profil")}
          className={actionClass(currentPath === "/profil")}
        >
          <span className={`grid h-5 w-5 shrink-0 place-items-center ${iconClass(currentPath === "/profil")}`}>
            <UserRound size={15} />
          </span>
          <span className="min-w-0 flex-1 truncate">Contul meu</span>
        </button>

        <button
          type="button"
          aria-label="Securitate"
          aria-current={currentPath === "/securitate" ? "page" : undefined}
          onClick={() => onNavigate("/securitate")}
          className={actionClass(currentPath === "/securitate")}
        >
          <span className={`grid h-5 w-5 shrink-0 place-items-center ${iconClass(currentPath === "/securitate")}`}>
            <ShieldCheck size={15} />
          </span>
          <span className="min-w-0 flex-1 truncate">Securitate</span>
        </button>
      </div>

      <div className="border-t border-[var(--border)] pt-2">
        <button
          type="button"
          aria-label="Deconectare"
          onClick={onLogout}
          className="flex min-h-8 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[12px] font-medium text-[var(--danger)] opacity-80 transition-colors hover:bg-[var(--danger-soft)] hover:opacity-100"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center"><LogOut size={14} /></span>
          Deconectare
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const auth = useSession();
  const [dark, setDark] = useState(() => localStorage.getItem("billwise_theme") === "dark");
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem("billwise_active_company_id"));

  const me = useQuery({queryKey: ["me"], queryFn: () => api<User>("/me")});
  const companies = useQuery({queryKey: ["companies"], queryFn: () => api<CompanyProfile[]>("/companies?include_archived=1")});
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<ActivityNotificationFeed>("/notifications"),
    refetchInterval: 30000,
  });
  const readNotification = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, {method: "PATCH"}),
    onMutate: async (id) => {
      await queryClient.cancelQueries({queryKey: ["notifications"]});
      const previous = queryClient.getQueryData<ApiEnvelope<ActivityNotificationFeed>>(["notifications"]);
      queryClient.setQueryData<ApiEnvelope<ActivityNotificationFeed>>(["notifications"], (current) => {
        if (!current) return current;
        const wasUnread = current.data.items.some((item) => item.id === id && !item.read_at);
        return {
          ...current,
          data: {
            ...current.data,
            unread_count: wasUnread ? Math.max(0, current.data.unread_count - 1) : current.data.unread_count,
            items: current.data.items.map((item) => item.id === id && !item.read_at
              ? {...item, read_at: new Date().toISOString()}
              : item),
          },
        };
      });
      return {previous};
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["notifications"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({queryKey: ["notifications"]}),
  });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", {method: "POST"}),
    onMutate: async () => {
      await queryClient.cancelQueries({queryKey: ["notifications"]});
      const previous = queryClient.getQueryData<ApiEnvelope<ActivityNotificationFeed>>(["notifications"]);
      const readAt = new Date().toISOString();
      queryClient.setQueryData<ApiEnvelope<ActivityNotificationFeed>>(["notifications"], (current) => current ? {
        ...current,
        data: {
          ...current.data,
          unread_count: 0,
          items: current.data.items.map((item) => item.read_at ? item : {...item, read_at: readAt}),
        },
      } : current);
      return {previous};
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["notifications"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({queryKey: ["notifications"]}),
  });

  const user = me.data?.data;
  const hasConfiguredAccess = Boolean((user?.roles.length ?? 0) > 0 || (user?.permissions.length ?? 0) > 0);
  const can = (permission: string) => !hasConfiguredAccess || Boolean(user?.permissions.includes(permission));
  const allCompanies = companies.data?.data ?? [];
  const list = selectableCompanies(allCompanies, can);
  const company = list.find((c) => c.id === activeId) ?? list.find((c) => !c.archived_at) ?? list[0];
  const archivedCompany = Boolean(company?.archived_at);
  const archivedLanding = archivedCompanyLandingPath(can);
  const archivedPathAllowed = canAccessArchivedCompanyPath(location.pathname, can);
  const visibleNavigation = NAV.filter((item) => (!item.permission || can(item.permission))
    && (!archivedCompany || ["/achizitii", "/seif-fiscal"].includes(item.to)));
  const [title, subtitle] = pageMeta(location.pathname);
  const accountPath = location.pathname === "/profil" || location.pathname === "/securitate";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("billwise_theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const handleExpiredSession = () => {
      localStorage.removeItem("billwise_active_company_id");
      queryClient.clear();
      navigate("/login", {replace: true});
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);

    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
  }, [navigate, queryClient]);

  useEffect(() => {
    if (!company?.id) return;
    localStorage.setItem("billwise_active_company_id", company.id);
    if (activeId !== company.id) setActiveId(company.id);
  }, [activeId, company?.id]);

  useEffect(() => {
    if (!archivedCompany || !archivedLanding || archivedPathAllowed) return;
    navigate(archivedLanding, {replace: true});
  }, [archivedCompany, archivedLanding, archivedPathAllowed, navigate]);

  const selectCompany = (id: string) => {
    setActiveId(id);
    localStorage.setItem("billwise_active_company_id", id);
    if (list.find((item) => item.id === id)?.archived_at && archivedLanding) navigate(archivedLanding);
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== "me" && query.queryKey[0] !== "companies",
    });
  };

  const logout = async () => {
    try {
      await auth.signOut();
    } finally {
      localStorage.removeItem("billwise_active_company_id");
      queryClient.clear();
      navigate("/login", {replace: true});
    }
  };

  const groups = [...new Set(visibleNavigation.map((n) => n.group))];

  if (me.isLoading || (!accountPath && companies.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2.5 bg-[var(--bg-subtle)] text-sm text-[var(--text-muted)]">
        <Spinner size="sm" /> Se verifică firmele contului…
      </div>
    );
  }

  if (me.isError || (!accountPath && companies.isError)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-subtle)] px-6 text-center">
        <p className="text-sm font-medium text-[var(--danger)]">Firmele contului nu au putut fi încărcate.</p>
        <Button variant="outline" onPress={() => {
          if (companies.isError) void companies.refetch();
          if (me.isError) void me.refetch();
        }}>
          Încearcă din nou
        </Button>
      </div>
    );
  }

  if (allCompanies.length === 0 && !accountPath) {
    if (location.pathname !== "/onboarding/firma") {
      return <Navigate to="/onboarding/firma" replace />;
    }

    return (
      <CompanyContext.Provider value={{company: undefined, user, can}}>
        <Outlet />
      </CompanyContext.Provider>
    );
  }

  if (list.length === 0 && !accountPath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-subtle)] px-6 text-center">
        <p className="max-w-lg text-sm text-[var(--danger)]">
          Nu ai acces la modulele disponibile pentru firmele arhivate ale acestui cont.
        </p>
      </div>
    );
  }

  if (location.pathname === "/onboarding/firma") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <CompanyContext.Provider value={{company, user, can}}>
      <Sidebar.Provider collapsible="offcanvas" navigate={(href) => navigate(href)}>
        <Sidebar>
          <Sidebar.Header className="gap-3">
            <div className="flex items-center gap-2.5 px-1.5 pb-1">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-sm font-extrabold text-white">
                B
              </span>
              <span className="text-[15px] font-bold tracking-tight">BillWise</span>
            </div>

            <Dropdown>
              <Dropdown.Trigger className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2.5 text-left transition-colors hover:border-[var(--border-strong)]">
                <Avatar className="h-8 w-8 shrink-0 rounded-lg bg-[var(--text)] text-[var(--bg)]">
                  <Avatar.Fallback className="text-[12.5px] font-bold">{initials(company?.legal_name)}</Avatar.Fallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{company?.legal_name ?? "Firma ta"}</span>
                  <span className="block truncate text-[11px] tabular-nums text-[var(--text-muted)]">
                    {company?.tax_id ?? "Selectează firma"}
                  </span>
                </span>
                <ChevronsUpDown size={15} className="shrink-0 text-[var(--text-faint)]" />
              </Dropdown.Trigger>
              <Dropdown.Popover className="min-w-[248px]">
                <Dropdown.Menu
                  selectionMode="single"
                  selectedKeys={company ? [company.id] : []}
                  onAction={(key) => selectCompany(String(key))}
                >
                  {list.map((c) => (
                    <Dropdown.Item key={c.id} id={String(c.id)} textValue={c.legal_name}>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--bg-muted)] text-[11.5px] font-bold">
                          {initials(c.legal_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{c.legal_name}</span>
                          <span className="block text-[11px] tabular-nums text-[var(--text-muted)]">{c.tax_id}{c.archived_at ? " · Arhivată" : ""}</span>
                        </span>
                        {c.id === company?.id && <Check size={16} className="shrink-0 text-[var(--accent)]" />}
                      </div>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>

            <Button variant="outline" fullWidth onPress={() => navigate("/firme/noi")}>
              <Plus size={16} /> Adaugă firmă
            </Button>

            {!archivedCompany ? <Button variant="primary" fullWidth onPress={() => navigate("/facturi/noi")}>
              <Plus size={17} /> Emite factură
            </Button> : null}
          </Sidebar.Header>

          <Sidebar.Content>
            {groups.map((group) => (
              <Sidebar.Group key={group}>
                <Sidebar.GroupLabel>{group}</Sidebar.GroupLabel>
                <Sidebar.Menu aria-label={group}>
                  {visibleNavigation.filter((n) => n.group === group).map(({to, label, icon: Icon, badge}) => (
                    <Sidebar.MenuItem key={to} href={to} isCurrent={location.pathname.startsWith(to)}>
                      <Sidebar.MenuIcon>
                        <Icon size={18} />
                      </Sidebar.MenuIcon>
                      <Sidebar.MenuLabel>{label}</Sidebar.MenuLabel>
                      {badge ? <Sidebar.MenuChip>{badge}</Sidebar.MenuChip> : null}
                    </Sidebar.MenuItem>
                  ))}
                </Sidebar.Menu>
              </Sidebar.Group>
            ))}
          </Sidebar.Content>

          <Sidebar.Footer>
            <AccountFooter
              user={me.data?.data}
              companyName={company?.legal_name}
              currentPath={location.pathname}
              onNavigate={navigate}
              onLogout={() => void logout()}
            />
          </Sidebar.Footer>
        </Sidebar>

        <Sidebar.Mobile>
          <Sidebar.Header className="gap-3">
            <div className="flex items-center gap-2.5 px-1.5 pb-1">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-sm font-extrabold text-white">
                B
              </span>
              <span className="text-[15px] font-bold tracking-tight">BillWise</span>
            </div>

            <Dropdown>
              <Dropdown.Trigger className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2.5 text-left transition-colors hover:border-[var(--border-strong)]">
                <Avatar className="h-8 w-8 shrink-0 rounded-lg bg-[var(--text)] text-[var(--bg)]">
                  <Avatar.Fallback className="text-[12.5px] font-bold">{initials(company?.legal_name)}</Avatar.Fallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{company?.legal_name ?? "Firma ta"}</span>
                  <span className="block truncate text-[11px] tabular-nums text-[var(--text-muted)]">
                    {company?.tax_id ?? "Selectează firma"}
                  </span>
                </span>
                <ChevronsUpDown size={15} className="shrink-0 text-[var(--text-faint)]" />
              </Dropdown.Trigger>
              <Dropdown.Popover className="min-w-[248px]">
                <Dropdown.Menu
                  selectionMode="single"
                  selectedKeys={company ? [company.id] : []}
                  onAction={(key) => selectCompany(String(key))}
                >
                  {list.map((c) => (
                    <Dropdown.Item key={c.id} id={String(c.id)} textValue={c.legal_name}>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--bg-muted)] text-[11.5px] font-bold">
                          {initials(c.legal_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{c.legal_name}</span>
                          <span className="block text-[11px] tabular-nums text-[var(--text-muted)]">{c.tax_id}{c.archived_at ? " · Arhivată" : ""}</span>
                        </span>
                        {c.id === company?.id && <Check size={16} className="shrink-0 text-[var(--accent)]" />}
                      </div>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>

            <Button variant="outline" fullWidth onPress={() => navigate("/firme/noi")}>
              <Plus size={16} /> Adaugă firmă
            </Button>

            {!archivedCompany ? <Button variant="primary" fullWidth onPress={() => navigate("/facturi/noi")}>
              <Plus size={17} /> Emite factură
            </Button> : null}
          </Sidebar.Header>

          <Sidebar.Content>
            {groups.map((group) => (
              <Sidebar.Group key={group}>
                <Sidebar.GroupLabel>{group}</Sidebar.GroupLabel>
                <Sidebar.Menu aria-label={`${group} mobil`}>
                  {visibleNavigation.filter((n) => n.group === group).map(({to, label, icon: Icon, badge}) => (
                    <Sidebar.MenuItem key={to} href={to} isCurrent={location.pathname.startsWith(to)}>
                      <Sidebar.MenuIcon>
                        <Icon size={18} />
                      </Sidebar.MenuIcon>
                      <Sidebar.MenuLabel>{label}</Sidebar.MenuLabel>
                      {badge ? <Sidebar.MenuChip>{badge}</Sidebar.MenuChip> : null}
                    </Sidebar.MenuItem>
                  ))}
                </Sidebar.Menu>
              </Sidebar.Group>
            ))}
          </Sidebar.Content>

          <Sidebar.Footer>
            <AccountFooter
              user={me.data?.data}
              companyName={company?.legal_name}
              currentPath={location.pathname}
              onNavigate={navigate}
              onLogout={() => void logout()}
            />
          </Sidebar.Footer>
        </Sidebar.Mobile>

        <Sidebar.Main className="flex min-h-screen flex-col bg-[var(--bg-subtle)]">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3.5 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-7">
            <Sidebar.Trigger aria-label="Deschide meniul" className="md:hidden">
              <Menu size={20} />
            </Sidebar.Trigger>
            <div className="min-w-0">
              <div className="truncate text-[16.5px] font-bold tracking-tight">{title}</div>
              <div className="truncate text-xs text-[var(--text-muted)]">{subtitle}</div>
            </div>

            <div className="flex-1" />

            <Dropdown>
              <Dropdown.Trigger className="relative grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)]" aria-label="Notificări">
                <Bell size={17} />
                {(notifications.data?.data.unread_count ?? 0) > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[var(--danger)] px-1 text-center text-[10px] font-bold text-white">
                    {Math.min(99, notifications.data!.data.unread_count)}
                  </span>
                ) : null}
              </Dropdown.Trigger>
              <Dropdown.Popover className="w-[min(360px,calc(100vw-24px))]">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5">
                  <div>
                    <b className="text-sm">Activitate</b>
                    <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                      {(notifications.data?.data.unread_count ?? 0) > 0
                        ? `${notifications.data!.data.unread_count} necitite`
                        : "Totul este citit"}
                    </div>
                  </div>
                  {(notifications.data?.data.unread_count ?? 0) > 0 ? <Button size="sm" variant="ghost" isPending={readAll.isPending} onPress={() => readAll.mutate()}>Marchează tot ca citit</Button> : null}
                </div>
                <Dropdown.Menu aria-label="Notificări" onAction={(key) => {
                  const item = notifications.data?.data.items.find((notification) => notification.id === String(key));
                  if (!item) return;
                  if (!item.read_at) readNotification.mutate(item.id);
                  if (item.url) navigate(item.url);
                }}>
                  {(notifications.data?.data.items ?? []).length === 0 ? (
                    <Dropdown.Item id="empty" isDisabled textValue="Nicio notificare">Nu există notificări.</Dropdown.Item>
                  ) : (notifications.data?.data.items ?? []).map((notification) => (
                    <Dropdown.Item key={notification.id} id={notification.id} textValue={notification.title} className="p-1">
                      <div className="flex w-full items-start gap-2.5 rounded-xl border border-transparent bg-transparent px-3 py-2.5 transition-colors">
                        <span
                          aria-label={notification.read_at ? "Citită" : "Necitită"}
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? "border border-[var(--text-faint)]" : "bg-[var(--accent)]"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={`text-xs ${notification.read_at ? "font-semibold text-[var(--text-muted)]" : "font-bold text-[var(--text)]"}`}>{notification.title}</div>
                          <div className="mt-1 whitespace-normal text-[11px] leading-relaxed text-[var(--text-muted)]">{notification.message}</div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            {!notification.read_at ? <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Nou</span> : <span />}
                            <time
                              dateTime={notification.created_at}
                              title={activityNotificationExactTime(notification.created_at)}
                              className="text-[10px] font-medium text-[var(--text-faint)]"
                            >
                              {activityNotificationTime(notification.created_at)}
                            </time>
                          </div>
                        </div>
                      </div>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            <Button isIconOnly variant="outline" size="sm" aria-label="Comută tema" onPress={() => setDark((v) => !v)}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
          </header>

          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-[30px]">
            <div className="w-full">
              <Outlet key={company?.id} />
            </div>
          </main>
        </Sidebar.Main>
      </Sidebar.Provider>
    </CompanyContext.Provider>
  );
}
