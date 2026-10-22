import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type {
  ActorConsoleAccount,
  ActorConsoleWorkspace,
  DisplayApifyAccount,
  WorkspaceConnectionCheck,
} from "./messages";

type ConnectionTone = "linked" | "attention" | "neutral";
type FlowNodeKind = "actor" | "workspace" | "account" | "apify";

type FlowNodeData = {
  kind: FlowNodeKind;
  title: string;
  detail: string;
  status?: string;
  tone?: ConnectionTone;
  workspaceId?: string;
  accountId?: string;
  accountType?: "PERSONAL" | "ORGANIZATION" | "SAVED";
  actionLabel?: string;
  onAction?: () => void;
};

type ConnectionEdgeData = {
  workspaceId?: string;
  accountId?: string;
  interactive?: boolean;
};

type FlowAccount = {
  id: string;
  name: string;
  username: string | null;
  type: "PERSONAL" | "ORGANIZATION" | "SAVED";
};

type EntityNode = Node<FlowNodeData, "entity">;
type ConnectionEdge = Edge<ConnectionEdgeData>;

export type ConnectionFlowProps = {
  actor: ActorConsoleAccount;
  account: DisplayApifyAccount | null;
  liveSession: boolean;
  accountListCached: boolean;
  workspaces: ActorConsoleWorkspace[];
  workspaceError: string | null;
  checks: ReadonlyMap<string, WorkspaceConnectionCheck>;
  selectedWorkspaceId: string | null;
  selectedAccountId: string | null;
  onWorkspaceOpen: (workspaceId: string) => void;
  onWorkspaceManage: (workspaceId: string) => void;
  onAccountManage: (accountId: string) => void;
  onConnectionManage: (workspaceId: string, accountId: string) => void;
  onAddWorkspace: () => void;
  onOpenApify: (accountId: string | null) => void;
};

const nodeTypes = { entity: FlowEntityNode };
const ROW_GAP = 132;
const FIRST_ROW_Y = 94;

