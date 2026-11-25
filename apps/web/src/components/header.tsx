import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export function AccountShell({ children }: { children: ReactNode }) {
  return <div className="grid grid-rows-[auto_1fr] h-svh"><Header />{children}</div>;
}

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
      <hr />
    </div>
  );
}
