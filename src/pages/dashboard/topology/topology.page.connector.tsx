import { DragDropProvider, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import {
    createEmptyTopologyGraph,
    createLoadBalancerNode,
    createProxyNode,
    edgeIssueIds,
    getTopologyFormatSupport,
    LOAD_BALANCER_STRATEGIES,
    nodeIssueIds,
    removeTopologyNode,
    reorderTopologyNodes,
    TOPOLOGY_FORMATS,
    tryAddTopologyEdge,
    validateTopologyGraph,
    withAutoLayout,
    type LoadBalancerStrategy,
    type ProxyResource,
    type TopologyGraph,
    type TopologyLoadBalancerNode,
    type TopologyNode
} from '@features/dashboard/topology/lib/topology-graph'
import {
    getTopologyMutationRevision,
    type TopologyRevision
} from '@features/dashboard/topology/lib/topology-revision'
import {
    Accordion,
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Card,
    Code,
    Divider,
    Grid,
    Group,
    Loader,
    NumberInput,
    Paper,
    ScrollArea,
    Select,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    TextInput,
    ThemeIcon,
    Tooltip
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    TbArrowRight,
    TbArrowsMove,
    TbChevronLeft,
    TbChevronRight,
    TbCirclePlus,
    TbDeviceFloppy,
    TbEye,
    TbLink,
    TbPlus,
    TbRefresh,
    TbScale,
    TbServer,
    TbTrash,
    TbUnlink
} from 'react-icons/tb'

import {
    isTopologyVersionConflict,
    topologyGraphSchema,
    useCreateTopology,
    useDeleteTopology,
    useGetHosts,
    useGetNodes,
    useGetTopologies,
    useGetTopology,
    usePreviewTopology,
    useUpdateTopology,
    useValidateTopology,
    type SubscriptionTopology,
    type TopologyPreview,
    type TopologyServerIssue
} from '@shared/api/hooks'
import { LoadingScreen, Page, PageHeaderShared } from '@shared/ui'

import classes from './TopologyPage.module.css'

type DragData =
    | { dragKind: 'CANVAS_NODE'; nodeId: string }
    | { dragKind: 'RESOURCE'; resource: ProxyResource }

const kindColor: Record<TopologyNode['kind'], string> = {
    ENTRY: 'blue',
    EXIT: 'gray',
    LOAD_BALANCER: 'violet',
    PROXY: 'teal'
}

const formatLabels = {
    MIHOMO: 'Mihomo',
    SINGBOX: 'sing-box',
    XRAY_JSON: 'Xray JSON',
    XRAY_BASE64: 'Base64'
} as const

interface PaletteResourceCardProps {
    groupBy?: 'HOST' | 'NODE'
    resource: ProxyResource
    onAdd: (resource: ProxyResource) => void
}

function PaletteResourceCard({ resource, onAdd, groupBy = 'HOST' }: PaletteResourceCardProps) {
    const { t } = useTranslation()
    const { ref, handleRef, isDragging } = useDraggable<DragData>({
        id: `resource:${resource.hostUuid}:${resource.nodeUuid}`,
        data: { dragKind: 'RESOURCE', resource }
    })
    const primaryLabel = groupBy === 'HOST' ? resource.hostLabel : resource.nodeLabel
    const secondaryLabel = groupBy === 'HOST' ? resource.nodeLabel : resource.hostLabel

    return (
        <Paper
            className={classes.paletteItem}
            opacity={isDragging ? 0.45 : 1}
            p="xs"
            ref={ref}
            withBorder
        >
            <Group align="flex-start" gap="xs" justify="space-between" wrap="nowrap">
                <Box className={classes.resourceText}>
                    <Text fw={600} lineClamp={1} size="sm">
                        {primaryLabel}
                    </Text>
                    <Text c="dimmed" lineClamp={1} size="xs">
                        {secondaryLabel}
                    </Text>
                </Box>
                <Group gap={4} wrap="nowrap">
                    <Tooltip label={t('topology.actions.drag-to-canvas')}>
                        <ActionIcon
                            aria-label={t('topology.actions.drag-resource', {
                                name: resource.hostLabel
                            })}
                            ref={handleRef}
                            variant="subtle"
                        >
                            <TbArrowsMove size={17} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t('topology.actions.add-to-canvas')}>
                        <ActionIcon
                            aria-label={t('topology.actions.add-resource', {
                                name: resource.hostLabel
                            })}
                            onClick={() => onAdd(resource)}
                            variant="light"
                        >
                            <TbPlus size={17} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
        </Paper>
    )
}

interface CanvasNodeCardProps {
    allNodes: TopologyNode[]
    hasIssue: boolean
    incomingEdges: TopologyGraph['edges']
    index: number
    node: TopologyNode
    onAddEdge: (source: string, target: string) => void
    onMove: (nodeId: string, direction: -1 | 1) => void
    onRemove: (nodeId: string) => void
    onRemoveEdge: (edgeId: string) => void
    onUpdateLoadBalancer: (node: TopologyLoadBalancerNode) => void
    outgoingEdges: TopologyGraph['edges']
}

