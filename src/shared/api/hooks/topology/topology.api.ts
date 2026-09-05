import {
    LOAD_BALANCER_STRATEGIES,
    TOPOLOGY_FORMATS,
    type TopologyFormat,
    type TopologyGraph
} from '@features/dashboard/topology/lib/topology-graph'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { z } from 'zod'

import { instance } from '../../axios'
import { requestSessionResponse } from '../../session-response'
import { useSessionMutation } from '../../tsq-helpers/use-session-mutation'

const topologyPositionSchema = z.object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000)
})

const topologyNodeBase = {
    id: z.string().min(1),
    label: z.string().trim().min(1).max(64),
    position: topologyPositionSchema.optional()
}

const topologyNodeSchema = z.discriminatedUnion('kind', [
    z.object({ ...topologyNodeBase, kind: z.literal('ENTRY') }),
    z.object({
        ...topologyNodeBase,
        kind: z.literal('PROXY'),
        hostUuid: z.string().uuid(),
        nodeUuid: z.string().uuid()
    }),
    z.object({
        ...topologyNodeBase,
        kind: z.literal('LOAD_BALANCER'),
        strategy: z.enum(LOAD_BALANCER_STRATEGIES),
        testUrl: z.string().url().startsWith('https://').optional(),
        intervalSeconds: z.number().int().min(10).max(86_400).optional()
    }),
    z.object({ ...topologyNodeBase, kind: z.literal('EXIT') })
])

export const topologyGraphSchema = z.object({
    schemaVersion: z.literal(1),
    nodes: z.array(topologyNodeSchema).min(3).max(64),
    edges: z
        .array(
            z.object({
                id: z.string().min(1),
                source: z.string().min(1),
                target: z.string().min(1),
                order: z.number().int().min(0).max(127).optional()
            })
        )
        .min(2)
        .max(128)
})

const topologySchema = z.object({
    uuid: z.string().uuid(),
    name: z.string().min(2).max(100),
    version: z.number().int().positive(),
    isPublished: z.boolean().default(false),
    graph: topologyGraphSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
})

const serverIssueSchema = z.object({
    code: z.string(),
    message: z.string(),
    nodeIds: z.array(z.string()).optional(),
    edgeIds: z.array(z.string()).optional()
})

const formatSchema = z.enum(TOPOLOGY_FORMATS)

const previewResultSchema = z.discriminatedUnion('status', [
    z.object({
        format: formatSchema,
        status: z.literal('SUPPORTED'),
        artifact: z.record(z.string(), z.unknown())
    }),
    z.object({
        format: formatSchema,
        status: z.literal('UNSUPPORTED'),
        reasonCode: z.string(),
        message: z.string()
    }),
    z.object({
        format: formatSchema,
        status: z.literal('ERROR'),
        reasonCode: z.string(),
        message: z.string()
    })
])

const listResponseSchema = z.object({
    response: z.object({
        topologies: z.array(topologySchema),
        total: z.number().int().nonnegative()
    })
})

const topologyResponseSchema = z.object({ response: topologySchema })

const validationResponseSchema = z.object({
    response: z.object({
        valid: z.boolean(),
        issues: z.array(serverIssueSchema),
        maxDepth: z.number().int().nonnegative()
    })
})

const previewResponseSchema = z.object({
    response: z.object({
        valid: z.boolean(),
        issues: z.array(serverIssueSchema),
        results: z.array(previewResultSchema)
    })
})

export type SubscriptionTopology = z.infer<typeof topologySchema>
export type TopologyServerIssue = z.infer<typeof serverIssueSchema>
export type TopologyPreview = z.infer<typeof previewResponseSchema>['response']

export const topologyQueryKeys = {
    all: ['topologies'] as const,
    detail: (uuid: string) => ['topologies', uuid] as const
}

export const useGetTopologies = () =>
    useQuery({
        queryKey: topologyQueryKeys.all,
        queryFn: ({ signal }) =>
            requestSessionResponse(
                () => instance.get('/api/topologies', { signal }),
                listResponseSchema
            )
    })

export const useGetTopology = (uuid: null | string) =>
    useQuery({
        enabled: uuid !== null,
        queryKey:
            uuid === null ? [...topologyQueryKeys.all, 'none'] : topologyQueryKeys.detail(uuid),
        queryFn: ({ signal }) =>
            requestSessionResponse(
                () => instance.get(`/api/topologies/${uuid}`, { signal }),
                topologyResponseSchema
            )
    })

export const useCreateTopology = () => {
    const queryClient = useQueryClient()
    return useSessionMutation({
        mutationFn: (payload: { graph: TopologyGraph; name: string }) =>
            requestSessionResponse(
                () => instance.post('/api/topologies', payload),
                topologyResponseSchema
            ),
        onSuccess: (topology) => {
            queryClient.setQueryData(topologyQueryKeys.detail(topology.uuid), topology)
            queryClient.invalidateQueries({ queryKey: topologyQueryKeys.all })
        }
    })
}

export const useUpdateTopology = () => {
    const queryClient = useQueryClient()
    return useSessionMutation({
        mutationFn: ({
            uuid,
            ...payload
        }: {
            expectedVersion: number
            graph?: TopologyGraph
            isPublished?: boolean
            name?: string
            uuid: string
        }) =>
            requestSessionResponse(
                () => instance.patch(`/api/topologies/${uuid}`, payload),
                topologyResponseSchema
            ),
        onSuccess: (topology) => {
            queryClient.setQueryData(topologyQueryKeys.detail(topology.uuid), topology)
            queryClient.invalidateQueries({ queryKey: topologyQueryKeys.all })
        }
    })
}

export const useDeleteTopology = () => {
    const queryClient = useQueryClient()
    return useSessionMutation({
        mutationFn: async ({
            expectedVersion,
            uuid
        }: {
            expectedVersion: number
            uuid: string
        }) => {
            await instance.delete(`/api/topologies/${uuid}`, { params: { expectedVersion } })
        },
        onSuccess: (_data, variables) => {
            queryClient.removeQueries({ queryKey: topologyQueryKeys.detail(variables.uuid) })
            queryClient.invalidateQueries({ queryKey: topologyQueryKeys.all })
        }
    })
}

export const useValidateTopology = () =>
    useSessionMutation({
        mutationFn: (graph: TopologyGraph) =>
            requestSessionResponse(
                () => instance.post('/api/topologies/actions/validate', { graph }),
                validationResponseSchema
            )
    })

export const usePreviewTopology = () =>
    useSessionMutation({
        mutationFn: ({ formats, graph }: { formats: TopologyFormat[]; graph: TopologyGraph }) =>
            requestSessionResponse(
                () => instance.post('/api/topologies/actions/preview', { graph, formats }),
                previewResponseSchema
            )
    })

export const isTopologyVersionConflict = (error: unknown) =>
    axios.isAxiosError(error) &&
    (error.response?.status === 409 || error.response?.data?.error?.code === 'XT003')
