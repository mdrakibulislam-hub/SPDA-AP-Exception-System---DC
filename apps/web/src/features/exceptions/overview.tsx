import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspace } from "./workspace";

export function OverviewScreen() {
  const navigate = useNavigate();
  const { role } = useWorkspace();
  useEffect(() => {
    void navigate({ to: "/exceptions", search: { status: role === "ap" || role === "supplier" ? "needs" : "assigned" }, replace: true })
      .then(() => window.dispatchEvent(new Event("spda:open-assistant")));
  }, [navigate, role]);
  return null;
}
