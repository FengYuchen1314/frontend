import type { TOpenEntityTarget } from '../../../shared/_modals/open-entity-targets'

import { Button, Card, FieldError, Input, Label, TextField } from '@heroui/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, isValidElement, useEffect, useState, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

import { OPEN_ENTITY, ROUTES } from '../../../shared/constants/routes.ts'
import { isValidUuid } from '../../../shared/utils/misc/is.ts'
import { createModalReturnTracker, resolveOpenEntity } from '../open-entity/open-entity.model.ts'
import { createCopyRequest, resolveQuickOpenPath } from './quick-open.model.ts'

function source(path: string) {
    return ts.createSourceFile(
        path,
        readFileSync(new URL(path, import.meta.url), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
}

function evaluate<T>(code: string, scope: Record<string, unknown>): T {
    const javascript = ts.transpileModule(code, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.React,
            jsxFactory: 'createElement'
        }
    }).outputText
    return new Function(...Object.keys(scope), javascript)(...Object.values(scope)) as T
}

const opened: { modalId: string; args: unknown }[] = []
const icon = () => null
const registryFile = source('../../../shared/_modals/open-entity-targets.ts')
const registryDeclaration = registryFile.statements
    .flatMap((node) => (ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []))
    .find((node) => node.name.getText(registryFile) === 'OPEN_ENTITY_TARGETS')
assert(registryDeclaration?.initializer)
// Execute the production registry, stubbing only visual icons and the external modal dispatch.
const targets = evaluate<Record<string, TOpenEntityTarget>>(
    `return ${registryDeclaration.initializer.getText(registryFile)}`,
    {
        OPEN_ENTITY,
        ROUTES,
        isValidUuid,
        HiServer: icon,
        PiArrowsInCardinalFill: icon,
        PiListChecks: icon,
        PiUsers: icon,
        TbCirclesRelation: icon,
        TbPackage: icon,
        TbWebhook: icon,
        XrayLogo: icon,
        showModal: (modalId: string, args: unknown) => opened.push({ modalId, args })
    }
)

const uuid = '11111111-1111-4111-8111-111111111111'
const expectations = [
    ['user', 'users_viewUserModal', { userId: 77 }, '/dashboard/management/users'],
    ['host', 'hosts_editHostDrawer', { hostUuid: uuid }, '/dashboard/management/hosts'],
    ['node', 'nodes_editNodeModal', { nodeUuid: uuid }, '/dashboard/management/nodes'],
    [
        'internal-squad',
        'internalSquads_internalSquadsInboundsDrawer',
        { squadUuid: uuid },
        '/dashboard/management/internal-squads'
    ],
    [
        'external-squad',
        'externalSquads_externalSquadsDrawer',
        { uuid },
        '/dashboard/management/external-squads'
    ],
    ['config-profile', null, null, `/dashboard/management/config-profiles/${uuid}`],
    ['node-plugin', null, null, `/dashboard/management/plugins/${uuid}`],
    ['subpage-config', null, null, `/dashboard/subpage/${uuid}`]
] as const

test('the Quick Open catalog retains exactly the eight production entities', () => {
    assert.deepEqual(Object.keys(targets).sort(), expectations.map(([entity]) => entity).sort())
})

