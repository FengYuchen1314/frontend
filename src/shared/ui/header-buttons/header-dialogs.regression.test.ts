import type { GetMetadataCommand } from '@remnawave/backend-contract'

import * as hero from '@heroui/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

import * as recapConstants from '../../../widgets/dashboard/recap/recap.constants.ts'
import * as recapModel from '../../../widgets/dashboard/recap/recap.model.ts'
import * as bytes from '../../utils/bytes/index.ts'
import * as time from '../../utils/time-utils/format-time.util.ts'
import * as logo from '../logo.tsx'
import * as controls from './header-controls.model.ts'
import * as header from './HeaderControl.tsx'
import * as updaterModel from './panel-updater.model.ts'
import * as skeleton from './SkeletonHeaderControl.tsx'

const require = createRequire(import.meta.url)
const translation = { useTranslation: () => ({ t: (key: string) => key }) }
const styles = new Proxy({}, { get: (_target, key) => String(key) })
// Transpile the exact production module in memory, replacing only I/O hooks and
// CSS module loading. Native HeroUI and React still produce the SSR markup.
function production<T>(path: string, dependencies: Record<string, unknown> = {}): T {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    const code = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true
        }
    }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', code)(
        (name: string) =>
            name === '@heroui/react'
                ? hero
                : name === 'react-i18next'
                  ? translation
                  : name.endsWith('.css')
                    ? { __esModule: true, default: styles }
                    : Object.hasOwn(dependencies, name)
                      ? dependencies[name]
                      : require(name),
        module,
        module.exports
    )
    return module.exports as T
}

const metadata: GetMetadataCommand.Response['response'] = {
    version: '3.4.13',
    build: { time: '2026-01-01T00:00:00Z', number: 'fixture-build' },
    git: {
        backend: {
            branch: 'xboard-dev',
            commitSha: 'fixture-backend-sha',
            commitUrl: 'https://github.com/example/backend/commit/fixture'
        },
        frontend: {
            commitSha: 'fixture-frontend-sha',
            commitUrl: 'https://github.com/example/frontend/commit/fixture'
        }
    }
}
const readyStatus: updaterModel.PanelUpdateStatus = {
    configured: true,
    reachable: true,
    channel: 'xboard-dev',
    state: 'IDLE',
    currentVersion: '3.4.13',
    targetVersion: '3.4.14',
    updateAvailable: true,
    lastError: null,
    updatedAt: 'fixture-time'
}
const copyButton = production<typeof import('./CopyValueButton.tsx')>('./CopyValueButton.tsx', {
    './use-control-lifetime': { useControlLifetime: () => () => () => true }
})

test('Build Info SSR keeps version/build/commit links, copy actions and updater eligibility in native components', () => {
    let data = readyStatus
    const { BuildInfoModal } = production<typeof import('../sidebar/build-info-modal.tsx')>(
        '../sidebar/build-info-modal.tsx',
        {
            '@shared/utils/time-utils': time,
            '../header-buttons/CopyValueButton': copyButton,
            '../header-buttons/HeaderControl': header,
            '../logo': logo,
            '../header-buttons/use-panel-updater': {
                usePanelUpdater: () => ({
                    data,
                    error: null,
                    isFetching: false,
                    isTriggering: false,
                    canUpdate: updaterModel.canRequestPanelUpdate(data),
                    confirm: async () => {},
                    refetch: async () => {}
                })
            }
        }
    )
    const render = () =>
        renderToStaticMarkup(
            createElement(BuildInfoModal, {
                remnawaveMetadata: metadata,
                isNewVersionAvailable: true
            })
        )
    const available = render()
    for (const text of [
        '3.4.13',
        'fixture-build',
        'fixture-backend-sha',
        'fixture-frontend-sha',
        'Copy build info',
        'Copy backend commit',
        'Copy frontend commit',
        'build-info.updater.update-available',
        'https://t.me/remnalog',
        'https://t.me/remnawave'
    ])
        assert.ok(available.includes(text), text)
    assert.match(available, /href="https:\/\/github.com\/example\/backend\/commit\/fixture"/)
    const buttonForUpdate = (html: string) =>
        html
            .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
            ?.find((button) => button.includes('build-info.updater.update-now'))
    assert.ok(buttonForUpdate(available))
    assert.doesNotMatch(buttonForUpdate(available)!, /disabled=""/)
    data = { ...readyStatus, configured: false, state: 'UNCONFIGURED' }
    const unavailable = render()
    assert.match(unavailable, /build-info.updater.unconfigured/)
    const updateButton = buttonForUpdate(unavailable)
    assert.ok(updateButton?.includes('disabled=""'))
    data = { ...readyStatus, state: 'FAILED', lastError: 'fixture rollback error' }
    assert.match(render(), /fixture rollback error/)
})

