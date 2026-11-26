import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { WorkspaceAssistant } from "./assistant";
import { statuses, visibleCases, type Role } from "./model";
import { useWorkspace } from "./workspace-state";
import "./workspace.css";

export { WorkspaceProvider, useWorkspace } from "./workspace-state";
export type { Workspace } from "./workspace-state";

const queueLabels: Record<Role, string> = {
  ap: "Exceptions", budget: "Tasks", head: "Needs Approval", controller: "Finance review", supplier: "My Invoices",
};

export const roleLabels: Record<Role, string> = {
  ap: "AP Manager", budget: "Budget Owner", head: "Department head", controller: "Finance Controller", supplier: "Supplier",
};

export function WorkspaceLayout() {
  const workspace = useWorkspace();
  const { role, setRole, cases, visible } = workspace;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const routeQuery = useRouterState({ select: state => (state.location.search as { q?: string }).q ?? "" });
  const invoice = cases.find(item => pathname === `/exceptions/${item.id}`);
  const invoiceId = invoice?.id;
  const defaultStatus = role === "ap" || role === "supplier" ? "needs" : "assigned";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState(routeQuery);
  const [profileName, setProfileName] = useState(() => localStorage.getItem("spda-profile-name") || "Md Rakibul Islam");
  const searchInput = useRef<HTMLInputElement>(null);
  const mobileMenu = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const queueActive = pathname.startsWith("/exceptions");
  const preferencesActive = pathname === "/preferences";
  const activeCount = visible.filter(item => !item.outcome).length;
  const results = visible.filter(item => `${item.supplier} ${item.ref} ${item.entity} ${item.type} ${item.issue}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
  const notifications = visible.flatMap(item => item.events.map(event => ({ ...event, invoice: item })))
    .sort((a, b) => Date.parse(b.when) - Date.parse(a.when)).slice(0, 5);
  const breadcrumb = preferencesActive ? "Preference" : pathname === "/overview" ? "Assistant" : queueActive ? role === "supplier" ? "Invoices" : "Exceptions" : pathname === "/guide" ? "Workspace guide" : "Dashboard";

  useEffect(() => setQuery(routeQuery), [routeQuery]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => { setCompactNavigation(media.matches); setMobileOpen(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (mobileOpen) sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [mobileOpen]);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = localStorage.getItem("spda-reduce-motion") === "true" ? "true" : "false";
    const update = () => setProfileName(localStorage.getItem("spda-profile-name") || "Md Rakibul Islam");
    const keys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault(); setSearchOpen(true); searchInput.current?.focus();
      }
      if (event.key === "Escape") {
        setProfileOpen(false); setNotificationsOpen(false); setSearchOpen(false); setMobileOpen(false);
        if (document.querySelector('.spda-app[data-mobile-open="true"]')) mobileMenu.current?.focus();
      }
    };
    window.addEventListener("spda:preferences", update);
    window.addEventListener("keydown", keys);
    return () => { window.removeEventListener("spda:preferences", update); window.removeEventListener("keydown", keys); };
  }, []);

  function changeRole(next: Role) {
    setRole(next, invoiceId);
    setProfileOpen(false);
    setMobileOpen(false);
    if (next === "supplier" && (pathname === "/overview" || pathname === "/")) {
      void navigate({ to: "/exceptions", search: { status: "needs" } });
    } else if (pathname === "/exceptions" || (invoiceId && !visibleCases(cases, next, invoiceId).some(invoice => invoice.id === invoiceId))) {
      void navigate({ to: "/exceptions", search: { status: next === "ap" || next === "supplier" ? "needs" : "assigned" } });
    }
  }

  function search(event: FormEvent) {
    event.preventDefault();
    setSearchOpen(false);
    void navigate({ to: "/exceptions", search: { status: defaultStatus, ...(query.trim() ? { q: query.trim() } : {}) } });
  }

  async function logout() {
    try { await authClient.signOut(); } catch { /* The workspace can also run without the account server. */ }
    setRole("ap");
    void navigate({ to: "/login" });
  }

  function closeMenus() { setProfileOpen(false); setNotificationsOpen(false); setSearchOpen(false); }

  return (
    <div className="spda-app" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <a className="spda-skip" href="#workspace-content">Skip to workspace content</a>
      {mobileOpen && <button className="spda-mobile-shade" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside ref={sidebar} className="spda-sidebar" aria-label="Workspace navigation" inert={compactNavigation && !mobileOpen}>
        <div className="spda-profile-card">
          <button className="spda-profile-account" aria-label={`${profileName}, ${roleLabels[role]}. Switch workspace role`} aria-expanded={profileOpen}
            onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); setSearchOpen(false); }}>
            <img className="spda-profile-avatar" src="/design/dashboard-ellipse1.png" width="30" height="30" alt="" />
            <span className="spda-profile-copy"><span>{profileName}</span><small>{roleLabels[role]}</small></span>
          </button>
          <button className="spda-profile-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>
            <img src="/design/dashboard-chevrons-left.svg" width="16" height="16" alt="" />
          </button>
        </div>
        <nav className="spda-navigation" aria-label="Workspace">
          {role !== "supplier" && <Link to="/" className="spda-nav-item" activeOptions={{ exact: true }} onClick={() => setMobileOpen(false)}>
            <img src="/design/dashboard-analytics03.svg" width="16" height="16" alt="" /><span>Dashboard</span>
          </Link>}
          <Link to="/exceptions" className={`spda-nav-item${queueActive ? " is-active" : ""}`} search={{ status: defaultStatus }} activeOptions={{ includeSearch: false }} onClick={() => setMobileOpen(false)}>
            <img src="/design/detail-inbox.svg" width="16" height="16" alt="" /><span>{queueLabels[role]}</span><small className="spda-nav-count">{String(activeCount).padStart(role === "supplier" ? 2 : 1, "0")}</small>
          </Link>
          {role !== "supplier" && <Link to="/preferences" className={`spda-nav-item${preferencesActive ? " is-active" : ""}`} onClick={() => setMobileOpen(false)}>
            <img src="/design/dashboard-preference-horizontal.svg" width="16" height="16" alt="" /><span>Preference</span>
          </Link>}
        </nav>
        <button className="spda-nav-item spda-logout" onClick={() => void logout()}><img src="/design/dashboard-arrow-right-from-line.svg" width="16" height="16" alt="" /><span>Logout</span></button>
      </aside>
      <section className="spda-workspace-frame" aria-label="SPDA workspace">
        <header className="spda-topbar">
          <button ref={mobileMenu} className="spda-mobile-menu spda-icon-button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={16} /> : <Menu size={16} />}</button>
          <nav className="spda-breadcrumb" aria-label="Breadcrumb">
            <Link to="/" aria-label="Dashboard"><img src="/design/dashboard-home01.svg" width="16" height="16" alt="" /></Link>
            <img src="/design/dashboard-greater-than.svg" width="16" height="16" alt="" />
            {invoice ? <><Link to="/exceptions" search={{ status: defaultStatus }}>{breadcrumb}</Link><img src="/design/dashboard-greater-than.svg" width="16" height="16" alt="" /><span className="spda-breadcrumb-current">{invoice.supplier}</span></> : <span>{breadcrumb}</span>}
          </nav>
          <form className={`spda-header-search${searchOpen ? " is-open" : ""}`} role="search" onSubmit={search}>
            <button type="button" aria-label="Search exceptions" onClick={() => { setSearchOpen(true); searchInput.current?.focus(); }}><img src="/design/dashboard-search01.svg" width="16" height="16" alt="" /></button>
            <input ref={searchInput} aria-label="Search exceptions" placeholder="Exceptions" value={query} onFocus={() => { setSearchOpen(true); setProfileOpen(false); setNotificationsOpen(false); }}
              onChange={event => { const value = event.target.value; setQuery(value); if (queueActive && !invoice) void navigate({ to: "/exceptions", search: previous => ({ ...previous, q: value.trim() || undefined }), replace: true }); }} />
            <kbd><img src="/design/dashboard-command.svg" width="12" height="12" alt="Command" /> F</kbd>
            {searchOpen && <div className="spda-search-results">
              <p>{query.trim() ? "Search results" : "Search Exceptions…"}</p>
              {results.length ? results.map(item => <Link to="/exceptions/$invoiceId" params={{ invoiceId: item.id }} key={item.id} onClick={() => setSearchOpen(false)}><strong>{item.supplier}</strong><small>Invoice {item.ref} · {item.entity}</small></Link>) : <span className="spda-search-empty">No exceptions match your search.</span>}
              <button type="submit" className="spda-search-all">View all matching exceptions</button>
            </div>}
          </form>
          <button className="spda-icon-button spda-notification-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); setSearchOpen(false); }}><img src="/design/dashboard-notification01.svg" width="16" height="16" alt="" /></button>
        </header>
        <main id="workspace-content" className="spda-content" tabIndex={-1}>
          <Outlet />
        </main>
      </section>
      {(profileOpen || notificationsOpen || searchOpen) && <button className="spda-menu-dismiss" tabIndex={-1} aria-label="Close open menu" onClick={closeMenus} />}
      {profileOpen && <div className="spda-profile-popover spda-popover" role="dialog" aria-label="Switch workspace role"><p>Workspace</p>{(Object.keys(roleLabels) as Role[]).map(key => <button key={key} className={role === key ? "is-selected" : ""} onClick={() => changeRole(key)}><span>{roleLabels[key]}</span>{role === key && <span aria-hidden="true">✓</span>}</button>)}</div>}
      {notificationsOpen && <div className="spda-notifications spda-popover" role="dialog" aria-label="Notifications"><p>Notifications</p>{notifications.length ? notifications.map((event, index) => <Link key={`${event.invoice.id}-${index}`} to="/exceptions/$invoiceId" params={{ invoiceId: event.invoice.id }} onClick={() => setNotificationsOpen(false)}><strong>{event.title}</strong><span>{event.invoice.supplier}</span><small>{new Date(event.when).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></Link>) : <span className="spda-search-empty">You’re all caught up.</span>}</div>}
      <WorkspaceAssistant key={role} workspace={workspace} currentId={invoiceId} />
    </div>
  );
}

export function StatusBadge({ status }: { status: keyof typeof statuses }) {
  return <span className="spda-badge" data-status={status}><span aria-hidden="true" />{statuses[status]}</span>;
}
