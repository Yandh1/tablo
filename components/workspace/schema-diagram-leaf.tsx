"use client";

import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useMemo } from "react";
import "@xyflow/react/dist/style.css";

import type { GuidedDraftV1 } from "@/domain/guided-draft";
import type { ParsedSchemaV1 } from "@/domain/parser";

import styles from "./schema-diagram.module.css";

interface TableNodeData extends Record<string, unknown> {
  columns: Array<{
    id: string;
    name: string;
    type: string;
    primaryKey: boolean;
    foreignKey: boolean;
    unique: boolean;
  }>;
  draft: boolean;
  label: string;
}

type TableNode = Node<TableNodeData, "table">;

function TableNodeView({ data }: NodeProps<TableNode>) {
  return (
    <div className={styles.tableNode} data-draft={data.draft || undefined}>
      <Handle type="target" position={Position.Left} className={styles.handle} />
      <div className={styles.nodeHeader}>
        <strong title={data.label}>{data.label}</strong>
        {data.draft ? <span>Draft</span> : null}
      </div>
      {data.columns.length === 0 ? (
        <p className={styles.emptyNode}>Add a column to define this table.</p>
      ) : (
        <div className={styles.nodeColumns}>
          {data.columns.map((column) => (
            <div className={styles.nodeColumn} key={column.id}>
              <span className={styles.keyMark} aria-label={column.primaryKey ? "Primary key" : column.foreignKey ? "Foreign key" : undefined}>
                {column.primaryKey ? "PK" : column.foreignKey ? "FK" : ""}
              </span>
              <span className={styles.columnName} title={column.name}>{column.name}</span>
              <code title={column.type}>{column.type}</code>
              {column.unique ? <span className={styles.uniqueMark} title="Unique">UQ</span> : null}
            </div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { table: TableNodeView };

function layoutPosition(index: number) {
  return { x: 32 + (index % 2) * 330, y: 32 + Math.floor(index / 2) * 250 };
}

export function projectGuidedDraftForDiagram(draft: GuidedDraftV1): { nodes: TableNode[]; edges: Edge[] } {
  const nodes: TableNode[] = draft.tables.map((table, index) => ({
    id: table.id,
    type: "table",
    position: layoutPosition(index),
    data: {
      draft: true,
      label: table.name.value || "Untitled table",
      columns: table.columns.map((column) => ({
        id: column.id,
        name: column.name.value || "Untitled column",
        type: column.dataType || "Choose a data type",
        primaryKey: column.primaryKey,
        foreignKey: Boolean(column.references),
        unique: column.unique,
      })),
    },
  }));
  const edges: Edge[] = draft.tables.flatMap((table) =>
    table.columns.flatMap((column) =>
      column.references
        ? [{
            id: `draft-edge:${column.id}`,
            source: table.id,
            target: column.references.tableDraftId,
            type: "smoothstep",
            label: "FK",
          }]
        : [],
    ),
  );
  return { nodes, edges };
}

export function projectParsedSchemaForDiagram(schema: ParsedSchemaV1 | null): { nodes: TableNode[]; edges: Edge[] } {
  if (!schema) return { nodes: [], edges: [] };
  const foreignColumnIds = new Set(schema.relationships.map((relationship) => relationship.sourceColumnId));
  const nodes: TableNode[] = schema.tables.map((table, index) => ({
    id: table.id,
    type: "table",
    position: layoutPosition(index),
    data: {
      draft: false,
      label: table.name.displayName,
      columns: table.columns.map((column) => ({
        id: column.id,
        name: column.name.displayName,
        type: column.dataType.displayName,
        primaryKey: column.primaryKey,
        foreignKey: foreignColumnIds.has(column.id),
        unique: column.unique,
      })),
    },
  }));
  const edges: Edge[] = schema.relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.sourceTableId,
    target: relationship.targetTableId,
    type: "smoothstep",
    label: "FK",
  }));
  return { nodes, edges };
}

function FitDiagramButton() {
  const { fitView } = useReactFlow();
  return (
    <button className={styles.fitButton} type="button" onClick={() => void fitView({ padding: 0.16, duration: 0 })}>
      Fit diagram
    </button>
  );
}

export function SchemaDiagramLeaf({
  draft,
  mode,
  schema,
  stale,
}: {
  draft: GuidedDraftV1;
  mode: "guided" | "manual";
  schema: ParsedSchemaV1 | null;
  stale: boolean;
}) {
  const graph = useMemo(
    () => mode === "guided" ? projectGuidedDraftForDiagram(draft) : projectParsedSchemaForDiagram(schema),
    [draft, mode, schema],
  );

  return (
    <div className={styles.diagram} data-testid="schema-diagram">
      {stale && mode === "manual" ? <div className={styles.staleNotice} role="status">Showing last valid diagram</div> : null}
      {graph.nodes.length === 0 ? (
        <div className={styles.emptyDiagram}>
          <strong>No tables to show</strong>
          <span>Add a table or enter valid PostgreSQL SQL.</span>
        </div>
      ) : null}
      <ReactFlowProvider>
        <ReactFlow<TableNode, Edge>
          aria-label="Relational schema diagram"
          edges={graph.edges}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.2}
          maxZoom={1.8}
          nodes={graph.nodes}
          nodesConnectable={false}
          nodeTypes={NODE_TYPES}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <FitDiagramButton />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