export function ConnectionFlow(props: ConnectionFlowProps) {
  const { nodes, edges } = useMemo(() => buildFlow(props), [
    props.actor,
    props.account,
    props.liveSession,
    props.accountListCached,
    props.workspaces,
    props.workspaceError,
    props.checks,
    props.selectedWorkspaceId,
    props.selectedAccountId,
    props.onWorkspaceManage,
    props.onAddWorkspace,
    props.onOpenApify,
  ]);

  return (
    <ReactFlow<EntityNode, ConnectionEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      minZoom={0.42}
      maxZoom={1.45}
      defaultViewport={{ x: 16, y: 22, zoom: 0.86 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      panOnScroll
      zoomOnScroll
      zoomOnPinch
      zoomOnDoubleClick={false}
      preventScrolling
      onNodeClick={(_, node) => {
        if (node.data.kind === "workspace" && node.data.workspaceId) {
          props.onWorkspaceOpen(node.data.workspaceId);
        } else if (node.data.kind === "account" && node.data.accountId) {
          props.onAccountManage(node.data.accountId);
        } else if (node.data.kind === "apify") {
          props.onOpenApify(props.account?.selectedAccountId ?? null);
        }
      }}
      onEdgeClick={(_, edge) => {
        const data = edge.data;
        if (data?.interactive && data.workspaceId && data.accountId) {
          props.onConnectionManage(data.workspaceId, data.accountId);
        }
      }}
      proOptions={{ hideAttribution: true }}
      aria-label="ActorConsole and Apify workspace connection map"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#c8cbc5" />
      <Controls position="top-right" showInteractive={false} aria-label="Connection map zoom controls" />
      <Panel position="top-left" className="flow-help">
        Drag to move <span aria-hidden="true">·</span> Scroll to zoom
      </Panel>
    </ReactFlow>
  );
}

function buildFlow(props: ConnectionFlowProps): { nodes: EntityNode[]; edges: ConnectionEdge[] } {
  const accountChoices: FlowAccount[] = props.account ? [
    {
      id: props.account.userId,
      name: props.account.displayName || props.account.username || "Personal account",
      username: props.account.username,
      type: "PERSONAL" as const,
    },
    ...props.account.organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      username: organization.username,
      type: "ORGANIZATION" as const,
    })),
  ] : [];

  const accountById = new Map(accountChoices.map((choice) => [choice.id, choice]));
  for (const workspace of props.workspaces) {
    if (!workspace.connectedAccountId || accountById.has(workspace.connectedAccountId)) continue;
    const savedAccount: FlowAccount = {
      id: workspace.connectedAccountId,
      name: workspace.apifyUsername ? `@${workspace.apifyUsername}` : "Saved Apify account",
      username: workspace.apifyUsername,
      type: "SAVED" as const,
    };
    accountChoices.push(savedAccount);
    accountById.set(savedAccount.id, savedAccount);
  }

  const accountOrder = new Map(accountChoices.map((choice, index) => [choice.id, index]));
  const orderedWorkspaces = [...props.workspaces].sort((left, right) =>
    (accountOrder.get(left.connectedAccountId ?? "") ?? Number.MAX_SAFE_INTEGER) -
    (accountOrder.get(right.connectedAccountId ?? "") ?? Number.MAX_SAFE_INTEGER));
  const rowCount = Math.max(orderedWorkspaces.length, accountChoices.length, 1);
  const rootY = FIRST_ROW_Y + ((rowCount - 1) * ROW_GAP) / 2;
  const nodes: EntityNode[] = [];
  const edges: ConnectionEdge[] = [];

  nodes.push({
    id: "actor-root",
    type: "entity",
    position: { x: 20, y: rootY },
    data: {
      kind: "actor",
      title: "ActorConsole",
      detail: `${props.actor.name || props.actor.email} · ${props.workspaces.length} workspace${props.workspaces.length === 1 ? "" : "s"}`,
      status: props.workspaceError ? "Workspaces unavailable" : "Connected",
      tone: props.workspaceError ? "attention" : "linked",
      actionLabel: "Add workspace",
      onAction: props.onAddWorkspace,
    },
    selectable: false,
  });

  orderedWorkspaces.forEach((workspace, index) => {
    const tone = connectionTone(workspace, props.checks);
    const status = workspaceStatus(workspace, props.checks);
    const connected = workspace.connectedAccountId
      ? accountById.get(workspace.connectedAccountId)?.name ?? workspace.apifyUsername ?? "Saved account"
      : "No Apify account";
    nodes.push({
      id: `workspace:${workspace.id}`,
      type: "entity",
      position: { x: 250, y: FIRST_ROW_Y + index * ROW_GAP },
      data: {
        kind: "workspace",
        workspaceId: workspace.id,
        title: workspace.name,
        detail: connected,
        status,
        tone,
        actionLabel: "Manage connection",
        onAction: () => props.onWorkspaceManage(workspace.id),
      },
      selected: props.selectedWorkspaceId === workspace.id,
      ariaLabel: `${workspace.name} workspace. ${connected}. ${status}. Open in ActorConsole.`,
    });
    edges.push({
      id: `actor:${workspace.id}`,
      source: "actor-root",
      target: `workspace:${workspace.id}`,
      type: "default",
      className: "flow-edge flow-edge--actor",
      selectable: false,
      focusable: false,
    });
  });

  accountChoices.forEach((choice, index) => {
    const links = props.workspaces.filter((workspace) => workspace.connectedAccountId === choice.id);
    const hasAttention = links.some((workspace) => connectionTone(workspace, props.checks) === "attention");
    const hasVerified = links.some((workspace) => connectionTone(workspace, props.checks) === "linked");
    const typeLabel = choice.type === "PERSONAL" ? "Personal" : choice.type === "ORGANIZATION" ? "Organization" : "Saved account";
    nodes.push({
      id: `account:${choice.id}`,
      type: "entity",
      position: { x: 620, y: FIRST_ROW_Y + index * ROW_GAP },
      data: {
        kind: "account",
        accountId: choice.id,
        accountType: choice.type,
        title: choice.name,
        detail: `${typeLabel}${choice.username ? ` · @${choice.username.replace(/^@/, "")}` : ""}`,
        status: links.length ? `${links.length} saved link${links.length === 1 ? "" : "s"}` : props.accountListCached ? "Saved account" : "Available",
        tone: hasAttention ? "attention" : hasVerified ? "linked" : "neutral",
      },
      selected: props.selectedAccountId === choice.id,
      ariaLabel: `${choice.name} ${typeLabel.toLowerCase()}. ${links.length ? `${links.length} linked workspace${links.length === 1 ? "" : "s"}` : props.accountListCached ? "Saved account; refresh access before connecting" : "Available to connect"}.`,
    });
    edges.push({
      id: `apify:${choice.id}`,
      source: `account:${choice.id}`,
      target: "apify-root",
      type: "default",
      className: "flow-edge flow-edge--apify",
      selectable: false,
      focusable: false,
    });
  });

  nodes.push({
    id: "apify-root",
    type: "entity",
    position: { x: 900, y: rootY },
    data: {
      kind: "apify",
      title: "Apify.com",
      detail: props.account
        ? `${props.account.displayName || props.account.username || "Apify account"} · ${accountChoices.length} account${accountChoices.length === 1 ? "" : "s"}`
        : "Open Console to load personal and organization accounts",
      status: props.liveSession ? props.accountListCached ? "Session detected · saved list" : "Session detected"
        : props.account ? "Saved account list" : "Sign in required",
      tone: props.liveSession ? "linked" : props.account ? "neutral" : "attention",
      actionLabel: props.liveSession ? "Open Console" : props.account ? "Refresh in Apify" : "Sign in to Apify",
      onAction: () => props.onOpenApify(props.account?.selectedAccountId ?? null),
    },
    selectable: false,
  });

  for (const workspace of orderedWorkspaces) {
    if (!workspace.connectedAccountId || !accountOrder.has(workspace.connectedAccountId)) continue;
    const tone = connectionTone(workspace, props.checks);
    edges.push({
      id: `connection:${workspace.id}:${workspace.connectedAccountId}`,
      source: `workspace:${workspace.id}`,
      target: `account:${workspace.connectedAccountId}`,
      type: "default",
      className: `flow-edge flow-edge--connection flow-edge--${tone}`,
      interactionWidth: 22,
      selectable: true,
      focusable: true,
      ariaLabel: `Manage ${workspace.name} connection. ${workspaceStatus(workspace, props.checks)}.`,
      data: {
        workspaceId: workspace.id,
        accountId: workspace.connectedAccountId,
        interactive: true,
      },
    });
  }

  return { nodes, edges };
}

