"use client";

import { useGSAP } from "@gsap/react";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { gsap } from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";

import type { GuidedDraftV1 } from "@/domain/guided-draft";
import type { ParsedSchemaV1 } from "@/domain/parser";

import styles from "./schema-diagram.module.css";

gsap.registerPlugin(useGSAP);

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
  entranceRevision?: number;
  label: string;
  source: "guided-draft" | "parsed-schema";
}

type TableNode = Node<TableNodeData, "table">;

interface DiagramGraph {
  nodes: TableNode[];
  edges: Edge[];
}

const TABLE_NODE_WIDTH = 250;
const TABLE_NODE_HEADER_HEIGHT = 36;
const TABLE_NODE_EMPTY_HEIGHT = 42;
const TABLE_NODE_COLUMNS_PADDING = 8;
const TABLE_NODE_COLUMN_HEIGHT = 26;
const LAYOUT_X = 32;
const LAYOUT_Y = 32;
const LAYOUT_COLUMN_GAP = 80;
const LAYOUT_ROW_GAP = 40;
const AUTOMATIC_FIT_DURATION_MS = 240;

function TableNodeView({ data }: NodeProps<TableNode>) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const surface = surfaceRef.current;
    if (!surface || data.entranceRevision === undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.fromTo(
      surface,
      { opacity: 0, y: 10, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.4,
        ease: "back.out(1.25)",
        clearProps: "opacity,transform",
        overwrite: "auto",
      },
    );
  }, {
    dependencies: [data.entranceRevision],
    revertOnUpdate: true,
    scope: surfaceRef,
  });

  return (
    <div
      className={styles.tableNode}
      data-draft={data.draft || undefined}
      data-node-source={data.source}
      ref={surfaceRef}
    >
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
              <span className={styles.keyMarks}>
                {column.primaryKey ? <span aria-label="Primary key">PK</span> : null}
                {column.foreignKey ? <span aria-label="Foreign key">FK</span> : null}
                {column.unique ? <span aria-label="Unique">UQ</span> : null}
              </span>
              <span className={styles.columnName} title={column.name}>{column.name}</span>
              <code title={column.type}>{column.type}</code>
            </div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { table: TableNodeView };

function tableNodeHeight(node: TableNode) {
  if (node.measured?.height) return node.measured.height;

  return TABLE_NODE_HEADER_HEIGHT + (
    node.data.columns.length === 0
      ? TABLE_NODE_EMPTY_HEIGHT
      : TABLE_NODE_COLUMNS_PADDING
        + node.data.columns.length * TABLE_NODE_COLUMN_HEIGHT
  );
}

function compareNodeIds(
  leftId: string,
  rightId: string,
  originalIndexById: ReadonlyMap<string, number>,
) {
  const indexDifference = (originalIndexById.get(leftId) ?? Number.MAX_SAFE_INTEGER)
    - (originalIndexById.get(rightId) ?? Number.MAX_SAFE_INTEGER);
  return indexDifference || leftId.localeCompare(rightId);
}

export function sortTableNodesByRelationships(
  nodes: TableNode[],
  edges: Edge[],
): TableNode[] {
  if (nodes.length < 2) return nodes;

  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const originalIndexById = new Map(
    nodes.map((node, index) => [node.id, index] as const),
  );
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()] as const));
  const incomingCount = new Map<string, number>(
    nodes.map((node) => [node.id, 0]),
  );

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const compareByRelationship = (leftId: string, rightId: string) => {
    const incomingDifference = (incomingCount.get(rightId) ?? 0)
      - (incomingCount.get(leftId) ?? 0);
    if (incomingDifference) return incomingDifference;
    const degreeDifference = (adjacency.get(rightId)?.size ?? 0)
      - (adjacency.get(leftId)?.size ?? 0);
    return degreeDifference
      || compareNodeIds(leftId, rightId, originalIndexById);
  };

  const unseen = new Set(nodes.map((node) => node.id));
  const components: string[][] = [];
  for (const seed of nodes) {
    if (!unseen.has(seed.id)) continue;
    const component: string[] = [];
    const pending = [seed.id];
    unseen.delete(seed.id);
    while (pending.length > 0) {
      const current = pending.shift()!;
      component.push(current);
      const neighbors = [...(adjacency.get(current) ?? [])]
        .filter((id) => unseen.has(id))
        .sort(compareByRelationship);
      for (const neighbor of neighbors) {
        unseen.delete(neighbor);
        pending.push(neighbor);
      }
    }
    components.push(component);
  }

  components.sort((left, right) =>
    Math.min(...left.map((id) => originalIndexById.get(id) ?? Number.MAX_SAFE_INTEGER))
    - Math.min(...right.map((id) => originalIndexById.get(id) ?? Number.MAX_SAFE_INTEGER))
  );

  const orderedIds = components.flatMap((component) => {
    const componentSet = new Set(component);
    const root = [...component].sort(compareByRelationship)[0]!;
    const ordered: string[] = [];
    const visited = new Set([root]);
    const pending = [root];
    while (pending.length > 0) {
      const current = pending.shift()!;
      ordered.push(current);
      const neighbors = [...(adjacency.get(current) ?? [])]
        .filter((id) => componentSet.has(id) && !visited.has(id))
        .sort(compareByRelationship);
      for (const neighbor of neighbors) {
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    return ordered;
  });

  return orderedIds.map((id) => nodeById.get(id)!);
}

export function diagramLayoutColumnCount(tableCount: number) {
  return tableCount === 0 ? 0 : Math.ceil(Math.sqrt(tableCount));
}

export function layoutTableNodes(
  nodes: TableNode[],
  edges: Edge[] = [],
): TableNode[] {
  const orderedNodes = sortTableNodesByRelationships(nodes, edges);
  const layoutColumns = diagramLayoutColumnCount(orderedNodes.length);
  const positioned: TableNode[] = [];
  let y = LAYOUT_Y;

  for (let rowStart = 0; rowStart < orderedNodes.length; rowStart += layoutColumns) {
    const row = orderedNodes.slice(rowStart, rowStart + layoutColumns);
    const rowHeight = Math.max(...row.map(tableNodeHeight));

    row.forEach((node, columnIndex) => {
      positioned.push({
        ...node,
        position: {
          x: LAYOUT_X + columnIndex * (TABLE_NODE_WIDTH + LAYOUT_COLUMN_GAP),
          y,
        },
      });
    });
    y += rowHeight + LAYOUT_ROW_GAP;
  }

  return positioned;
}

export function projectGuidedDraftForDiagram(draft: GuidedDraftV1): DiagramGraph {
  const rawNodes: TableNode[] = draft.tables.map((table) => ({
    id: table.id,
    type: "table",
    position: { x: 0, y: 0 },
    data: {
      draft: true,
      label: table.name.value || "Untitled table",
      source: "guided-draft",
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
  const nodes = layoutTableNodes(rawNodes, edges);
  return { nodes, edges };
}

export function projectParsedSchemaForDiagram(schema: ParsedSchemaV1 | null): DiagramGraph {
  if (!schema) return { nodes: [], edges: [] };
  const foreignColumnIds = new Set(schema.relationships.map((relationship) => relationship.sourceColumnId));
  const rawNodes: TableNode[] = schema.tables.map((table) => ({
    id: table.id,
    type: "table",
    position: { x: 0, y: 0 },
    data: {
      draft: false,
      label: table.name.displayName,
      source: "parsed-schema",
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
  const nodes = layoutTableNodes(rawNodes, edges);
  return { nodes, edges };
}

export function projectWorkspaceDiagram({
  draft,
  guidedCanonical,
  mode,
  schema,
}: {
  draft: GuidedDraftV1;
  guidedCanonical: boolean;
  mode: "guided" | "manual";
  schema: ParsedSchemaV1 | null;
}) {
  if (mode === "guided" && !guidedCanonical) {
    return projectGuidedDraftForDiagram(draft);
  }

  return projectParsedSchemaForDiagram(schema);
}

function FitDiagramButton() {
  const { fitView } = useReactFlow();
  return (
    <button className={styles.fitButton} type="button" onClick={() => void fitView({ padding: 0.16, duration: 0 })}>
      Fit diagram
    </button>
  );
}

export function reconcileTableNodes(
  currentNodes: TableNode[],
  incomingNodes: TableNode[],
  topologyChanged: boolean,
  edges: Edge[] = [],
) {
  if (topologyChanged) {
    return layoutTableNodes(incomingNodes, edges);
  }

  const positionsById = new Map(
    currentNodes.map((node) => [node.id, node.position] as const),
  );
  return incomingNodes.map((node, index) => ({
    ...node,
    position: positionsById.get(node.id)
      ?? currentNodes[index]?.position
      ?? node.position,
  }));
}

export function findNewTableIds(
  seenTableIds: ReadonlySet<string>,
  previousTableCount: number,
  incomingTableIds: readonly string[],
) {
  if (
    previousTableCount < 0
    || incomingTableIds.length <= previousTableCount
  ) {
    return [];
  }

  return incomingTableIds.filter((tableId) => !seenTableIds.has(tableId));
}

export function haveMeasuredTableNodes(
  nodes: TableNode[],
  tableIds: readonly string[],
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));

  return tableIds.every((tableId) => {
    const measured = nodesById.get(tableId)?.measured;
    return measured?.width !== undefined && measured.height !== undefined;
  });
}

export function haveRenderedTableNodes(
  nodes: TableNode[],
  tableIds: readonly string[],
) {
  if (nodes.length !== tableIds.length) return false;
  const renderedTableIds = new Set(nodes.map((node) => node.id));
  return tableIds.every((tableId) => renderedTableIds.has(tableId));
}

interface PendingLayout {
  expectedTableIds: string[];
  revision: number;
  tableIdsToMeasure: string[];
}

function DiagramCanvas({ graph }: { graph: DiagramGraph }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>(graph.nodes);
  const [pendingLayout, setPendingLayout] = useState<PendingLayout | null>(null);
  const entranceRevisionByIdRef = useRef(new Map<string, number>());
  const fitFrameRef = useRef<number | null>(null);
  const layoutFrameRef = useRef<number | null>(null);
  const runningAutomaticFitRevisionRef = useRef<number | null>(null);
  const pendingAutomaticFitRevisionRef = useRef<number | null>(null);
  const nextLayoutRevisionRef = useRef(0);
  const nextEntranceRevisionRef = useRef(0);
  const previousTableCountRef = useRef(-1);
  const seenTableIdsRef = useRef(new Set(graph.nodes.map((node) => node.id)));
  const userInteractingRef = useRef(false);
  const nodesInitialized = useNodesInitialized();
  const { fitView, getViewport, setViewport } = useReactFlow<TableNode, Edge>();

  const cancelAutomaticFit = useCallback(() => {
    pendingAutomaticFitRevisionRef.current = null;

    if (fitFrameRef.current !== null) {
      window.cancelAnimationFrame(fitFrameRef.current);
      fitFrameRef.current = null;
    }

    if (runningAutomaticFitRevisionRef.current !== null) {
      runningAutomaticFitRevisionRef.current = null;
      void setViewport(getViewport(), { duration: 0 });
    }
  }, [getViewport, setViewport]);

  useEffect(() => {
    const incomingTableIds = graph.nodes.map((node) => node.id);
    const activeTableIds = new Set(incomingTableIds);
    const newTableIds = findNewTableIds(
      seenTableIdsRef.current,
      previousTableCountRef.current,
      incomingTableIds,
    );
    const previousTableCount = previousTableCountRef.current;
    const topologyChanged = previousTableCount !== graph.nodes.length;
    previousTableCountRef.current = graph.nodes.length;

    for (const tableId of incomingTableIds) {
      seenTableIdsRef.current.add(tableId);
    }
    for (const tableId of entranceRevisionByIdRef.current.keys()) {
      if (!activeTableIds.has(tableId)) {
        entranceRevisionByIdRef.current.delete(tableId);
      }
    }
    for (const tableId of newTableIds) {
      nextEntranceRevisionRef.current += 1;
      entranceRevisionByIdRef.current.set(
        tableId,
        nextEntranceRevisionRef.current,
      );
    }

    if (topologyChanged && previousTableCount >= 0) {
      cancelAutomaticFit();
      nextLayoutRevisionRef.current += 1;
      const revision = nextLayoutRevisionRef.current;
      pendingAutomaticFitRevisionRef.current = revision;
      setPendingLayout({
        expectedTableIds: incomingTableIds,
        revision,
        tableIdsToMeasure: newTableIds,
      });
    }

    const incomingNodes = graph.nodes.map((node) => {
      const entranceRevision = entranceRevisionByIdRef.current.get(node.id);
      if (entranceRevision === undefined) return node;

      return {
        ...node,
        data: { ...node.data, entranceRevision },
      };
    });

    setNodes((currentNodes) =>
      reconcileTableNodes(currentNodes, incomingNodes, false)
    );
  }, [cancelAutomaticFit, graph.nodes, setNodes]);

  useEffect(() => {
    if (!pendingLayout || !nodesInitialized) return;
    const { expectedTableIds, revision, tableIdsToMeasure } = pendingLayout;

    if (!haveRenderedTableNodes(nodes, expectedTableIds)) return;
    if (!haveMeasuredTableNodes(nodes, tableIdsToMeasure)) return;

    layoutFrameRef.current = window.requestAnimationFrame(() => {
      layoutFrameRef.current = null;
      setNodes(layoutTableNodes(nodes, graph.edges));
      setPendingLayout((current) =>
        current?.revision === revision ? null : current
      );

      fitFrameRef.current = window.requestAnimationFrame(() => {
        fitFrameRef.current = null;
        if (
          userInteractingRef.current
          || pendingAutomaticFitRevisionRef.current !== revision
        ) {
          return;
        }

        pendingAutomaticFitRevisionRef.current = null;
        runningAutomaticFitRevisionRef.current = revision;
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : AUTOMATIC_FIT_DURATION_MS;

        void fitView({ padding: 0.16, duration }).finally(() => {
          if (runningAutomaticFitRevisionRef.current === revision) {
            runningAutomaticFitRevisionRef.current = null;
          }
        });
      });
    });

    return () => {
      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
    };
  }, [fitView, graph.edges, nodes, nodesInitialized, pendingLayout, setNodes]);

  const handleUserInteractionStart = useCallback(() => {
    userInteractingRef.current = true;
    cancelAutomaticFit();
  }, [cancelAutomaticFit]);

  const handleMoveStart = useCallback((event: MouseEvent | TouchEvent | null) => {
    if (event) handleUserInteractionStart();
  }, [handleUserInteractionStart]);

  const handleMoveEnd = useCallback(() => {
    userInteractingRef.current = false;
  }, []);

  const handleNodeDragStop = useCallback(() => {
    userInteractingRef.current = false;
  }, []);

  return (
    <ReactFlow<TableNode, Edge>
      aria-label="Relational schema diagram"
      edges={graph.edges}
      maxZoom={1.8}
      minZoom={0.2}
      nodes={nodes}
      nodesConnectable={false}
      nodesDraggable
      nodeTypes={NODE_TYPES}
      onMoveEnd={handleMoveEnd}
      onMoveStart={handleMoveStart}
      onNodeDragStart={handleUserInteractionStart}
      onNodeDragStop={handleNodeDragStop}
      onNodesChange={onNodesChange}
      panOnDrag
      proOptions={{ hideAttribution: true }}
      zoomOnScroll
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <FitDiagramButton />
    </ReactFlow>
  );
}

export function SchemaDiagramLeaf({
  draft,
  guidedCanonical,
  mode,
  schema,
  stale,
}: {
  draft: GuidedDraftV1;
  guidedCanonical: boolean;
  mode: "guided" | "manual";
  schema: ParsedSchemaV1 | null;
  stale: boolean;
}) {
  const graph = useMemo(
    () => projectWorkspaceDiagram({ draft, guidedCanonical, mode, schema }),
    [draft, guidedCanonical, mode, schema],
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
        <DiagramCanvas graph={graph} />
      </ReactFlowProvider>
    </div>
  );
}
