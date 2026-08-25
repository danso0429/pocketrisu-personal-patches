import { createPageFoldHttpRenderPort } from './httpRenderPort'
import { PageFoldRenderPortError, type PageFoldRenderPort } from './renderPort'

declare global {
    // Installed only by the BG server composition root. Never persisted.
    var __pageFoldRenderPort: PageFoldRenderPort | undefined
    var __bgOrch: unknown
}

let browserPort: PageFoldRenderPort | undefined

export function getPageFoldRuntimeRenderPort(): PageFoldRenderPort {
    if (globalThis.__pageFoldRenderPort) return globalThis.__pageFoldRenderPort
    if (globalThis.__bgOrch) {
        throw new PageFoldRenderPortError(
            'PAGEFOLD_RENDER_PORT_MISSING',
            'PageFold BG rendering port is not installed',
        )
    }
    browserPort ??= createPageFoldHttpRenderPort()
    return browserPort
}

export function setPageFoldRuntimeRenderPortForTest(port: PageFoldRenderPort | undefined): void {
    browserPort = port
}
