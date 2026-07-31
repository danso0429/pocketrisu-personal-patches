'use strict'

function createMobileNavigationAdapterManifest({
    id,
    title,
    adapter,
    lazyChat,
}) {
    const prefix = `${id}:`
    const marker = (name) =>
        `POCKETRISU-PATCH:kei-mobile-navigation:${adapter}:${name}`
    const bootstrapAfter = lazyChat
        ? ['lazy-chat-sync:replace:src:ts:bootstrap-ts']
        : ['startup-cache:bootstrap']

    return {
        id,
        title,
        version: '0.1.0',
        userSelectable: false,
        requires: lazyChat
            ? ['kei-mobile-navigation-core', 'lazy-chat-sync']
            : ['kei-mobile-navigation-core'],
        conflicts: lazyChat
            ? ['kei-mobile-navigation-base-adapter']
            : [
                'lazy-chat-sync',
                'kei-mobile-navigation-lazy-adapter',
            ],
        autoWhen: lazyChat
            ? {
                all: ['kei-mobile-navigation-core', 'lazy-chat-sync'],
            }
            : {
                all: ['kei-mobile-navigation-core'],
                none: ['lazy-chat-sync'],
            },
        units: [
            {
                id: `${prefix}main-import`,
                file: 'src/main.ts',
                type: 'replace',
                anchor: `import { loadData } from "./ts/bootstrap";
import { initHotkey } from "./ts/hotkey";
import { preLoadCheck } from "./preload";
`,
                managed: `/* ${marker('main-import')} */
import { loadData } from "./ts/bootstrap";
import { preLoadCheck } from "./preload";
`,
                markerNeedle: marker('main-import'),
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}main-init`,
                file: 'src/main.ts',
                type: 'replace',
                anchor: `loadData()
initHotkey()
document.getElementById('preloading').remove()
`,
                managed: `/* ${marker('main-init')} */
loadData()
document.getElementById('preloading').remove()
`,
                markerNeedle: marker('main-init'),
                anchorPolicy: 'first',
                requires: [`${prefix}main-import`],
            },
            {
                id: `${prefix}hotkey-store-imports`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `import { alertStore, DBState, MobileGUIStack, MobileSideBar, openPersonaList, personaSelectCallback, openPresetList, openHypaV3PresetList, openThemePresetList, OpenRealmStore, PlaygroundStore, QuickSettings, SafeModeStore, selectedCharID, settingsOpen } from "./stores.svelte"
`,
                managed: `/* ${marker('hotkey-store-imports')} */
import { alertStore, MobileGUIStack, MobileSideBar, openModelPresetList, openPersonaList, personaSelectCallback, openPresetList, openHypaV3PresetList, openThemePresetList, OpenRealmStore, PlaygroundStore, QuickSettings, SafeModeStore, selectedCharID, settingsOpen } from "./stores.svelte"
`,
                markerNeedle: marker('hotkey-store-imports'),
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}hotkey-core-imports`,
                file: 'src/ts/hotkey.ts',
                type: 'insert',
                where: 'after',
                anchor: `import { defaultHotkeys } from "./defaulthotkeys"
`,
                content: `import {
    findAdjacentCharacterIndex,
    getBoundedNavigationIndex,
    getHorizontalNavigationDirection,
    hotkeyMatches,
    shouldIgnoreNavigationPointer,
} from "./keiMobileNavigation"
`,
                anchorPolicy: 'first',
                requires: ['kei-mobile-navigation-core:hotkey-navigation'],
            },
            {
                id: `${prefix}hotkey-idempotent-init`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `export function initHotkey(){
    document.addEventListener('keydown', async (ev) => {
`,
                managed: `/* ${marker('hotkey-idempotent-init')} */
let hotkeyInitialized = false

export function initHotkey(){
    if(hotkeyInitialized) return
    hotkeyInitialized = true

    document.addEventListener('keydown', async (ev) => {
`,
                markerNeedle: marker('hotkey-idempotent-init'),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-core-imports`],
            },
            {
                id: `${prefix}hotkey-editable-guard`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `        if(
            !ev.ctrlKey &&
            !ev.altKey &&
            !ev.shiftKey &&
            (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) ||
            document.activeElement.getAttribute('contenteditable'))
        ){
            return
        }
`,
                managed: `        /* ${marker('hotkey-editable-guard')} */
        const activeElement = document.activeElement as HTMLElement | null
        if(
            !ev.ctrlKey &&
            !ev.altKey &&
            !ev.shiftKey &&
            activeElement &&
            (['INPUT', 'TEXTAREA'].includes(activeElement.tagName) ||
            activeElement.isContentEditable)
        ){
            return
        }
`,
                markerNeedle: marker('hotkey-editable-guard'),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-idempotent-init`],
            },
            {
                id: `${prefix}hotkey-enable-gate`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `        const hotKeys = database?.hotkeys ?? defaultHotkeys
`,
                managed: `        /* ${marker('hotkey-enable-gate')} */
        const hotKeys = database?.enableHotkeys === false
            ? []
            : (database?.hotkeys ?? defaultHotkeys)
`,
                markerNeedle: marker('hotkey-enable-gate'),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-editable-guard`],
            },
            {
                id: `${prefix}hotkey-match`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `            if(!hotkeyMatches(hotkey, ev)){
`,
                managed: `            /* ${marker('hotkey-match')} */
            if(!hotkeyMatches(hotkey, ev, activeElement)){
`,
                markerNeedle: marker('hotkey-match'),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-enable-gate`],
            },
            {
                id: `${prefix}hotkey-dom-actions`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `                case 'reroll':{
                    clickQuery('.button-icon-reroll')
                    break
                }
                case 'unreroll':{
                    clickQuery('.button-icon-unreroll')
                    break
                }
                case 'translate':{
                    clickQuery('.button-icon-translate')
                    break
                }
                case 'remove':{
                    clickQuery('.button-icon-remove')
                    break
                }
                case 'edit':{
                    clickQuery('.button-icon-edit')
                    setTimeout(() => {
                        focusQuery('.message-edit-area')
                    }, 100)
                    break
                }
                case 'copy':{
                    clickQuery('.button-icon-copy')
                    break
                }
                case 'focusInput':{
                    focusQuery('.text-input-area')
                    break
                }
                case 'send':{
                    clickQuery('.button-icon-send')
                    break
                }
`,
                managed: `                /* ${marker('hotkey-dom-actions')}:START */
                case 'reroll':{
                    hotKeyRanThisTime = clickQuery('.button-icon-reroll')
                    break
                }
                case 'unreroll':{
                    hotKeyRanThisTime = clickQuery('.button-icon-unreroll')
                    break
                }
                case 'translate':{
                    hotKeyRanThisTime = clickQuery('.button-icon-translate')
                    break
                }
                case 'remove':{
                    hotKeyRanThisTime = clickQuery('.button-icon-remove')
                    break
                }
                case 'edit':{
                    hotKeyRanThisTime = clickQuery('.button-icon-edit')
                    if(hotKeyRanThisTime){
                        setTimeout(() => {
                            focusQuery('.message-edit-area')
                        }, 100)
                    }
                    break
                }
                case 'copy':{
                    hotKeyRanThisTime = clickQuery('.button-icon-copy')
                    break
                }
                case 'focusInput':{
                    hotKeyRanThisTime = focusQuery('.text-input-area')
                    break
                }
                case 'send':{
                    hotKeyRanThisTime = clickQuery('.button-icon-send')
                    break
                }
                /* ${marker('hotkey-dom-actions')}:END */
`,
                markerNeedle: `${marker('hotkey-dom-actions')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-match`],
            },
            {
                id: `${prefix}hotkey-model-select`,
                file: 'src/ts/hotkey.ts',
                type: 'insert',
                where: 'before',
                anchor: `                case 'toggleCSS':{
`,
                content: `                case 'modelSelect':{
                    openModelPresetList.set(!get(openModelPresetList))
                    break
                }
`,
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-store-imports`],
            },
            {
                id: `${prefix}hotkey-adjacent-character`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `                case 'prevChar':{
                    const sorted = database.characters.map((v, i) => {
                        return {name: v.name, i}
                    }).sort((a, b) => a.name.localeCompare(b.name))
                    const currentIndex = sorted.findIndex(v => v.i === get(selectedCharID))
                    if(currentIndex === 0){
                        return
                    }
                    if(currentIndex >= sorted.length - 1){
                        return
                    }
                    selectedCharID.set(sorted[currentIndex - 1].i)
                    PlaygroundStore.set(0)
                    OpenRealmStore.set(false)
                    break
                }
                case 'nextChar':{
                    const sorted = database.characters.map((v, i) => {
                        return {name: v.name, i}
                    }).sort((a, b) => a.name.localeCompare(b.name))
                    const currentIndex = sorted.findIndex(v => v.i === get(selectedCharID))
                    if(currentIndex === 0){
                        return
                    }
                    if(currentIndex >= sorted.length - 1){
                        return
                    }
                    selectedCharID.set(sorted[currentIndex + 1].i)
                    PlaygroundStore.set(0)
                    OpenRealmStore.set(false)
                    break
                }
`,
                managed: `                /* ${marker('hotkey-adjacent-character')}:START */
                case 'prevChar':{
                    const adjacentCharacter = findAdjacentCharacterIndex(
                        database.characters,
                        get(selectedCharID),
                        -1,
                    )
                    if(adjacentCharacter === null){
                        hotKeyRanThisTime = false
                        break
                    }
                    selectedCharID.set(adjacentCharacter)
                    PlaygroundStore.set(0)
                    OpenRealmStore.set(false)
                    break
                }
                case 'nextChar':{
                    const adjacentCharacter = findAdjacentCharacterIndex(
                        database.characters,
                        get(selectedCharID),
                        1,
                    )
                    if(adjacentCharacter === null){
                        hotKeyRanThisTime = false
                        break
                    }
                    selectedCharID.set(adjacentCharacter)
                    PlaygroundStore.set(0)
                    OpenRealmStore.set(false)
                    break
                }
                /* ${marker('hotkey-adjacent-character')}:END */
`,
                markerNeedle: `${marker('hotkey-adjacent-character')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-core-imports`],
            },
            {
                id: `${prefix}hotkey-export-helper`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `export function hotkeyMatches(hotkey: typeof DBState.db.hotkeys[number], ev: KeyboardEvent): boolean {
    if(!hotkey){
        return false
    }

    hotkey.ctrl = hotkey.ctrl ?? false
    hotkey.alt = hotkey.alt ?? false
    hotkey.shift = hotkey.shift ?? false

    if(hotkey.ctrl !== ev.ctrlKey) return false
    if(hotkey.alt !== ev.altKey) return false
    if(hotkey.shift !== ev.shiftKey) return false
    if(hotkey.key.toLowerCase() !== ev.key.toLowerCase()) return false
    if(!hotkey.ctrl && !hotkey.alt && !hotkey.shift){
        if(['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return false
    }
    return true
}
`,
                managed: `/* ${marker('hotkey-export-helper')} */
export { hotkeyMatches }
`,
                markerNeedle: marker('hotkey-export-helper'),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-core-imports`],
            },
            {
                id: `${prefix}textarea-popup-hotkey-enable-gate`,
                file: 'src/lib/UI/GUI/TextAreaInput.svelte',
                type: 'replace',
                anchor: `                if(
                    (e.ctrlKey || e.shiftKey || e.altKey)
                    && hotkeyMatches(DBState.db.hotkeys.find(hk => hk.action === 'popupEditor'), e)
                ){
`,
                managed: `                if(
                    /* ${marker('textarea-popup-hotkey-enable-gate')} */
                    DBState.db.enableHotkeys !== false
                    && (e.ctrlKey || e.shiftKey || e.altKey)
                    && hotkeyMatches(DBState.db.hotkeys.find(hk => hk.action === 'popupEditor'), e)
                ){
`,
                markerNeedle: marker(
                    'textarea-popup-hotkey-enable-gate',
                ),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-export-helper`],
            },
            {
                id: `${prefix}contenteditable-popup-hotkey-enable-gate`,
                file: 'src/lib/UI/GUI/TextAreaInput.svelte',
                type: 'replace',
                anchor: `            if(
                (e.ctrlKey || e.shiftKey || e.altKey)
                && hotkeyMatches(DBState.db.hotkeys.find(hk => hk.action === 'popupEditor'), e)
            ){
`,
                managed: `            if(
                /* ${marker('contenteditable-popup-hotkey-enable-gate')} */
                DBState.db.enableHotkeys !== false
                && (e.ctrlKey || e.shiftKey || e.altKey)
                && hotkeyMatches(DBState.db.hotkeys.find(hk => hk.action === 'popupEditor'), e)
            ){
`,
                markerNeedle: marker(
                    'contenteditable-popup-hotkey-enable-gate',
                ),
                anchorPolicy: 'first',
                requires: [
                    `${prefix}textarea-popup-hotkey-enable-gate`,
                ],
            },
            {
                id: `${prefix}hotkey-dom-helper-results`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `function clickQuery(query:string){
    let ele = document.querySelector(query) as HTMLElement
    console.log(ele)
    if(ele){
        ele.click()
    }
}

function focusQuery(query:string){
    let ele = document.querySelector(query) as HTMLElement
    if(ele){
        ele.focus()
    }
}
`,
                managed: `/* ${marker('hotkey-dom-helper-results')}:START */
function clickQuery(query:string): boolean {
    const ele = document.querySelector(query) as HTMLElement | null
    if(!ele) return false
    ele.click()
    return true
}

function focusQuery(query:string): boolean {
    const ele = document.querySelector(query) as HTMLElement | null
    if(!ele) return false
    ele.focus()
    return true
}
/* ${marker('hotkey-dom-helper-results')}:END */
`,
                markerNeedle: `${marker('hotkey-dom-helper-results')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-dom-actions`],
            },
            {
                id: `${prefix}hotkey-triple-touch-gate`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `    document.addEventListener('touchstart', (ev) => {
        touchs++
`,
                managed: `    /* ${marker('hotkey-triple-touch-gate')} */
    document.addEventListener('touchstart', (ev) => {
        if(getDatabase().enableHotkeys === false) return
        touchs++
`,
                markerNeedle: marker('hotkey-triple-touch-gate'),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-enable-gate`],
            },
            {
                id: `${prefix}hotkey-drag-gate`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `    document.addEventListener('dragover', (ev) => {
        if (ev.ctrlKey && !ev.shiftKey && !ev.altKey) {
`,
                managed: `    /* ${marker('hotkey-drag-gate')} */
    document.addEventListener('dragover', (ev) => {
        if(getDatabase().enableHotkeys === false) return
        if (ev.ctrlKey && !ev.shiftKey && !ev.altKey) {
`,
                markerNeedle: marker('hotkey-drag-gate'),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-enable-gate`],
            },
            {
                id: `${prefix}mobile-pointer-navigation`,
                file: 'src/ts/hotkey.ts',
                type: 'replace',
                anchor: `export function initMobileGesture(){
    let pressingPointers = new Map<number, {x:number, y:number}>()

    document.addEventListener('touchstart', (ev) => {
        for(const touch of ev.changedTouches){
            const ele = touch.target as HTMLElement
            if(ele.tagName === 'BUTTON' || ele.tagName === 'INPUT' || ele.tagName === 'SELECT' || ele.tagName === 'TEXTAREA'){
                return
            }
            pressingPointers.set(touch.identifier, {x: touch.clientX, y: touch.clientY})
        }
    }, {
        passive: true
    })
    document.addEventListener('touchend', (ev) => {
        for(const touch of ev.changedTouches){
            const d = pressingPointers.get(touch.identifier)
            const moveX = touch.clientX - d.x
            const moveY = touch.clientY - d.y
            pressingPointers.delete(touch.identifier)

            if(moveX > 50 && Math.abs(moveY) < Math.abs(moveX)){
                if(get(selectedCharID) === -1){
                    if(get(MobileGUIStack) > 0){
                        MobileGUIStack.update(v => v - 1)
                    }
                }
                else{
                    if(get(MobileSideBar) > 0){
                        MobileSideBar.update(v => v - 1)
                    }
                }
            }
            else if(moveX < -50 && Math.abs(moveY) < Math.abs(moveX)){
                if(get(selectedCharID) === -1){
                    if(get(MobileGUIStack) < 2){
                        MobileGUIStack.update(v => v + 1)
                    }
                }
                else{
                    if(get(MobileSideBar) < 3){
                        MobileSideBar.update(v => v + 1)
                    }
                }
            }
        }
    }, {
        passive: true
    })
}
`,
                managed: `/* ${marker('mobile-pointer-navigation')}:START */
let mobileGestureInitialized = false

export function initMobileGesture(){
    if(mobileGestureInitialized) return
    mobileGestureInitialized = true

    const pressingPointers = new Map<number, {x:number, y:number}>()

    document.addEventListener('pointerdown', (event) => {
        if(
            !event.isPrimary
            || (event.pointerType === 'mouse' && event.button !== 0)
            || shouldIgnoreNavigationPointer(
                event.target,
                get(alertStore).type,
                Boolean(document.querySelector(
                    '[aria-modal="true"], [role="dialog"][data-state="open"]',
                )),
            )
        ){
            pressingPointers.delete(event.pointerId)
            return
        }
        pressingPointers.clear()
        pressingPointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
        })
    })

    document.addEventListener('pointerup', (event) => {
        const start = pressingPointers.get(event.pointerId)
        pressingPointers.delete(event.pointerId)
        if(!start) return

        const direction = getHorizontalNavigationDirection(start, {
            x: event.clientX,
            y: event.clientY,
        })
        if(direction){
            const step = direction === 'previous' ? -1 : 1
            if(get(selectedCharID) === -1){
                const next = getBoundedNavigationIndex(
                    get(MobileGUIStack),
                    step,
                    2,
                )
                if(next !== null){
                    MobileGUIStack.set(next)
                }
            }
            else{
                const next = getBoundedNavigationIndex(
                    get(MobileSideBar),
                    step,
                    3,
                )
                if(next !== null){
                    MobileSideBar.set(next)
                }
            }
        }
    })

    document.addEventListener('pointercancel', (event) => {
        pressingPointers.delete(event.pointerId)
    })
}
/* ${marker('mobile-pointer-navigation')}:END */
`,
                markerNeedle: `${marker('mobile-pointer-navigation')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-core-imports`],
            },
            {
                id: `${prefix}bootstrap-imports`,
                file: 'src/ts/bootstrap.ts',
                type: 'replace',
                anchor: `import { initMobileGesture } from "./hotkey";
`,
                managed: `/* ${marker('bootstrap-imports')} */
import { initHotkey, initMobileGesture } from "./hotkey";
import { syncMobileBackNavigationGuard } from "./mobileBackNavigation";
`,
                markerNeedle: marker('bootstrap-imports'),
                anchorPolicy: 'first',
                after: bootstrapAfter,
                requires: [
                    'kei-mobile-navigation-core:mobile-back',
                    `${prefix}main-init`,
                ],
            },
            {
                id: `${prefix}bootstrap-initialize`,
                file: 'src/ts/bootstrap.ts',
                type: 'replace',
                anchor: `            updateGuisize()
            if (!db.didFirstSetup) {
`,
                managed: `            updateGuisize()
            /* ${marker('bootstrap-initialize')} */
            initHotkey()
            syncMobileBackNavigationGuard(db.disableMobileBackNavigation)
            if (!db.didFirstSetup) {
`,
                markerNeedle: marker('bootstrap-initialize'),
                anchorPolicy: 'first',
                after: bootstrapAfter,
                requires: [`${prefix}bootstrap-imports`],
            },
            {
                id: `${prefix}database-enable-hotkeys-default`,
                file: 'src/ts/storage/database.svelte.ts',
                type: 'insert',
                where: 'before',
                anchor: `    data.enableScrollToActiveChar ??= true
`,
                content: `    data.enableHotkeys ??= true
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}database-mobile-back-default`,
                file: 'src/ts/storage/database.svelte.ts',
                type: 'insert',
                where: 'after',
                anchor: `    data.disableMobileDragDrop ??= false
`,
                content: `    data.disableMobileBackNavigation ??= false
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}database-mobile-back-field`,
                file: 'src/ts/storage/database.svelte.ts',
                type: 'insert',
                where: 'after',
                anchor: `    disableMobileDragDrop:boolean
`,
                content: `    disableMobileBackNavigation:boolean
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}database-enable-hotkeys-field`,
                file: 'src/ts/storage/database.svelte.ts',
                type: 'insert',
                where: 'before',
                anchor: `    hotkeys:Hotkey[]
`,
                content: `    enableHotkeys:boolean
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}hotkey-settings-import`,
                file: 'src/lib/Setting/Pages/HotkeySettings.svelte',
                type: 'insert',
                where: 'after',
                anchor: `    import SettingPage from "src/lib/UI/GUI/SettingPage.svelte";
`,
                content: `    import Check from "src/lib/UI/GUI/CheckInput.svelte";
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}hotkey-settings-toggle`,
                file: 'src/lib/Setting/Pages/HotkeySettings.svelte',
                type: 'insert',
                where: 'after',
                anchor: `<SettingPage title={language.hotkey}>
`,
                managed: `    <!-- ${marker('hotkey-settings-toggle')}:START -->
    <div class="mb-4 flex flex-col gap-1">
        <Check
            bind:check={DBState.db.enableHotkeys}
            name={language.enableHotkeys}
        />
        <span class="text-sm text-textcolor2">
            {language.enableHotkeysDesc}
        </span>
    </div>
    <!-- ${marker('hotkey-settings-toggle')}:END -->
`,
                markerNeedle: `${marker('hotkey-settings-toggle')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-settings-import`],
            },
            {
                id: `${prefix}hotkey-settings-enabled-open`,
                file: 'src/lib/Setting/Pages/HotkeySettings.svelte',
                type: 'replace',
                anchor: `{#if window.innerWidth < 768}
`,
                managed: `    <!-- ${marker('hotkey-settings-enabled-open')} -->
    {#if DBState.db.enableHotkeys}
{#if window.innerWidth < 768}
`,
                markerNeedle: marker('hotkey-settings-enabled-open'),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-settings-toggle`],
            },
            {
                id: `${prefix}hotkey-settings-enabled-close`,
                file: 'src/lib/Setting/Pages/HotkeySettings.svelte',
                type: 'replace',
                anchor: `{/if}
</SettingPage>`,
                managed: `{/if}
    <!-- ${marker('hotkey-settings-enabled-close')} -->
    {/if}
</SettingPage>`,
                markerNeedle: marker('hotkey-settings-enabled-close'),
                anchorPolicy: 'first',
                requires: [`${prefix}hotkey-settings-enabled-open`],
            },
            {
                id: `${prefix}accessibility-mobile-back-import`,
                file: 'src/ts/setting/accessibilitySettingsData.ts',
                type: 'insert',
                where: 'after',
                anchor: `import { getCurrentChat, getDatabase, loadTogglesFromChat } from '../storage/database.svelte';
`,
                content: `import { syncMobileBackNavigationGuard } from '../mobileBackNavigation';
`,
                anchorPolicy: 'first',
                requires: ['kei-mobile-navigation-core:mobile-back'],
            },
            {
                id: `${prefix}accessibility-mobile-back-setting`,
                file: 'src/ts/setting/accessibilitySettingsData.ts',
                type: 'insert',
                where: 'after',
                anchor: `    {
        id: 'acc.disableMobileDragDrop',
        type: 'check',
        labelKey: 'disableMobileDragDrop',
        bindKey: 'disableMobileDragDrop',
        helpKey: 'disableMobileDragDrop',
        keywords: ['mobile', 'drag', 'drop', 'character', 'disable'],
    },
`,
                content: `    {
        id: 'acc.disableMobileBackNavigation',
        type: 'check',
        labelKey: 'disableMobileBackNavigation',
        bindKey: 'disableMobileBackNavigation',
        helpKey: 'disableMobileBackNavigation',
        keywords: ['mobile', 'browser', 'back', 'navigation', 'history', 'disable'],
        onChange: (enabled) =>
            syncMobileBackNavigationGuard(Boolean(enabled), true),
    },
`,
                anchorPolicy: 'first',
                requires: [`${prefix}accessibility-mobile-back-import`],
            },
            {
                id: `${prefix}accessibility-mobile-back-group`,
                file: 'src/ts/setting/accessibilitySettingsData.ts',
                type: 'insert',
                where: 'after',
                anchor: `    'acc.disableMobileDragDrop',
`,
                content: `    'acc.disableMobileBackNavigation',
`,
                anchorPolicy: 'first',
                requires: [`${prefix}accessibility-mobile-back-setting`],
            },
            {
                id: `${prefix}language-en-mobile-back`,
                file: 'src/lang/en.ts',
                type: 'insert',
                where: 'after',
                anchor: `    disableMobileDragDrop: "Disable Character Drag & Drop on Mobile",
`,
                content: `    disableMobileBackNavigation: "Disable Back Navigation on Mobile",
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}language-en-hotkey-toggle`,
                file: 'src/lang/en.ts',
                type: 'insert',
                where: 'after',
                anchor: `    hotkey: "Hotkey",
`,
                content: `    enableHotkeys: "Enable hotkeys",
    enableHotkeysDesc: "Enable configurable keyboard shortcuts and related shortcut gestures.",
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}language-ko-mobile-back`,
                file: 'src/lang/ko.ts',
                type: 'insert',
                where: 'after',
                anchor: `  disableMobileDragDrop: "모바일에서 캐릭터 드래그 앤 드롭 비활성화",
`,
                content: `  disableMobileBackNavigation: "모바일에서 뒤로 가기 비활성화",
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}language-ko-hotkey-toggle`,
                file: 'src/lang/ko.ts',
                type: 'insert',
                where: 'after',
                anchor: `  hotkey: "단축키",
`,
                content: `  enableHotkeys: "단축키 활성화",
  enableHotkeysDesc: "설정한 키보드 단축키와 관련 단축 동작을 활성화합니다.",
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}help-en-mobile-back`,
                file: 'src/lang/help.en.ts',
                type: 'insert',
                where: 'after',
                anchor: `        disableMobileDragDrop: "Disable drag-and-drop for chat reordering on mobile devices. Enable this if you experience accidental drags while scrolling.",
`,
                content: `        disableMobileBackNavigation: "Prevents the browser back button or back gesture from accidentally leaving the current tab on mobile devices. Some browsers may show a confirmation before leaving.",
`,
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}help-ko-mobile-back`,
                file: 'src/lang/help.ko.ts',
                type: 'insert',
                where: 'after',
                anchor: `        "disableMobileDragDrop": "모바일에서 채팅 목록의 드래그 앤 드롭 정렬을 비활성화합니다.",
`,
                content: `        "disableMobileBackNavigation": "모바일 브라우저에서 뒤로 가기 버튼이나 제스처로 현재 탭을 실수로 벗어나지 않도록 합니다. 일부 브라우저에서는 이탈 전에 확인 창이 표시될 수 있습니다.",
`,
                anchorPolicy: 'first',
            },
        ],
    }
}

module.exports = {
    createMobileNavigationAdapterManifest,
}