for (const [entity, modalId, args, destination] of expectations) {
    test(`${entity}: trim, validation, deep link and destination retain the production mapping`, () => {
        const id = entity === 'user' ? '77' : uuid
        const target = targets[entity]
        assert.equal(
            resolveQuickOpenPath(ROUTES.DASHBOARD.OPEN_ENTITY, entity, ` ${id} `, target.validate),
            `/dashboard/open/${entity}/${id}`
        )
        for (const invalid of ['', ' ', '-1', 'not-an-id', '../node', '<script>']) {
            assert.equal(
                resolveQuickOpenPath(
                    ROUTES.DASHBOARD.OPEN_ENTITY,
                    entity,
                    invalid,
                    target.validate
                ),
                null
            )
        }
        const result = resolveOpenEntity(targets, ROUTES.DASHBOARD.HOME, entity, id)
        if (modalId) {
            assert.equal(result.kind, 'modal')
            if (result.kind !== 'modal') assert.fail('modal expected')
            assert.equal(result.key, `${entity}:${id}`)
            assert.equal(result.target.fallback, destination)
            result.target.open(result.id)
            assert.deepEqual(opened.pop(), { modalId, args })
        } else {
            assert.deepEqual(result, { kind: 'redirect', to: destination })
        }
        assert.deepEqual(resolveOpenEntity(targets, ROUTES.DASHBOARD.HOME, entity, 'invalid'), {
            kind: 'redirect',
            to: target.fallback
        })
    })
}

test('missing and prototype-like entity names safely return home', () => {
    for (const entity of [undefined, 'missing', 'constructor', '__proto__', 'toString']) {
        assert.deepEqual(resolveOpenEntity(targets, ROUTES.DASHBOARD.HOME, entity, uuid), {
            kind: 'redirect',
            to: ROUTES.DASHBOARD.HOME
        })
    }
    assert.deepEqual(resolveOpenEntity(targets, ROUTES.DASHBOARD.HOME, 'user', undefined), {
        kind: 'redirect',
        to: ROUTES.DASHBOARD.HOME
    })
})

test('modal return waits for first visibility, returns after close, and is scoped to the new entity', () => {
    const first = createModalReturnTracker()
    assert.equal(first(false), false)
    assert.equal(first(true), false)
    assert.equal(first(true), false)
    assert.equal(first(false), true)
    assert.equal(createModalReturnTracker()(false), false)
})

test('copy reports success/failure and safely ignores stale completion after edit or unmount', async () => {
    const request = createCopyRequest()
    assert.equal(await request.copy(async () => {}), 'copied')
    assert.equal(
        await request.copy(async () => {
            throw new Error('denied')
        }),
        'error'
    )
    let finish: (() => void) | undefined
    const pending = request.copy(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve
            })
    )
    request.invalidate()
    assert(finish)
    finish()
    assert.equal(await pending, null)
})

test('a newer copy cannot be overwritten by an older completion', async () => {
    const request = createCopyRequest()
    let finish: (() => void) | undefined
    const older = request.copy(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve
            })
    )
    assert.equal(await request.copy(async () => {}), 'copied')
    assert(finish)
    finish()
    assert.equal(await older, null)
})

function cardFunction(scope: Record<string, unknown>) {
    const file = source('./quick-open-entity-card.tsx')
    const fn = file.statements.find(
        (node): node is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(node) && node.name?.text === 'QuickOpenEntityCard'
    )
    assert(fn)
    return evaluate<(props: { entity: string; target: TOpenEntityTarget }) => ReactElement>(
        `return ${fn.getText(file).replace(/^export\s+/, '')}`,
        {
            createElement,
            Button,
            Card,
            FieldError,
            Input,
            Label,
            TextField,
            TbArrowRight: icon,
            TbCheck: icon,
            TbLink: icon,
            createCopyRequest,
            resolveQuickOpenPath,
            ROUTES,
            classes: {},
            useTranslation: () => ({ t: (key: string) => key }),
            ...scope
        }
    )
}

function findElement(tree: unknown, type: unknown): ReactElement<Record<string, unknown>> {
    if (isValidElement<Record<string, unknown>>(tree)) {
        if (tree.type === type) return tree
        const children = tree.props.children
        for (const child of Array.isArray(children) ? children : [children]) {
            try {
                return findElement(child, type)
            } catch {
                /* search the next child */
            }
        }
    }
    throw new Error('element not found')
}

