import { consola } from 'consola/browser'
import { ComponentProps, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { app } from 'src/config'

import { useGetConfigProfile, useGetSnippets } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { LoadingScreen } from '@shared/ui'
import { isMieruProfileConfig } from '@shared/utils/config-profile-runtime'
import { fetchWithProgress } from '@shared/utils/fetch-with-progress'

import { ConfigProfileByUuidPageComponent } from '../components/config-profile-by-uuid.page.component'

export function ConfigProfileByUuidPageConnector() {
    const { uuid } = useParams()

    const { data: configProfile, isLoading: isConfigProfileLoading } = useGetConfigProfile({
        route: { uuid: uuid! },
        rQueryParams: {
            enabled: !!uuid,
            refetchOnWindowFocus: false
        }
    })

    const { data: snippets, isLoading: isSnippetsLoading } = useGetSnippets({})

    if (!uuid) {
        return <Navigate to={ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILES} />
    }

    if (isConfigProfileLoading || !configProfile || isSnippetsLoading || !snippets) {
        return <LoadingScreen />
    }

    // Decide from resolved profile data, including a synchronous query-cache hit.
    // The Mieru branch never mounts the Xray loader or downloads its WASM module.
    if (isMieruProfileConfig(configProfile.config)) {
        return (
            <ConfigProfileByUuidPageComponent
                key={configProfile.uuid}
                configProfile={configProfile}
                isWasmCrashed={false}
                isWasmRestarting={false}
                onRestartWasm={() => {}}
                snippets={snippets}
            />
        )
    }

    return (
        <XrayConfigProfileEditor
            key={configProfile.uuid}
            configProfile={configProfile}
            snippets={snippets}
        />
    )
}

type EditorProps = Pick<
    ComponentProps<typeof ConfigProfileByUuidPageComponent>,
    'configProfile' | 'snippets'
>

function XrayConfigProfileEditor({ configProfile, snippets }: EditorProps) {
    const [downloadProgress, setDownloadProgress] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [isWasmCrashed, setIsWasmCrashed] = useState(false)
    const [isWasmRestarting, setIsWasmRestarting] = useState(false)
    const wasmBytesCache = useRef<ArrayBuffer | null>(null)
    const generation = useRef(0)
    const initializedCallback = useRef<(() => void) | null>(null)

    const initWasm = useCallback(async () => {
        const current = ++generation.current
        const isCurrent = () => generation.current === current

        try {
            let wasmBytes: ArrayBuffer
            if (wasmBytesCache.current) {
                wasmBytes = wasmBytesCache.current
            } else {
                wasmBytes = await fetchWithProgress(app.configEditor.wasmUrl, (value) => {
                    if (isCurrent()) setDownloadProgress(value)
                })
                wasmBytesCache.current = wasmBytes
            }

            if (!isCurrent()) return
            const go = new window.Go()
            const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject)
            if (!isCurrent()) return
            const initialized = Promise.withResolvers<void>()
            const onInitialized = () => initialized.resolve()
            initializedCallback.current = onInitialized
            window.onWasmInitialized = onInitialized
            const timeout = window.setTimeout(
                () => initialized.reject(new Error('Xray WASM initialization timed out')),
                30000
            )

            const onExit = () => {
                initialized.reject(new Error('Xray WASM exited'))
                if (isCurrent()) setIsWasmCrashed(true)
            }
            try {
                void go.run(instance).then(onExit, onExit)
                await initialized.promise
            } finally {
                window.clearTimeout(timeout)
                if (window.onWasmInitialized === onInitialized) delete window.onWasmInitialized
            }

            if (!isCurrent()) return
            if (typeof window.XrayParseConfig === 'function') {
                return true
            } else {
                throw new Error('XrayParseConfig not initialized')
            }
        } catch (err: unknown) {
            if (!isCurrent()) return
            consola.error('WASM initialization error:', err)
            return false
        }
    }, [])

    const onInitializationSettled = useCallback((ready: boolean | undefined) => {
        if (ready === undefined) return // An unmounted or superseded generation.
        setIsWasmCrashed(!ready)
        setIsLoading(false)
        setIsWasmRestarting(false)
    }, [])

    const restartWasm = useCallback(() => {
        setIsWasmRestarting(true)
        setIsWasmCrashed(false)
        void initWasm().then(onInitializationSettled)
    }, [initWasm, onInitializationSettled])

    useEffect(() => {
        void initWasm().then(onInitializationSettled)

        return () => {
            generation.current++
            if (window.onWasmInitialized === initializedCallback.current) {
                delete window.onWasmInitialized
            }
        }
    }, [initWasm, onInitializationSettled])

    if (isLoading) {
        return <LoadingScreen text="The WASM module is loading..." value={downloadProgress} />
    }

    return (
        <ConfigProfileByUuidPageComponent
            configProfile={configProfile}
            isWasmCrashed={isWasmCrashed}
            isWasmRestarting={isWasmRestarting}
            onRestartWasm={restartWasm}
            snippets={snippets}
        />
    )
}
