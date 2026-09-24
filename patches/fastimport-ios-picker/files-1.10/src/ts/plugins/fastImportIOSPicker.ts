export interface FastImportPluginShape {
    name?: string
    displayName?: string
    version?: number | string
    script?: string
}

export interface FastImportIOSPickerPolicy {
    pluginName: string
    displayName: string
    apiVersion: number | string
    originalScriptSha256: string
    patchedScriptSha256: string
    needle: string
    replacement: string
}

export const FASTIMPORT_IOS_PICKER_POLICY: Readonly<FastImportIOSPickerPolicy> = Object.freeze({
    pluginName: 'fast-character-import',
    displayName: '고속 캐릭터 임포트 1.5.5',
    apiVersion: '2.1',
    originalScriptSha256: '203678e882cee9d2e2c66123820e26ede8d6cc085ac5feb0072ed2b5a2cee908',
    patchedScriptSha256: '5777e74585a3dfc7993cd53fef58c7ad2e649d1d6d167aaf8457355eb1885e94',
    needle: 'const clipText = await navigator.clipboard.readText();',
    replacement: "const clipText = isIOS() ? '' : await navigator.clipboard.readText();",
})

function countOccurrences(source: string, needle: string): number {
    if (!needle) return 0
    let count = 0
    let offset = 0
    while (true) {
        const found = source.indexOf(needle, offset)
        if (found < 0) return count
        count += 1
        offset = found + needle.length
    }
}

export async function sha256Text(source: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(source),
    )
    return [...new Uint8Array(digest)]
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
}

export async function applyFastImportIOSPickerCompatibility<
    T extends FastImportPluginShape,
>(
    plugins: T[],
    policy: Readonly<FastImportIOSPickerPolicy> = FASTIMPORT_IOS_PICKER_POLICY,
    digest: (source: string) => Promise<string> = sha256Text,
    logger: Pick<Console, 'warn'> = console,
): Promise<T[]> {
    const matches = plugins
        .map((plugin, index) => ({ plugin, index }))
        .filter(({ plugin }) => (
            plugin?.name === policy.pluginName
            && plugin?.displayName === policy.displayName
            && plugin?.version === policy.apiVersion
        ))

    if (matches.length === 0) return plugins
    if (matches.length !== 1) {
        logger.warn(
            `[FastImport iOS] Expected one exact plugin target; found ${matches.length}. `
            + 'Compatibility transform was not applied.',
        )
        return plugins
    }

    const { plugin, index } = matches[0]
    if (typeof plugin.script !== 'string') {
        logger.warn('[FastImport iOS] Exact plugin target has no script; transform was not applied.')
        return plugins
    }

    let scriptHash: string
    try {
        scriptHash = await digest(plugin.script)
    }
    catch (error) {
        logger.warn('[FastImport iOS] Script hash failed; transform was not applied.', error)
        return plugins
    }

    if (scriptHash === policy.patchedScriptSha256) return plugins
    if (scriptHash !== policy.originalScriptSha256) {
        logger.warn(
            `[FastImport iOS] Unknown exact-target script hash ${scriptHash}; `
            + 'transform was not applied.',
        )
        return plugins
    }

    const oldOccurrences = countOccurrences(plugin.script, policy.needle)
    const patchedOccurrences = countOccurrences(plugin.script, policy.replacement)
    if (oldOccurrences !== 1 || patchedOccurrences !== 0) {
        logger.warn(
            `[FastImport iOS] Expected source occurrence 1/0; found `
            + `${oldOccurrences}/${patchedOccurrences}. Transform was not applied.`,
        )
        return plugins
    }

    const patchedScript = plugin.script.replace(policy.needle, policy.replacement)
    let patchedHash: string
    try {
        patchedHash = await digest(patchedScript)
    }
    catch (error) {
        logger.warn('[FastImport iOS] Patched script hash failed; transform was not applied.', error)
        return plugins
    }
    if (patchedHash !== policy.patchedScriptSha256) {
        logger.warn(
            `[FastImport iOS] Patched script hash ${patchedHash} did not match the admitted value; `
            + 'transform was not applied.',
        )
        return plugins
    }

    return plugins.map((entry, entryIndex) => (
        entryIndex === index
            ? { ...entry, script: patchedScript }
            : entry
    ))
}
