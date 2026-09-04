import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    createEmptyTopologyGraph,
    createLoadBalancerNode,
    createProxyNode,
    getTopologyFormatSupport,
    reorderTopologyNodes,
    tryAddTopologyEdge,
    validateTopologyGraph,
    type TopologyGraph
} from './topology-graph.ts'

const proxy = (id: string, nodeUuid: string) =>
    createProxyNode(
        {
            hostLabel: `Host ${id}`,
            hostUuid: `host-${id}`,
            nodeLabel: `Server ${nodeUuid}`,
            nodeUuid
        },
        id
    )

const graphWith = (...nodes: TopologyGraph['nodes']): TopologyGraph => ({
    ...createEmptyTopologyGraph(),
    nodes: [createEmptyTopologyGraph().nodes[0], ...nodes, createEmptyTopologyGraph().nodes[1]]
})

describe('topology graph safety', () => {
    it('rejects merging branches directly into a proxy without a load balancer', () => {
        const graph = graphWith(
            proxy('a', 'server-a'),
            proxy('b', 'server-b'),
            proxy('c', 'server-c')
        )
        const entry = graph.nodes.find((node) => node.kind === 'ENTRY')!
        const exit = graph.nodes.find((node) => node.kind === 'EXIT')!
        graph.edges = [
            { id: '1', source: entry.id, target: 'a' },
            { id: '2', source: entry.id, target: 'b' },
            { id: '3', source: 'a', target: 'c' },
            { id: '4', source: 'b', target: 'c' },
            { id: '5', source: 'c', target: exit.id }
        ]
        assert.ok(
            validateTopologyGraph(graph).some((issue) => issue.code === 'INVALID_PROXY_DEGREE')
        )
    })
    it('creates backend-compatible UUID identifiers for a new canvas', () => {
        const graph = createEmptyTopologyGraph()
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

        assert.equal(graph.nodes.length, 2)
        assert.ok(graph.nodes.every((node) => uuidPattern.test(node.id)))
    })

    it('rejects a direct self-loop and identifies the node and edge', () => {
        const graph = graphWith(proxy('a', 'server-a'))
        const result = tryAddTopologyEdge(graph, 'a', 'a', 'self-edge')

        assert.equal(result.ok, false)
        assert.equal(result.graph.edges.length, 0)
        assert.deepEqual(result.issues[0]?.nodeIds, ['a'])
        assert.deepEqual(result.issues[0]?.edgeIds, ['self-edge'])
        assert.equal(result.issues[0]?.code, 'SELF_LOOP')
    })

    it('rejects a directed cycle', () => {
        let graph = graphWith(proxy('a', 'server-a'), proxy('b', 'server-b'))
        graph = tryAddTopologyEdge(graph, 'a', 'b', 'a-b').graph
        const result = tryAddTopologyEdge(graph, 'b', 'a', 'b-a')

        assert.equal(result.ok, false)
        assert.equal(result.issues[0]?.code, 'CYCLE')
        assert.ok(result.issues[0]?.edgeIds?.includes('b-a'))
    })

    it('rejects a chain that returns to the same physical server', () => {
        let graph = graphWith(
            proxy('same-server-first', 'server-a'),
            proxy('middle', 'server-b'),
            proxy('same-server-last', 'server-a')
        )
        graph = tryAddTopologyEdge(graph, 'same-server-first', 'middle', 'first').graph
        const result = tryAddTopologyEdge(graph, 'middle', 'same-server-last', 'second')

        assert.equal(result.ok, false)
        assert.equal(result.issues[0]?.code, 'SELF_SERVER_CHAIN')
        assert.deepEqual(result.issues[0]?.nodeIds, ['same-server-first', 'same-server-last'])
        assert.deepEqual(result.issues[0]?.edgeIds, ['first', 'second'])
    })

    it('accepts many upstream proxies feeding one load balancer', () => {
        const empty = createEmptyTopologyGraph()
        const entry = empty.nodes.find((node) => node.kind === 'ENTRY')!
        const exit = empty.nodes.find((node) => node.kind === 'EXIT')!
        const balancer = createLoadBalancerNode('ROUND_ROBIN', 'lb')
        let graph: TopologyGraph = {
            ...empty,
            nodes: [entry, proxy('a', 'server-a'), proxy('b', 'server-b'), balancer, exit]
        }
        graph = tryAddTopologyEdge(graph, entry.id, 'a', 'entry-a').graph
        graph = tryAddTopologyEdge(graph, entry.id, 'b', 'entry-b').graph
        graph = tryAddTopologyEdge(graph, 'a', 'lb', 'a-lb').graph
        graph = tryAddTopologyEdge(graph, 'b', 'lb', 'b-lb').graph
        const completed = tryAddTopologyEdge(graph, 'lb', exit.id, 'lb-exit')

        assert.equal(completed.ok, true)
        assert.equal(completed.graph.edges.length, 5)
        assert.deepEqual(validateTopologyGraph(completed.graph), [])
    })

    it('reorders canvas nodes without changing connections', () => {
        let graph = graphWith(proxy('a', 'server-a'), proxy('b', 'server-b'))
        graph = tryAddTopologyEdge(graph, 'a', 'b', 'a-b').graph
        const reordered = reorderTopologyNodes(graph, 'b', 'a')

        assert.ok(
            reordered.nodes.findIndex((node) => node.id === 'b') <
                reordered.nodes.findIndex((node) => node.id === 'a')
        )
        assert.deepEqual(reordered.edges, graph.edges)
    })
})

describe('topology format support', () => {
    it('shows Xray JSON and Base64 as structurally unsupported', () => {
        assert.deepEqual(getTopologyFormatSupport('XRAY_JSON'), {
            supported: false,
            reasonCode: 'STRUCTURED_TOPOLOGY_UNSUPPORTED'
        })
        assert.deepEqual(getTopologyFormatSupport('XRAY_BASE64'), {
            supported: false,
            reasonCode: 'STRUCTURED_TOPOLOGY_UNSUPPORTED'
        })
        assert.equal(getTopologyFormatSupport('MIHOMO').supported, true)
        assert.equal(getTopologyFormatSupport('SINGBOX').supported, true)
    })
})
