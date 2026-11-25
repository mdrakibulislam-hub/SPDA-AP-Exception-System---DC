import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceLayout } from "@/features/exceptions/workspace";

export const Route = createFileRoute("/_workspace")({ component: WorkspaceLayout });
