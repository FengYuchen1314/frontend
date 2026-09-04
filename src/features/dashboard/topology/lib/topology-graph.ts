export const TOPOLOGY_SCHEMA_VERSION = 1 as const

export const TOPOLOGY_FORMATS = ['MIHOMO', 'SINGBOX', 'XRAY_JSON', 'XRAY_BASE64'] as const
export type TopologyFormat = (typeof TOPOLOGY_FORMATS)[number]

export const LOAD_BALANCER_STRATEGIES = [
    'ROUND_ROBIN',
    'CONSISTENT_HASH',
    'URL_TEST',
    'SELECTOR'
] as const
export type LoadBalancerStrategy = (typeof LOAD_BALANCER_STRATEGIES)[number]

export interface TopologyPosition {
    x: number
    y: number
}

interface TopologyNodeBase {
    id: string
    label: string
    position?: TopologyPosition
}

export interface TopologyEntryNode extends TopologyNodeBase {
    kind: 'ENTRY'
}

export interface TopologyProxyNode extends TopologyNodeBase {
    hostUuid: string
    kind: 'PROXY'
    nodeUuid: string
}

export interface TopologyLoadBalancerNode extends TopologyNodeBase {
    intervalSeconds?: number
    kind: 'LOAD_BALANCER'
    strategy: LoadBalancerStrategy
    testUrl?: string
}

export interface TopologyExitNode extends TopologyNodeBase {
    kind: 'EXIT'
}

export type TopologyNode =
    | TopologyEntryNode
    | TopologyProxyNode
    | TopologyLoadBalancerNode
    | TopologyExitNode

export interface TopologyEdge {
    id: string
    order?: number
    source: string
    target: string
}

export interface TopologyGraph {
    edges: TopologyEdge[]
    nodes: TopologyNode[]
    schemaVersion: typeof TOPOLOGY_SCHEMA_VERSION
}

export type TopologyIssueCode =
    | 'CYCLE'
    | 'DUPLICATE_EDGE'
    | 'DUPLICATE_NODE_ID'
    | 'DUPLICATE_NODE_LABEL'
    | 'DUPLICATE_PROXY_REFERENCE'
    | 'DISCONNECTED_GRAPH'
    | 'EMPTY_PROXY_SET'
    | 'ENTRY_HAS_INCOMING'
    | 'EXIT_HAS_OUTGOING'
    | 'INVALID_ENTRY_DEGREE'
    | 'INVALID_ENTRY_TARGET'
    | 'INVALID_ENTRY_COUNT'
    | 'INVALID_EXIT_COUNT'
    | 'INVALID_EXIT_DEGREE'
    | 'INVALID_LOAD_BALANCER_MEMBER'
    | 'INVALID_LOAD_BALANCER_SUCCESSOR'
    | 'INVALID_PROXY_DEGREE'
    | 'INVALID_PROXY_SUCCESSOR'
    | 'LOAD_BALANCER_NEEDS_UPSTREAMS'
    | 'MISSING_NODE'
    | 'SELF_LOOP'
    | 'SELF_SERVER_CHAIN'

export interface TopologyIssue {
    code: TopologyIssueCode
    edgeIds?: string[]
    message: string
    nodeIds?: string[]
    severity: 'ERROR' | 'WARNING'
}

export interface ProxyResource {
    hostLabel: string
    hostUuid: string
    nodeLabel: string
    nodeUuid: string
}

const createLocalId = () => {
    const randomUuid = globalThis.crypto?.randomUUID?.()
    if (randomUuid) return randomUuid
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16)
        const value = character === 'x' ? random : (random & 0x3) | 0x8
        return value.toString(16)
    })
}

export const createEmptyTopologyGraph = (): TopologyGraph => ({
    schemaVersion: TOPOLOGY_SCHEMA_VERSION,
    nodes: [
        { id: createLocalId(), kind: 'ENTRY', label: 'Entry', position: { x: 0, y: 0 } },
        { id: createLocalId(), kind: 'EXIT', label: 'Exit', position: { x: 640, y: 0 } }
    ],
    edges: []
})

