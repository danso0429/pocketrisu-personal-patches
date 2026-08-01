interface PendingTranslationChunk {
    text: string
    resolve: (value: string) => void
    reject: (reason?: unknown) => void
}

export interface TranslationChunkBatchOptions {
    translate: (text: string) => Promise<string>
    maxCombinedLength?: number
    joiner?: string
    splitMarker?: string
}

export interface TranslationChunkBatch {
    enqueue: (text: string) => Promise<string>
    flush: () => Promise<void>
}

export function createTranslationChunkBatch(
    options: TranslationChunkBatchOptions,
): TranslationChunkBatch {
    const maxCombinedLength = Math.max(
        1,
        Math.floor(options.maxCombinedLength ?? 5000),
    )
    const joiner = options.joiner ?? '\n■\n'
    const splitMarker = options.splitMarker ?? '■'
    let current: PendingTranslationChunk[] = []
    let currentCombinedLength = 0
    const inFlight = new Set<Promise<void>>()
    let firstFailure: unknown
    let failed = false

    const translateBatch = async (
        batch: PendingTranslationChunk[],
    ): Promise<void> => {
        try {
            const translated = await options.translate(
                batch.map((entry) => entry.text).join(joiner),
            )
            const split = translated.split(splitMarker)
            if (split.length === batch.length) {
                for (let index = 0; index < batch.length; index++) {
                    batch[index].resolve(split[index])
                }
                return
            }

            for (const entry of batch) {
                entry.resolve(await options.translate(entry.text))
            }
        }
        catch (error) {
            for (const entry of batch) {
                entry.reject(error)
            }
            throw error
        }
    }

    const startCurrent = (): void => {
        if (current.length === 0) {
            return
        }
        const batch = current
        current = []
        currentCombinedLength = 0
        const operation = translateBatch(batch)
        inFlight.add(operation)
        operation.then(
            () => {
                inFlight.delete(operation)
            },
            (error) => {
                inFlight.delete(operation)
                if (!failed) {
                    failed = true
                    firstFailure = error
                }
            },
        )
    }

    return {
        enqueue(text: string): Promise<string> {
            const addedLength = text.length
                + (current.length > 0 ? joiner.length : 0)
            if (currentCombinedLength + addedLength >= maxCombinedLength) {
                startCurrent()
            }
            return new Promise<string>((resolve, reject) => {
                if (current.length > 0) {
                    currentCombinedLength += joiner.length
                }
                current.push({ text, resolve, reject })
                currentCombinedLength += text.length
            })
        },

        async flush(): Promise<void> {
            do {
                startCurrent()
                if (inFlight.size > 0) {
                    await Promise.allSettled(Array.from(inFlight))
                }
            }
            while (current.length > 0 || inFlight.size > 0)
            if (failed) {
                throw firstFailure
            }
        },
    }
}