function FlowEntityNode({ data, selected }: NodeProps<EntityNode>) {
  const canReceive = data.kind !== "actor";
  const canSend = data.kind !== "apify";
  const status = data.status ? (
    <span className="flow-node-status" title={data.status}><i aria-hidden="true" /><span>{data.status}</span></span>
  ) : null;
  return (
    <div className={`flow-node flow-node--${data.kind}${selected ? " is-selected" : ""}`} data-tone={data.tone ?? "neutral"}>
      {canReceive ? <Handle type="target" position={Position.Left} isConnectable={false} /> : null}
      <div className="flow-node-heading">
        <span className="flow-node-icon" aria-hidden="true">{nodeIcon(data.kind, data.accountType)}</span>
        <span className="flow-node-copy">
          <strong>{data.title}</strong>
          <small>{data.detail}</small>
        </span>
      </div>
      {data.kind === "workspace" ? (
        <div className="flow-node-footer">
          {status}
          {data.actionLabel && data.onAction ? (
            <button
              type="button"
              className="flow-node-manage nodrag nopan"
              aria-label={`${data.actionLabel} for ${data.title}`}
              title={`${data.actionLabel} for ${data.title}`}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                data.onAction?.();
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>
            </button>
          ) : null}
        </div>
      ) : status}
      {data.kind !== "workspace" && data.actionLabel && data.onAction ? (
        <button
          type="button"
          className="flow-node-action nodrag nopan"
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            data.onAction?.();
          }}
        >
          {data.actionLabel}
        </button>
      ) : null}
      {canSend ? <Handle type="source" position={Position.Right} isConnectable={false} /> : null}
    </div>
  );
}

function nodeIcon(kind: FlowNodeKind, accountType?: FlowNodeData["accountType"]) {
  if (kind === "actor") return <img src="icon-96.png" alt="" />;
  if (kind === "workspace") return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12.1V21"/></svg>
  );
  if (kind === "account" && accountType === "PERSONAL") return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.8 3-5.7 7-5.7s6.3 1.9 7 5.7"/></svg>
  );
  if (kind === "account") return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 21V5l7-3 7 3v16M3 21h18M9 8h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"/></svg>
  );
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.2 3.4c.5-1 1.9-1 2.4 0l7.2 14.1c.5 1-.2 2.2-1.3 2.2H5.1c-1.1 0-1.8-1.2-1.3-2.2l7.4-14.1Z" fill="currentColor" opacity=".92"/><path d="m8 17 4.3-8.3 4.1 8.3H8Z" fill="#fff" opacity=".82"/></svg>
  );
}

function connectionTone(
  workspace: ActorConsoleWorkspace,
  checks: ReadonlyMap<string, WorkspaceConnectionCheck>,
): ConnectionTone {
  if (!workspace.connectedAccountId) return "neutral";
  const check = checks.get(workspace.id);
  if (check) return check.confirmed && check.api === "VALID" ? "linked" : "attention";
  if (!workspace.browserSessionConfigured || workspace.browserSessionStatus !== "VALID" ||
    !workspace.apiKeyConfigured || ["EXPIRED", "INVALID", "ERROR"].includes(workspace.apiTokenStatus)) {
    return "attention";
  }
  return "neutral";
}

function workspaceStatus(
  workspace: ActorConsoleWorkspace,
  checks: ReadonlyMap<string, WorkspaceConnectionCheck>,
) {
  const check = checks.get(workspace.id);
  if (check?.confirmed) return check.api === "VALID" ? "Verified"
    : check.api === "MISSING" ? "API key needed" : "API key needs refresh";
  if (check) return "Reconnect needed";
  if (!workspace.connectedAccountId) return workspace.apiKeyConfigured ? "Console link needed" : "Ready to connect";
  if (!workspace.browserSessionConfigured || workspace.browserSessionStatus !== "VALID") return "Reconnect needed";
  if (!workspace.apiKeyConfigured) return "API key needed";
  if (["EXPIRED", "INVALID", "ERROR"].includes(workspace.apiTokenStatus)) return "API key needs refresh";
  return "Saved link · check to confirm";
}