export const createProxyNode = (
    resource: ProxyResource,
    id = createLocalId()
): TopologyProxyNode => ({
    id,
    kind: 'PROXY',
    label: `${resource.hostLabel} · ${resource.nodeLabel}`.trim().slice(0, 64),
    hostUuid: resource.hostUuid,
    nodeUuid: resource.nodeUuid
})

export const createLoadBalancerNode = (
    strategy: LoadBalancerStrategy = 'ROUND_ROBIN',
    id = createLocalId()
): TopologyLoadBalancerNode => ({
    id,
    kind: 'LOAD_BALANCER',
    label: 'Load balancer',
    strategy,
    ...(strategy === 'URL_TEST'
        ? { testUrl: 'https://www.gstatic.com/generate_204', intervalSeconds: 300 }
        : {})
})

export const withAutoLayout = (graph: TopologyGraph): TopologyGraph => {
    const columnWidth = 250
    return {
        ...graph,
        nodes: graph.nodes.map((node, index) => ({
            ...node,
            position: {
                x: index * columnWidth,
                y: index % 2 === 0 ? 0 : 120
            }
        }))
    }
}

const unique = (values: string[]) => [...new Set(values)]

const issueKey = (issue: TopologyIssue) =>
    [
        issue.code,
        ...(issue.nodeIds ?? []).slice().sort(),
        ...(issue.edgeIds ?? []).slice().sort()
    ].join(':')

