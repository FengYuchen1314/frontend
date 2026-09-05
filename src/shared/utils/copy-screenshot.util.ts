import { domToCanvas } from 'modern-screenshot'

export const isScreenshotSupported = !/Firefox|Gecko\//.test(navigator.userAgent)

const prefersNativeShare =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

const MAX_CANVAS_AREA = 12_000_000
const PADDING_UNITS = 96

const BLOB_COLORS = [
    'rgba(99, 59, 171, 0.45)',
    'rgba(49, 120, 198, 0.4)',
    'rgba(167, 55, 138, 0.35)',
    'rgba(30, 144, 155, 0.35)',
    'rgba(76, 29, 149, 0.4)',
    'rgba(14, 116, 144, 0.35)',
    'rgba(134, 55, 100, 0.35)',
    'rgba(59, 78, 171, 0.4)'
]

function decorateCanvas(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    scale: number
): HTMLCanvasElement {
    const padding = (PADDING_UNITS / 2) * scale
    const innerRadius = 5 * scale

    const totalWidth = sourceWidth + padding * 2
    const totalHeight = sourceHeight + padding * 2

    const canvas = document.createElement('canvas')
    canvas.width = totalWidth
    canvas.height = totalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')

    ctx.fillStyle = '#111118'
    ctx.fillRect(0, 0, totalWidth, totalHeight)

    const blobCount = 3 + Math.floor(Math.random() * 2)
    const shuffled = [...BLOB_COLORS].sort(() => Math.random() - 0.5)
    for (let i = 0; i < blobCount; i++) {
        const bx = Math.random() * totalWidth
        const by = Math.random() * totalHeight
        const br = Math.max(totalWidth, totalHeight) * (0.3 + Math.random() * 0.4)
        const radial = ctx.createRadialGradient(bx, by, 0, bx, by, br)
        radial.addColorStop(0, shuffled[i % shuffled.length])
        radial.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = radial
        ctx.fillRect(0, 0, totalWidth, totalHeight)
    }

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(padding, padding, sourceWidth, sourceHeight, innerRadius)
    ctx.clip()
    ctx.drawImage(source, padding, padding, sourceWidth, sourceHeight)
    ctx.restore()

    return canvas
}

async function renderScreenshot(element: HTMLElement, scale = 3): Promise<HTMLCanvasElement> {
    const sourceCanvas = await domToCanvas(element, { scale })

    return decorateCanvas(sourceCanvas, sourceCanvas.width, sourceCanvas.height, scale)
}

async function renderImageScreenshot(image: HTMLImageElement): Promise<HTMLCanvasElement> {
    await image.decode().catch(() => {})

    const naturalWidth = image.naturalWidth || image.clientWidth
    const naturalHeight = image.naturalHeight || image.clientHeight

    if (!naturalWidth || !naturalHeight) throw new Error('Image is not ready yet')

    const maxScale = Math.sqrt(
        MAX_CANVAS_AREA / ((naturalWidth + PADDING_UNITS) * (naturalHeight + PADDING_UNITS))
    )
    const scale = Math.max(1, Math.min(2, maxScale))

    return decorateCanvas(image, naturalWidth * scale, naturalHeight * scale, scale)
}

function assertScreenshotSupported(): void {
    if (!isScreenshotSupported) {
        throw new Error('Screenshots are not supported in Firefox-based browsers')
    }
}

type ScreenshotTarget = (() => HTMLElement | Promise<HTMLElement>) | HTMLElement

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Failed to capture'))),
            'image/png'
        )
    })
}

function screenshotBlob(target: ScreenshotTarget, signal?: AbortSignal): Promise<Blob> {
    return Promise.resolve()
        .then(() => {
            signal?.throwIfAborted()
            return typeof target === 'function' ? target() : target
        })
        .then((element) => {
            signal?.throwIfAborted()
            return renderScreenshot(element)
        })
        .then((canvas) => {
            signal?.throwIfAborted()
            return canvasToBlob(canvas)
        })
        .then((blob) => {
            signal?.throwIfAborted()
            return blob
        })
}

