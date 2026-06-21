import { AppSidebar } from "@/components/app-shell/app-sidebar";
import type { Project } from "@/lib/features/types";

interface AppShellProps {
  project: Project;
  children: React.ReactNode;
}

export function AppShell({ project, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-niflheim">
      <AppSidebar project={project} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