function CanvasNodeCard({
    allNodes,
    hasIssue,
    incomingEdges,
    index,
    node,
    onAddEdge,
    onMove,
    onRemove,
    onRemoveEdge,
    onUpdateLoadBalancer,
    outgoingEdges
}: CanvasNodeCardProps) {
    const { t } = useTranslation()
    const [targetId, setTargetId] = useState<null | string>(null)
    const isFixed = node.kind === 'ENTRY' || node.kind === 'EXIT'
    const { ref, handleRef, isDragging, isDropTarget } = useSortable<DragData>({
        id: node.id,
        index,
        group: 'topology-canvas',
        data: { dragKind: 'CANVAS_NODE', nodeId: node.id },
        disabled: { draggable: isFixed, droppable: false },
        transition: { idle: true }
    })
    const { ref: memberDropRef, isDropTarget: isMemberDropTarget } = useDroppable({
        id: `load-balancer-members:${node.id}`,
        disabled: node.kind !== 'LOAD_BALANCER'
    })

    const existingTargets = new Set(outgoingEdges.map((edge) => edge.target))
    const canHaveAnotherNextHop = node.kind === 'ENTRY' || outgoingEdges.length === 0
    const isAllowedTarget = (candidate: TopologyNode) => {
        if (node.kind === 'ENTRY') return candidate.kind === 'PROXY'
        if (node.kind === 'PROXY') {
            return (
                candidate.kind === 'PROXY' ||
                candidate.kind === 'LOAD_BALANCER' ||
                candidate.kind === 'EXIT'
            )
        }
        if (node.kind === 'LOAD_BALANCER') {
            return candidate.kind === 'PROXY' || candidate.kind === 'EXIT'
        }
        return false
    }
    const targetOptions = (canHaveAnotherNextHop ? allNodes : [])
        .filter(
            (candidate) =>
                candidate.id !== node.id &&
                isAllowedTarget(candidate) &&
                !existingTargets.has(candidate.id)
        )
        .map((candidate) => ({ value: candidate.id, label: candidate.label }))

    const displayLabel =
        node.kind === 'ENTRY'
            ? t('topology.node.entry')
            : node.kind === 'EXIT'
              ? t('topology.node.exit')
              : node.label

    return (
        <Card
            className={classes.canvasNode}
            data-node-id={node.id}
            opacity={isDragging ? 0.45 : 1}
            p="sm"
            ref={ref}
            shadow={isDropTarget ? 'lg' : 'sm'}
            style={{
                borderColor: hasIssue
                    ? 'var(--mantine-color-red-6)'
                    : isDropTarget
                      ? 'var(--mantine-primary-color-filled)'
                      : undefined
            }}
            withBorder
        >
            <Stack gap="xs">
                <Group gap="xs" justify="space-between" wrap="nowrap">
                    <Group gap="xs" miw={0} wrap="nowrap">
                        <ThemeIcon color={kindColor[node.kind]} size="md" variant="light">
                            {node.kind === 'LOAD_BALANCER' ? (
                                <TbScale size={16} />
                            ) : node.kind === 'PROXY' ? (
                                <TbServer size={16} />
                            ) : (
                                <TbArrowRight size={16} />
                            )}
                        </ThemeIcon>
                        <Box miw={0}>
                            <Text fw={600} lineClamp={2} size="sm">
                                {displayLabel}
                            </Text>
                            <Badge color={kindColor[node.kind]} size="xs" variant="light">
                                {t(`topology.node.kind.${node.kind}`)}
                            </Badge>
                        </Box>
                    </Group>
                    {!isFixed && (
                        <Group gap={2} wrap="nowrap">
                            <Tooltip label={t('topology.actions.move-left')}>
                                <ActionIcon
                                    aria-label={t('topology.actions.move-node-left', {
                                        name: node.label
                                    })}
                                    onClick={() => onMove(node.id, -1)}
                                    size="sm"
                                    variant="subtle"
                                >
                                    <TbChevronLeft size={15} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t('topology.actions.drag-to-reorder')}>
                                <ActionIcon
                                    aria-label={t('topology.actions.drag-node', {
                                        name: node.label
                                    })}
                                    ref={handleRef}
                                    size="sm"
                                    variant="subtle"
                                >
                                    <TbArrowsMove size={15} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t('topology.actions.move-right')}>
                                <ActionIcon
                                    aria-label={t('topology.actions.move-node-right', {
                                        name: node.label
                                    })}
                                    onClick={() => onMove(node.id, 1)}
                                    size="sm"
                                    variant="subtle"
                                >
                                    <TbChevronRight size={15} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t('common.action.delete')}>
                                <ActionIcon
                                    aria-label={t('topology.actions.delete-node', {
                                        name: node.label
                                    })}
                                    color="red"
                                    onClick={() => onRemove(node.id)}
                                    size="sm"
                                    variant="subtle"
                                >
                                    <TbTrash size={15} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    )}
                </Group>

                {node.kind === 'PROXY' && (
                    <Stack gap={2}>
                        <Text c="dimmed" ff="monospace" lineClamp={1} size="xs">
                            Host: {node.hostUuid}
                        </Text>
                        <Text c="dimmed" ff="monospace" lineClamp={1} size="xs">
                            Server: {node.nodeUuid}
                        </Text>
                    </Stack>
                )}

                {node.kind === 'LOAD_BALANCER' && (
                    <Stack gap="xs">
                        <Paper
                            className={classes.memberDropZone}
                            data-drop-target={isMemberDropTarget || undefined}
                            p="xs"
                            ref={memberDropRef}
                            withBorder
                        >
                            <Group gap="xs" justify="space-between" wrap="nowrap">
                                <Text c="dimmed" size="xs">
                                    {t('topology.canvas.drop-members')}
                                </Text>
                                <Badge size="xs" variant="light">
                                    {t('topology.labels.member-count', {
                                        count: incomingEdges.length
                                    })}
                                </Badge>
                            </Group>
                        </Paper>
                        <Select
                            allowDeselect={false}
                            data={LOAD_BALANCER_STRATEGIES.map((strategy) => ({
                                value: strategy,
                                label: t(`topology.strategy.${strategy}`)
                            }))}
                            label={t('topology.fields.strategy')}
                            onChange={(value) => {
                                if (!value) return
                                const strategy = value as LoadBalancerStrategy
                                onUpdateLoadBalancer({
                                    ...node,
                                    strategy,
                                    ...(strategy !== 'SELECTOR'
                                        ? {
                                              testUrl:
                                                  node.testUrl ??
                                                  'https://www.gstatic.com/generate_204',
                                              intervalSeconds: node.intervalSeconds ?? 300
                                          }
                                        : { testUrl: undefined, intervalSeconds: undefined })
                                })
                            }}
                            size="xs"
                            value={node.strategy}
                        />
                        {node.strategy !== 'SELECTOR' && (
                            <>
                                <TextInput
                                    label={t('topology.fields.test-url')}
                                    onChange={(event) =>
                                        onUpdateLoadBalancer({
                                            ...node,
                                            testUrl: event.currentTarget.value
                                        })
                                    }
                                    size="xs"
                                    value={node.testUrl ?? ''}
                                />
                                <NumberInput
                                    allowDecimal={false}
                                    label={t('topology.fields.interval')}
                                    min={10}
                                    onChange={(value) =>
                                        onUpdateLoadBalancer({
                                            ...node,
                                            intervalSeconds: typeof value === 'number' ? value : 300
                                        })
                                    }
                                    size="xs"
                                    value={node.intervalSeconds ?? 300}
                                />
                            </>
                        )}
                    </Stack>
                )}

                {node.kind !== 'EXIT' && (
                    <Group align="flex-end" gap={6} wrap="nowrap">
                        <Select
                            aria-label={t('topology.fields.next-hop')}
                            className={classes.targetSelect}
                            clearable
                            data={targetOptions}
                            label={t('topology.fields.next-hop')}
                            onChange={setTargetId}
                            placeholder={t('topology.placeholders.choose-next-hop')}
                            searchable
                            size="xs"
                            value={targetId}
                        />
                        <Tooltip label={t('topology.actions.connect')}>
                            <ActionIcon
                                aria-label={t('topology.actions.connect-node', {
                                    name: displayLabel
                                })}
                                disabled={!targetId}
                                onClick={() => {
                                    if (!targetId) return
                                    onAddEdge(node.id, targetId)
                                    setTargetId(null)
                                }}
                                size="lg"
                                variant="light"
                            >
                                <TbLink size={17} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                )}

                {outgoingEdges.length > 0 && (
                    <Stack gap={4}>
                        <Text c="dimmed" size="xs">
                            {t('topology.labels.outgoing')}
                        </Text>
                        {outgoingEdges.map((edge) => {
                            const target = allNodes.find(
                                (candidate) => candidate.id === edge.target
                            )
                            return (
                                <Group gap={4} justify="space-between" key={edge.id} wrap="nowrap">
                                    <Group gap={4} miw={0} wrap="nowrap">
                                        <TbArrowRight size={14} />
                                        <Text lineClamp={1} size="xs">
                                            {target?.kind === 'EXIT'
                                                ? t('topology.node.exit')
                                                : (target?.label ?? edge.target)}
                                        </Text>
                                    </Group>
                                    <ActionIcon
                                        aria-label={t('topology.actions.delete-connection')}
                                        color="red"
                                        onClick={() => onRemoveEdge(edge.id)}
                                        size="xs"
                                        variant="subtle"
                                    >
                                        <TbUnlink size={13} />
                                    </ActionIcon>
                                </Group>
                            )
                        })}
                    </Stack>
                )}
            </Stack>
        </Card>
    )
}

