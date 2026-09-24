/** Bounded acquisition without retaining an unbounded array of tiny chunks. */
export async function readFontStream(
    body: ReadableStream<Uint8Array>,
    maximumBytes: number,
    progress: (bytes: number) => void = () => {},
): Promise<Uint8Array> {
    const reader = body.getReader()
    let bytes = new Uint8Array(Math.min(65_536, maximumBytes))
    let size = 0
    try {
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            if (size + value.byteLength > maximumBytes) throw new Error('폰트 다운로드가 크기 한도를 초과했습니다.')
            if (size + value.byteLength > bytes.length) {
                const grown = new Uint8Array(Math.min(maximumBytes, Math.max(size + value.byteLength, bytes.length * 2)))
                grown.set(bytes.subarray(0, size))
                bytes = grown
            }
            bytes.set(value, size)
            size += value.byteLength
            progress(size)
        }
        return bytes.slice(0, size)
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