test('the actual form trims input, blocks invalid submission and uses submit for Enter/open', () => {
    const slots: unknown[] = []
    const navigations: string[] = []
    let cursor = 0
    const component = cardFunction({
        useEffect: () => {},
        useNavigate: () => (path: string) => navigations.push(path),
        useState: (initial: unknown) => {
            const index = cursor++
            if (!(index in slots))
                slots[index] = typeof initial === 'function' ? initial() : initial
            return [
                slots[index],
                (value: unknown) => {
                    slots[index] = value
                }
            ]
        }
    })
    const render = () => {
        cursor = 0
        return component({ entity: 'user', target: targets.user })
    }
    let tree = render()
    let prevented = 0
    const submit = (current: ReactElement) => {
        const form = findElement(current, 'form')
        ;(form.props.onSubmit as (event: { preventDefault: () => void }) => void)({
            preventDefault: () => {
                prevented += 1
            }
        })
    }
    submit(tree)
    assert.deepEqual(navigations, [])
    ;(findElement(tree, TextField).props.onChange as (value: string) => void)(' 77 ')
    tree = render()
    assert.equal(findElement(tree, TextField).props.value, '77')
    submit(tree)
    assert.deepEqual(navigations, ['/dashboard/open/user/77'])
    ;(findElement(tree, TextField).props.onChange as (value: string) => void)('not-an-id')
    tree = render()
    assert.equal(findElement(tree, TextField).props.isInvalid, true)
    submit(tree)
    assert.equal(navigations.length, 1)
    assert.equal(prevented, 3)
    const file = readFileSync(new URL('./quick-open-entity-card.tsx', import.meta.url), 'utf8')
    assert.match(file, /type="submit"/)
    assert.match(file, /type="button"/)
})

test('real HeroUI SSR associates each label/input and disables both empty-field actions', () => {
    const component = cardFunction({ useEffect, useState, useNavigate: () => () => {} })
    const html = renderToStaticMarkup(
        createElement(component, { entity: 'user', target: targets.user })
    )
    assert.match(html, /<form/)
    assert.match(html, /<label[^>]+for="([^"]+)"/)
    const labelId = /<label[^>]+for="([^"]+)"/.exec(html)?.[1]
    assert(labelId)
    assert(html.includes(`id="${labelId}"`))
    assert.match(html, /aria-label="common.action.copy-link: constants.users"/)
    assert.match(html, /aria-label="common.action.open: constants.users"/)
    assert.equal((html.match(/<button[^>]+disabled=""/g) ?? []).length, 2)
})

test('the actual copy action writes the full deep link and ignores completion after the ID changes', async () => {
    const slots: unknown[] = []
    const writes: string[] = []
    let finish: (() => void) | undefined
    let cursor = 0
    const component = cardFunction({
        useEffect: () => {},
        useNavigate: () => () => {},
        navigator: {
            clipboard: {
                writeText: (value: string) => {
                    writes.push(value)
                    return new Promise<void>((resolve) => {
                        finish = resolve
                    })
                }
            }
        },
        window: { location: { origin: 'https://panel.example' } },
        useState: (initial: unknown) => {
            const index = cursor++
            if (!(index in slots))
                slots[index] = typeof initial === 'function' ? initial() : initial
            return [
                slots[index],
                (value: unknown) => {
                    slots[index] = value
                }
            ]
        }
    })
    const render = () => {
        cursor = 0
        return component({ entity: 'user', target: targets.user })
    }
    const setId = (value: string) => {
        ;(findElement(render(), TextField).props.onChange as (value: string) => void)(value)
    }
    setId(' 77 ')
    const pending = (findElement(render(), Button).props.onPress as () => Promise<void>)()
    assert.deepEqual(writes, ['https://panel.example/dashboard/open/user/77'])
    assert.equal(findElement(render(), Button).props.isPending, true)
    setId('88')
    assert(finish)
    finish()
    await pending
    assert.equal(slots[2], 'idle')
    const next = (findElement(render(), Button).props.onPress as () => Promise<void>)()
    assert(finish)
    finish()
    await next
    assert.equal(slots[2], 'copied')
    assert.equal(writes[1], 'https://panel.example/dashboard/open/user/88')
})
