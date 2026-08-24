import { Suspense } from "react";
import { CreateProjectPageClient } from "@/components/projects/create-project-page-client";

export default function CreateProjectPage() {
  return (
    <Suspense>
      <CreateProjectPageClient />
    </Suspense>
  );
}