export const validateTopologyGraph = (graph: TopologyGraph): TopologyIssue[] => {
    const issues: TopologyIssue[] = []
    const nodeById = new Map<string, TopologyNode>()

    for (const node of graph.nodes) {
        if (nodeById.has(node.id)) {
            issues.push({
                code: 'DUPLICATE_NODE_ID',
                message: `Node ID ${node.id} is used more than once.`,
                nodeIds: [node.id],
                severity: 'ERROR'
            })
        } else {
            nodeById.set(node.id, node)
        }
    }

    const labels = new Map<string, string[]>()
    const proxyReferences = new Map<string, string[]>()
    for (const node of graph.nodes) {
        const normalizedLabel = node.label.trim().toLocaleLowerCase('en-US')
        labels.set(normalizedLabel, [...(labels.get(normalizedLabel) ?? []), node.id])
        if (node.kind === 'PROXY') {
            const reference = `${node.hostUuid}:${node.nodeUuid}`
            proxyReferences.set(reference, [...(proxyReferences.get(reference) ?? []), node.id])
        }
    }
    for (const duplicateIds of labels.values()) {
        if (duplicateIds.length < 2) continue
        issues.push({
            code: 'DUPLICATE_NODE_LABEL',
            message: 'Canvas labels must be unique.',
            nodeIds: duplicateIds,
            severity: 'ERROR'
        })
    }
    for (const duplicateIds of proxyReferences.values()) {
        if (duplicateIds.length < 2) continue
        issues.push({
            code: 'DUPLICATE_PROXY_REFERENCE',
            message: 'The same Host and server pairing cannot be added twice.',
            nodeIds: duplicateIds,
            severity: 'ERROR'
        })
    }

    const entries = graph.nodes.filter((node) => node.kind === 'ENTRY')
    const exits = graph.nodes.filter((node) => node.kind === 'EXIT')
    if (entries.length !== 1) {
        issues.push({
            code: 'INVALID_ENTRY_COUNT',
            message: 'A topology must contain exactly one entry.',
            nodeIds: entries.map((node) => node.id),
            severity: 'ERROR'
        })
    }
    if (exits.length !== 1) {
        issues.push({
            code: 'INVALID_EXIT_COUNT',
            message: 'A topology must contain exactly one exit.',
            nodeIds: exits.map((node) => node.id),
            severity: 'ERROR'
        })
    }

    const edgePairIds = new Map<string, string>()
    const outgoing = new Map<string, TopologyEdge[]>()
    const incoming = new Map<string, TopologyEdge[]>()

    for (const edge of graph.edges) {
        const source = nodeById.get(edge.source)
        const target = nodeById.get(edge.target)
        if (!source || !target) {
            issues.push({
                code: 'MISSING_NODE',
                message: 'An edge points to a node that no longer exists.',
                edgeIds: [edge.id],
                nodeIds: [edge.source, edge.target].filter((id) => !nodeById.has(id)),
                severity: 'ERROR'
            })
            continue
        }

        if (edge.source === edge.target) {
            issues.push({
                code: 'SELF_LOOP',
                message: 'A node cannot connect to itself.',
                edgeIds: [edge.id],
                nodeIds: [edge.source],
                severity: 'ERROR'
            })
        }

        const pair = `${edge.source}\u0000${edge.target}`
        const previousEdgeId = edgePairIds.get(pair)
        if (previousEdgeId) {
            issues.push({
                code: 'DUPLICATE_EDGE',
                message: 'This connection already exists.',
                edgeIds: [previousEdgeId, edge.id],
                nodeIds: [edge.source, edge.target],
                severity: 'ERROR'
            })
        } else {
            edgePairIds.set(pair, edge.id)
        }

        outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
        incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge])

        if (target.kind === 'ENTRY') {
            issues.push({
                code: 'ENTRY_HAS_INCOMING',
                message: 'The entry cannot have an incoming connection.',
                edgeIds: [edge.id],
                nodeIds: [target.id],
                severity: 'ERROR'
            })
        }
        if (source.kind === 'EXIT') {
            issues.push({
                code: 'EXIT_HAS_OUTGOING',
                message: 'The exit cannot have an outgoing connection.',
                edgeIds: [edge.id],
                nodeIds: [source.id],
                severity: 'ERROR'
            })
        }
        if (source.kind === 'ENTRY' && target.kind !== 'PROXY') {
            issues.push({
                code: 'INVALID_ENTRY_TARGET',
                message: 'Entry can only connect to proxy branch roots.',
                edgeIds: [edge.id],
                nodeIds: [source.id, target.id],
                severity: 'ERROR'
            })
        }
        if (
            source.kind === 'PROXY' &&
            target.kind !== 'PROXY' &&
            target.kind !== 'LOAD_BALANCER' &&
            target.kind !== 'EXIT'
        ) {
            issues.push({
                code: 'INVALID_PROXY_SUCCESSOR',
                message: 'A proxy has an invalid next hop.',
                edgeIds: [edge.id],
                nodeIds: [source.id, target.id],
                severity: 'ERROR'
            })
        }
        if (source.kind === 'LOAD_BALANCER' && target.kind !== 'PROXY' && target.kind !== 'EXIT') {
            issues.push({
                code: 'INVALID_LOAD_BALANCER_SUCCESSOR',
                message: 'A load balancer must continue to a proxy or Exit.',
                edgeIds: [edge.id],
                nodeIds: [source.id, target.id],
                severity: 'ERROR'
            })
        }
        if (target.kind === 'LOAD_BALANCER' && source.kind !== 'PROXY') {
            issues.push({
                code: 'INVALID_LOAD_BALANCER_MEMBER',
                message: 'Only proxies can be load-balancer members.',
                edgeIds: [edge.id],
                nodeIds: [source.id, target.id],
                severity: 'ERROR'
            })
        }
    }

    for (const loadBalancer of graph.nodes.filter(
        (node): node is TopologyLoadBalancerNode => node.kind === 'LOAD_BALANCER'
    )) {
        const upstreams = incoming.get(loadBalancer.id) ?? []
        const nextHops = outgoing.get(loadBalancer.id) ?? []
        if (upstreams.length < 2 || nextHops.length !== 1) {
            issues.push({
                code: 'LOAD_BALANCER_NEEDS_UPSTREAMS',
                message:
                    'A load balancer needs at least two incoming proxies and exactly one next hop.',
                edgeIds: [...upstreams, ...nextHops].map((edge) => edge.id),
                nodeIds: [loadBalancer.id],
                severity: 'ERROR'
            })
        }
    }

    const proxies = graph.nodes.filter((node): node is TopologyProxyNode => node.kind === 'PROXY')
    if (proxies.length === 0) {
        issues.push({
            code: 'EMPTY_PROXY_SET',
            message: 'Add at least one proxy to the topology.',
            severity: 'ERROR'
        })
    }
    for (const entry of entries) {
        if (
            (incoming.get(entry.id)?.length ?? 0) !== 0 ||
            (outgoing.get(entry.id)?.length ?? 0) < 1
        ) {
            issues.push({
                code: 'INVALID_ENTRY_DEGREE',
                message:
                    'Entry needs at least one outgoing proxy branch and no incoming connection.',
                nodeIds: [entry.id],
                severity: 'ERROR'
            })
        }
    }
    for (const exit of exits) {
        if (
            (incoming.get(exit.id)?.length ?? 0) < 1 ||
            (outgoing.get(exit.id)?.length ?? 0) !== 0
        ) {
            issues.push({
                code: 'INVALID_EXIT_DEGREE',
                message: 'Exit needs at least one incoming connection and no outgoing connection.',
                nodeIds: [exit.id],
                severity: 'ERROR'
            })
        }
    }
    for (const proxy of proxies) {
        if ((outgoing.get(proxy.id)?.length ?? 0) !== 1) {
            issues.push({
                code: 'INVALID_PROXY_DEGREE',
                message: 'Every proxy needs exactly one next hop.',
                nodeIds: [proxy.id],
                severity: 'ERROR'
            })
        }
    }

    const state = new Map<string, 'ACTIVE' | 'DONE'>()
    const path: string[] = []
    const pathEdges: string[] = []

    const visitForCycles = (nodeId: string) => {
        state.set(nodeId, 'ACTIVE')
        path.push(nodeId)

        for (const edge of outgoing.get(nodeId) ?? []) {
            if (!nodeById.has(edge.target)) continue
            if (state.get(edge.target) === 'ACTIVE') {
                const cycleStart = path.indexOf(edge.target)
                issues.push({
                    code: 'CYCLE',
                    message: 'This connection creates a directed cycle.',
                    edgeIds: [...pathEdges.slice(cycleStart), edge.id],
                    nodeIds: [...path.slice(cycleStart), edge.target],
                    severity: 'ERROR'
                })
                continue
            }
            if (state.get(edge.target) !== 'DONE') {
                pathEdges.push(edge.id)
                visitForCycles(edge.target)
                pathEdges.pop()
            }
        }

        path.pop()
        state.set(nodeId, 'DONE')
    }

    for (const node of graph.nodes) {
        if (!state.has(node.id)) visitForCycles(node.id)
    }

    if (!issues.some((issue) => issue.code === 'CYCLE')) {
        const walkServerPaths = (
            nodeId: string,
            serversOnPath: ReadonlyMap<string, string>,
            visitedEdges: ReadonlySet<string>
        ) => {
            const node = nodeById.get(nodeId)
            if (!node) return

            const nextServers = new Map(serversOnPath)
            if (node.kind === 'PROXY') {
                const previousNodeId = nextServers.get(node.nodeUuid)
                if (previousNodeId) {
                    issues.push({
                        code: 'SELF_SERVER_CHAIN',
                        message: 'A chain cannot return to the same physical server.',
                        edgeIds: [...visitedEdges],
                        nodeIds: [previousNodeId, node.id],
                        severity: 'ERROR'
                    })
                    return
                }
                nextServers.set(node.nodeUuid, node.id)
            }

            for (const edge of outgoing.get(nodeId) ?? []) {
                if (visitedEdges.has(edge.id)) continue
                walkServerPaths(edge.target, nextServers, new Set([...visitedEdges, edge.id]))
            }
        }

        const roots = graph.nodes.filter((node) => (incoming.get(node.id) ?? []).length === 0)
        for (const root of roots) walkServerPaths(root.id, new Map(), new Set())

        if (entries.length === 1 && exits.length === 1) {
            const walk = (startId: string, adjacency: ReadonlyMap<string, TopologyEdge[]>) => {
                const visited = new Set<string>()
                const pending = [startId]
                while (pending.length > 0) {
                    const current = pending.pop()!
                    if (visited.has(current)) continue
                    visited.add(current)
                    pending.push(
                        ...(adjacency.get(current) ?? []).map((edge) =>
                            edge.source === current ? edge.target : edge.source
                        )
                    )
                }
                return visited
            }
            const reachableFromEntry = walk(entries[0].id, outgoing)
            const canReachExit = walk(exits[0].id, incoming)
            const disconnected = graph.nodes
                .filter((node) => !reachableFromEntry.has(node.id) || !canReachExit.has(node.id))
                .map((node) => node.id)
            if (disconnected.length > 0) {
                issues.push({
                    code: 'DISCONNECTED_GRAPH',
                    message: 'Every item must be on a path from Entry to Exit.',
                    nodeIds: disconnected,
                    severity: 'ERROR'
                })
            }
        }
    }

    return [...new Map(issues.map((issue) => [issueKey(issue), issue])).values()]
}