interface TopologyCanvasProps {
    graph: TopologyGraph
    issueNodeIds: Set<string>
    onAddEdge: (source: string, target: string) => void
    onMove: (nodeId: string, direction: -1 | 1) => void
    onRemoveEdge: (edgeId: string) => void
    onRemoveNode: (nodeId: string) => void
    onUpdateLoadBalancer: (node: TopologyLoadBalancerNode) => void
}

function TopologyCanvas({
    graph,
    issueNodeIds,
    onAddEdge,
    onMove,
    onRemoveEdge,
    onRemoveNode,
    onUpdateLoadBalancer
}: TopologyCanvasProps) {
    const { t } = useTranslation()
    const { ref, isDropTarget } = useDroppable({ id: 'topology-canvas' })

    return (
        <Box
            aria-label={t('topology.canvas.aria-label')}
            className={classes.canvas}
            data-drop-target={isDropTarget || undefined}
            ref={ref}
            role="region"
            tabIndex={0}
        >
            <div className={classes.canvasRail}>
                {graph.nodes.map((node, index) => (
                    <CanvasNodeCard
                        allNodes={graph.nodes}
                        hasIssue={issueNodeIds.has(node.id)}
                        incomingEdges={graph.edges.filter((edge) => edge.target === node.id)}
                        index={index}
                        key={node.id}
                        node={node}
                        onAddEdge={onAddEdge}
                        onMove={onMove}
                        onRemove={onRemoveNode}
                        onRemoveEdge={onRemoveEdge}
                        onUpdateLoadBalancer={onUpdateLoadBalancer}
                        outgoingEdges={graph.edges.filter((edge) => edge.source === node.id)}
                    />
                ))}
            </div>
        </Box>
    )
}

function PreviewResults({ preview }: { preview: null | TopologyPreview }) {
    const { t } = useTranslation()

    return (
        <Accordion multiple variant="separated">
            {TOPOLOGY_FORMATS.map((format) => {
                const result = preview?.results.find((candidate) => candidate.format === format)
                const localSupport = getTopologyFormatSupport(format)
                const status = result?.status ?? (localSupport.supported ? 'READY' : 'UNSUPPORTED')
                const badgeColor =
                    status === 'SUPPORTED' || status === 'READY'
                        ? 'teal'
                        : status === 'UNSUPPORTED'
                          ? 'gray'
                          : 'red'

                return (
                    <Accordion.Item key={format} value={format}>
                        <Accordion.Control>
                            <Group justify="space-between" pr="md" wrap="nowrap">
                                <Text fw={600} size="sm">
                                    {formatLabels[format]}
                                </Text>
                                <Badge color={badgeColor} size="sm" variant="light">
                                    {t(`topology.preview.status.${status}`)}
                                </Badge>
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            {result?.status === 'SUPPORTED' ? (
                                <ScrollArea h={300} type="auto">
                                    <Code block>{JSON.stringify(result.artifact, null, 2)}</Code>
                                </ScrollArea>
                            ) : (
                                <Text c="dimmed" size="sm">
                                    {result
                                        ? result.message
                                        : localSupport.supported
                                          ? t('topology.preview.run-to-see')
                                          : t('topology.preview.structured-unsupported')}
                                </Text>
                            )}
                        </Accordion.Panel>
                    </Accordion.Item>
                )
            })}
        </Accordion>
    )
}

