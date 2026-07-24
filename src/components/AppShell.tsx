import {createContext, useContext, useEffect, useState} from "react";
import {Outlet, useLocation, useNavigate} from "react-router";
import {useQuery} from "@tanstack/react-query";
import {Avatar, Button, Dropdown} from "@heroui/react";
import {Sidebar} from "@heroui-pro/react/sidebar";
import {
  Building2,
  Check,
  ChevronsUpDown,
  CircleGauge,
  CreditCard,
  FileText,
  Hash,
  LogOut,
  Moon,
  Plus,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import {api, session} from "../lib/api";
import type {CompanyProfile, User} from "../lib/types";

type NavItem = {to: string; label: string; icon: typeof FileText; group: string; badge?: number};

const NAV: NavItem[] = [
  {to: "/dashboard", label: "Dashboard", icon: CircleGauge, group: "Principal"},
  {to: "/facturi", label: "Facturi", icon: FileText, group: "Principal"},
  {to: "/clienti", label: "Clienți", icon: Users, group: "Date firmă"},
  {to: "/conturi", label: "Conturi bancare", icon: CreditCard, group: "Date firmă"},
  {to: "/serii", label: "Serii de facturare", icon: Hash, group: "Date firmă"},
  {to: "/setari", label: "Setări", icon: Settings, group: "Date firmă"},
];

const META: Record<string, [string, string]> = {
  "/dashboard": ["Dashboard", "Sumarul activității firmei tale"],
  "/facturi": ["Facturi", "Toate documentele emise"],
  "/clienti": ["Clienți", "Firmele cu care lucrezi"],
  "/conturi": ["Conturi bancare", "Conturile afișate pe facturi"],
  "/serii": ["Serii de facturare", "Prefixe și numerotare"],
  "/setari": ["Setări", "Date firmă și preferințe"],
};

// Current tenant company shared with every page (invoices/customers are scoped to it).
type ShellContext = {company?: CompanyProfile};
const CompanyContext = createContext<ShellContext>({});
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
  const [dark, setDark] = useState(() => localStorage.getItem("billwise_theme") === "dark");
  const [activeId, setActiveId] = useState<string | null>(null);

  const me = useQuery({queryKey: ["me"], queryFn: () => api<User>("/me")});
  const companies = useQuery({queryKey: ["companies"], queryFn: () => api<CompanyProfile[]>("/companies")});

  const list = companies.data?.data ?? [];
  const company = list.find((c) => c.id === activeId) ?? list[0];
  const [title, subtitle] = pageMeta(location.pathname);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("billwise_theme", dark ? "dark" : "light");
  }, [dark]);

  const logout = async () => {
    try {
      await api("/auth/logout", {method: "POST"});
    } finally {
      session.clear();
      navigate("/login", {replace: true});
    }
  };

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <CompanyContext.Provider value={{company}}>
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
                  onAction={(key) => setActiveId(String(key))}
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

            <Button variant="primary" fullWidth onPress={() => navigate("/facturi/noi")}>
              <Plus size={17} /> Emite factură
            </Button>
          </Sidebar.Header>

          <Sidebar.Content>
            {groups.map((group) => (
              <Sidebar.Group key={group}>
                <Sidebar.GroupLabel>{group}</Sidebar.GroupLabel>
                <Sidebar.Menu aria-label={group}>
                  {NAV.filter((n) => n.group === group).map(({to, label, icon: Icon, badge}) => (
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

            <Button isIconOnly variant="outline" size="sm" aria-label="Comută tema" onPress={() => setDark((v) => !v)}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
          </header>

          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-[30px]">
            <div className="w-full">
              {companies.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Building2 size={16} /> Se încarcă firma…
                </div>
              ) : (
                <Outlet />
              )}
            </div>
          </main>
        </Sidebar.Main>
      </Sidebar.Provider>
    </CompanyContext.Provider>
  );
}
