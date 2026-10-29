'use strict'

// PocketRisu 1.16.1 characterCards.ts units. Native code stays the base; these
// units add the import job (progress notification, confirmed save, final
// success or failure) on top of it. The unit `character-import-ux:character-cards`
// in manifest.cjs replaces the importCharacterProcess header and requires every
// unit here, so packs that order after it see all of them applied.

const stateImport = 'character-import-ux:character-state-import:1.16'

const unit = (name, fields) => ({
    id: `character-import-ux:${name}:1.16`,
    file: 'src/ts/characterCards.ts',
    requires: name === 'character-state-import' ? ['character-import-ux:state'] : [stateImport],
    ...fields,
})

const progress = (indent, label, count, title, nativeMessage) => {
    const pad = ' '.repeat(indent)
    return {
        anchor: `${pad}alertStore.set({
${pad}    type: 'progress',
${pad}    msg: \`${nativeMessage}\`,
${pad}    submsg: (i / ${count} * 100).toFixed(2)
${pad}})
`,
        content: `${pad}if (importJob) {
${pad}    importJob.update(formatCharacterImportProgress(
${pad}        '${title}',
${pad}        i + 1,
${pad}        ${count},
${pad}    ))
${pad}}
${pad}else {
${pad}    alertStore.set({
${pad}        type: 'progress',
${pad}        msg: \`${nativeMessage}\`,
${pad}        submsg: (i / ${count} * 100).toFixed(2)
${pad}    })
${pad}}
`,
        label,
    }
}

const progressUnits = [
    progress(16, 'emotions', 'risuext.emotions.length', 'Saving character emotions...', 'Loading... (Loading Emotions)'),
    progress(16, 'additional-assets', 'risuext.additionalAssets.length', 'Saving character assets...', 'Loading... (Loading Assets)'),
    progress(16, 'voice-assets', 'keys.length', 'Saving character voice assets...', 'Loading... (Loading VITS)'),
    progress(16, 'card-assets', 'data.assets.length', 'Saving character assets...', 'Loading... (Assets)'),
].map(({ label, anchor, content }) => unit(`character-spec-progress-${label}`, {
    type: 'replace',
    anchor,
    content,
}))