test('Version Control exposes a retry after metadata errors, native skeleton while loading and a native modal trigger once ready', () => {
    let query = {
        data: undefined as GetMetadataCommand.Response['response'] | undefined,
        isLoading: true,
        isFetching: true,
        error: null as Error | null,
        refetch: async () => {}
    }
    const { VersionControl } = production<typeof import('./VersionControl.tsx')>(
        './VersionControl.tsx',
        {
            '@shared/api/hooks': { useGetRemnawaveMetadata: () => query },
            '@entities/dashboard/updates-store': {
                useRemnawaveInfo: () => ({ latestVersion: 'invalid-tag' })
            },
            '../logo': logo,
            '../sidebar/build-info-modal': { BuildInfoModal: () => null },
            './HeaderControl': header,
            './SkeletonHeaderControl': skeleton,
            './header-controls.model': controls,
            './use-control-lifetime': {
                useDialogSessionKey: () => 0,
                useDialogOperationScope: () => ({
                    generation: 0,
                    signal: AbortSignal.abort(),
                    onOpenChange() {}
                })
            }
        }
    )
    assert.match(renderToStaticMarkup(createElement(VersionControl)), /Loading header information/)
    query = { ...query, isLoading: false, isFetching: false, error: new Error('fixture error') }
    assert.match(
        renderToStaticMarkup(createElement(VersionControl)),
        /Retry loading build information/
    )
    query = { ...query, data: metadata, error: null }
    const loaded = renderToStaticMarkup(createElement(VersionControl))
    assert.match(loaded, /aria-expanded="false"/)
    assert.match(loaded, /Build info: 3.4.13/)
})

test('Prime retains all four feature descriptions and its external enrollment link', () => {
    const { PrimeModalContent } = production<
        typeof import('../prime-modal/prime-modal.shared.tsx')
    >('../prime-modal/prime-modal.shared.tsx')
    const markup = renderToStaticMarkup(createElement(PrimeModalContent))
    for (const feature of [
        'priority-support',
        'private-community',
        'shape-the-roadmap',
        'direct-developer-access'
    ])
        assert.ok(markup.includes(`prime-modal.shared.${feature}-description`))
    assert.match(markup, /href="https:\/\/docs.rw\/prime"/)
    assert.match(markup, /rel="noopener noreferrer"/)
})

