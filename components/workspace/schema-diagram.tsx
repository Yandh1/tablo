"use client";

import dynamic from "next/dynamic";

import type { GuidedDraftV1 } from "@/domain/guided-draft";
import type { ParsedSchemaV1 } from "@/domain/parser";

import styles from "./schema-diagram.module.css";

const SchemaDiagramLeaf = dynamic(
  () => import("./schema-diagram-leaf").then((module) => module.SchemaDiagramLeaf),
  {
    ssr: false,
    loading: () => <div className={styles.loading} role="status">Loading diagram...</div>,
  },
);

export function SchemaDiagram(props: {
  draft: GuidedDraftV1;
  mode: "guided" | "manual";
  schema: ParsedSchemaV1 | null;
  stale: boolean;
}) {
  return <SchemaDiagramLeaf {...props} />;
}
