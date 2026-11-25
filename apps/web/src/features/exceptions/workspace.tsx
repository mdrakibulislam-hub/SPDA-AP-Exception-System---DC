import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, ChartNoAxesCombined, Inbox, ReceiptText, Sparkles } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { WorkspaceAssistant } from "./assistant";
import { roles, seedCases, statuses, visibleCases, type Invoice, type Role } from "./model";
import "./workspace.css";

const storageKey = "spda-workspace-v1";
const queueLabels: Record<Role, string> = {
  ap: "Exceptions", budget: "My approvals", head: "Department approvals", controller: "Finance review", supplier: "My invoices",
};

function readCases() {
  const stored = localStorage.getItem(storageKey);
  return stored ? JSON.parse(stored) as Invoice[] : null;
}

function initialCases() {
  try {
    return readCases() ?? seedCases();
  } catch {
    return seedCases();
  }
}

export interface Workspace {
  cases: Invoice[];
  visible: Invoice[];
  role: Role;
  setRole: (role: Role, invoiceId?: string) => void;
  commit: <T>(change: (draft: Invoice[]) => T) => Promise<T>;
  suggestedIds: string[];
  setSuggestedIds: (ids: string[]) => void;
}

const Context = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState(initialCases);
  const [role, setRole] = useState<Role>("ap");
  const [supplierId, setSupplierId] = useState("vantage");
  const [suggestedIds, setSuggestedIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey) setCases(initialCases());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function commit<T>(change: (draft: Invoice[]) => T) {
    const transaction = () => {
      const latest = readCases();
      if (latest) setCases(latest);
      const draft = structuredClone(latest ?? cases);
      const result = change(draft);
      try {
        localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        throw new Error("The browser could not save this change. Check the available storage and try again.");
      }
      setCases(draft);
      return result;
    };
    return navigator.locks
      ? navigator.locks.request(storageKey, transaction)
      : Promise.resolve().then(transaction);
  }

  return (
    <Context.Provider value={{
      cases, visible: visibleCases(cases, role, supplierId), role, commit, suggestedIds, setSuggestedIds,
      setRole(nextRole, invoiceId) {
        if (nextRole === "supplier" && invoiceId) setSupplierId(invoiceId);
        setSuggestedIds([]);
        setRole(nextRole);
      },
    }}>
      {children}
    </Context.Provider>
  );
}

export function useWorkspace() {
  const workspace = useContext(Context);
  if (!workspace) throw new Error("Workspace provider is missing.");
  return workspace;
}

export function WorkspaceLayout() {
  const workspace = useWorkspace();
  const { role, setRole, cases } = workspace;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const invoiceId = cases.find(invoice => pathname === `/exceptions/${invoice.id}`)?.id;
  const defaultStatus = role === "ap" || role === "supplier" ? "needs" : "assigned";

  function changeRole(next: Role) {
    setRole(next, invoiceId);
    if (next === "supplier" && pathname === "/overview") {
      void navigate({ to: "/" });
    } else if (pathname === "/exceptions" || (invoiceId && !visibleCases(cases, next, invoiceId).some(invoice => invoice.id === invoiceId))) {
      void navigate({ to: "/exceptions", search: { status: next === "ap" || next === "supplier" ? "needs" : "assigned" } });
    }
  }

  return (
    <div className="spda-shell">
      <a className="spda-skip" href="#workspace-content">Skip to workspace content</a>
      <aside className="spda-rail">
        <Link to="/" className="spda-brand" aria-label="SPDA Supply dashboard">
          <span className="spda-brand-icon"><ReceiptText aria-hidden="true" size={19} /></span>
          <span><strong>SPDA Supply</strong><small>Accounts payable</small></span>
        </Link>
        <nav className="spda-navigation" aria-label="Workspace">
          <Link to="/" activeOptions={{ exact: true }}><ChartNoAxesCombined aria-hidden="true" />Dashboard</Link>
          <Link to="/exceptions" search={{ status: defaultStatus }} activeOptions={{ includeSearch: false }}><Inbox aria-hidden="true" />{queueLabels[role]}</Link>
          {role !== "supplier" && <Link to="/overview"><Sparkles aria-hidden="true" />AI overview</Link>}
          <Link to="/guide" search={{ view: "detailed" }} activeOptions={{ includeSearch: false }}><BookOpen aria-hidden="true" />Assessment guide</Link>
        </nav>
        <div className="spda-rail-bottom">
          <Link to="/login">Project account</Link>
        </div>
      </aside>
      <div className="spda-body">
        <div className="spda-top">
          <span>AP exception workspace</span>
          <label className="spda-role">
            Preview as
            <select value={role} onChange={event => changeRole(event.target.value as Role)}>
              {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <main id="workspace-content" className="spda-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {role !== "supplier" && <WorkspaceAssistant key={role} workspace={workspace} currentId={invoiceId} />}
    </div>
  );
}

export function StatusBadge({ status }: { status: keyof typeof statuses }) {
  return <span className="spda-badge" data-status={status}><span aria-hidden="true" />{statuses[status]}</span>;
}

export function PageTitle({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="spda-page-heading">
    <div><h1>{title}</h1><p>{description}</p></div>
    {actions && <div className="spda-actions">{actions}</div>}
  </header>;
}
