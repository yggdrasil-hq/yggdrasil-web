import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEATURE_LIST_QUERY,
  type Feature,
  type FeatureListQuery,
} from "@/lib/features/types";
import {
  filterAndSortFeatures,
  groupFeaturesByStatus,
  orderedStatusGroups,
} from "@/lib/features/sort-filter";

const sampleFeatures: Feature[] = [
  {
    id: "a",
    projectId: "p1",
    title: "Zebra",
    slug: "zebra",
    featureType: "normal",
    specExcerpt: "last",
    status: "spec_ready",
    adrMarkdown: "# ADR",
    awaitingUserInput: false,
    adrApproved: false,
    branchName: null,
    prUrl: null,
    createdAt: "2024-01-03T00:00:00.000Z",
    updatedAt: "2024-01-05T00:00:00.000Z",
  },
  {
    id: "b",
    projectId: "p1",
    title: "Alpha",
    slug: "alpha",
    featureType: "normal",
    specExcerpt: "first",
    status: "draft",
    adrMarkdown: null,
    awaitingUserInput: true,
    adrApproved: false,
    branchName: null,
    prUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
  },
  {
    id: "c",
    projectId: "p1",
    title: "Beta",
    slug: "beta",
    featureType: "normal",
    specExcerpt: "middle",
    status: "running",
    adrMarkdown: "# ADR",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: "yggdrasil/beta-c",
    prUrl: null,
    createdAt: "2024-01-02T00:00:00.000Z",
    updatedAt: "2024-01-04T00:00:00.000Z",
  },
];

describe("filterAndSortFeatures", () => {
  it("filters by search across title and excerpt", () => {
    const query: FeatureListQuery = {
      ...DEFAULT_FEATURE_LIST_QUERY,
      search: "first",
    };
    const result = filterAndSortFeatures(sampleFeatures, query);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("b");
  });

  it("filters by selected statuses", () => {
    const query: FeatureListQuery = {
      ...DEFAULT_FEATURE_LIST_QUERY,
      statuses: ["draft"],
    };
    const result = filterAndSortFeatures(sampleFeatures, query);
    expect(result.map((feature) => feature.id)).toEqual(["b"]);
  });

  it("sorts by name", () => {
    const query: FeatureListQuery = {
      ...DEFAULT_FEATURE_LIST_QUERY,
      sort: "name",
    };
    const result = filterAndSortFeatures(sampleFeatures, query);
    expect(result.map((feature) => feature.title)).toEqual([
      "Alpha",
      "Beta",
      "Zebra",
    ]);
  });
});

describe("orderedStatusGroups", () => {
  it("returns only non-empty groups in workflow order", () => {
    const filtered = filterAndSortFeatures(sampleFeatures, DEFAULT_FEATURE_LIST_QUERY);
    const groups = groupFeaturesByStatus(filtered);
    const ordered = orderedStatusGroups(groups);

    expect(ordered.map((group) => group.status)).toEqual([
      "draft",
      "spec_ready",
      "running",
    ]);
    expect(ordered[1]?.features[0]?.title).toBe("Zebra");
  });
});
