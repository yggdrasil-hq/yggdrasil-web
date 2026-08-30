"use client";

import { createContext, useContext } from "react";
import type { Feature, Project } from "@/lib/features/types";

export interface FeatureDetailContextValue {
  projectId: string;
  featureId: string;
  project: Project;
  feature: Feature;
  setFeature: (feature: Feature) => void;
}

const FeatureDetailContext = createContext<FeatureDetailContextValue | null>(null);

export function FeatureDetailProvider({
  value,
  children,
}: {
  value: FeatureDetailContextValue;
  children: React.ReactNode;
}) {
  return (
    <FeatureDetailContext.Provider value={value}>{children}</FeatureDetailContext.Provider>
  );
}

/**
 * Reads the project/feature loaded once by FeatureDetailLayout. Every page
 * under `/projects/:projectId/features/:featureId/*` renders inside that
 * layout, so this is safe to call from any of the six stage pages (and the
 * bare-route redirect) without re-fetching.
 */
export function useFeatureDetail(): FeatureDetailContextValue {
  const ctx = useContext(FeatureDetailContext);
  if (!ctx) {
    throw new Error("useFeatureDetail must be used within FeatureDetailLayout");
  }
  return ctx;
}
