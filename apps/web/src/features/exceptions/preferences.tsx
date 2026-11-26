import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { roleLabels, useWorkspace } from "./workspace";
import type { Role } from "./model";

export function PreferencesScreen() {
  const { role, setRole } = useWorkspace();
  const [name, setName] = useState(() => localStorage.getItem("spda-profile-name") || "Md Rakibul Islam");
  const [nextRole, setNextRole] = useState<Role>(role);
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem("spda-reduce-motion") === "true");
  function save(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem("spda-profile-name", name.trim());
    localStorage.setItem("spda-reduce-motion", String(reduceMotion));
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
    setRole(nextRole);
    window.dispatchEvent(new Event("spda:preferences"));
    toast.success("Preferences saved");
  }
  return <div className="spda-preferences"><form className="spda-panel" onSubmit={save}>
    <div><h1>Preference</h1><p className="spda-muted">Manage your workspace profile and display.</p></div>
    <label>Display name<input className="spda-input" value={name} onChange={event => setName(event.target.value)} required maxLength={80} /></label>
    <label>Workspace role<select className="spda-select" value={nextRole} onChange={event => setNextRole(event.target.value as Role)}>{(Object.keys(roleLabels) as Role[]).map(key => <option key={key} value={key}>{roleLabels[key]}</option>)}</select></label>
    <label className="spda-check-label"><input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)} />Reduce interface motion</label>
    <div className="spda-actions"><button className="spda-button spda-button-primary" type="submit">Save preferences</button></div>
  </form></div>;
}
