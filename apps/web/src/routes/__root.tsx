import { Toaster } from "@SPDA-AP-Exception-System---DC/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, createRootRouteWithContext, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";
import { WorkspaceProvider } from "@/features/exceptions/workspace-state";
import type { trpc } from "@/utils/trpc";

import "../index.css";

export interface RouterAppContext {
  trpc: typeof trpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "SPDA Supply · Accounts payable",
      },
      {
        name: "description",
        content: "Review, route, and resolve sample accounts payable invoice exceptions.",
      },
    ],
  }),
});

function RootComponent() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const accountPage = pathname === "/login" || pathname === "/dashboard";
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <WorkspaceProvider><Outlet /></WorkspaceProvider>
        <Toaster richColors />
      </ThemeProvider>
      {import.meta.env.DEV && accountPage && <>
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
      </>}
    </>
  );
}
