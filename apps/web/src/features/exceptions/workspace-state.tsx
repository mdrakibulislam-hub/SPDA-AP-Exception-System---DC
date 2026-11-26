import { createContext, useContext, useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { seedCases, visibleCases, type Invoice, type Role } from "./model";
import { applyMonthEnd } from "./month-end";

const storageKey = "spda-workspace-v1";

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

function saveCases(cases: Invoice[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(cases));
  } catch {
    throw new Error("The browser could not save this change. Check the available storage and try again.");
  }
}

function withWorkspaceLock<T>(transaction: () => T) {
  return navigator.locks
    ? navigator.locks.request(storageKey, transaction)
    : Promise.resolve().then(transaction);
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

  const refreshPeriods = useEffectEvent(() => {
    void withWorkspaceLock(() => {
      const draft = readCases() ?? structuredClone(cases);
      if (applyMonthEnd(draft)) {
        saveCases(draft);
        setCases(draft);
      }
    }).catch(error => toast.error(error instanceof Error ? error.message : "The workspace could not be updated.", { id: "month-end-close" }));
  });

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey) setCases(initialCases());
    };
    const refresh = () => refreshPeriods();
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  function commit<T>(change: (draft: Invoice[]) => T) {
    return withWorkspaceLock(() => {
      const latest = readCases();
      if (latest) setCases(latest);
      const draft = structuredClone(latest ?? cases);
      const result = change(draft);
      applyMonthEnd(draft);
      saveCases(draft);
      setCases(draft);
      return result;
    });
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

