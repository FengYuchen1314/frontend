import NiceModal from '@ebay/nice-modal-react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

// Known unfinished boundary: token A -> B without logout still leaves pending
// modal state and its show Promise alive before first mount. Retain this reproducer and remove the TODO
// once session-aware modal removal and Promise settlement are implemented.
test.todo('replacing an authenticated session settles and removes pending modal state without logout', async () => {
    const id = 'fixture-session-modal'
    let state: import('@ebay/nice-modal-react').NiceModalStore = {}
    let handler!: ReturnType<typeof NiceModal.useModal>
    function Capture() {
        // SSR-only fixture: retain the real public handler; no browser render or user state.
        // eslint-disable-next-line react/globals
        handler = NiceModal.useModal(id)
        return null
    }
    const dispatch = (action: import('@ebay/nice-modal-react').NiceModalAction) => {
        state = NiceModal.reducer(state, action)
    }
    renderToStaticMarkup(
        createElement(NiceModal.Provider, { modals: state, dispatch }, createElement(Capture))
    )
    const shown = NiceModal.show(id, { text: 'account A draft fixture' })
    let settled = false
    void shown.then(() => {
        settled = true
    })
    const sessionListeners = new Set<() => void>()
    const logoutListeners = new Set<() => void>()
    const effects: (() => void | (() => void))[] = []
    const module = { exports: {} as typeof import('./nice-modal-auto-close.tsx') }
    const code = ts.transpileModule(
        readFileSync(new URL('./nice-modal-auto-close.tsx', import.meta.url), 'utf8'),
        {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                jsx: ts.JsxEmit.ReactJSX,
                esModuleInterop: true
            }
        }
    ).outputText
    const dependencies = {
        '@ebay/nice-modal-react': { ...NiceModal, default: NiceModal, __esModule: true },
        react: {
            useContext: () => state,
            useEffectEvent: (callback: () => void) => callback,
            useEffect: (callback: () => void | (() => void)) => effects.push(callback)
        },
        '@shared/api/axios': {
            subscribeSessionChanges: (callback: () => void) => {
                sessionListeners.add(callback)
                return () => sessionListeners.delete(callback)
            }
        },
        '@shared/emitters': {
            logoutEvents: {
                subscribe: (callback: () => void) => {
                    logoutListeners.add(callback)
                    return () => logoutListeners.delete(callback)
                }
            }
        }
    }
    new Function('require', 'module', 'exports', code)(
        (name: keyof typeof dependencies) => {
            assert.ok(dependencies[name], name)
            return dependencies[name]
        },
        module,
        module.exports
    )
    module.exports.NiceModalAutoClose()
    const cleanups = effects.map((effect) => effect())
    try {
        sessionListeners.forEach((listener) => listener())
        await Promise.resolve()
        assert.equal(
            state[id],
            undefined,
            'Account A modal must disappear when token A changes to token B'
        )
        assert.equal(settled, true, 'Its show promise must settle before removal')
    } finally {
        cleanups.forEach((cleanup) => cleanup?.())
        handler.resolve(undefined)
        handler.resolveHide()
        handler.remove()
    }
})
