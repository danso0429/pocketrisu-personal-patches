export interface SeekableImportSource {
    readonly size: number
    read(offset: number, length: number): Promise<Uint8Array>
}

export class Uint8ArrayImportSource implements SeekableImportSource {
    readonly size: number

    constructor(private readonly value: Uint8Array) {
        this.size = value.byteLength
    }

    async read(offset: number, length: number): Promise<Uint8Array> {
        if (
            !Number.isSafeInteger(offset)
            || !Number.isSafeInteger(length)
            || offset < 0
            || length < 0
            || offset + length > this.size
        ) {
            throw new Error('Import source range is invalid')
        }
        return this.value.subarray(offset, offset + length)
    }
}