const blockingConnectionCodes = new Set<TopologyIssueCode>([
    'CYCLE',
    'DUPLICATE_EDGE',
    'INVALID_ENTRY_TARGET',
    'INVALID_LOAD_BALANCER_MEMBER',
    'INVALID_LOAD_BALANCER_SUCCESSOR',
    'INVALID_PROXY_SUCCESSOR',
    'ENTRY_HAS_INCOMING',
    'EXIT_HAS_OUTGOING',
    'MISSING_NODE',
    'SELF_LOOP',
    'SELF_SERVER_CHAIN'
])

export const tryAddTopologyEdge = (
    graph: TopologyGraph,
    source: string,
    target: string,
    id = createLocalId()
): { graph: TopologyGraph; issues: TopologyIssue[]; ok: boolean } => {
    const nextGraph: TopologyGraph = {
        ...graph,
        edges: [...graph.edges, { id, source, target, order: graph.edges.length }]
    }
    const issues = validateTopologyGraph(nextGraph).filter((issue) =>
        blockingConnectionCodes.has(issue.code)
    )
    const introducedIssue = issues.find(
        (issue) => issue.edgeIds?.includes(id) || issue.code === 'SELF_SERVER_CHAIN'
    )

    return introducedIssue
        ? { graph, issues: [introducedIssue], ok: false }
        : { graph: nextGraph, issues: [], ok: true }
}

