import {
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

type SidebarContextValue = {
  navigate: (href: string) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebar(): SidebarContextValue {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("CspSidebar must be rendered inside CspSidebar.Provider.");
  return value;
}

type ProviderProps = {
  children: ReactNode;
  navigate: (href: string) => void;
  collapsible?: "offcanvas";
};

function Provider({children, navigate}: ProviderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const value = useMemo(
    () => ({navigate, mobileOpen, setMobileOpen}),
    [mobileOpen, navigate],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

function Root({className = "", ...props}: HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-[var(--border)] bg-[var(--bg)] md:flex ${className}`}
      {...props}
    />
  );
}

function Header({className = "", ...props}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col p-4 ${className}`} {...props} />;
}

function Content({className = "", ...props}: HTMLAttributes<HTMLElement>) {
  return <nav className={`min-h-0 flex-1 overflow-y-auto px-3 py-2 ${className}`} {...props} />;
}

function Group({className = "", ...props}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`mb-5 ${className}`} {...props} />;
}

function GroupLabel({className = "", ...props}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)] ${className}`}
      {...props}
    />
  );
}

function MenuList({className = "", ...props}: HTMLAttributes<HTMLUListElement>) {
  return <ul className={`space-y-1 ${className}`} {...props} />;
}

type MenuItemProps = Omit<HTMLAttributes<HTMLLIElement>, "onClick"> & {
  href: string;
  isCurrent?: boolean;
};

function MenuItem({href, isCurrent = false, className = "", children, ...props}: MenuItemProps) {
  const {navigate, setMobileOpen} = useSidebar();

  return (
    <li className={className} {...props}>
      <button
        type="button"
        aria-current={isCurrent ? "page" : undefined}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
          isCurrent
            ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-soft-foreground)]"
            : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]"
        }`}
        onClick={() => {
          navigate(href);
          setMobileOpen(false);
        }}
      >
        {children}
      </button>
    </li>
  );
}

function MenuIcon({className = "", ...props}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`shrink-0 ${className}`} aria-hidden="true" {...props} />;
}

function MenuLabel({className = "", ...props}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`min-w-0 flex-1 truncate ${className}`} {...props} />;
}

function MenuChip({className = "", ...props}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] font-bold ${className}`}
      {...props}
    />
  );
}

function Footer({className = "", ...props}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-t border-[var(--border)] p-3 ${className}`} {...props} />;
}

function Mobile({className = "", children, ...props}: HTMLAttributes<HTMLElement>) {
  const {mobileOpen, setMobileOpen} = useSidebar();
  if (!mobileOpen) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        type="button"
        aria-label="Închide meniul"
        className="absolute inset-0 bg-black/45"
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={`relative flex h-full w-64 flex-col border-r border-[var(--border)] bg-[var(--bg)] shadow-xl ${className}`}
        {...props}
      >
        {children}
      </aside>
    </div>
  );
}

function Main({className = "", ...props}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`md:pl-[240px] ${className}`} {...props} />;
}

function Trigger({className = "", ...props}: HTMLAttributes<HTMLButtonElement>) {
  const {setMobileOpen} = useSidebar();
  return (
    <button
      type="button"
      className={`grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] ${className}`}
      onClick={() => setMobileOpen(true)}
      {...props}
    />
  );
}

export const CspSidebar = Object.assign(Root, {
  Provider,
  Header,
  Content,
  Group,
  GroupLabel,
  Menu: MenuList,
  MenuItem,
  MenuIcon,
  MenuLabel,
  MenuChip,
  Footer,
  Mobile,
  Main,
  Trigger,
});
