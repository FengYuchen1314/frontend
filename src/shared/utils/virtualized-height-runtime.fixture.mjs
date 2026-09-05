import { Box, Checkbox, MantineProvider } from '@mantine/core'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Virtuoso } from 'react-virtuoso'

// Independent layout probe, not an application build or a hydrated interaction test.
// The left side reproduces the committed flat-list component's real library composition;
// the right side loads the production CSS that gives the intermediate role=group a height.
const rows = Array.from({ length: 12 }, (_, index) => ({ uuid: `fixture-${index + 1}` }))
function fixedScroller(id, height = '100%') {
    return h(Virtuoso, {
        id: `${id}-scroller`,
        data: rows,
        fixedItemHeight: 60,
        increaseViewportBy: 300,
        initialItemCount: 6,
        computeItemKey: (_, row) => row.uuid,
        itemContent: (_, row) => h('div', { style: { height: 60 } }, row.uuid),
        style: { height }
    })
}

function probe(id) {
    return h(
        'section',
        { id },
        h(
            'h2',
            null,
            id === 'committed-layout' ? 'Committed layout' : 'Height-bearing group control'
        ),
        h(
            'div',
            { style: { height: 360, width: 420 }, 'data-fixture-frame': true },
            h(
                Box,
                {
                    style: { height: '100%', border: '1px solid #555', borderRadius: 8, padding: 8 }
                },
                h(
                    Checkbox.Group,
                    id === 'control-layout'
                        ? { className: 'checkboxGroup' }
                        : { style: { height: '100%' } },
                    fixedScroller(id)
                )
            )
        )
    )
}

const otherLayouts = [
    [
        'grouped-inbounds-layout',
        h(Checkbox.Group, null, fixedScroller('grouped-inbounds-layout', 360))
    ],
    [
        'user-squads-layout',
        h(
            Checkbox.Group,
            null,
            h(
                'div',
                {
                    style: { height: 200, border: '1px solid #555', borderRadius: 8, padding: 8 }
                },
                fixedScroller('user-squads-layout')
            )
        )
    ],
    [
        'simple-squads-layout',
        h(
            'div',
            {
                style: { height: 200, borderRadius: 8, padding: 8 }
            },
            fixedScroller('simple-squads-layout')
        )
    ],
    [
        'billing-layout',
        h(
            Box,
            { style: { height: 360 } },
            h(Virtuoso, {
                id: 'billing-layout-scroller',
                data: rows,
                defaultItemHeight: 72,
                increaseViewportBy: 576,
                initialItemCount: 6,
                computeItemKey: (_, row) => row.uuid,
                itemContent: (_, row) =>
                    h(
                        Box,
                        { style: { paddingBottom: 8 } },
                        h('div', { style: { height: 60 } }, row.uuid)
                    ),
                style: { height: '100%', overflowX: 'hidden' }
            })
        )
    ]
]
const layoutIds = ['committed-layout', 'control-layout', ...otherLayouts.map(([id]) => id)]

const markup = renderToStaticMarkup(
    h(
        MantineProvider,
        null,
        h(
            'main',
            null,
            probe('committed-layout'),
            probe('control-layout'),
            ...otherLayouts.map(([id, content]) =>
                h(
                    'section',
                    { id, key: id },
                    h('h2', null, id),
                    h(
                        'div',
                        { style: { height: 360, width: 420 }, 'data-fixture-frame': true },
                        content
                    )
                )
            )
        )
    )
)
const cssPath = fileURLToPath(import.meta.resolve('@mantine/core/styles.css'))
const productionCssPath = new URL(
    '../ui/config-profiles/virtualized-flat-inbounds-list/VirtualizedFlatInboundsList.module.css',
    import.meta.url
)
const page = `<!doctype html><html><head><meta charset="utf-8"><title>Virtualized height runtime probe</title><link rel="stylesheet" href="/mantine.css"><link rel="stylesheet" href="/flat-list.css"><style>body{padding:24px}main{display:flex;flex-wrap:wrap;gap:24px}</style></head><body>${markup}<p>This page checks real rendered DOM/CSS geometry only; it does not prove scroll or selection interactions.</p><pre id="measurements">Waiting for browser layout</pre><script>window.addEventListener('load',()=>{const results=${JSON.stringify(layoutIds)}.map(id=>{const section=document.getElementById(id);const frame=section.querySelector('[data-fixture-frame]');const group=section.querySelector('[role=group]');const scroller=document.getElementById(id+'-scroller');return {id,frameHeight:frame.getBoundingClientRect().height,groupHeight:group?group.getBoundingClientRect().height:null,scrollerHeight:scroller.getBoundingClientRect().height,scrollerClientHeight:scroller.clientHeight,scrollerScrollHeight:scroller.scrollHeight,overflowY:getComputedStyle(scroller).overflowY};});const isScrollable=(result)=>result.scrollerClientHeight>0 && result.scrollerScrollHeight>result.scrollerClientHeight;document.getElementById('measurements').textContent=JSON.stringify({productionCssLayout:isScrollable(results[1])?'PASS':'FAIL',otherLayoutFrames:results.slice(2).every(isScrollable)?'PASS':'FAIL',results},null,2);});</script></body></html>`

const server = createServer((request, response) => {
    if (request.url === '/mantine.css') {
        response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' })
        response.end(readFileSync(cssPath))
    } else if (request.url === '/flat-list.css') {
        response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' })
        response.end(readFileSync(productionCssPath))
    } else if (request.url === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end(page)
    } else {
        response.writeHead(404)
        response.end()
    }
})
server.listen(Number(process.argv[2] ?? 0), '127.0.0.1', () => {
    const address = server.address()
    process.stdout.write(`HEIGHT_PROBE_URL=http://127.0.0.1:${address.port}/\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close())