function imageScreenshotBlob(image: HTMLImageElement, signal?: AbortSignal): Promise<Blob> {
    signal?.throwIfAborted()
    return renderImageScreenshot(image)
        .then((canvas) => {
            signal?.throwIfAborted()
            return canvasToBlob(canvas)
        })
        .then((blob) => {
            signal?.throwIfAborted()
            return blob
        })
}

function downloadBlob(blob: Blob, filename: string, signal?: AbortSignal): void {
    signal?.throwIfAborted()
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.download = filename
    a.href = url
    a.rel = 'noopener'

    try {
        document.body.appendChild(a)
        signal?.throwIfAborted()
        a.click()
    } finally {
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }
}

function copyBlobToClipboard(blob: Blob, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

async function copyPendingBlobToClipboard(
    blobPromise: Promise<Blob>,
    signal?: AbortSignal
): Promise<void> {
    let renderError: unknown

    const guarded = blobPromise
        .then((blob) => {
            signal?.throwIfAborted()
            return blob
        })
        .catch((error) => {
            renderError = error
            throw error
        })
    // The browser may reject before consuming its Blob promise (permissions or
    // unsupported ClipboardItem). Still observe a later rendering cancellation.
    void guarded.catch(() => {})

    try {
        signal?.throwIfAborted()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': guarded })])
    } catch (error) {
        throw renderError ?? error
    }
}

function shareableFile(blob: Blob, filename: string): File {
    return new File([blob], filename, { type: blob.type || 'image/png' })
}

function canShareFiles(): boolean {
    return (
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [shareableFile(new Blob(), 'probe.png')] })
    )
}

async function shareBlob(blob: Blob, filename: string, signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted()
    if (!canShareFiles()) return false

    try {
        signal?.throwIfAborted()
        await navigator.share({ files: [shareableFile(blob, filename)] })
        signal?.throwIfAborted()
        return true
    } catch (error) {
        signal?.throwIfAborted()
        return error instanceof DOMException && error.name === 'AbortError'
    }
}

async function shareOrCopyBlob(blob: Blob, filename: string, signal?: AbortSignal): Promise<void> {
    if (await shareBlob(blob, filename, signal)) return

    await copyBlobToClipboard(blob, signal)
}

async function shareOrSaveBlob(blob: Blob, filename: string, signal?: AbortSignal): Promise<void> {
    if (prefersNativeShare && (await shareBlob(blob, filename, signal))) return

    downloadBlob(blob, filename, signal)
}

export async function copyScreenshotToClipboard(
    target: ScreenshotTarget,
    filename = 'screenshot.png',
    signal?: AbortSignal
): Promise<void> {
    assertScreenshotSupported()
    signal?.throwIfAborted()

    if (canShareFiles()) {
        await shareOrCopyBlob(await screenshotBlob(target, signal), filename, signal)
        return
    }

    await copyPendingBlobToClipboard(screenshotBlob(target, signal), signal)
}

export async function downloadScreenshot(
    element: HTMLElement,
    filename: string,
    signal?: AbortSignal
): Promise<void> {
    assertScreenshotSupported()
    signal?.throwIfAborted()

    await shareOrSaveBlob(await screenshotBlob(element, signal), filename, signal)
}

export async function copyImageScreenshotToClipboard(
    image: HTMLImageElement,
    filename: string,
    signal?: AbortSignal
): Promise<void> {
    signal?.throwIfAborted()
    if (canShareFiles()) {
        await shareOrCopyBlob(await imageScreenshotBlob(image, signal), filename, signal)
        return
    }

    await copyPendingBlobToClipboard(imageScreenshotBlob(image, signal), signal)
}

export async function downloadImageScreenshot(
    image: HTMLImageElement,
    filename: string,
    signal?: AbortSignal
): Promise<void> {
    signal?.throwIfAborted()
    await shareOrSaveBlob(await imageScreenshotBlob(image, signal), filename, signal)
}
