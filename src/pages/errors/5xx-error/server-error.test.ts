import { Button, Disclosure } from '@heroui/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, useEffect, useRef, useState, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

import { ROUTES } from '../../../shared/constants/routes.ts'
import { formatErrorDetails } from './server-error.model.ts'

function component(path: string, name: string, scope: Record<string, unknown>) {
    const text = readFileSync(new URL(path, import.meta.url), 'utf8')
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const fn = file.statements.find(
        (node): node is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(node) && node.name?.text === name
    )
    assert(fn)
    const javascript = ts.transpileModule(`return ${fn.getText(file).replace(/^export\s+/, '')}`, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.React,
            jsxFactory: 'createElement'
        }
    }).outputText
    return new Function(...Object.keys(scope), javascript)(...Object.values(scope)) as (
        props: Record<string, unknown>
    ) => ReactElement
}

test('error details preserve complete error/component stacks and omit absent values', () => {
    const error = new Error('fixture')
    error.stack = 'Error: fixture\n    at one (fixture.ts:1:1)\n\n    at two (fixture.ts:2:2)'
    assert.equal(
        formatErrorDetails(error, '\n    at App'),
        `${error.stack}\n\nComponent stack:\n    at App`
    )
    assert.equal(formatErrorDetails(undefined), '')
    assert.equal(formatErrorDetails('non-Error', null), '')
    assert.equal(formatErrorDetails(undefined, 'Only component'), 'Component stack:Only component')
})

test('404 retains the illustration, explanation and dashboard return action using real HeroUI SSR', () => {
    const navigations: unknown[] = []
    const scope = {
        createElement,
        Button,
        ROUTES,
        classes: {},
        useNavigate: () => (value: unknown) => navigations.push(value)
    }
    const Illustration = component('../4xx-error/not-found.component.tsx', 'Illustration', scope)
    const NotFound = component('../4xx-error/not-found.component.tsx', 'NotFoundPageComponent', {
        ...scope,
        Illustration
    })
    const html = renderToStaticMarkup(createElement(NotFound))
    assert.match(html, /Nothing to see here/)
    assert.match(html, /Page you are trying to open does not exist/)
    assert.match(html, /Take me back to home page/)
    assert.match(html, /<svg[^>]+aria-hidden="true"/)
    const tree = NotFound({})
    const children = tree.props as { children: ReactElement<{ children: ReactElement[] }> }
    const content = children.children.props.children[1] as ReactElement<{
        children: ReactElement[]
    }>
    const actions = content.props.children[2] as ReactElement<{
        children: ReactElement<{ onPress: () => void }>
    }>
    actions.props.children.props.onPress()
    assert.deepEqual(navigations, [ROUTES.DASHBOARD.ROOT])
})

test('500 refreshes the current page and keys full error details to a fresh panel', () => {
    const navigations: unknown[] = []
    const ErrorDetailsPanel = () => null
    const ErrorPage = component('./server-error.component.tsx', 'ErrorPageComponent', {
        createElement,
        Button,
        ErrorDetailsPanel,
        classes: {},
        formatErrorDetails,
        useNavigate: () => (value: unknown) => navigations.push(value)
    })
    const error = new Error('fixture')
    const tree = ErrorPage({ error, componentStack: '\n    at App' }) as ReactElement<{
        children: ReactElement<{ children: ReactElement[] }>
    }>
    const content = tree.props.children.props.children
    const actions = content[2] as ReactElement<{ children: ReactElement<{ onPress: () => void }> }>
    actions.props.children.props.onPress()
    assert.deepEqual(navigations, [0])
    const details = content[3] as ReactElement<{ details: string }>
    assert.equal(details.props.details, formatErrorDetails(error, '\n    at App'))
    assert.equal(details.key, details.props.details)
    const html = renderToStaticMarkup(createElement(ErrorPage, {}))
    assert.match(html, /Something bad just happened/)
    assert.match(html, /Refresh the page/)
})

test('error surfaces and styles no longer depend on Mantine or its CSS macros', () => {
    for (const path of [
        './server-error.component.tsx',
        './ServerError.module.css',
        '../4xx-error/not-found.component.tsx',
        '../4xx-error/NotFound.module.css'
    ]) {
        assert.doesNotMatch(
            readFileSync(new URL(path, import.meta.url), 'utf8'),
            /@mantine|--mantine|\$mantine|\brem\(/
        )
    }
})

test('real HeroUI error disclosure keeps its trigger, copy control and escaped stack lines', () => {
    const Details = component('./server-error.component.tsx', 'ErrorDetailsPanel', {
        createElement,
        Button,
        Disclosure,
        useEffect,
        useRef,
        useState,
        classes: {}
    })
    const html = renderToStaticMarkup(
        createElement(Details, { details: 'Error: <script>fixture</script>\n    at App' })
    )
    assert.match(html, /Error details/)
    assert.match(html, /aria-expanded="false"/)
    assert.match(html, /Copy error details/)
    assert.match(html, /&lt;script&gt;fixture&lt;\/script&gt;/)
    assert.doesNotMatch(html, /<script>fixture/)
})