export const removeTopologyNode = (graph: TopologyGraph, nodeId: string): TopologyGraph => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId)
    if (!node || node.kind === 'ENTRY' || node.kind === 'EXIT') return graph
    return {
        ...graph,
        nodes: graph.nodes.filter((candidate) => candidate.id !== nodeId),
        edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    }
}

export const reorderTopologyNodes = (
    graph: TopologyGraph,
    activeNodeId: string,
    targetNodeId: string
): TopologyGraph => {
    const activeNode = graph.nodes.find((node) => node.id === activeNodeId)
    const targetNode = graph.nodes.find((node) => node.id === targetNodeId)
    if (
        !activeNode ||
        !targetNode ||
        activeNode.id === targetNode.id ||
        activeNode.kind === 'ENTRY' ||
        activeNode.kind === 'EXIT'
    ) {
        return graph
    }

    const entryNodes = graph.nodes.filter((node) => node.kind === 'ENTRY')
    const exitNodes = graph.nodes.filter((node) => node.kind === 'EXIT')
    const movableNodes = graph.nodes.filter((node) => node.kind !== 'ENTRY' && node.kind !== 'EXIT')
    const activeIndex = movableNodes.findIndex((node) => node.id === activeNodeId)
    const targetIndex =
        targetNode.kind === 'ENTRY'
            ? 0
            : targetNode.kind === 'EXIT'
              ? movableNodes.length - 1
              : movableNodes.findIndex((node) => node.id === targetNodeId)
    if (activeIndex < 0 || targetIndex < 0 || activeIndex === targetIndex) return graph

    const [movedNode] = movableNodes.splice(activeIndex, 1)
    movableNodes.splice(targetIndex, 0, movedNode)
    return withAutoLayout({ ...graph, nodes: [...entryNodes, ...movableNodes, ...exitNodes] })
}

export const getTopologyFormatSupport = (format: TopologyFormat) => {
    if (format === 'MIHOMO' || format === 'SINGBOX') {
        return { supported: true as const }
    }
    return {
        supported: false as const,
        reasonCode: 'STRUCTURED_TOPOLOGY_UNSUPPORTED' as const
    }
}

export const nodeIssueIds = (issues: TopologyIssue[]) =>
    unique(issues.flatMap((issue) => issue.nodeIds ?? []))

export const edgeIssueIds = (issues: TopologyIssue[]) =>
    unique(issues.flatMap((issue) => issue.edgeIds ?? []))