const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Request failed with an unknown error.'

export function TopologyPageConnector() {
    const { t } = useTranslation()
    const { data: hosts, isLoading: isHostsLoading } = useGetHosts()
    const { data: nodes, isLoading: isNodesLoading } = useGetNodes()
    const {
        data: topologyList,
        error: listError,
        isLoading: isTopologiesLoading
    } = useGetTopologies()
    const [selectedUuid, setSelectedUuid] = useState<null | string>(null)
    const {
        data: selectedTopology,
        isLoading: isSelectedTopologyLoading,
        refetch: refetchSelected
    } = useGetTopology(selectedUuid)
    const createTopology = useCreateTopology()
    const updateTopology = useUpdateTopology()
    const deleteTopology = useDeleteTopology()
    const validateTopology = useValidateTopology()
    const previewTopology = usePreviewTopology()

    const [name, setName] = useState('')
    const [loadedIsPublished, setLoadedIsPublished] = useState(false)
    const [graph, setGraph] = useState<TopologyGraph>(() => createEmptyTopologyGraph())
    const [isDirty, setIsDirty] = useState(false)
    const [hasConflict, setHasConflict] = useState(false)
    const [serverIssues, setServerIssues] = useState<TopologyServerIssue[]>([])
    const [preview, setPreview] = useState<null | TopologyPreview>(null)
    const [resourceSearch, setResourceSearch] = useState('')
    const loadedVersionRef = useRef<TopologyRevision | null>(null)

    const nodesByUuid = useMemo(
        () => new Map((nodes ?? []).map((node) => [node.uuid, node])),
        [nodes]
    )
    const proxyResources = useMemo(
        () =>
            (hosts ?? []).flatMap((host) =>
                host.nodes.flatMap((nodeUuid) => {
                    const node = nodesByUuid.get(nodeUuid)
                    if (!node) return []
                    return [
                        {
                            hostUuid: host.uuid,
                            hostLabel: host.remark,
                            nodeUuid: node.uuid,
                            nodeLabel: node.name
                        } satisfies ProxyResource
                    ]
                })
            ),
        [hosts, nodesByUuid]
    )

    const filteredResources = useMemo(() => {
        const query = resourceSearch.trim().toLocaleLowerCase()
        if (!query) return proxyResources
        return proxyResources.filter((resource) =>
            `${resource.hostLabel} ${resource.nodeLabel}`.toLocaleLowerCase().includes(query)
        )
    }, [proxyResources, resourceSearch])

    const localIssues = useMemo(() => validateTopologyGraph(graph), [graph])
    const allIssueNodeIds = useMemo(
        () =>
            new Set([
                ...nodeIssueIds(localIssues),
                ...serverIssues.flatMap((issue) => issue.nodeIds ?? [])
            ]),
        [localIssues, serverIssues]
    )
    const allIssueEdgeIds = useMemo(
        () =>
            new Set([
                ...edgeIssueIds(localIssues),
                ...serverIssues.flatMap((issue) => issue.edgeIds ?? [])
            ]),
        [localIssues, serverIssues]
    )

    const loadTopology = (topology: SubscriptionTopology) => {
        setName(topology.name)
        setLoadedIsPublished(topology.isPublished)
        setGraph(topology.graph)
        setIsDirty(false)
        setHasConflict(false)
        setServerIssues([])
        setPreview(null)
        loadedVersionRef.current = { uuid: topology.uuid, version: topology.version }
    }

    useEffect(() => {
        if (!selectedTopology || selectedTopology.uuid !== selectedUuid) return
        const loaded = loadedVersionRef.current
        if (loaded?.uuid === selectedTopology.uuid && loaded.version === selectedTopology.version)
            return
        if (isDirty && loaded?.uuid === selectedTopology.uuid) {
            setHasConflict(true)
            return
        }
        loadTopology(selectedTopology)
    }, [selectedTopology, selectedUuid])

    useEffect(() => {
        if (!isDirty) return
        const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
            event.preventDefault()
        }
        window.addEventListener('beforeunload', warnBeforeLeaving)
        return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
    }, [isDirty])

    const updateGraph = (updater: (current: TopologyGraph) => TopologyGraph) => {
        setGraph((current) => updater(current))
        setIsDirty(true)
        setHasConflict(false)
        setServerIssues([])
        setPreview(null)
    }

    const addResource = (resource: ProxyResource, targetNodeId?: string) => {
        const duplicate = graph.nodes.some(
            (node) =>
                node.kind === 'PROXY' &&
                node.hostUuid === resource.hostUuid &&
                node.nodeUuid === resource.nodeUuid
        )
        if (duplicate) {
            notifications.show({
                color: 'orange',
                title: t('topology.messages.duplicate-resource-title'),
                message: t('topology.messages.duplicate-resource')
            })
            return
        }
        updateGraph((current) => {
            let nextNode = createProxyNode(resource)
            if (current.nodes.some((node) => node.label === nextNode.label)) {
                const suffix = resource.nodeUuid.slice(0, 6)
                nextNode = {
                    ...nextNode,
                    label: `${nextNode.label.slice(0, 56)} · ${suffix}`
                }
            }
            const nodes = [...current.nodes]
            const targetIndex = targetNodeId
                ? nodes.findIndex((node) => node.id === targetNodeId)
                : nodes.findIndex((node) => node.kind === 'EXIT')
            nodes.splice(targetIndex < 0 ? nodes.length : targetIndex, 0, nextNode)
            return withAutoLayout({ ...current, nodes })
        })
    }

    const addResourceToLoadBalancer = (resource: ProxyResource, loadBalancerId: string) => {
        const duplicate = graph.nodes.some(
            (node) =>
                node.kind === 'PROXY' &&
                node.hostUuid === resource.hostUuid &&
                node.nodeUuid === resource.nodeUuid
        )
        if (duplicate) {
            notifications.show({
                color: 'orange',
                title: t('topology.messages.duplicate-resource-title'),
                message: t('topology.messages.duplicate-resource')
            })
            return
        }
        updateGraph((current) => {
            let nextNode = createProxyNode(resource)
            if (current.nodes.some((node) => node.label === nextNode.label)) {
                const suffix = resource.nodeUuid.slice(0, 6)
                nextNode = {
                    ...nextNode,
                    label: `${nextNode.label.slice(0, 56)} · ${suffix}`
                }
            }
            const nodes = [...current.nodes]
            const loadBalancerIndex = nodes.findIndex((node) => node.id === loadBalancerId)
            nodes.splice(loadBalancerIndex < 0 ? nodes.length : loadBalancerIndex, 0, nextNode)
            const withNode = withAutoLayout({ ...current, nodes })
            return tryAddTopologyEdge(withNode, nextNode.id, loadBalancerId).graph
        })
    }

    const addLoadBalancer = () => {
        updateGraph((current) => {
            const nodes = [...current.nodes]
            const exitIndex = nodes.findIndex((node) => node.kind === 'EXIT')
            const loadBalancerCount = nodes.filter((node) => node.kind === 'LOAD_BALANCER').length
            const loadBalancer = createLoadBalancerNode()
            loadBalancer.label = t('topology.node.load-balancer-numbered', {
                number: loadBalancerCount + 1
            })
            nodes.splice(exitIndex < 0 ? nodes.length : exitIndex, 0, loadBalancer)
            return withAutoLayout({ ...current, nodes })
        })
    }

    const handleDragEnd = (event: DragEndEvent) => {
        if (event.canceled) return
        const data = event.operation.source?.data as DragData | undefined
        const targetId = event.operation.target?.id?.toString()
        if (!data || !targetId) return
        if (targetId.startsWith('load-balancer-members:')) {
            const loadBalancerId = targetId.slice('load-balancer-members:'.length)
            if (data.dragKind === 'RESOURCE') {
                addResourceToLoadBalancer(data.resource, loadBalancerId)
                return
            }
            const sourceNode = graph.nodes.find((node) => node.id === data.nodeId)
            if (sourceNode?.kind !== 'PROXY') return
            if (graph.edges.some((edge) => edge.source === sourceNode.id)) {
                notifications.show({
                    color: 'orange',
                    title: t('topology.messages.connection-rejected'),
                    message: t('topology.messages.proxy-next-hop-exists')
                })
                return
            }
            addEdge(sourceNode.id, loadBalancerId)
            return
        }
        if (data.dragKind === 'RESOURCE') {
            addResource(data.resource, targetId === 'topology-canvas' ? undefined : targetId)
            return
        }
        if (targetId !== 'topology-canvas') {
            updateGraph((current) => reorderTopologyNodes(current, data.nodeId, targetId))
        }
    }

    const addEdge = (source: string, target: string) => {
        const sourceNode = graph.nodes.find((node) => node.id === source)
        if (
            sourceNode &&
            sourceNode.kind !== 'ENTRY' &&
            graph.edges.some((edge) => edge.source === source)
        ) {
            notifications.show({
                color: 'orange',
                title: t('topology.messages.connection-rejected'),
                message: t('topology.messages.next-hop-exists')
            })
            return
        }
        const result = tryAddTopologyEdge(graph, source, target)
        if (!result.ok) {
            notifications.show({
                color: 'red',
                title: t('topology.messages.connection-rejected'),
                message: t(`topology.issue.${result.issues[0]?.code ?? 'CYCLE'}`)
            })
            return
        }
        updateGraph(() => result.graph)
    }

    const moveNode = (nodeId: string, direction: -1 | 1) => {
        const index = graph.nodes.findIndex((node) => node.id === nodeId)
        const target = graph.nodes[index + direction]
        if (!target || target.kind === 'ENTRY' || target.kind === 'EXIT') return
        updateGraph((current) => reorderTopologyNodes(current, nodeId, target.id))
    }

    const startNew = () => {
        setSelectedUuid(null)
        setLoadedIsPublished(false)
        setName('')
        setGraph(createEmptyTopologyGraph())
        setIsDirty(false)
        setHasConflict(false)
        setServerIssues([])
        setPreview(null)
        loadedVersionRef.current = null
    }

    const handleSelectTopology = (uuid: null | string) => {
        if (uuid === selectedUuid) return
        setSelectedUuid(uuid)
        setLoadedIsPublished(false)
        setIsDirty(false)
        setHasConflict(false)
        setServerIssues([])
        setPreview(null)
        loadedVersionRef.current = null
    }

    const confirmDiscardChanges = (onConfirm: () => void) => {
        if (!isDirty) {
            onConfirm()
            return
        }
        modals.openConfirmModal({
            title: t('topology.discard.title'),
            children: <Text size="sm">{t('topology.discard.message')}</Text>,
            labels: {
                confirm: t('topology.discard.confirm'),
                cancel: t('common.action.cancel')
            },
            confirmProps: { color: 'orange' },
            onConfirm
        })
    }

    const handleSave = async () => {
        if (selectedUuid && !selectedTopology) {
            notifications.show({
                color: 'orange',
                title: t('topology.messages.cannot-save'),
                message: t('topology.messages.wait-for-load')
            })
            return
        }
        if (name.trim().length < 2 || name.trim().length > 100) {
            notifications.show({
                color: 'red',
                title: t('topology.messages.cannot-save'),
                message: t('topology.messages.name-required')
            })
            return
        }
        const blockingIssues = localIssues.filter((issue) => issue.severity === 'ERROR')
        if (blockingIssues.length > 0 || !topologyGraphSchema.safeParse(graph).success) {
            notifications.show({
                color: 'red',
                title: t('topology.messages.cannot-save'),
                message: t('topology.messages.fix-errors')
            })
            return
        }

        try {
            const revision = selectedUuid
                ? getTopologyMutationRevision(selectedUuid, loadedVersionRef.current)
                : null
            const validation = await validateTopology.mutateAsync(graph)
            setServerIssues(validation.issues)
            if (!validation.valid) {
                notifications.show({
                    color: 'red',
                    title: t('topology.messages.server-rejected'),
                    message: t('topology.messages.fix-server-errors')
                })
                return
            }

            const saved = revision
                ? await updateTopology.mutateAsync({
                      uuid: revision.uuid,
                      expectedVersion: revision.version,
                      name: name.trim(),
                      graph
                  })
                : await createTopology.mutateAsync({ name: name.trim(), graph })
            setSelectedUuid(saved.uuid)
            loadTopology(saved)
            notifications.show({
                color: 'teal',
                title: t('topology.messages.saved-title'),
                message: t('topology.messages.saved')
            })
        } catch (error) {
            if (isTopologyVersionConflict(error)) {
                setHasConflict(true)
                notifications.show({
                    color: 'orange',
                    title: t('topology.conflict.title'),
                    message: t('topology.conflict.message')
                })
                return
            }
            notifications.show({
                color: 'red',
                title: t('topology.messages.cannot-save'),
                message: errorMessage(error)
            })
        }
    }

    const handlePublication = async () => {
        if (!selectedUuid || isDirty || hasConflict) return
        try {
            const revision = getTopologyMutationRevision(selectedUuid, loadedVersionRef.current)
            const saved = await updateTopology.mutateAsync({
                uuid: revision.uuid,
                expectedVersion: revision.version,
                isPublished: !loadedIsPublished
            })
            loadTopology(saved)
            notifications.show({
                color: 'teal',
                title: t(
                    saved.isPublished
                        ? 'topology.publication.published'
                        : 'topology.publication.draft'
                ),
                message: t('topology.publication.next-refresh')
            })
        } catch (error) {
            if (isTopologyVersionConflict(error)) setHasConflict(true)
            notifications.show({
                color: 'red',
                title: t('topology.messages.cannot-save'),
                message: isTopologyVersionConflict(error)
                    ? t('topology.conflict.message')
                    : errorMessage(error)
            })
        }
    }

    const handleReloadLatest = async () => {
        const result = await refetchSelected()
        if (result.data) loadTopology(result.data)
    }

    const handleDelete = () => {
        if (!selectedTopology) return
        const revision = getTopologyMutationRevision(
            selectedTopology.uuid,
            loadedVersionRef.current
        )
        modals.openConfirmModal({
            title: t('topology.delete.title'),
            children: <Text size="sm">{t('topology.delete.message')}</Text>,
            labels: {
                confirm: t('common.action.delete'),
                cancel: t('common.action.cancel')
            },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteTopology.mutateAsync({
                        uuid: revision.uuid,
                        expectedVersion: revision.version
                    })
                    startNew()
                    notifications.show({
                        color: 'teal',
                        title: t('topology.messages.deleted-title'),
                        message: t('topology.messages.deleted')
                    })
                } catch (error) {
                    if (isTopologyVersionConflict(error)) {
                        setHasConflict(true)
                        return
                    }
                    notifications.show({
                        color: 'red',
                        title: t('topology.messages.delete-failed'),
                        message: errorMessage(error)
                    })
                }
            }
        })
    }

    const handlePreview = async () => {
        if (!topologyGraphSchema.safeParse(graph).success) {
            notifications.show({
                color: 'orange',
                title: t('topology.preview.not-ready-title'),
                message: t('topology.preview.not-ready')
            })
            return
        }
        try {
            const nextPreview = await previewTopology.mutateAsync({
                graph,
                formats: [...TOPOLOGY_FORMATS]
            })
            setPreview(nextPreview)
            setServerIssues(nextPreview.issues)
        } catch (error) {
            notifications.show({
                color: 'red',
                title: t('topology.preview.failed'),
                message: errorMessage(error)
            })
        }
    }

    const issueRows = [
        ...localIssues.map((issue) => ({ ...issue, source: 'LOCAL' as const })),
        ...serverIssues.map((issue) => ({
            ...issue,
            severity: 'ERROR' as const,
            source: 'SERVER' as const
        }))
    ]

    const isLoading = isHostsLoading || isNodesLoading || isTopologiesLoading
    const isSaving =
        createTopology.isPending || updateTopology.isPending || validateTopology.isPending

    return (
        <Page title={t('topology.title')}>
            <PageHeaderShared
                actions={
                    <Group gap="xs" wrap="wrap">
                        <Button
                            leftSection={<TbCirclePlus size={17} />}
                            onClick={() => confirmDiscardChanges(startNew)}
                            variant="light"
                        >
                            {t('topology.actions.new')}
                        </Button>
                        <Button
                            leftSection={<TbEye size={17} />}
                            loading={previewTopology.isPending}
                            onClick={handlePreview}
                            variant="light"
                        >
                            {t('topology.actions.preview')}
                        </Button>
                        <Button
                            leftSection={<TbDeviceFloppy size={17} />}
                            loading={isSaving}
                            onClick={handleSave}
                            disabled={Boolean(selectedUuid && isSelectedTopologyLoading)}
                        >
                            {t('common.action.save')}
                        </Button>
                        <Button
                            color={loadedIsPublished ? 'orange' : 'teal'}
                            disabled={
                                !selectedTopology ||
                                isSelectedTopologyLoading ||
                                isDirty ||
                                hasConflict ||
                                isSaving
                            }
                            onClick={handlePublication}
                            variant="light"
                        >
                            {t(
                                loadedIsPublished
                                    ? 'topology.publication.unpublish'
                                    : 'topology.publication.publish'
                            )}
                        </Button>
                    </Group>
                }
                description={t('topology.description')}
                icon={<TbLink size={24} />}
                title={t('topology.title')}
                wrapActions
            />

            {isLoading ? (
                <LoadingScreen height="60vh" />
            ) : (
                <DragDropProvider onDragEnd={handleDragEnd}>
                    <Stack gap="md">
                        {listError && (
                            <Alert color="red" title={t('topology.messages.load-failed')}>
                                {errorMessage(listError)}
                            </Alert>
                        )}
                        <Alert
                            color={loadedIsPublished ? 'teal' : 'blue'}
                            title={t(
                                loadedIsPublished
                                    ? 'topology.publication.published'
                                    : 'topology.publication.draft'
                            )}
                        >
                            <Text size="sm">{t('topology.publication.help')}</Text>
                            <Text mt="xs" size="sm">
                                {t('topology.publication.binding')}
                            </Text>
                            <Text mt="xs" size="sm">
                                {t('topology.publication.formats')}
                            </Text>
                        </Alert>
                        {hasConflict && (
                            <Alert
                                color="orange"
                                title={t('topology.conflict.title')}
                                variant="light"
                            >
                                <Stack gap="xs">
                                    <Text size="sm">{t('topology.conflict.message')}</Text>
                                    <Button
                                        leftSection={<TbRefresh size={16} />}
                                        onClick={handleReloadLatest}
                                        size="xs"
                                        variant="light"
                                        w="fit-content"
                                    >
                                        {t('topology.conflict.reload')}
                                    </Button>
                                </Stack>
                            </Alert>
                        )}

                        <Card p="md" withBorder>
                            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                                <Select
                                    clearable
                                    data={(topologyList?.topologies ?? []).map((topology) => ({
                                        value: topology.uuid,
                                        label: topology.name
                                    }))}
                                    label={t('topology.fields.saved-topology')}
                                    onChange={(uuid) =>
                                        confirmDiscardChanges(() =>
                                            uuid ? handleSelectTopology(uuid) : startNew()
                                        )
                                    }
                                    placeholder={t('topology.placeholders.new-topology')}
                                    searchable
                                    value={selectedUuid}
                                />
                                <TextInput
                                    label={t('topology.fields.name')}
                                    onChange={(event) => {
                                        setName(event.currentTarget.value)
                                        setIsDirty(true)
                                    }}
                                    placeholder={t('topology.placeholders.name')}
                                    maxLength={100}
                                    required
                                    value={name}
                                />
                                <Group align="flex-end" justify="space-between">
                                    <Group gap="xs">
                                        {selectedTopology && (
                                            <Badge variant="light">
                                                {t('topology.labels.version', {
                                                    version: selectedTopology.version
                                                })}
                                            </Badge>
                                        )}
                                        {isDirty && (
                                            <Badge color="orange" variant="light">
                                                {t('topology.labels.unsaved')}
                                            </Badge>
                                        )}
                                    </Group>
                                    <Button
                                        color="red"
                                        disabled={!selectedTopology}
                                        leftSection={<TbTrash size={16} />}
                                        onClick={handleDelete}
                                        variant="subtle"
                                    >
                                        {t('common.action.delete')}
                                    </Button>
                                </Group>
                            </SimpleGrid>
                        </Card>

                        <Grid align="stretch">
                            <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
                                <Card className={classes.palette} h="100%" p="md" withBorder>
                                    <Stack gap="sm">
                                        <Box>
                                            <Text fw={600}>{t('topology.palette.title')}</Text>
                                            <Text c="dimmed" size="xs">
                                                {t('topology.palette.help')}
                                            </Text>
                                        </Box>
                                        <TextInput
                                            aria-label={t('topology.palette.search')}
                                            onChange={(event) =>
                                                setResourceSearch(event.currentTarget.value)
                                            }
                                            placeholder={t('topology.palette.search')}
                                            value={resourceSearch}
                                        />
                                        <Tabs defaultValue="hosts">
                                            <Tabs.List grow>
                                                <Tabs.Tab value="hosts">
                                                    {t('topology.palette.by-host')}
                                                </Tabs.Tab>
                                                <Tabs.Tab value="nodes">
                                                    {t('topology.palette.by-node')}
                                                </Tabs.Tab>
                                            </Tabs.List>
                                            <Tabs.Panel pt="xs" value="hosts">
                                                <ScrollArea h={420} type="auto">
                                                    <Stack gap="xs" pr="xs">
                                                        {filteredResources.map((resource) => (
                                                            <PaletteResourceCard
                                                                key={`${resource.hostUuid}:${resource.nodeUuid}:host`}
                                                                onAdd={addResource}
                                                                resource={resource}
                                                            />
                                                        ))}
                                                    </Stack>
                                                </ScrollArea>
                                            </Tabs.Panel>
                                            <Tabs.Panel pt="xs" value="nodes">
                                                <ScrollArea h={420} type="auto">
                                                    <Stack gap="xs" pr="xs">
                                                        {[...filteredResources]
                                                            .sort((a, b) =>
                                                                a.nodeLabel.localeCompare(
                                                                    b.nodeLabel
                                                                )
                                                            )
                                                            .map((resource) => (
                                                                <PaletteResourceCard
                                                                    groupBy="NODE"
                                                                    key={`${resource.hostUuid}:${resource.nodeUuid}:node`}
                                                                    onAdd={addResource}
                                                                    resource={resource}
                                                                />
                                                            ))}
                                                    </Stack>
                                                </ScrollArea>
                                            </Tabs.Panel>
                                        </Tabs>
                                        {filteredResources.length === 0 && (
                                            <Text c="dimmed" size="sm" ta="center">
                                                {t('topology.palette.empty')}
                                            </Text>
                                        )}
                                        <Divider label={t('topology.palette.components')} />
                                        <Button
                                            fullWidth
                                            leftSection={<TbScale size={17} />}
                                            onClick={addLoadBalancer}
                                            variant="light"
                                        >
                                            {t('topology.actions.add-load-balancer')}
                                        </Button>
                                    </Stack>
                                </Card>
                            </Grid.Col>

                            <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
                                <Card h="100%" p="md" withBorder>
                                    <Stack gap="sm">
                                        <Group justify="space-between">
                                            <Box>
                                                <Text fw={600}>{t('topology.canvas.title')}</Text>
                                                <Text c="dimmed" size="xs">
                                                    {t('topology.canvas.help')}
                                                </Text>
                                            </Box>
                                            <Badge
                                                color={
                                                    localIssues.some(
                                                        (issue) => issue.severity === 'ERROR'
                                                    )
                                                        ? 'red'
                                                        : 'teal'
                                                }
                                                variant="light"
                                            >
                                                {localIssues.some(
                                                    (issue) => issue.severity === 'ERROR'
                                                )
                                                    ? t('topology.labels.has-errors')
                                                    : t('topology.labels.locally-valid')}
                                            </Badge>
                                        </Group>
                                        <TopologyCanvas
                                            graph={graph}
                                            issueNodeIds={allIssueNodeIds}
                                            onAddEdge={addEdge}
                                            onMove={moveNode}
                                            onRemoveEdge={(edgeId) =>
                                                updateGraph((current) => ({
                                                    ...current,
                                                    edges: current.edges.filter(
                                                        (edge) => edge.id !== edgeId
                                                    )
                                                }))
                                            }
                                            onRemoveNode={(nodeId) =>
                                                updateGraph((current) =>
                                                    removeTopologyNode(current, nodeId)
                                                )
                                            }
                                            onUpdateLoadBalancer={(updatedNode) =>
                                                updateGraph((current) => ({
                                                    ...current,
                                                    nodes: current.nodes.map((node) =>
                                                        node.id === updatedNode.id
                                                            ? updatedNode
                                                            : node
                                                    )
                                                }))
                                            }
                                        />

                                        <Divider label={t('topology.connections.title')} />
                                        {graph.edges.length === 0 ? (
                                            <Text c="dimmed" size="sm">
                                                {t('topology.connections.empty')}
                                            </Text>
                                        ) : (
                                            <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
                                                {graph.edges.map((edge) => {
                                                    const source = graph.nodes.find(
                                                        (node) => node.id === edge.source
                                                    )
                                                    const target = graph.nodes.find(
                                                        (node) => node.id === edge.target
                                                    )
                                                    return (
                                                        <Paper
                                                            key={edge.id}
                                                            p="xs"
                                                            style={{
                                                                borderColor: allIssueEdgeIds.has(
                                                                    edge.id
                                                                )
                                                                    ? 'var(--mantine-color-red-6)'
                                                                    : undefined
                                                            }}
                                                            withBorder
                                                        >
                                                            <Group
                                                                gap="xs"
                                                                justify="space-between"
                                                                wrap="nowrap"
                                                            >
                                                                <Text lineClamp={1} size="xs">
                                                                    {source?.label} →{' '}
                                                                    {target?.label}
                                                                </Text>
                                                                <ActionIcon
                                                                    aria-label={t(
                                                                        'topology.actions.delete-connection'
                                                                    )}
                                                                    color="red"
                                                                    onClick={() =>
                                                                        updateGraph((current) => ({
                                                                            ...current,
                                                                            edges: current.edges.filter(
                                                                                (candidate) =>
                                                                                    candidate.id !==
                                                                                    edge.id
                                                                            )
                                                                        }))
                                                                    }
                                                                    size="xs"
                                                                    variant="subtle"
                                                                >
                                                                    <TbUnlink size={13} />
                                                                </ActionIcon>
                                                            </Group>
                                                        </Paper>
                                                    )
                                                })}
                                            </SimpleGrid>
                                        )}
                                    </Stack>
                                </Card>
                            </Grid.Col>
                        </Grid>

                        {issueRows.length > 0 && (
                            <Card p="md" withBorder>
                                <Stack gap="xs">
                                    <Text fw={600}>{t('topology.validation.title')}</Text>
                                    {issueRows.map((issue, index) => (
                                        <Alert
                                            color={issue.severity === 'WARNING' ? 'yellow' : 'red'}
                                            key={`${issue.source}:${issue.code}:${index}`}
                                            title={t(`topology.issue.${issue.code}`, {
                                                defaultValue: issue.message
                                            })}
                                            variant="light"
                                        >
                                            <Text size="xs">
                                                {issue.source === 'SERVER'
                                                    ? t('topology.validation.server-source')
                                                    : t('topology.validation.local-source')}
                                                {issue.nodeIds?.length
                                                    ? ` · ${t('topology.validation.nodes')}: ${issue.nodeIds.join(', ')}`
                                                    : ''}
                                                {issue.edgeIds?.length
                                                    ? ` · ${t('topology.validation.edges')}: ${issue.edgeIds.join(', ')}`
                                                    : ''}
                                            </Text>
                                        </Alert>
                                    ))}
                                </Stack>
                            </Card>
                        )}

                        <Card p="md" withBorder>
                            <Stack gap="sm">
                                <Group justify="space-between">
                                    <Box>
                                        <Text fw={600}>{t('topology.preview.title')}</Text>
                                        <Text c="dimmed" size="xs">
                                            {t('topology.preview.help')}
                                        </Text>
                                    </Box>
                                    {previewTopology.isPending && <Loader size="sm" />}
                                </Group>
                                <PreviewResults preview={preview} />
                            </Stack>
                        </Card>
                    </Stack>
                </DragDropProvider>
            )}
        </Page>
    )
}
