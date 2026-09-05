import {
    Accordion,
    Alert,
    Badge,
    Button,
    Group,
    Stack,
    Switch,
    TagsInput,
    Text,
    TextInput
} from '@mantine/core'
import { GetNodeCommand, RestartNodeCommand } from '@remnawave/backend-contract'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { getSessionGeneration, instance } from '@shared/api/axios'
import { requestSessionResponse } from '@shared/api/session-response'
import { useSessionMutation } from '@shared/api/tsq-helpers/use-session-mutation'

const siteSchema = z.object({ domains: z.array(z.string()), upstream: z.string() })
const settingsSchema = z.object({
    management: siteSchema.nullable(),
    website: siteSchema.nullable()
})
const savedSchema = z.object({ revision: z.number().int().nonnegative(), settings: settingsSchema })
const saveResponseSchema = z.object({ response: savedSchema })
const responseSchema = z.object({
    response: savedSchema.extend({
        runtime: z
            .object({
                available: z.boolean(),
                haproxy: z.boolean(),
                caddy: z.boolean(),
                planVersion: z.literal(1)
            })
            .nullable()
    })
})
type Saved = z.infer<typeof savedSchema>

export function NodeEdgeSettingsCard({ node }: { node: GetNodeCommand.Response['response'] }) {
    const { i18n } = useTranslation()
    const zh = i18n.language.startsWith('zh')
    const label = (cn: string, en: string) => (zh ? cn : en)
    const client = useQueryClient()
    const key = ['node-edge-settings', node.uuid]
    const url = `/api/nodes/${node.uuid}/edge-settings`
    const [edited, setDraft] = useState<Saved | null>(null)
    const [baseline, setBaseline] = useState<string | null>(null)
    const [notice, setNotice] = useState('')
    const [error, setError] = useState('')
    const query = useQuery({
        queryKey: key,
        queryFn: ({ signal }) =>
            requestSessionResponse(() => instance.get(url, { signal }), responseSchema),
        retry: false,
        refetchOnWindowFocus: false
    })
    const draft = edited ?? query.data ?? null
    const load = (value: Saved) => {
        setDraft({ revision: value.revision, settings: structuredClone(value.settings) })
        setBaseline(JSON.stringify(value.settings))
    }
    const dirty = draft !== null && baseline !== null && JSON.stringify(draft.settings) !== baseline
    const save = useSessionMutation({
        mutationFn: async () => {
            if (!draft) throw new Error('Settings have not loaded')
            return requestSessionResponse(
                () =>
                    instance.put(url, {
                        expectedRevision: draft.revision,
                        settings: draft.settings
                    }),
                saveResponseSchema
            )
        },
        onSuccess: (saved) => {
            load(saved)
            setError('')
            setNotice(
                label(
                    '已保存。尚未确认在 Agent 上生效，请点击“应用已保存配置”。',
                    'Saved, not yet confirmed on the Agent. Apply the saved settings next.'
                )
            )
            client.setQueryData(key, { ...query.data, ...saved })
        },
        onError: (cause) => {
            setNotice('')
            setError(
                axios.isAxiosError(cause) && cause.response?.status === 409
                    ? label(
                          '配置已被其他窗口修改。你的草稿已保留；请复制需要保留的内容，再重新载入。',
                          'Another editor changed these settings. Your draft is preserved; copy your changes before reloading.'
                      )
                    : label(
                          '保存失败，请检查域名是否重复、上游地址是否形成回环，以及节点配置是否合法。',
                          'Save failed. Check duplicate domains, upstream loops and the node configuration.'
                      )
            )
        }
    })
    const apply = useSessionMutation({
        mutationFn: async () => {
            await instance.post(
                RestartNodeCommand.url(node.uuid),
                RestartNodeCommand.RequestBodySchema.parse({ forceRestart: true })
            )
        },
        onSuccess: () => {
            setError('')
            setNotice(
                label(
                    '应用请求已入队，不代表运行成功。请查看节点状态和错误信息；失败时 Agent 会尝试恢复旧配置。',
                    'Apply request queued, not runtime confirmation. Check node status/errors; the Agent attempts rollback on failure.'
                )
            )
            client.invalidateQueries({ queryKey: ['nodes'] })
        },
        onError: () =>
            setError(
                label(
                    '应用请求失败；已保存配置仍保留。',
                    'Apply request failed; the saved settings remain.'
                )
            )
    })
    const busy = save.isPending || apply.isPending
    const change = (role: 'management' | 'website', value: z.infer<typeof siteSchema> | null) => {
        if (baseline === null && draft) setBaseline(JSON.stringify(draft.settings))
        if (draft) setDraft({ ...draft, settings: { ...draft.settings, [role]: value } })
        setNotice('')
    }
    return (
        <Accordion mt="md" variant="contained">
            <Accordion.Item value="edge">
                <Accordion.Control>
                    {label('共享 443 · 网站反向代理', 'Shared 443 · Website reverse proxy')}
                </Accordion.Control>
                <Accordion.Panel>
                    <Stack gap="md">
                        <Text size="sm" c="dimmed">
                            {label(
                                '域名需解析到本服务器。网站域名不能与代理节点的 SNI 重复。上游只填写 HTTP/HTTPS 源地址，不含路径；HTTP 自动重定向到 HTTPS。',
                                'Point domains to this server. Website domains must differ from proxy SNI. Enter an HTTP/HTTPS origin without a path; HTTP redirects to HTTPS.'
                            )}
                        </Text>
                        <Badge color={query.data?.runtime?.available ? 'teal' : 'yellow'}>
                            {query.data?.runtime?.available
                                ? label('共享端口组件可用', 'Edge components available')
                                : label('尚未确认 Agent 支持', 'Agent capability unconfirmed')}
                        </Badge>
                        {query.isError && (
                            <Alert color="red">
                                {label(
                                    '无法读取配置。后端需包含新版反向代理接口。',
                                    'Cannot read settings. The backend must include the edge-settings API.'
                                )}
                            </Alert>
                        )}
                        {error && <Alert color="red">{error}</Alert>}
                        {notice && <Alert color="blue">{notice}</Alert>}
                        {draft &&
                            (['management', 'website'] as const).map((role) => {
                                const site = draft.settings[role]
                                return (
                                    <Stack key={role} gap="xs">
                                        <Switch
                                            checked={site !== null}
                                            disabled={busy}
                                            label={
                                                role === 'management'
                                                    ? label('面板反向代理', 'Panel reverse proxy')
                                                    : label('网站反向代理', 'Website reverse proxy')
                                            }
                                            onChange={(event) =>
                                                change(
                                                    role,
                                                    event.currentTarget.checked
                                                        ? { domains: [], upstream: '' }
                                                        : null
                                                )
                                            }
                                        />
                                        {site && (
                                            <>
                                                <TagsInput
                                                    label={label(
                                                        '域名（回车添加）',
                                                        'Domains (press Enter to add)'
                                                    )}
                                                    value={site.domains}
                                                    disabled={busy}
                                                    onChange={(domains) =>
                                                        change(role, {
                                                            ...site,
                                                            domains: domains.map((domain) =>
                                                                domain.trim().toLowerCase()
                                                            )
                                                        })
                                                    }
                                                    placeholder="panel.example.com"
                                                />
                                                <TextInput
                                                    label={label('上游源地址', 'Upstream origin')}
                                                    value={site.upstream}
                                                    disabled={busy}
                                                    onChange={(event) =>
                                                        change(role, {
                                                            ...site,
                                                            upstream: event.currentTarget.value
                                                        })
                                                    }
                                                    placeholder="http://127.0.0.1:3000"
                                                />
                                            </>
                                        )}
                                    </Stack>
                                )
                            })}
                        <Group>
                            <Button
                                disabled={!dirty || busy}
                                loading={save.isPending}
                                onClick={() => save.mutate()}
                            >
                                {label('保存反向代理配置', 'Save reverse-proxy settings')}
                            </Button>
                            <Button
                                variant="light"
                                disabled={
                                    !draft ||
                                    !node.configProfile.activeConfigProfileUuid ||
                                    dirty ||
                                    busy ||
                                    node.isDisabled ||
                                    node.isConnecting ||
                                    !node.isConnected ||
                                    !query.data?.runtime?.available
                                }
                                loading={apply.isPending}
                                onClick={() => apply.mutate()}
                            >
                                {label('应用已保存配置', 'Apply saved settings')}
                            </Button>
                            <Button
                                variant="subtle"
                                disabled={busy}
                                onClick={async () => {
                                    if (
                                        dirty &&
                                        !window.confirm(
                                            label(
                                                '重新载入将丢弃当前反向代理草稿，是否继续？',
                                                'Reload will discard the current reverse-proxy draft. Continue?'
                                            )
                                        )
                                    )
                                        return
                                    const generation = getSessionGeneration()
                                    const result = await query.refetch()
                                    // Cancellation can return the observer's previous
                                    // cached value after the shared cache was cleared.
                                    if (generation !== getSessionGeneration()) return
                                    if (result.data && !result.error) {
                                        load(result.data)
                                        setError('')
                                        setNotice('')
                                    }
                                }}
                            >
                                {label('重新载入', 'Reload')}
                            </Button>
                        </Group>
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    )
}
