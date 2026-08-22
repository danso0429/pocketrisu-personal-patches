'use strict'

const pocketRisu181 = { pocketrisu: ['1.8.1'] }
const pocketRisu190 = { pocketrisu: ['1.9.0', '1.10.0'] }

function createTranslationToolsAdapterManifest({
    id,
    title,
    adapter,
    bgPreserve,
}) {
    const prefix = `${id}:`
    const marker = (name) =>
        `POCKETRISU-PATCH:kei-translation-tools:${adapter}:${name}`
    const chatRenderAdapter = `kei-chat-render-${adapter}-adapter`
    const translatorAfter = bgPreserve
        ? [
            'bg-preserve:hook:regex-translator-import',
            'bg-preserve:hook:regex-translator-edittrans',
        ]
        : []

    const manifest181 = {
        id,
        title,
        version: '0.2.1',
        userSelectable: false,
        requires: bgPreserve
            ? [
                'kei-translation-tools-core',
                'kei-chat-render-bg-adapter',
                'bg-preserve',
            ]
            : [
                'kei-translation-tools-core',
                'kei-chat-render-base-adapter',
            ],
        conflicts: bgPreserve
            ? ['kei-translation-tools-base-adapter']
            : ['bg-preserve', 'kei-translation-tools-bg-adapter'],
        autoWhen: bgPreserve
            ? {
                all: ['kei-translation-tools-core', 'bg-preserve'],
            }
            : {
                all: ['kei-translation-tools-core'],
                none: ['bg-preserve'],
            },
        units: [
            {
                id: `${prefix}language-page-imports`,
                file: 'src/lib/Setting/Pages/LanguageSettings.svelte',
                type: 'replace',
                anchor: `    import { onMount } from "svelte";
`,
                managed: `    import { onMount } from "svelte";
    /* ${marker('language-page-imports')} */
    import { DBState } from "src/ts/stores.svelte";
    import TranslationCachePanel from "./Language/TranslationCachePanel.svelte";
`,
                markerNeedle: marker('language-page-imports'),
                anchorPolicy: 'first',
                requires: [
                    'kei-translation-tools-core:src/lib/Setting/Pages/Language/TranslationCachePanel.svelte',
                ],
            },
            {
                id: `${prefix}language-page-panel`,
                file: 'src/lib/Setting/Pages/LanguageSettings.svelte',
                type: 'replace',
                anchor: `<SettingRenderer items={languageSettingsItems} />
</SettingPage>
`,
                managed: `<SettingRenderer items={languageSettingsItems} />
<!-- ${marker('language-page-panel')} -->
{#if DBState.db.translator && DBState.db.translatorType === 'llm'}
    <TranslationCachePanel />
{/if}
</SettingPage>
`,
                markerNeedle: marker('language-page-panel'),
                anchorPolicy: 'first',
                requires: [`${prefix}language-page-imports`],
            },
            {
                id: `${prefix}language-en`,
                file: 'src/lang/en.ts',
                type: 'insert',
                where: 'after',
                anchor: `    clearTranslationCacheConfirm: "This will delete all translation cache entries. This cannot be undone. Continue?",
`,
                content: `    /* ${marker('language-en')} */
    translationCacheManagement: "Translation Cache Entries",
    translationCacheManagementDesc: "Search, inspect, copy, edit, or delete individual LLM translation cache entries. Export, import, and clear-all remain in the controls above.",
    translationCacheRefresh: "Refresh",
    translationCacheEntries: "Translation Cache Entries",
    translationCacheSearchPlaceholder: "Search original or translated text...",
    translationCacheShown: (shown: number, filtered: number, total: number, loading: boolean) => loading
        ? \`Showing \${shown} of \${filtered} loaded entries (about \${total} found so far).\`
        : \`Showing \${shown} of \${filtered} matching entries (\${total} total).\`,
    translationCacheNoSearchResults: "No matching translation cache entries.",
    translationCacheOriginal: "Original cache key",
    translationCacheTranslated: "Cached translation",
    translationCacheShowOriginal: "Show original",
    translationCacheHideOriginal: "Hide original",
    translationCacheEntrySaved: "Translation cache entry updated.",
    translationCacheEntryChanged: "This cache entry changed or disappeared after it was loaded. It was not overwritten or deleted; refresh and try again.",
    deleteTranslationCacheEntryConfirm: "Delete this exact translation cache entry? This cannot be undone.",
    deleteTranslationCacheEntrySuccess: "Translation cache entry deleted.",
    cleanupUnusedTranslationCache: "Review Unused Candidates",
    cleanupUnusedTranslationCacheDesc: "Scan exact source text still present in greetings, chats, swipes, suggestions, and Hypa summaries. Candidates are only previewed until you explicitly delete them.",
    translationCacheScanCandidates: "Scan candidates",
    translationCacheCleanupCandidates: "Unused candidate preview",
    translationCacheDeleteCandidates: (count: number) => \`Delete \${count} candidates\`,
    translationCacheCleanupScopeWarning: "Review before deleting: formatted chat keys and translations created by Playground, input translation, TTS, exports, or plugins may appear as candidates because those sources cannot be proven from the saved chat database.",
    translationCacheCleanupScanProgress: (current: number, total: number) => \`Scanning saved sources... (\${current}/\${total})\`,
    translationCacheCleanupLoadProgress: (current: number, total: number) => \`Loading cache entries... (\${current}/\${total})\`,
    translationCacheCleanupPreviewReady: (count: number) => \`\${count} candidates are shown below. Nothing has been deleted.\`,
    translationCacheCleanupCancelled: "Translation cache scan or cleanup cancelled.",
    translationCacheCleanupCancelledAfter: (deleted: number, skipped: number) => \`Cleanup cancelled after deleting \${deleted} entries and skipping \${skipped} changed or missing entries. Remaining candidates are still previewed.\`,
    cleanupUnusedTranslationCacheProgressScanningChats: "Scanning saved translation sources...",
    cleanupUnusedTranslationCacheProgressLoadingCache: "Loading translation cache...",
    cleanupUnusedTranslationCacheProgressDeleting: (current: number, total: number) => \`Deleting unchanged candidates... (\${current}/\${total})\`,
    cleanupUnusedTranslationCacheConfirm: (count: number) => \`Delete the \${count} previewed entries only if each still has the exact value that was scanned? This cannot be undone.\`,
    cleanupUnusedTranslationCacheSuccess: (deleted: number, skipped: number) => \`Deleted \${deleted} entries; skipped \${skipped} entries that changed or disappeared.\`,
`,
                markerNeedle: marker('language-en'),
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}language-ko`,
                file: 'src/lang/ko.ts',
                type: 'insert',
                where: 'after',
                anchor: `  clearTranslationCacheConfirm:
    "모든 번역 캐시 항목이 삭제됩니다. 되돌릴 수 없습니다. 계속하시겠습니까?",
`,
                content: `  /* ${marker('language-ko')} */
  translationCacheManagement: "번역 캐시 항목",
  translationCacheManagementDesc:
    "LLM 번역 캐시를 검색·확인·복사·수정하거나 개별 삭제합니다. 내보내기·가져오기·전체 지우기는 위의 기존 버튼을 그대로 사용합니다.",
  translationCacheRefresh: "새로고침",
  translationCacheEntries: "번역 캐시 항목",
  translationCacheSearchPlaceholder: "원문 또는 번역문 검색...",
  translationCacheShown: (
    shown: number,
    filtered: number,
    total: number,
    loading: boolean,
  ) =>
    loading
      ? \`현재 불러온 \${filtered}개 중 \${shown}개 표시(현재까지 약 \${total}개 발견).\`
      : \`검색 결과 \${filtered}개 중 \${shown}개 표시(전체 \${total}개).\`,
  translationCacheNoSearchResults: "일치하는 번역 캐시 항목이 없습니다.",
  translationCacheOriginal: "원문 캐시 키",
  translationCacheTranslated: "저장된 번역문",
  translationCacheShowOriginal: "원문 보기",
  translationCacheHideOriginal: "원문 숨기기",
  translationCacheEntrySaved: "번역 캐시 항목을 수정했습니다.",
  translationCacheEntryChanged:
    "불러온 뒤 이 캐시 항목이 바뀌었거나 사라졌습니다. 덮어쓰거나 삭제하지 않았으니 새로고침한 뒤 다시 시도하세요.",
  deleteTranslationCacheEntryConfirm:
    "현재 표시된 정확한 번역 캐시 항목을 삭제할까요? 되돌릴 수 없습니다.",
  deleteTranslationCacheEntrySuccess: "번역 캐시 항목을 삭제했습니다.",
  cleanupUnusedTranslationCache: "미사용 후보 검토",
  cleanupUnusedTranslationCacheDesc:
    "인사말·채팅·스와이프·제안·Hypa 요약에 남아 있는 정확한 원문을 검사합니다. 후보를 먼저 보여주며 별도 삭제 동작 전에는 아무것도 지우지 않습니다.",
  translationCacheScanCandidates: "후보 검사",
  translationCacheCleanupCandidates: "미사용 후보 미리보기",
  translationCacheDeleteCandidates: (count: number) => \`후보 \${count}개 삭제\`,
  translationCacheCleanupScopeWarning:
    "삭제 전에 검토하세요. 포맷된 채팅 키와 Playground·입력 번역·TTS·내보내기·플러그인이 만든 번역은 저장된 채팅 DB에서 사용 여부를 증명할 수 없어 후보에 포함될 수 있습니다.",
  translationCacheCleanupScanProgress: (current: number, total: number) =>
    \`저장된 원문 검사 중... (\${current}/\${total})\`,
  translationCacheCleanupLoadProgress: (current: number, total: number) =>
    \`캐시 항목 불러오는 중... (\${current}/\${total})\`,
  translationCacheCleanupPreviewReady: (count: number) =>
    \`아래에 후보 \${count}개를 표시했습니다. 아직 삭제한 항목은 없습니다.\`,
  translationCacheCleanupCancelled: "번역 캐시 검사 또는 정리를 취소했습니다.",
  translationCacheCleanupCancelledAfter: (deleted: number, skipped: number) =>
    \`정리를 취소하기 전 \${deleted}개를 삭제했고 바뀌었거나 사라진 \${skipped}개를 건너뛰었습니다. 남은 후보는 계속 미리보기로 표시합니다.\`,
  cleanupUnusedTranslationCacheProgressScanningChats:
    "저장된 번역 원문을 검사하는 중...",
  cleanupUnusedTranslationCacheProgressLoadingCache:
    "번역 캐시를 불러오는 중...",
  cleanupUnusedTranslationCacheProgressDeleting: (
    current: number,
    total: number,
  ) => \`바뀌지 않은 후보를 삭제하는 중... (\${current}/\${total})\`,
  cleanupUnusedTranslationCacheConfirm: (count: number) =>
    \`미리 본 \${count}개 항목 중 검사 당시와 값이 정확히 같은 항목만 삭제할까요? 되돌릴 수 없습니다.\`,
  cleanupUnusedTranslationCacheSuccess: (deleted: number, skipped: number) =>
    \`\${deleted}개를 삭제했고 바뀌었거나 사라진 \${skipped}개는 건너뛰었습니다.\`,
`,
                markerNeedle: marker('language-ko'),
                anchorPolicy: 'first',
                requires: [`${prefix}language-en`],
            },
            {
                id: `${prefix}translator-runtime-import`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `import { clearPersistentPrefix, listPersistentKeys, makeHashedStorageKey, readPersistentJson, writePersistentJson } from "../storage/persistentKv"
`,
                managed: `/* ${marker('translator-runtime-import')}:START */
import {
    getLLMCache as getCachedLLMTranslation,
    storeGeneratedLLMCache,
} from "./translationCacheRuntime"
import {
    raceTranslationAbort,
    throwIfTranslationAborted,
    waitForTranslationDelay,
} from "./translationTask"
import { createTranslationChunkBatch } from "./translationChunkBatch"
/* ${marker('translator-runtime-import')}:END */
`,
                markerNeedle: `${marker('translator-runtime-import')}:START`,
                anchorPolicy: 'first',
                requires: [
                    'kei-translation-tools-core:src/ts/translator/translationCacheRuntime.ts',
                    'kei-translation-tools-core:src/ts/translator/translationTask.ts',
                    'kei-translation-tools-core:src/ts/translator/translationChunkBatch.ts',
                ],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-remove-sleep-import`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `import { getNodetextToSentence, sleep } from "../util"
`,
                managed: `/* ${marker('translator-remove-sleep-import')} */
import { getNodetextToSentence } from "../util"
`,
                markerNeedle: marker('translator-remove-sleep-import'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-runtime-import`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-remove-legacy-cache-runtime`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `const llmTranslateCache = new Map<string, string>()
const llmTranslateCachePrefix = 'cache/llm-translate/'

async function getPersistentLLMCache(text: string): Promise<string | null> {
    const storageKey = await makeHashedStorageKey(llmTranslateCachePrefix, text)
    const payload = await readPersistentJson<{ key: string, value: string }>(storageKey)
    if (!payload || payload.key !== text) {
        return null
    }
    llmTranslateCache.set(text, payload.value)
    return payload.value
}

async function setPersistentLLMCache(text: string, value: string) {
    const storageKey = await makeHashedStorageKey(llmTranslateCachePrefix, text)
    await writePersistentJson(storageKey, {
        key: text,
        value
    })
}

`,
                managed: `/* ${marker('translator-remove-legacy-cache-runtime')} */
`,
                markerNeedle: marker('translator-remove-legacy-cache-runtime'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-remove-sleep-import`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-translate-signature`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `export async function translate(text:string, reverse:boolean) {
`,
                managed: `export async function translate(text:string, reverse:boolean, signal?:AbortSignal) {
    /* ${marker('translator-translate-signature')} */
    throwIfTranslationAborted(signal)
`,
                markerNeedle: marker('translator-translate-signature'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-remove-legacy-cache-runtime`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-translate-forward-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `    return runTranslator(text, reverse, db.translator,db.aiModel.startsWith('novellist') ? 'ja' : 'en')
`,
                managed: `    /* ${marker('translator-translate-forward-signal')} */
    return runTranslator(text, reverse, db.translator,db.aiModel.startsWith('novellist') ? 'ja' : 'en', undefined, signal)
`,
                markerNeedle: marker('translator-translate-forward-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-translate-signature`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-run-signature`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `export async function runTranslator(text:string, reverse:boolean, from:string,target:string, exarg?:{translatorNote?:string}) {
`,
                managed: `export async function runTranslator(text:string, reverse:boolean, from:string,target:string, exarg?:{translatorNote?:string}, signal?:AbortSignal) {
    /* ${marker('translator-run-signature')} */
    throwIfTranslationAborted(signal)
`,
                markerNeedle: marker('translator-run-signature'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-translate-forward-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-run-call`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `            const result = await translateMain(trimed, arg);

            if(result.startsWith('ERR::')){
`,
                managed: `            /* ${marker('translator-run-call')} */
            const result = await translateMain(trimed, arg, signal);
            throwIfTranslationAborted(signal)

            if(result.startsWith('ERR::')){
`,
                markerNeedle: marker('translator-run-call'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-run-signature`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-main-signature`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `async function translateMain(text:string, arg:{from:string, to:string, host:string, translatorNote?:string}){
    let db = getDatabase()
`,
                managed: `async function translateMain(text:string, arg:{from:string, to:string, host:string, translatorNote?:string}, signal?:AbortSignal){
    /* ${marker('translator-main-signature')} */
    throwIfTranslationAborted(signal)
    let db = getDatabase()
`,
                markerNeedle: marker('translator-main-signature'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-run-call`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-main-llm-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `        return translateLLM(text, {to: tr, from: arg.from, translatorNote: arg.translatorNote})
`,
                managed: `        /* ${marker('translator-main-llm-signal')} */
        return translateLLM(text, {to: tr, from: arg.from, translatorNote: arg.translatorNote, signal})
`,
                markerNeedle: marker('translator-main-llm-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-main-signature`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-deepl-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `            },
            body: body
        })

        if(!f.ok){
`,
                managed: `            },
            body: body,
            /* ${marker('translator-deepl-signal')} */
            abortSignal: signal
        })
        throwIfTranslationAborted(signal)

        if(!f.ok){
`,
                markerNeedle: marker('translator-deepl-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-main-llm-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-deeplx-delay`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `                await sleep(waitTime)
`,
                managed: `                /* ${marker('translator-deeplx-delay')} */
                await waitForTranslationDelay(waitTime, signal)
`,
                markerNeedle: marker('translator-deeplx-delay'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-deepl-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-deeplx-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `        const f = await globalFetch(url, { method: "POST", headers: headers, body: body, plainFetchForce:true })

        if(!f.ok){ return 'ERR::DeepLX API Error' + (await f.data) }
`,
                managed: `        /* ${marker('translator-deeplx-signal')} */
        const f = await globalFetch(url, { method: "POST", headers: headers, body: body, plainFetchForce:true, abortSignal: signal })
        throwIfTranslationAborted(signal)

        if(!f.ok){ return 'ERR::DeepLX API Error' + (await f.data) }
`,
                markerNeedle: marker('translator-deeplx-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-deeplx-delay`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-bergamot-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `        return bergamotTranslate(text, arg.from, arg.to, false);
`,
                managed: `        /* ${marker('translator-bergamot-signal')} */
        throwIfTranslationAborted(signal)
        return raceTranslationAbort(
            bergamotTranslate(text, arg.from, arg.to, false),
            signal,
        );
`,
                markerNeedle: marker('translator-bergamot-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-deeplx-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-google-experimental-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `                    method: "GET",
                })
                const parser = new DOMParser()
`,
                managed: `                    method: "GET",
                    /* ${marker('translator-google-experimental-signal')} */
                    abortSignal: signal,
                })
                throwIfTranslationAborted(signal)
                const parser = new DOMParser()
`,
                markerNeedle: marker('translator-google-experimental-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-bergamot-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-google-experimental-catch`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `            } catch (error) {
${'                '}
            }
`,
                managed: `            } catch (error) {
                /* ${marker('translator-google-experimental-catch')} */
                throwIfTranslationAborted(signal)
            }
`,
                markerNeedle: marker('translator-google-experimental-catch'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-google-experimental-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-google-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `    const f = await fetch(url, {

        method: "GET",

    })

    const res = await f.json()
`,
                managed: `    const f = await fetch(url, {

        method: "GET",
        /* ${marker('translator-google-signal')} */
        signal,

    })

    const res = await f.json()
    throwIfTranslationAborted(signal)
`,
                markerNeedle: marker('translator-google-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-google-experimental-catch`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-signature`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `export async function translateHTML(html: string, reverse:boolean, charArg:simpleCharacterArgument|string = '', chatID:number, regenerate = false): Promise<string> {
`,
                managed: `export async function translateHTML(html: string, reverse:boolean, charArg:simpleCharacterArgument|string = '', chatID:number, regenerate = false, signal?:AbortSignal): Promise<string> {
    /* ${marker('translator-html-signature')} */
    throwIfTranslationAborted(signal)
`,
                markerNeedle: marker('translator-html-signature'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-google-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-doing-cache`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `            if(!(db.translatorType === 'llm' && await getLLMCache(html) !== null)){
`,
                managed: `            /* ${marker('translator-html-doing-cache')} */
            if(!(db.translatorType === 'llm' && await getCachedLLMTranslation(html, signal) !== null)){
                throwIfTranslationAborted(signal)
`,
                markerNeedle: marker('translator-html-doing-cache'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-signature`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-llm-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `        const r = await translateLLM(html, {to: tr, from: from, regenerate, onCacheState: (cached) => { translated = !cached }})
        if(translated && db.playMessageOnTranslateEnd){
`,
                managed: `        /* ${marker('translator-html-llm-signal')} */
        const r = await translateLLM(html, {to: tr, from: from, regenerate, signal, onCacheState: (cached) => { translated = !cached }})
        throwIfTranslationAborted(signal)
        if(translated && db.playMessageOnTranslateEnd){
`,
                markerNeedle: marker('translator-html-llm-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-doing-cache`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-bergamot-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `        return applyEdittransRegex(await bergamotTranslate(html, from, to, true), charArg, alwaysExistChar)
`,
                managed: `        /* ${marker('translator-html-bergamot-signal')} */
        throwIfTranslationAborted(signal)
        const result = await raceTranslationAbort(
            bergamotTranslate(html, from, to, true),
            signal,
        )
        return applyEdittransRegex(result, charArg, alwaysExistChar)
`,
                markerNeedle: marker('translator-html-bergamot-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-llm-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-superchunk-coordinator`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `    let translationChunks: {
        chunks: string[],
        resolvers: ((text:string) => void)[]
    }[] = [{
        chunks: [],
        resolvers: []
    }]
${'    '}

    async function translateTranslationChunks(force:boolean = false, additionalChunkLength = 0){
        if(translationChunks.length === 0 || !needSuperChunkedTranslate()){
            return
        }

        const currentChunk = translationChunks[translationChunks.length-1]
        const text: string = currentChunk.chunks.join('\\n■\\n')

        if(!force && text.length + additionalChunkLength < 5000){
            return
        }

        translationChunks.push({
            chunks: [],
            resolvers: []
        })

        if(!text){
            return
        }

        const translated = await translate(text, reverse)

        const split = translated.split('■')

        console.log(split.length, currentChunk.chunks.length)

        if(split.length !== currentChunk.chunks.length){
            //try translating one by one
            for(let i = 0; i < currentChunk.chunks.length; i++){
                currentChunk.resolvers[i](
                    await translate(currentChunk.chunks[i]
                , reverse))
            }
        }
${'        '}
        for(let i = 0; i < split.length; i++){
            console.log(split[i])
            currentChunk.resolvers[i](split[i])
        }


    }
`,
                managed: `    /* ${marker('translator-html-superchunk-coordinator')} */
    const superChunkTranslations = createTranslationChunkBatch({
        maxCombinedLength: 5000,
        joiner: '\\n■\\n',
        splitMarker: '■',
        translate: (text) => translate(text, reverse, signal),
    })
`,
                markerNeedle: marker('translator-html-superchunk-coordinator'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-bergamot-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-superchunk-enqueue`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `            if(needSuperChunkedTranslate()){
                const prm = new Promise<string>((resolve) => {
                    translateTranslationChunks(false, node.textContent.length)
                    translationChunks[translationChunks.length-1].resolvers.push(resolve)
                    translationChunks[translationChunks.length-1].chunks.push(node.textContent)
                })
${'    '}
                node.textContent = await prm
                return
            }
`,
                managed: `            if(needSuperChunkedTranslate()){
                /* ${marker('translator-html-superchunk-enqueue')} */
                node.textContent = await superChunkTranslations.enqueue(
                    node.textContent,
                )
                return
            }
`,
                markerNeedle: marker('translator-html-superchunk-enqueue'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-superchunk-coordinator`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-chunk-signal`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `                const translatedPromise = translate(chunk, reverse);
`,
                managed: `                /* ${marker('translator-html-chunk-signal')} */
                const translatedPromise = translate(chunk, reverse, signal);
`,
                markerNeedle: marker('translator-html-chunk-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-superchunk-enqueue`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-node-cancel`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `    async function translateNode(node: Node, parent?: Node): Promise<void> {
        if (node.nodeType === Node.TEXT_NODE) {
`,
                managed: `    async function translateNode(node: Node, parent?: Node): Promise<void> {
        /* ${marker('translator-html-node-cancel')} */
        throwIfTranslationAborted(signal)
        if (node.nodeType === Node.TEXT_NODE) {
`,
                markerNeedle: marker('translator-html-node-cancel'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-chunk-signal`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-node-promise-observed`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `                promises.push(translateNodeText(node))
`,
                managed: `                /* ${marker('translator-html-node-promise-observed')} */
                const translationPromise = translateNodeText(node)
                void translationPromise.catch(() => undefined)
                promises.push(translationPromise)
`,
                markerNeedle: marker('translator-html-node-promise-observed'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-node-cancel`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-superchunk-flush`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `    await translateTranslationChunks(true, 0)
`,
                managed: `    /* ${marker('translator-html-superchunk-flush')} */
    await superChunkTranslations.flush()
`,
                markerNeedle: marker('translator-html-superchunk-flush'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-node-promise-observed`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-html-final-cancel`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `    translatedHTML = applyEdittransRegex(translatedHTML, charArg, alwaysExistChar);
`,
                managed: `    /* ${marker('translator-html-final-cancel')} */
    throwIfTranslationAborted(signal)
    translatedHTML = applyEdittransRegex(translatedHTML, charArg, alwaysExistChar);
`,
                markerNeedle: marker('translator-html-final-cancel'),
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-superchunk-flush`],
                after: translatorAfter,
            },
            {
                id: `${prefix}translator-llm-runtime`,
                file: 'src/ts/translator/translator.ts',
                type: 'replace',
                anchor: `async function translateLLM(text:string, arg:{to:string, from:string, regenerate?:boolean,translatorNote?:string, onCacheState?:(cached:boolean) => void}):Promise<string>{
    if(!arg.regenerate){
        const cacheMatch = llmTranslateCache.get(text)
        if(cacheMatch){
            arg.onCacheState?.(true)
            return cacheMatch
        }
        const persistedCacheMatch = await getPersistentLLMCache(text)
        if (persistedCacheMatch !== null) {
            arg.onCacheState?.(true)
            return persistedCacheMatch
        }
    }
    const styleDecodeRegex = /\\<risu-style\\>(.+?)\\<\\/risu-style\\>/gms
    let styleDecodes:string[] = []
    text = text.replace(styleDecodeRegex, (match, p1) => {
        styleDecodes.push(p1)
        return \`<style-data style-index="\${styleDecodes.length-1}"></style-data>\`
    })

    const db = getDatabase()
    const charIndex = get(selectedCharID)
    const currentChar = db.characters[charIndex]
    let translatorNote = ""
    console.log(arg.translatorNote)
    if(arg.translatorNote){
        translatorNote = arg.translatorNote
    }
    else if (currentChar?.type === "character") {
        translatorNote = currentChar.translatorNote ?? ""
    } else {
        translatorNote = ""
    }
    console.log(translatorNote)

    let formated:OpenAIChat[] = []
    const preset = getCurrentTranslatorPreset()
    let prompt = preset.prompt || defaultTranslatorPrompt
    let parsedPrompt = parseChatML(prompt.replaceAll('{{slot::from}}', arg.from).replaceAll('{{slot}}', arg.to).replaceAll('{{solt::content}}', text).replaceAll('{{slot::content}}', text).replaceAll('{{slot::tnote}}', translatorNote))
    if(parsedPrompt){
        formated = parsedPrompt
    }
    else{
        prompt = prompt.replaceAll('{{slot}}', arg.to).replaceAll('{{slot::tnote}}', translatorNote).replaceAll('{{slot::from}}', arg.from)
        formated = [
            {
                'role': 'system',
                'content': prompt
            },
            {
                'role': 'user',
                'content': text
            }
        ]
    }
    const rq = await requestChatData({
        formated,
        bias: {},
        useStreaming: false,
        noMultiGen: true,
        maxTokens: preset.maxResponse,
    }, 'translate')

    if(rq.type === 'fail'){
        notifyError(rq.result)
        return text
    }
    if(rq.type === 'streaming' || rq.type === 'multiline'){
        notifyError('Unexpected response type')
        return text
    }
    const result = rq.result.replace(/<style-data style-index="(\\d+)" ?\\/?>/g, (match, p1) => {
        return styleDecodes[parseInt(p1)] ?? ''
    }).replace(/<\\/style-data>/g, '')
    llmTranslateCache.set(text, result)
    void setPersistentLLMCache(text, result)
    arg.onCacheState?.(false)
    return result
}

export async function clearLLMCache(): Promise<void> {
    llmTranslateCache.clear()
    await clearPersistentPrefix(llmTranslateCachePrefix)
}

export async function getLLMCache(text:string):Promise<string | null>{
    return llmTranslateCache.get(text) ?? await getPersistentLLMCache(text)
}

export async function searchLLMCache(partialKey:string):Promise<{key: string, value: string}[]>{
    const results:{key: string, value: string}[] = []
    for(const [key, value] of llmTranslateCache){
        if(key.includes(partialKey)){
            results.push({key, value})
        }
    }
    const storageKeys = await listPersistentKeys(llmTranslateCachePrefix)
    for (const storageKey of storageKeys) {
        const payload = await readPersistentJson<{ key: string, value: string }>(storageKey)
        if (!payload || !payload.key.includes(partialKey)) {
            continue
        }
        if (results.some((entry) => entry.key === payload.key)) {
            continue
        }
        llmTranslateCache.set(payload.key, payload.value)
        results.push(payload)
    }
    return results
}

export async function setLLMCache(key:string, value:string):Promise<void>{
    llmTranslateCache.set(key, value)
    await setPersistentLLMCache(key, value)
}

export async function exportLLMCacheAsJSON():Promise<Record<string, string>>{
    const result:Record<string, string> = {}
    for(const [key, value] of llmTranslateCache){
        result[key] = value
    }
    const storageKeys = await listPersistentKeys(llmTranslateCachePrefix)
    for (const storageKey of storageKeys) {
        const payload = await readPersistentJson<{ key: string, value: string }>(storageKey)
        if (payload && !(payload.key in result)) {
            result[payload.key] = payload.value
        }
    }
    return result
}

export async function importLLMCacheFromJSON(data:Record<string, string>):Promise<{count: number, failed: number}>{
    let count = 0
    let failed = 0
    for(const [key, value] of Object.entries(data)){
        try {
            await setPersistentLLMCache(key, value)
            llmTranslateCache.set(key, value)
            count++
        } catch {
            failed++
        }
    }
    return {count, failed}
}


`,
                managed: `/* ${marker('translator-llm-runtime')}:START */
async function translateLLM(text:string, arg:{to:string, from:string, regenerate?:boolean,translatorNote?:string, signal?:AbortSignal, onCacheState?:(cached:boolean) => void}):Promise<string>{
    throwIfTranslationAborted(arg.signal)
    const cacheKey = text
    if(!arg.regenerate){
        const cacheMatch = await getCachedLLMTranslation(cacheKey, arg.signal)
        throwIfTranslationAborted(arg.signal)
        if(cacheMatch !== null){
            arg.onCacheState?.(true)
            return cacheMatch
        }
    }
    const styleDecodeRegex = /\\<risu-style\\>(.+?)\\<\\/risu-style\\>/gms
    let styleDecodes:string[] = []
    text = text.replace(styleDecodeRegex, (match, p1) => {
        styleDecodes.push(p1)
        return \`<style-data style-index="\${styleDecodes.length-1}"></style-data>\`
    })

    const db = getDatabase()
    const charIndex = get(selectedCharID)
    const currentChar = db.characters[charIndex]
    let translatorNote = ""
    console.log(arg.translatorNote)
    if(arg.translatorNote){
        translatorNote = arg.translatorNote
    }
    else if (currentChar?.type === "character") {
        translatorNote = currentChar.translatorNote ?? ""
    } else {
        translatorNote = ""
    }
    console.log(translatorNote)

    let formated:OpenAIChat[] = []
    const preset = getCurrentTranslatorPreset()
    let prompt = preset.prompt || defaultTranslatorPrompt
    let parsedPrompt = parseChatML(prompt.replaceAll('{{slot::from}}', arg.from).replaceAll('{{slot}}', arg.to).replaceAll('{{solt::content}}', text).replaceAll('{{slot::content}}', text).replaceAll('{{slot::tnote}}', translatorNote))
    if(parsedPrompt){
        formated = parsedPrompt
    }
    else{
        prompt = prompt.replaceAll('{{slot}}', arg.to).replaceAll('{{slot::tnote}}', translatorNote).replaceAll('{{slot::from}}', arg.from)
        formated = [
            {
                'role': 'system',
                'content': prompt
            },
            {
                'role': 'user',
                'content': text
            }
        ]
    }
    const rq = await requestChatData({
        formated,
        bias: {},
        useStreaming: false,
        noMultiGen: true,
        maxTokens: preset.maxResponse,
    }, 'translate', arg.signal)
    throwIfTranslationAborted(arg.signal)

    if(rq.type === 'fail'){
        notifyError(rq.result)
        return cacheKey
    }
    if(rq.type === 'streaming' || rq.type === 'multiline'){
        notifyError('Unexpected response type')
        return cacheKey
    }
    const result = rq.result.replace(/<style-data style-index="(\\d+)" ?\\/?>/g, (match, p1) => {
        return styleDecodes[parseInt(p1)] ?? ''
    }).replace(/<\\/style-data>/g, '')
    throwIfTranslationAborted(arg.signal)
    storeGeneratedLLMCache(cacheKey, result)
    arg.onCacheState?.(false)
    return result
}

export {
    clearLLMCache,
    deleteLLMCache,
    deleteLLMCacheEntry,
    exportLLMCacheAsJSON,
    getLLMCache,
    importLLMCacheFromJSON,
    listLLMCacheEntries,
    loadedLLMCacheEntries,
    replaceLLMCacheEntry,
    searchLLMCache,
    setLLMCache,
    subscribeLLMTranslationCache,
} from "./translationCacheRuntime"
export type {
    LLMCacheEntry,
    LLMCacheEntryIdentity,
} from "./translationCacheRuntime"
/* ${marker('translator-llm-runtime')}:END */

`,
                markerNeedle: `${marker('translator-llm-runtime')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}translator-html-final-cancel`],
                after: translatorAfter,
            },
            {
                id: `${prefix}chatbody-task-import`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `    import { sleep } from "src/ts/util"
`,
                managed: `    /* ${marker('chatbody-task-import')}:START */
    import {
        createTranslationTaskController,
        isTranslationAbortError,
        throwIfTranslationAborted,
        waitForTranslationDelay,
    } from "src/ts/translator/translationTask"
    /* ${marker('chatbody-task-import')}:END */
`,
                markerNeedle: `${marker('chatbody-task-import')}:START`,
                anchorPolicy: 'first',
                requires: ['kei-translation-tools-core:src/ts/translator/translationTask.ts'],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-cache-subscription-import`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `    import { getLLMCache, translateHTML } from "../../ts/translator/translator"
`,
                managed: `    /* ${marker('chatbody-cache-subscription-import')} */
    import {
        getLLMCache,
        subscribeLLMTranslationCache,
        translateHTML,
    } from "../../ts/translator/translator"
`,
                markerNeedle: marker('chatbody-cache-subscription-import'),
                anchorPolicy: 'first',
                requires: [
                    `${prefix}chatbody-task-import`,
                    `${prefix}translator-llm-runtime`,
                ],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-ondestroy-import`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `    import { tick } from 'svelte'
`,
                managed: `    /* ${marker('chatbody-ondestroy-import')} */
    import { onDestroy, tick } from 'svelte'
`,
                markerNeedle: marker('chatbody-ondestroy-import'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-cache-subscription-import`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-task-state`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'insert',
                where: 'after',
                anchor: `    let lastChatId = -10
`,
                content: `    /* ${marker('chatbody-task-state')} */
    const translationTasks = createTranslationTaskController()
    let translationCacheRefresh = $state(0)
    let currentTranslationCacheKey: string | null = null
    const unsubscribeTranslationCache = subscribeLLMTranslationCache((key) => {
        if (
            !translationTasks.hasCurrent()
            && (key === null || key === currentTranslationCacheKey)
        ) {
            translationCacheRefresh++
        }
    })
    onDestroy(() => {
        translationTasks.dispose()
        unsubscribeTranslationCache()
    })
`,
                markerNeedle: marker('chatbody-task-state'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-ondestroy-import`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-begin-task`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `        /* POCKETRISU-PATCH:kei-chat-render:${adapter}:chatbody-capture-streaming */
        const streamingDisplay = isStreamingDisplay
        let lastParsedQueue = ''
`,
                managed: `        /* POCKETRISU-PATCH:kei-chat-render:${adapter}:chatbody-capture-streaming */
        const streamingDisplay = isStreamingDisplay
        /* ${marker('chatbody-begin-task')} */
        translationCacheRefresh
        const sourceData = data
        const task = translationTasks.begin()
        if(task.isCurrent()) translating = false
        let lastParsedQueue = ''
`,
                markerNeedle: marker('chatbody-begin-task'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-task-state`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-cache-signal`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `                            const cache = DBState.db.translateBeforeHTMLFormatting
                            ? await getLLMCache(data)
                            : !DBState.db.legacyTranslation
                            ? await getLLMCache(await ParseMarkdown(data, charArg, 'pretranslate', chatID, getCbsCondition()))
                            : await getLLMCache(await ParseMarkdown(data, charArg, mode, chatID, getCbsCondition()))
`,
                managed: `                            /* ${marker('chatbody-cache-signal')} */
                            const cache = DBState.db.translateBeforeHTMLFormatting
                            ? await getLLMCache(data, task.signal)
                            : !DBState.db.legacyTranslation
                            ? await getLLMCache(await ParseMarkdown(data, charArg, 'pretranslate', chatID, getCbsCondition()), task.signal)
                            : await getLLMCache(await ParseMarkdown(data, charArg, mode, chatID, getCbsCondition()), task.signal)
`,
                markerNeedle: marker('chatbody-cache-signal'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-begin-task`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-cache-cancel`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `                            translateText = cache !== null
`,
                managed: `                            /* ${marker('chatbody-cache-cancel')} */
                            throwIfTranslationAborted(task.signal)
                            translateText = cache !== null
`,
                markerNeedle: marker('chatbody-cache-cancel'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-cache-signal`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-cache-abort-catch`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `                } catch (error) {
                    console.error(error)
                }
`,
                managed: `                } catch (error) {
                    /* ${marker('chatbody-cache-abort-catch')} */
                    if(isTranslationAbortError(error)) throw error
                    console.error(error)
                }
`,
                markerNeedle: marker('chatbody-cache-abort-catch'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-cache-cancel`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-auto-state`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `                    setTimeout(() => {
                            translated = translateText
                    }, 10)
`,
                managed: `                    setTimeout(() => {
                        /* ${marker('chatbody-auto-state')} */
                        if(task.isLatest() && msgDisplay === sourceData){
                            translated = translateText
                        }
                    }, 10)
`,
                markerNeedle: marker('chatbody-auto-state'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-cache-abort-catch`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-translation-body`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `                if(DBState.db.translatorType === 'llm' && DBState.db.translateBeforeHTMLFormatting){
                    await sleep(100)
                    translating = true
                    data = await translateHTML(data, false, charArg, chatID, retranslate)
                    translating = false
                    const marked = await ParseMarkdown(data, charArg, mode, chatID, getCbsCondition())
                    lastParsedQueue = marked
                    lastCharArg = charArg
                    transResult = marked
                }
                else if(!DBState.db.legacyTranslation){
                    const marked = await ParseMarkdown(data, charArg, 'pretranslate', chatID, getCbsCondition())
                    translating = true
                    const translated = await postTranslationParse(await translateHTML(marked, false, charArg, chatID, retranslate))
                    translating = false
                    lastParsedQueue = translated
                    lastCharArg = charArg
                    transResult = translated
                }
                else{
                    const marked = await ParseMarkdown(data, charArg, mode, chatID, getCbsCondition())
                    translating = true
                    const translated = await translateHTML(marked, false, charArg, chatID, retranslate)
                    translating = false
                    lastParsedQueue = translated
                    lastCharArg = charArg
                    transResult = translated
                }
`,
                managed: `                /* ${marker('chatbody-translation-body')}:START */
                if(DBState.db.translatorType === 'llm' && DBState.db.translateBeforeHTMLFormatting){
                    await waitForTranslationDelay(100, task.signal)
                    if(task.isCurrent()) translating = true
                    currentTranslationCacheKey = sourceData
                    const translatedData = await translateHTML(sourceData, false, charArg, chatID, retranslate, task.signal)
                    throwIfTranslationAborted(task.signal)
                    const marked = await ParseMarkdown(translatedData, charArg, mode, chatID, getCbsCondition())
                    throwIfTranslationAborted(task.signal)
                    lastParsedQueue = marked
                    lastCharArg = charArg
                    transResult = marked
                }
                else if(!DBState.db.legacyTranslation){
                    const marked = await ParseMarkdown(sourceData, charArg, 'pretranslate', chatID, getCbsCondition())
                    throwIfTranslationAborted(task.signal)
                    if(task.isCurrent()) translating = true
                    currentTranslationCacheKey = DBState.db.translatorType === 'llm'
                        ? marked
                        : null
                    const translatedData = await translateHTML(marked, false, charArg, chatID, retranslate, task.signal)
                    throwIfTranslationAborted(task.signal)
                    const parsedTranslation = await postTranslationParse(translatedData)
                    throwIfTranslationAborted(task.signal)
                    lastParsedQueue = parsedTranslation
                    lastCharArg = charArg
                    transResult = parsedTranslation
                }
                else{
                    const marked = await ParseMarkdown(sourceData, charArg, mode, chatID, getCbsCondition())
                    throwIfTranslationAborted(task.signal)
                    if(task.isCurrent()) translating = true
                    currentTranslationCacheKey = DBState.db.translatorType === 'llm'
                        ? marked
                        : null
                    const translatedData = await translateHTML(marked, false, charArg, chatID, retranslate, task.signal)
                    throwIfTranslationAborted(task.signal)
                    lastParsedQueue = translatedData
                    lastCharArg = charArg
                    transResult = translatedData
                }
                /* ${marker('chatbody-translation-body')}:END */
`,
                markerNeedle: `${marker('chatbody-translation-body')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-auto-state`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-retranslate-state`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `                setTimeout(() => {
                    retranslate = false
                }, 10);
`,
                managed: `                setTimeout(() => {
                    /* ${marker('chatbody-retranslate-state')} */
                    if(task.isLatest() && msgDisplay === sourceData){
                        retranslate = false
                    }
                }, 10);
`,
                markerNeedle: marker('chatbody-retranslate-state'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-translation-body`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-original-cancel`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `                const marked = await ParseMarkdown(data, charArg, mode, chatID, getCbsCondition())
                lastParsedQueue = marked
`,
                managed: `                /* ${marker('chatbody-original-cancel')} */
                const marked = await ParseMarkdown(sourceData, charArg, mode, chatID, getCbsCondition())
                throwIfTranslationAborted(task.signal)
                lastParsedQueue = marked
`,
                markerNeedle: marker('chatbody-original-cancel'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-retranslate-state`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-catch-abort`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `        } catch (error) {
            //retry
            if(tries > 2){
`,
                managed: `        } catch (error) {
            /* ${marker('chatbody-catch-abort')} */
            if(isTranslationAbortError(error)){
                return sourceData
            }
            //retry
            if(tries > 2){
`,
                markerNeedle: marker('chatbody-catch-abort'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-original-cancel`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
            {
                id: `${prefix}chatbody-finalize-task`,
                file: 'src/lib/ChatScreens/ChatBody.svelte',
                type: 'replace',
                anchor: `        finally{
            //since trimMarkdown is fast, we don't need to cache it
            lastParsed = lastParsedQueue
        }
`,
                managed: `        finally{
            /* ${marker('chatbody-finalize-task')} */
            if(task.isCurrent()){
                translating = false
                //since trimMarkdown is fast, we don't need to cache it
                lastParsed = lastParsedQueue
            }
            task.finish()
        }
`,
                markerNeedle: marker('chatbody-finalize-task'),
                anchorPolicy: 'first',
                requires: [`${prefix}chatbody-catch-abort`],
                after: [`${chatRenderAdapter}:chatbody-translation-gate`],
            },
        ],
    }

    const units181 = manifest181.units
    const bySuffix = (suffix) => units181.find((unit) =>
        unit.id === `${prefix}${suffix}`
    )
    const deeplSignal190 = {
        ...bySuffix('translator-deepl-signal'),
        anchor: `            },
            body: body,
            logCategory: 'translate',
            logSource: 'translate',
        })

        if(!f.ok){
`,
        managed: `            },
            body: body,
            logCategory: 'translate',
            logSource: 'translate',
            /* ${marker('translator-deepl-signal')} */
            abortSignal: signal
        })
        throwIfTranslationAborted(signal)

        if(!f.ok){
`,
    }
    const deeplxSignal190 = {
        ...bySuffix('translator-deeplx-signal'),
        anchor: `        const f = await globalFetch(url, { method: "POST", headers: headers, body: body, plainFetchForce:true, logCategory: 'translate', logSource: 'translate' })

        if(!f.ok){ return 'ERR::DeepLX API Error' + (await f.data) }
`,
        managed: `        /* ${marker('translator-deeplx-signal')} */
        const f = await globalFetch(url, { method: "POST", headers: headers, body: body, plainFetchForce:true, logCategory: 'translate', logSource: 'translate', abortSignal: signal })
        throwIfTranslationAborted(signal)

        if(!f.ok){ return 'ERR::DeepLX API Error' + (await f.data) }
`,
    }
    const googleExperimentalSignal190 = {
        ...bySuffix('translator-google-experimental-signal'),
        anchor: `                    method: "GET",
                    logCategory: 'translate',
                    logSource: 'translate',
                })
                const parser = new DOMParser()
`,
        managed: `                    method: "GET",
                    logCategory: 'translate',
                    logSource: 'translate',
                    /* ${marker('translator-google-experimental-signal')} */
                    abortSignal: signal,
                })
                throwIfTranslationAborted(signal)
                const parser = new DOMParser()
`,
    }
    const llmRuntime181 = bySuffix('translator-llm-runtime')
    const llmRuntime190 = {
        ...llmRuntime181,
        anchor: llmRuntime181.anchor
            .replace(
                '    const styleDecodeRegex',
                `    // The cache is looked up (above) with the original text, so it must be stored
    // under the same key. \`text\` gets mutated below for the request; storing under
    // the mutated string made every <style>-bearing message a permanent cache miss
    // that re-billed the LLM and piled up orphan entries.
    const cacheKey = text
    const styleDecodeRegex`,
            )
            .replace(
                `    llmTranslateCache.set(text, result)
    void setPersistentLLMCache(text, result)`,
                `    llmTranslateCache.set(cacheKey, result)
    void setPersistentLLMCache(cacheKey, result)`,
            ),
    }
    const chatbodyBeginTask190 = {
        ...bySuffix('chatbody-begin-task'),
        anchor: `        translated;
        retranslate;
        /* POCKETRISU-PATCH:kei-chat-render:${adapter}:chatbody-capture-streaming:1.9 */
        const streamingDisplay = isOptimizedStreamingMessage
        let lastParsedQueue = ''
`,
        managed: `        translated;
        retranslate;
        /* POCKETRISU-PATCH:kei-chat-render:${adapter}:chatbody-capture-streaming:1.9 */
        const streamingDisplay = isOptimizedStreamingMessage
        /* ${marker('chatbody-begin-task')} */
        const sourceData = data
        const task = translationTasks.begin()
        let lastParsedQueue = ''
`,
    }
    const replacements190 = new Map([
        [`${prefix}translator-deepl-signal`, deeplSignal190],
        [`${prefix}translator-deeplx-signal`, deeplxSignal190],
        [`${prefix}translator-google-experimental-signal`, googleExperimentalSignal190],
        [`${prefix}translator-llm-runtime`, llmRuntime190],
        [`${prefix}chatbody-begin-task`, chatbodyBeginTask190],
    ])
    const units190Source = units181.map((unit) =>
        replacements190.get(unit.id) ?? unit
    )
    const units190Ids = new Set(units190Source.map((unit) => unit.id))
    const target190Dependency = (dependency) => {
        if (units190Ids.has(dependency)) return `${dependency}:1.9`
        if (dependency.startsWith(`${chatRenderAdapter}:chatbody-`)) {
            return `${dependency}:1.9`
        }
        return dependency
    }
    const units190 = units190Source.map((unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        requires: unit.requires?.map(target190Dependency),
        after: unit.after?.map(target190Dependency),
        targetVersions: pocketRisu190,
    }))

    return {
        ...manifest181,
        targets: {
            pocketrisu: {
                verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
            },
        },
        units: [
            ...units181.map((unit) => ({
                ...unit,
                targetVersions: pocketRisu181,
            })),
            ...units190,
        ],
    }
}

module.exports = {
    createTranslationToolsAdapterManifest,
}
