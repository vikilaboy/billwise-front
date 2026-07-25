import {createContext, useContext, useEffect, useState} from "react";
import {Navigate, Outlet, useLocation, useNavigate} from "react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Avatar, Button, Dropdown, Spinner} from "@heroui/react";
import {Sidebar} from "@heroui-pro/react/sidebar";
import {
  Check,
  Bell,
  ChevronsUpDown,
  CircleGauge,
  CreditCard,
  FileText,
  Archive,
  ShoppingCart,
  Hash,
  LogOut,
  Moon,
  Package,
  Plus,
  Repeat,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import {api, AUTH_EXPIRED_EVENT, session} from "../lib/api";
import type {ActivityNotificationFeed, CompanyProfile, User} from "../lib/types";

type NavItem = {to: string; label: string; icon: typeof FileText; group: string; badge?: number; permission?: string};

const NAV: NavItem[] = [
  {to: "/dashboard", label: "Dashboard", icon: CircleGauge, group: "Principal"},
  {to: "/facturi", label: "Facturi", icon: FileText, group: "Principal"},
  {to: "/achizitii", label: "Facturi furnizori", icon: ShoppingCart, group: "Principal", permission: "purchase_invoice.view"},
  {to: "/seif-fiscal", label: "Seif fiscal", icon: Archive, group: "Principal", permission: "fiscal_vault.view"},
  {to: "/recurente", label: "Facturi recurente", icon: Repeat, group: "Principal"},
  {to: "/clienti", label: "Clienți", icon: Users, group: "Date firmă"},
  {to: "/produse", label: "Produse și servicii", icon: Package, group: "Date firmă"},
  {to: "/conturi", label: "Conturi bancare", icon: CreditCard, group: "Date firmă"},
  {to: "/serii", label: "Serii de facturare", icon: Hash, group: "Date firmă"},
  {to: "/setari", label: "Setări", icon: Settings, group: "Date firmă"},
];

const META: Record<string, [string, string]> = {
  "/dashboard": ["Dashboard", "Sumarul activității firmei tale"],
  "/facturi": ["Facturi", "Toate documentele emise"],
  "/achizitii": ["Facturi furnizori", "Documente primite automat din ANAF e-Factura"],
  "/seif-fiscal": ["Seif fiscal", "Originalele ANAF păstrate în spațiul privat al firmei"],
  "/recurente": ["Facturi recurente", "Generare controlată de ciorne"],
  "/clienti": ["Clienți", "Firmele cu care lucrezi"],
  "/produse": ["Produse și servicii", "Catalogul firmei selectate"],
  "/conturi": ["Conturi bancare", "Conturile afișate pe facturi"],
  "/serii": ["Serii de facturare", "Prefixe și numerotare"],
  "/setari": ["Setări", "Date firmă și preferințe"],
};

// Current tenant company shared with every page (invoices/customers are scoped to it).
type ShellContext = {company?: CompanyProfile; user?: User; can: (permission: string) => boolean};
const CompanyContext = createContext<ShellContext>({can: () => false});
export const useCompany = () => useContext(CompanyContext);

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

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [dark, setDark] = useState(() => localStorage.getItem("billwise_theme") === "dark");
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem("billwise_active_company_id"));

  const me = useQuery({queryKey: ["me"], queryFn: () => api<User>("/me")});
  const companies = useQuery({queryKey: ["companies"], queryFn: () => api<CompanyProfile[]>("/companies")});
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<ActivityNotificationFeed>("/notifications"),
    refetchInterval: 30000,
  });
  const readNotification = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, {method: "PATCH"}),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ["notifications"]}),
  });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", {method: "POST"}),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ["notifications"]}),
  });

  const list = companies.data?.data ?? [];
  const company = list.find((c) => c.id === activeId) ?? list[0];
  const user = me.data?.data;
  const hasConfiguredAccess = Boolean((user?.roles.length ?? 0) > 0 || (user?.permissions.length ?? 0) > 0);
  const can = (permission: string) => !hasConfiguredAccess || Boolean(user?.permissions.includes(permission));
  const visibleNavigation = NAV.filter((item) => !item.permission || can(item.permission));
  const [title, subtitle] = pageMeta(location.pathname);

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

  const selectCompany = (id: string) => {
    setActiveId(id);
    localStorage.setItem("billwise_active_company_id", id);
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== "me" && query.queryKey[0] !== "companies",
    });
  };

  const logout = async () => {
    try {
      await api("/auth/logout", {method: "POST"});
    } finally {
      session.clear();
      localStorage.removeItem("billwise_active_company_id");
      queryClient.clear();
      navigate("/login", {replace: true});
    }
  };

  const groups = [...new Set(visibleNavigation.map((n) => n.group))];

  if (companies.isLoading || me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2.5 bg-[var(--bg-subtle)] text-sm text-[var(--text-muted)]">
        <Spinner size="sm" /> Se verifică firmele contului…
      </div>
    );
  }

  if (companies.isError || me.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-subtle)] px-6 text-center">
        <p className="text-sm font-medium text-[var(--danger)]">Firmele contului nu au putut fi încărcate.</p>
        <Button variant="outline" onPress={() => companies.refetch()}>
          Încearcă din nou
        </Button>
      </div>
    );
  }

  if (list.length === 0) {
    if (location.pathname !== "/onboarding/firma") {
      return <Navigate to="/onboarding/firma" replace />;
    }

    return (
      <CompanyContext.Provider value={{company: undefined, user, can}}>
        <Outlet />
      </CompanyContext.Provider>
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
                          <span className="block text-[11px] tabular-nums text-[var(--text-muted)]">{c.tax_id}</span>
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

            <Button variant="primary" fullWidth onPress={() => navigate("/facturi/noi")}>
              <Plus size={17} /> Emite factură
            </Button>
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
            <div className="flex items-center gap-2.5 rounded-xl bg-[var(--bg-muted)] p-2.5">
              <Avatar className="h-9 w-9 shrink-0 rounded-lg bg-[var(--accent)] text-white">
                <Avatar.Fallback className="text-[13px] font-bold">{initials(me.data?.data.name)}</Avatar.Fallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{me.data?.data.name ?? "Cont BillWise"}</div>
                <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                  {company?.legal_name ?? me.data?.data.email}
                </div>
              </div>
              <button
                aria-label="Deconectare"
                onClick={logout}
                className="text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
              >
                <LogOut size={17} />
              </button>
            </div>
          </Sidebar.Footer>
        </Sidebar>

        <Sidebar.Main className="flex min-h-screen flex-col bg-[var(--bg-subtle)]">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3.5 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-7">
            <Sidebar.Trigger className="md:hidden" />
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
                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                  <b className="text-sm">Activitate</b>
                  {(notifications.data?.data.unread_count ?? 0) > 0 ? <Button size="sm" variant="ghost" onPress={() => readAll.mutate()}>Marchează toate citite</Button> : null}
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
                    <Dropdown.Item key={notification.id} id={notification.id} textValue={notification.title}>
                      <div className={`py-1 ${notification.read_at ? "opacity-65" : ""}`}>
                        <div className="text-xs font-semibold">{notification.title}</div>
                        <div className="mt-0.5 whitespace-normal text-[11px] text-[var(--text-muted)]">{notification.message}</div>
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