module.exports = [
    unit('character-alert-import', {
        type: 'replace',
        anchor: 'import { alertCardExport, alertConfirm, alertError, alertInput, alertNormal, alertStore, alertTOS, alertWait, notifySuccess, notifyError } from "./alert"',
        content: 'import { alertCardExport, alertConfirm, alertError as showNativeAlertError, alertInput, alertNormal, alertStore, alertTOS, alertWait, notifySuccess, notifyError } from "./alert"',
    }),
    unit('character-save-import', {
        type: 'replace',
        anchor: 'import { AppendableBuffer, BlankWriter, checkCharOrder, downloadFile, forageStorage, loadAsset, loadAssetManifestItems, LocalWriter, readImage, saveAsset, VirtualWriter } from "./globalApi.svelte"',
        content: 'import { AppendableBuffer, BlankWriter, checkCharOrder, downloadFile, forageStorage, loadAsset, loadAssetManifestItems, LocalWriter, readImage, requestImportedCharacterSave, saveAsset, VirtualWriter } from "./globalApi.svelte"',
    }),
    unit('character-state-import', {
        type: 'insert',
        where: 'after',
        anchor: 'import { normalizeOnboarding } from "./onboarding"\n',
        content: 'import { beginCharacterImport, formatCharacterImportProgress, type CharacterImportJob } from "./characterImportState"\n',
    }),
    unit('character-import-outcome', {
        type: 'insert',
        where: 'before',
        anchor: `const EXTERNAL_HUB_URL = 'https://sv.risuai.xyz';\n`,
        content: `// While a character import job runs, the error modals that native import
// code shows are recorded on the job: a job that ends without a new
// character fails if one was shown, and closes quietly otherwise.
let characterImportOutcome: { errorShown: boolean, error: unknown } | null = null

function alertError(msg: unknown) {
    if (characterImportOutcome) {
        characterImportOutcome.errorShown = true
        characterImportOutcome.error = msg
    }
    showNativeAlertError(msg)
}
`,
        requires: [stateImport, 'character-import-ux:character-alert-import:1.16'],
    }),
    unit('character-json-job', {
        type: 'replace',
        anchor: '        if(await importCharacterCardSpec(da)){\n',
        content: "        if(await importCharacterCardSpec(da, undefined, 'normal', {}, null, false, importJob)){\n",
    }),
    unit('character-json-offspec-notify', {
        type: 'replace',
        anchor: '            setDatabaseLite(db)\n            notifySuccess(language.importedCharacter)\n            return\n',
        content: '            setDatabaseLite(db)\n            if(!importJob) notifySuccess(language.importedCharacter)\n            return\n',
    }),
    unit('character-charx-progress', {
        type: 'replace',
        anchor: `        console.log('reading charx')
        alertStore.set({
            type: 'wait',
            msg: 'Loading... (Reading)'
        })

        const importer = new CharXImporter()
        importer.alertInfo = true
`,
        content: `        console.log('reading charx')
        if (importJob) importJob.update('Reading character archive...')
        else {
            alertStore.set({
                type: 'wait',
                msg: 'Loading... (Reading)'
            })
        }

        const importer = new CharXImporter()
        importer.alertInfo = !importJob
        if (importJob) {
            importer.setProgressHandler((done, total) => {
                importJob.update(formatCharacterImportProgress(
                    'Saving character assets...',
                    done,
                    total,
                ))
            })
        }
`,
        requires: [stateImport, 'character-import-ux:charx-progress-callback'],
    }),
    unit('character-charx-job', {
        type: 'replace',
        anchor: 'lorebook, f.returnCharacter)\n',
        content: 'lorebook, f.returnCharacter, importJob)\n',
    }),
    unit('character-png-reading', {
        type: 'replace',
        anchor: `    alertStore.set({
        type: 'wait',
        msg: 'Loading... (Reading)'
    })
    await sleep(10)
`,
        content: `    if (importJob) importJob.update('Reading character image...')
    else {
        alertStore.set({
            type: 'wait',
            msg: 'Loading... (Reading)'
        })
        await sleep(10)
    }
`,
    }),
    unit('character-png-asset-progress', {
        type: 'replace',
        anchor: '            if(pngChunks === 0){\n',
        content: `            if(importJob){
                importJob.update(formatCharacterImportProgress(
                    'Saving character assets...',
                    readedPngChunks + 1,
                    pngChunks > 0 ? pngChunks : undefined,
                ))
            }
            else if(pngChunks === 0){
`,
    }),
    unit('character-rcc-password-job', {
        type: 'replace',
        anchor: '                        if(await importCharacterCardSpec(charaData, img, "normal", assets)){\n',
        content: '                        if(await importCharacterCardSpec(charaData, img, "normal", assets, null, false, importJob)){\n',
    }),
    unit('character-rcc-plain-job', {
        type: 'replace',
        anchor: `                const decrypted = await decryptBuffer(encrypted, 'RISU_NONE')
                try {
                    const charaData:CharacterCardV2Risu = JSON.parse(Buffer.from(decrypted).toString('utf-8'))
                    if(await importCharacterCardSpec(charaData, img, "normal", assets)){
`,
        content: `                const decrypted = await decryptBuffer(encrypted, 'RISU_NONE')
                try {
                    const charaData:CharacterCardV2Risu = JSON.parse(Buffer.from(decrypted).toString('utf-8'))
                    if(await importCharacterCardSpec(charaData, img, "normal", assets, null, false, importJob)){
`,
    }),
    unit('character-png-offspec-notify', {
        type: 'replace',
        anchor: '        setDatabaseLite(db)\n        notifySuccess(language.importedCharacter)\n        return db.characters.length - 1\n',
        content: '        setDatabaseLite(db)\n        if(!importJob) notifySuccess(language.importedCharacter)\n        return db.characters.length - 1\n',
    }),
    unit('character-png-job', {
        type: 'replace',
        anchor: '    await importCharacterCardSpec(parsed, img, "normal", assets)\n',
        content: '    await importCharacterCardSpec(parsed, img, "normal", assets, null, false, importJob)\n',
    }),
    unit('character-picker-job', {
        type: 'replace',
        anchor: `        for(const f of files){
            await importCharacterProcess({
                name: f.name,
                data: f
            })
            checkCharOrder()
        }
`,
        content: `        for(const f of files){
            let failed = false
            await importCharacterProcessWithError({
                name: f.name,
                data: f
            }, (error) => {
                failed = true
                alertError(error)
            })
            if (failed) return null
            checkCharOrder()
        }
`,
    }),
    unit('character-charahub-job', {
        type: 'replace',
        anchor: `            const img = new Uint8Array(await chara.arrayBuffer())
            await importCharacterProcess({
                name: 'charahub.png',
                data: img
            })
        }
    } catch (error) {
        notifyError(language.errors.noData)
        return null
    }
`,
        content: `            const img = new Uint8Array(await chara.arrayBuffer())
            alertStore.set({ type: 'none', msg: '' })
            let failed = false
            await importCharacterProcessWithError({
                name: 'charahub.png',
                data: img
            }, () => {
                failed = true
                notifyError(language.errors.noData)
            })
            if (failed) return null
        }
    } catch (error) {
        alertStore.set({ type: 'none', msg: '' })
        notifyError(language.errors.noData)
        return null
    }
`,
    }),
    unit('character-spec-signature', {
        type: 'replace',
        anchor: "async function importCharacterCardSpec<T extends boolean = false>(card:CharacterCardV2Risu|CharacterCardV3, img?:Uint8Array, mode:'hub'|'normal' = 'normal', assetDict:{[key:string]:string} = {}, overrideLorebook: loreBook[] = null, returnValue:T = false as T):Promise<T extends true ? character|false : boolean>{\n",
        content: `async function importCharacterCardSpec<T extends boolean = false>(
    card:CharacterCardV2Risu|CharacterCardV3,
    img?:Uint8Array,
    mode:'hub'|'normal' = 'normal',
    assetDict:{[key:string]:string} = {},
    overrideLorebook: loreBook[] = null,
    returnValue:T = false as T,
    importJob: CharacterImportJob | null = null,
):Promise<T extends true ? character|false : boolean>{
`,
    }),
    unit('character-spec-image-progress', {
        type: 'insert',
        where: 'before',
        anchor: '    let im = img ? await saveAsset(img) : undefined\n',
        content: "    if (img && importJob) importJob.update('Saving character image...')\n",
        requires: [stateImport, 'character-import-ux:character-spec-signature:1.16'],
    }),
    ...progressUnits.map((progressUnit) => ({
        ...progressUnit,
        requires: [stateImport, 'character-import-ux:character-spec-signature:1.16'],
    })),
    unit('character-spec-notify', {
        type: 'replace',
        anchor: '    db.characters.push(char)\n    notifySuccess(language.importedCharacter)\n    return true as any\n',
        content: '    db.characters.push(char)\n    if(!importJob) notifySuccess(language.importedCharacter)\n    return true as any\n',
        requires: [stateImport, 'character-import-ux:character-spec-signature:1.16'],
    }),
    unit('character-hub-archive-job', {
        type: 'replace',
        anchor: `            let db = getDatabase()
            if(res.headers.get('content-type') === 'application/zip' || res.headers.get('content-type') === 'application/charx'){
                await importCharacterProcess({
                    name: 'realm.charx',
                    data: new Uint8Array(await res.arrayBuffer()),
                    lightningRealmImport: db.lightningRealmImport,
                })
            }
            else{
                await importCharacterProcess({
                    name: 'realm.png',
                    data: res.body,
                    lightningRealmImport: db.lightningRealmImport,
                })
            }
            checkCharOrder()
`,
        content: `            alertStore.set({ type: 'none', msg: '' })
            let db = getDatabase()
            let imported: number | null
            if(res.headers.get('content-type') === 'application/zip' || res.headers.get('content-type') === 'application/charx'){
                imported = await importCharacterProcessWithError({
                    name: 'realm.charx',
                    data: new Uint8Array(await res.arrayBuffer()),
                    lightningRealmImport: db.lightningRealmImport,
                }, () => alertError("Error while importing"))
            }
            else{
                imported = await importCharacterProcessWithError({
                    name: 'realm.png',
                    data: res.body,
                    lightningRealmImport: db.lightningRealmImport,
                }, () => alertError("Error while importing"))
            }
            if (imported === null) return
            checkCharOrder()
`,
    }),
    unit('character-hub-card-job', {
        type: 'replace',
        anchor: "        await importCharacterCardSpec(data, await getHubResources(img), 'hub')\n",
        content: `        alertStore.set({ type: 'none', msg: '' })
        // One job covers the card and its resources; a failure shows the
        // native Hub error instead of the raw one.
        const imported = await runCharacterImportJob(
            async (job) => importCharacterCardSpec(
                data,
                await getHubResources(img),
                'hub',
                {},
                null,
                false,
                job,
            ),
            () => alertError("Error while importing"),
        )
        if (imported === null) return
`,
    }),
]