test('Recap SSR retains all editing controls and real statistics, with loading and retry instead of endless empty spinners', () => {
    let query: {
        data?: unknown
        isLoading: boolean
        isFetching: boolean
        error: Error | null
        refetch(): Promise<void>
    } = { isLoading: true, isFetching: true, error: null, refetch: async () => {} }
    const { RecapContent } = production<
        typeof import('../../../widgets/dashboard/recap/recap.content.widget.tsx')
    >('../../../widgets/dashboard/recap/recap.content.widget.tsx', {
        '@shared/api/hooks/system/system.query.hooks': { useGetRecap: () => query },
        '@shared/api/axios': {
            getSessionGeneration: () => 0,
            subscribeSessionChanges: () => () => {}
        },
        '@shared/ui/logo': logo,
        '@shared/utils/bytes': bytes,
        '@shared/utils/copy-screenshot.util': {},
        './recap.constants': recapConstants,
        './recap.model': recapModel
    })
    assert.match(renderToStaticMarkup(createElement(RecapContent)), /Loading Recap/)
    query = { ...query, isLoading: false, isFetching: false, error: new Error('fixture offline') }
    const unavailable = renderToStaticMarkup(createElement(RecapContent))
    assert.match(unavailable, /Recap unavailable/)
    assert.match(unavailable, /fixture offline/)
    assert.match(unavailable, /common.action.refresh/)
    query = {
        ...query,
        error: null,
        data: {
            initDate: '2025-03-01T00:00:00Z',
            version: '3.4.13',
            thisMonth: { users: 42, traffic: '10000' },
            total: {
                users: 100,
                nodes: 9,
                traffic: '100000',
                nodesRam: '4096',
                nodesCpuCores: 8,
                distinctCountries: 3
            }
        }
    }
    const markup = renderToStaticMarkup(createElement(RecapContent))
    for (const text of [
        'Early Adopter',
        'v3.4.13',
        '100',
        '42',
        'total users',
        'Sections',
        'Mask fields',
        'Background',
        'Custom note',
        'Accent color',
        'common.action.copy',
        'common.action.download'
    ])
        assert.ok(markup.includes(text), text)
    for (const field of recapConstants.MASKABLE_FIELDS)
        assert.ok(markup.includes(field.label), field.label)
    assert.equal((markup.match(/aria-label="Accent rgb/g) ?? []).length, 16)
    assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 3)
    assert.match(markup, /type="color"/)
    assert.match(markup, /maxLength="40"|maxlength="40"/)
})

test('production updater hook posts only a still-confirmed target and suppresses stale refetch on session change', async () => {
    const effects: (() => void | (() => void))[] = []
    let session = 1
    let posts = 0
    let refetches = 0
    let resolve!: (value: unknown) => void
    const notifications: unknown[][] = []
    const mockedHero = {
        toast: Object.fromEntries(
            ['success', 'warning', 'danger'].map((name) => [
                name,
                (...args: unknown[]) => notifications.push(args)
            ])
        )
    }
    const source = readFileSync(new URL('./use-panel-updater.ts', import.meta.url), 'utf8')
    const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText
    const exports = {} as typeof import('./use-panel-updater.ts')
    const dependencies: Record<string, unknown> = {
        '@heroui/react': mockedHero,
        'react-i18next': translation,
        react: {
            useEffect: (effect: () => void | (() => void)) => effects.push(effect),
            useRef: (value: unknown) => ({ current: value })
        },
        '@shared/api/axios': { getSessionGeneration: () => session },
        './panel-updater.model': updaterModel,
        '@shared/api/hooks': {
            useGetUpdateStatus: () => ({
                data: readyStatus,
                error: null,
                isFetching: false,
                refetch: async () => {
                    refetches++
                }
            }),
            useTriggerUpdate: () => ({
                isPending: false,
                mutateAsync: async () => {
                    posts++
                    return new Promise((done) => {
                        resolve = done
                    })
                }
            })
        }
    }
    new Function('exports', 'require', code)(exports, (id: string) => {
        assert.ok(Object.hasOwn(dependencies, id), id)
        return dependencies[id]
    })
    const hook = exports.usePanelUpdater()
    const cleanups = effects.map((effect) => effect())
    try {
        assert.equal(await hook.confirm({ ...readyStatus, targetVersion: 'unexpected' }), false)
        assert.equal(posts, 0)
        const pending = hook.confirm(readyStatus)
        assert.equal(posts, 1)
        session++
        resolve({
            accepted: true,
            channel: 'xboard-dev',
            operationId: 'fixture',
            state: 'QUEUED',
            message: null
        })
        assert.equal(await pending, false)
        assert.equal(refetches, 0)
        assert.equal(notifications.length, 1) // Only the current-session target mismatch.
        assert.equal(await hook.confirm(readyStatus), false)
        assert.equal(posts, 1)
    } finally {
        cleanups.forEach((cleanup) => cleanup?.())
    }
})

test('dynamic Prime and Recap modal roots are keyed to the current session and retain accessible native triggers', () => {
    let session = 5
    const dependencies = {
        './HeaderControl': header,
        './use-control-lifetime': {
            useDialogSessionKey: () => session,
            useDialogOperationScope: () => ({
                generation: 0,
                signal: AbortSignal.abort(),
                onOpenChange() {}
            })
        },
        '../prime-modal/prime-modal.shared': { PrimeModalContent: () => null },
        '@widgets/dashboard/recap/recap.content.widget': { RecapContent: () => null }
    }
    const { PrimeControl } = production<typeof import('./PrimeControl.tsx')>(
        './PrimeControl.tsx',
        dependencies
    )
    const { RecapControl } = production<typeof import('./RecapControl.tsx')>(
        './RecapControl.tsx',
        dependencies
    )
    for (const Component of [PrimeControl, RecapControl]) {
        assert.equal(Component().key, String(session))
        const markup = renderToStaticMarkup(createElement(Component))
        assert.match(markup, /aria-expanded="false"/)
        session++
        assert.equal(Component().key, String(session))
    }
})

test('control callbacks are invalidated by close, StrictMode effect replay and account replacement', () => {
    let session = 1
    const effects: (() => () => void)[] = []
    const { useControlLifetime } = production<typeof import('./use-control-lifetime.ts')>(
        './use-control-lifetime.ts',
        {
            '@shared/api/axios': { getSessionGeneration: () => session },
            react: {
                useRef: (value: unknown) => ({ current: value }),
                useEffect: (effect: () => () => void) => effects.push(effect)
            }
        }
    )
    const capture = useControlLifetime()
    const cleanup = effects[0]()
    const first = capture()
    assert.equal(first(), true)
    cleanup()
    assert.equal(first(), false)
    const cleanupReplay = effects[0]()
    assert.equal(first(), false)
    const replay = capture()
    assert.equal(replay(), true)
    session++
    assert.equal(replay(), false)
    // A stale component must not make a new callback valid for the new account.
    assert.equal(capture()(), false)
    cleanupReplay()
})
