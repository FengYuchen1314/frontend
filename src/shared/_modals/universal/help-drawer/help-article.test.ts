import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

import { HelpArticleContent } from './help-article-content'
import { helpLanguage, loadHelpArticle, resolveDocsUrl } from './model/help-article'

test('language selection supports region variants and safely falls back to English', () => {
    for (const [input, expected] of [
        ['zh-CN', 'zh'],
        ['RU_ru', 'ru'],
        ['fa', 'fa'],
        ['de', 'en'],
        ['', 'en']
    ])
        assert.equal(helpLanguage(input), expected)
    assert.match(resolveDocsUrl('PAGE_HOSTS', 'zh-CN'), /\/zh\/PAGE_HOSTS\.md$/)
})

test('localized documentation failure retries English with the same cancellation signal', async () => {
    const calls: string[] = []
    const controller = new AbortController()
    const fetcher: typeof fetch = async (input, options) => {
        calls.push(String(input))
        assert.equal(options?.signal, controller.signal)
        return new Response(calls.length === 1 ? '' : '# English', {
            status: calls.length === 1 ? 404 : 200
        })
    }
    assert.deepEqual(await loadHelpArticle('PAGE_HOSTS', 'zh', controller.signal, fetcher), {
        content: '# English',
        language: 'en'
    })
    assert.equal(calls.length, 2)
    assert.match(calls[1], /\/en\//)
})

test('successful localized documentation does not fetch English unnecessarily', async () => {
    let calls = 0
    const result = await loadHelpArticle(
        'PAGE_HOSTS',
        'ru',
        new AbortController().signal,
        async () => {
            calls++
            return new Response('# Russian')
        }
    )
    assert.equal(result.language, 'ru')
    assert.equal(calls, 1)
})

test('canceled documentation does not fall back or publish a late response body', async () => {
    const controller = new AbortController()
    let calls = 0
    await assert.rejects(
        loadHelpArticle('PAGE_HOSTS', 'zh', controller.signal, async () => {
            calls++
            controller.abort()
            return new Response('# late body')
        }),
        { name: 'AbortError' }
    )
    assert.equal(calls, 1)
})

test('English failure is returned rather than a permanently spinning or stale document', async () => {
    await assert.rejects(
        loadHelpArticle(
            'PAGE_HOSTS',
            'en',
            new AbortController().signal,
            async () => new Response('', { status: 503 })
        ),
        /503/
    )
})

test('the actual markdown view preserves tables, code, links and supported HTML without Mantine', () => {
    const html = renderToString(
        createElement(HelpArticleContent, {
            content:
                '# Help\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```json\n{}\n```\n\n[Guide](https://example.com)\n\n<details><summary>More</summary>Details</details>'
        })
    )
    assert.match(html, /<h1>Help<\/h1>/)
    assert.match(html, /<table>/)
    assert.match(html, /<code class="language-json">/)
    assert.match(html, /href="https:\/\/example.com"/)
    assert.match(html, /<details>/)
    assert.doesNotMatch(html, /mantine-/)
})
