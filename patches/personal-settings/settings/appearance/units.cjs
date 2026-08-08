'use strict'

const {
    managedTypeScript,
    owned,
} = require('../../manifest-helpers.cjs')

const targetVersions = {
    pocketrisu: ['1.9.0'],
}

function svelteBlock(id, content) {
    const body = content.endsWith('\n') ? content : `${content}\n`
    return `<!-- POCKETRISU-PATCH:${id}:START -->\n${body}<!-- POCKETRISU-PATCH:${id}:END -->\n`
}

const units = [
    {
        id: 'personal-settings:appearance-logic-1.9',
        file: 'src/ts/personalSettings/appearance.ts',
        type: 'owned',
        content: owned(__dirname, 'src/ts/personalSettings/appearance.ts'),
        requires: ['personal-settings:database-field'],
    },
    {
        id: 'personal-settings:appearance-logic-tests-1.9',
        file: 'src/ts/personalSettings/appearance.test.ts',
        type: 'owned',
        content: owned(__dirname, 'src/ts/personalSettings/appearance.test.ts'),
        requires: ['personal-settings:appearance-logic-1.9'],
    },
    {
        id: 'personal-settings:appearance-settings-data-1.9',
        file: 'src/ts/setting/personalAppearanceSettingsData.ts',
        type: 'owned',
        content: owned(__dirname, 'src/ts/setting/personalAppearanceSettingsData.ts'),
        requires: ['personal-settings:appearance-logic-1.9'],
    },
    {
        id: 'personal-settings:appearance-section-1.9',
        file: 'src/lib/Setting/Pages/PersonalSettings/AppearanceSettings.svelte',
        type: 'owned',
        content: owned(
            __dirname,
            'src/lib/Setting/Pages/PersonalSettings/AppearanceSettings.svelte',
        ),
        requires: [
            'personal-settings:appearance-settings-data-1.9',
            'personal-settings:appearance-language-ko-1.9',
        ],
    },
    {
        id: 'personal-settings:appearance-runtime-component-1.9',
        file: 'src/lib/Others/PersonalAppearanceRuntime.svelte',
        type: 'owned',
        content: owned(__dirname, 'src/lib/Others/PersonalAppearanceRuntime.svelte'),
        requires: ['personal-settings:appearance-logic-1.9'],
    },
    {
        id: 'personal-settings:appearance-css-1.9',
        file: 'src/styles/personal-appearance.css',
        type: 'owned',
        content: owned(__dirname, 'src/styles/personal-appearance.css'),
    },
    {
        id: 'personal-settings:appearance-language-en-1.9',
        file: 'src/lang/en.ts',
        type: 'insert',
        where: 'before',
        anchor: '    showRequestStatus: "Show request status",\n',
        content: `    personalSettingsImportTab: "Import behavior",
    personalSettingsAppearanceTab: "CSS appearance",
    personalAppearanceEnabled: "Enable personal appearance",
    personalAppearanceChatFont: "Chat font",
    personalAppearanceChatAlignment: "Message alignment",
    personalAppearanceKeepKoreanWords: "Keep Korean words together",
    personalAppearanceWrapCodeBlocks: "Wrap block code on narrow screens",
    personalAppearanceMinimalComposer: "Minimal composer",
    personalAppearanceTextSendIcon: "Text send icon",
    personalAppearanceCompactSidebar: "Compact sidebar spacing",
    personalAppearanceAvatarBorder: "Avatar borders",
    personalAppearancePanelDividers: "Panel dividers",
    personalAppearanceCompactSettings: "Compact setting rows",
    personalAppearanceHideJailbreakToggle: "Hide jailbreak toggle",
    personalAppearanceOptionAppFont: "Use app font",
    personalAppearanceOptionNotoSansKr: "Noto Sans KR (Korean glyph forms)",
    personalAppearanceOptionNotoSerifKr: "Noto Serif KR (Korean glyph forms)",
    personalAppearanceOptionLeft: "Left",
    personalAppearanceOptionCenter: "Center",
    personalAppearanceFontPreview: "Font preview",
    personalAppearanceFontStatusApp: "Using the app font",
    personalAppearanceFontStatusInactive: "Saved font is currently paused",
    personalAppearanceFontStatusLoading: "Loading the selected font…",
    personalAppearanceFontStatusReady: "Selected font loaded",
    personalAppearanceFontStatusFailed: "Font load failed; using a fallback",
    personalAppearanceFontStatusUnavailable: "Font loading status is unavailable",
    personalAppearanceStandardOnly: "These features apply only to PocketRisu Standard. Safe Mode temporarily disables all of them without changing saved choices.",
    personalAppearanceSchemaUnsupported: "This appearance data uses an unknown schema version. It is preserved unchanged and all appearance features are disabled.",
    personalAppearanceSafeModePaused: "Safe Mode is active, so saved appearance choices are temporarily paused.",
    personalAppearanceMasterOff: "The master switch is off. Child choices are saved but currently have no visual effect.",
    personalAppearanceJailbreakStatusOn: "Current jailbreak toggle value: On. Hiding the control does not turn it off.",
    personalAppearanceJailbreakStatusOff: "Current jailbreak toggle value: Off. Hiding the control preserves this value.",
`,
        requires: ['personal-settings:appearance-settings-data-1.9'],
    },
    {
        id: 'personal-settings:appearance-language-ko-1.9',
        file: 'src/lang/ko.ts',
        type: 'insert',
        where: 'before',
        anchor: '  showRequestStatus: "요청 상태 표시",\n',
        content: `  personalSettingsImportTab: "임포트 동작",
  personalSettingsAppearanceTab: "CSS 꾸미기",
  personalAppearanceEnabled: "개인 꾸미기 사용",
  personalAppearanceChatFont: "채팅 폰트",
  personalAppearanceChatAlignment: "메시지 정렬",
  personalAppearanceKeepKoreanWords: "한글 단어 끊김 방지",
  personalAppearanceWrapCodeBlocks: "좁은 화면에서 블록 코드 줄바꿈",
  personalAppearanceMinimalComposer: "심플 입력창",
  personalAppearanceTextSendIcon: "문자형 전송 아이콘",
  personalAppearanceCompactSidebar: "컴팩트 사이드바 간격",
  personalAppearanceAvatarBorder: "아바타 테두리",
  personalAppearancePanelDividers: "패널 구분선",
  personalAppearanceCompactSettings: "설정 행 간격 압축",
  personalAppearanceHideJailbreakToggle: "탈옥 토글 숨기기",
  personalAppearanceOptionAppFont: "앱 폰트 사용",
  personalAppearanceOptionNotoSansKr: "Noto Sans KR (한국어 자형)",
  personalAppearanceOptionNotoSerifKr: "Noto Serif KR (한국어 자형)",
  personalAppearanceOptionLeft: "왼쪽",
  personalAppearanceOptionCenter: "가운데",
  personalAppearanceFontPreview: "폰트 미리보기",
  personalAppearanceFontStatusApp: "앱 폰트 사용 중",
  personalAppearanceFontStatusInactive: "저장한 폰트가 현재 일시 중지됨",
  personalAppearanceFontStatusLoading: "선택한 폰트를 불러오는 중…",
  personalAppearanceFontStatusReady: "선택한 폰트 로드됨",
  personalAppearanceFontStatusFailed: "폰트 로드 실패 · 대체 폰트 사용 중",
  personalAppearanceFontStatusUnavailable: "폰트 로드 상태를 확인할 수 없음",
  personalAppearanceStandardOnly: "이 기능들은 PocketRisu Standard에서만 적용돼요. Safe Mode에서는 저장값을 바꾸지 않고 모두 잠시 꺼져요.",
  personalAppearanceSchemaUnsupported: "알 수 없는 버전의 꾸미기 설정이에요. 원본을 보존하고 모든 꾸미기 기능을 안전하게 끕니다. 감지된 버전:",
  personalAppearanceSafeModePaused: "Safe Mode가 켜져 있어 저장된 꾸미기 선택을 잠시 적용하지 않아요.",
  personalAppearanceMasterOff: "전체 사용이 꺼져 있어요. 하위 선택은 저장되지만 현재 화면에는 적용되지 않아요.",
  personalAppearanceJailbreakStatusOn: "현재 탈옥 토글 값: 켜짐. 토글을 숨겨도 이 값은 꺼지지 않아요.",
  personalAppearanceJailbreakStatusOff: "현재 탈옥 토글 값: 꺼짐. 토글을 숨겨도 이 값은 그대로 보존돼요.",
`,
        requires: ['personal-settings:appearance-language-en-1.9'],
    },
    {
        id: 'personal-settings:appearance-help-en-1.9',
        file: 'src/lang/help.en.ts',
        type: 'insert',
        where: 'before',
        anchor: '        bootBackupReminder:\n',
        content: `        personalAppearanceEnabled: "Master switch for this tab. Turning it off removes the root token attribute while preserving every child choice.",
        personalAppearanceChatFont: "Applies the selected font to message bodies. Code and keyboard input keep a monospace stack.",
        personalAppearanceChatAlignment: "Centers message prose while lists, quotes, code blocks, and tables stay left-aligned for readability.",
        personalAppearanceKeepKoreanWords: "Uses keep-all for prose so Korean words do not split arbitrarily. Long URLs can still wrap, and code is excluded.",
        personalAppearanceWrapCodeBlocks: "Wraps only code inside block pre elements on narrow screens. Inline code keeps its normal behavior and horizontal overflow is not hidden.",
        personalAppearanceMinimalComposer: "Reduces the visual padding and button prominence of the stable composer container without changing sticky positioning, width, actions, or plugin-injected UI.",
        personalAppearanceTextSendIcon: "Uses a text triangle for a normal Send action. Resend keeps its refresh icon and an active generation keeps the Stop/loading affordance.",
        personalAppearanceCompactSidebar: "Reduces visible character-list gaps while retaining an expanded drop hit area for drag and touch behavior.",
        personalAppearanceAvatarBorder: "Adds a theme-colored border around sidebar avatars. Independent from panel dividers.",
        personalAppearancePanelDividers: "Adds theme-colored vertical dividers between the main sidebar, secondary sidebar, and settings panels. Independent from avatar borders.",
        personalAppearanceCompactSettings: "Reduces vertical padding only on data-driven setting rows identified by data-setting-id. It does not resize text editors or unrelated forms.",
        personalAppearanceHideJailbreakToggle: "Removes the jailbreak control at render time but preserves its current value. Safe Mode or disabling personal appearance shows the control again.",

`,
        requires: ['personal-settings:appearance-language-en-1.9'],
    },
    {
        id: 'personal-settings:appearance-help-ko-1.9',
        file: 'src/lang/help.ko.ts',
        type: 'insert',
        where: 'before',
        anchor: '        "bootBackupReminder":',
        content: `        "personalAppearanceEnabled": "이 탭의 전체 스위치예요. 끄면 root token 속성만 제거하고 하위 선택값은 모두 보존해요.",
        "personalAppearanceChatFont": "선택한 폰트를 메시지 본문에 적용해요. 코드와 키보드 입력은 고정폭 폰트를 유지해요.",
        "personalAppearanceChatAlignment": "메시지 본문을 가운데 정렬하되 목록·인용문·블록 코드·표는 읽기 쉽도록 왼쪽 정렬을 유지해요.",
        "personalAppearanceKeepKoreanWords": "일반 본문에서 한글 단어가 임의로 끊기지 않게 해요. 긴 URL은 줄바꿈할 수 있고 코드는 대상에서 제외해요.",
        "personalAppearanceWrapCodeBlocks": "좁은 화면에서 pre 안의 블록 코드만 줄바꿈해요. 인라인 코드는 그대로 두고 가로 넘침을 숨기지 않아요.",
        "personalAppearanceMinimalComposer": "고정 위치·너비·버튼 기능·플러그인 UI는 보존하면서 안정된 입력창 컨테이너의 패딩과 버튼 강조만 줄여요.",
        "personalAppearanceTextSendIcon": "일반 전송일 때만 문자 삼각형을 써요. 재생성은 새로고침 아이콘, 생성 중 취소는 기존 진행 표시를 유지해요.",
        "personalAppearanceCompactSidebar": "캐릭터 목록의 보이는 간격을 줄이되 드래그와 터치용 드롭 판정 영역은 확장된 크기로 유지해요.",
        "personalAppearanceAvatarBorder": "사이드바 아바타에 현재 테마 색상의 테두리를 더해요. 패널 구분선과 별도 기능이에요.",
        "personalAppearancePanelDividers": "메인 사이드바·보조 사이드바·설정 패널 사이에 테마 색상의 세로 구분선을 더해요. 아바타 테두리와 별도 기능이에요.",
        "personalAppearanceCompactSettings": "data-setting-id가 있는 데이터 기반 설정 행의 세로 패딩만 줄여요. 긴 편집창과 다른 폼 크기는 바꾸지 않아요.",
        "personalAppearanceHideJailbreakToggle": "탈옥 토글을 렌더 단계에서 숨기지만 현재 값은 보존해요. Safe Mode 또는 개인 꾸미기 전체 사용을 끄면 다시 표시해요.",

`,
        requires: ['personal-settings:appearance-help-en-1.9'],
    },
    {
        id: 'personal-settings:appearance-submenu-store-1.9',
        file: 'src/ts/stores.svelte.ts',
        type: 'insert',
        where: 'after',
        anchor: 'export const AccessibilitySubmenuIndex = writable(0)\n',
        content: 'export const PersonalSubmenuIndex = writable(0)\n',
        requires: ['personal-settings:routing'],
    },
    {
        id: 'personal-settings:appearance-page-imports-1.9',
        file: 'src/lib/Setting/Pages/PersonalSettings.svelte',
        type: 'insert',
        where: 'after',
        anchor: "    import ImportNavigationSetting from './PersonalSettings/ImportNavigationSetting.svelte'\n",
        content: `    import SettingTabs from 'src/lib/UI/GUI/SettingTabs.svelte'
    import AppearanceSettings from './PersonalSettings/AppearanceSettings.svelte'
    import { PersonalSubmenuIndex } from 'src/ts/stores.svelte'
    import { language } from 'src/lang'
`,
        requires: [
            'personal-settings:page',
            'personal-settings:appearance-section-1.9',
            'personal-settings:appearance-submenu-store-1.9',
        ],
    },
    {
        id: 'personal-settings:appearance-page-tabs-1.9',
        file: 'src/lib/Setting/Pages/PersonalSettings.svelte',
        type: 'replace',
        anchor: '    <ImportNavigationSetting />\n',
        managed: svelteBlock('personal-settings:appearance-page-tabs-1.9', `    <SettingTabs
        tabs={[
            { label: language.personalSettingsImportTab, value: 0 },
            { label: language.personalSettingsAppearanceTab, value: 1 },
        ]}
        bind:selected={$PersonalSubmenuIndex}
    />
    {#if $PersonalSubmenuIndex === 0}
        <ImportNavigationSetting />
    {:else if $PersonalSubmenuIndex === 1}
        <AppearanceSettings />
    {/if}`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-page-tabs-1.9:START',
        requires: ['personal-settings:appearance-page-imports-1.9'],
    },
    {
        id: 'personal-settings:appearance-css-link-1.9',
        file: 'index.html',
        type: 'insert',
        where: 'after',
        anchor: '    <link rel="stylesheet" href="/src/styles/nodeonly-standard.css" />\n',
        managed: `    <!-- POCKETRISU-PATCH:personal-settings:appearance-css-link-1.9:START -->
    <link rel="stylesheet" href="/src/styles/personal-appearance.css" />
    <!-- POCKETRISU-PATCH:personal-settings:appearance-css-link-1.9:END -->
`,
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-css-link-1.9:START',
        requires: ['personal-settings:appearance-css-1.9'],
    },
    {
        id: 'personal-settings:appearance-app-import-1.9',
        file: 'src/App.svelte',
        type: 'insert',
        where: 'after',
        anchor: "    import BootBackupPrompt from './lib/Others/BootBackupPrompt.svelte';\n",
        content: "    import PersonalAppearanceRuntime from './lib/Others/PersonalAppearanceRuntime.svelte';\n",
        requires: ['personal-settings:appearance-runtime-component-1.9'],
    },
    {
        id: 'personal-settings:appearance-app-runtime-1.9',
        file: 'src/App.svelte',
        type: 'insert',
        where: 'before',
        anchor: `<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<main class="flex bg-bg w-full h-full max-w-100vw text-textcolor" ondragover={(e) => {
`,
        managed: svelteBlock(
            'personal-settings:appearance-app-runtime-1.9',
            '<PersonalAppearanceRuntime />',
        ),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-app-runtime-1.9:START',
        requires: ['personal-settings:appearance-app-import-1.9'],
    },
    {
        id: 'personal-settings:appearance-bootstrap-import-1.9',
        file: 'src/ts/bootstrap.ts',
        type: 'insert',
        where: 'after',
        anchor: 'import { updateColorScheme, updateTextThemeAndCSS } from "./gui/colorscheme";\n',
        content: `import { syncPersonalAppearance } from "./personalSettings/appearance";
import { SafeModeStore } from "./stores.svelte";
`,
        requires: ['personal-settings:appearance-logic-1.9'],
    },
    {
        id: 'personal-settings:appearance-bootstrap-sync-1.9',
        file: 'src/ts/bootstrap.ts',
        type: 'insert',
        where: 'after',
        anchor: '            updateTextThemeAndCSS()\n',
        content: '            syncPersonalAppearance(db, get(SafeModeStore))\n',
        requires: ['personal-settings:appearance-bootstrap-import-1.9'],
    },
    {
        id: 'personal-settings:appearance-composer-hook-1.9',
        file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
        type: 'replace',
        anchor: '<div class="flex flex-wrap items-center gap-1 rounded-3xl border border-darkborderc bg-bgcolor px-2 py-1.5 transition-colors focus-within:border-textcolor plugin-compat-items-stretch">',
        managed: svelteBlock(
            'personal-settings:appearance-composer-hook-1.9',
            '<div data-risu-composer class="flex flex-wrap items-center gap-1 rounded-3xl border border-darkborderc bg-bgcolor px-2 py-1.5 transition-colors focus-within:border-textcolor plugin-compat-items-stretch">',
        ),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-composer-hook-1.9:START',
        requires: ['personal-settings:appearance-css-1.9'],
    },
    {
        id: 'personal-settings:appearance-chat-render-imports-1.9',
        file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
        type: 'insert',
        where: 'after',
        anchor: '    import { chatProcessStage, doingChat, sendChat } from "../../ts/process/index.svelte";\n',
        content: `    import { SafeModeStore } from "../../ts/stores.svelte";
    import { isPersonalAppearanceFeatureEffective } from "../../ts/personalSettings/appearance";
`,
        after: ['bg-preserve:hook:defaultchatscreen-import-orchestrating'],
        requires: ['personal-settings:appearance-logic-1.9'],
    },
    {
        id: 'personal-settings:appearance-send-icon-render-1.9',
        file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
        type: 'replace',
        anchor: '                            <Send size={18} />\n',
        managed: svelteBlock('personal-settings:appearance-send-icon-render-1.9', `                            {#if isPersonalAppearanceFeatureEffective(DBState.db, $SafeModeStore, 'composer.textSendIcon')}
                                <span class="personal-send-glyph" aria-hidden="true">▶</span>
                            {:else}
                                <Send size={18} />
                            {/if}`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-send-icon-render-1.9:START',
        requires: ['personal-settings:appearance-chat-render-imports-1.9'],
    },
    {
        id: 'personal-settings:appearance-toggle-render-imports-1.9',
        file: 'src/lib/SideBars/Toggles.svelte',
        type: 'insert',
        where: 'after',
        anchor: '    import { DBState, selectedCharID } from "src/ts/stores.svelte";\n',
        content: `    import { SafeModeStore } from "src/ts/stores.svelte";
    import { isPersonalAppearanceFeatureEffective } from "src/ts/personalSettings/appearance";
`,
        requires: ['personal-settings:appearance-logic-1.9'],
    },
    {
        id: 'personal-settings:appearance-jailbreak-render-first-1.9',
        file: 'src/lib/SideBars/Toggles.svelte',
        type: 'replace',
        anchor: '        {#if hasJailbreakPrompt}\n',
        managed: svelteBlock(
            'personal-settings:appearance-jailbreak-render-first-1.9',
            "        {#if hasJailbreakPrompt && !isPersonalAppearanceFeatureEffective(DBState.db, $SafeModeStore, 'visibility.hideJailbreakToggle')}",
        ),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-jailbreak-render-first-1.9:START',
        anchorPolicy: 'first',
        requires: ['personal-settings:appearance-toggle-render-imports-1.9'],
    },
    {
        id: 'personal-settings:appearance-jailbreak-render-second-1.9',
        file: 'src/lib/SideBars/Toggles.svelte',
        type: 'replace',
        anchor: '    {#if hasJailbreakPrompt}\n',
        managed: svelteBlock(
            'personal-settings:appearance-jailbreak-render-second-1.9',
            "    {#if hasJailbreakPrompt && !isPersonalAppearanceFeatureEffective(DBState.db, $SafeModeStore, 'visibility.hideJailbreakToggle')}",
        ),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-jailbreak-render-second-1.9:START',
        requires: ['personal-settings:appearance-jailbreak-render-first-1.9'],
    },
    {
        id: 'personal-settings:appearance-search-import-1.9',
        file: 'src/ts/setting/searchIndex.ts',
        type: 'insert',
        where: 'after',
        anchor: "import { searchManifestEntries } from './searchManifestData';\n",
        content: "import { personalAppearanceSettingsItems } from './personalAppearanceSettingsData';\n",
        requires: ['personal-settings:appearance-settings-data-1.9'],
    },
    {
        id: 'personal-settings:appearance-search-store-import-1.9',
        file: 'src/ts/setting/searchIndex.ts',
        type: 'insert',
        where: 'after',
        anchor: '    AccessibilitySubmenuIndex,\n',
        content: '    PersonalSubmenuIndex,\n',
        requires: ['personal-settings:appearance-submenu-store-1.9'],
    },
    {
        id: 'personal-settings:appearance-search-source-1.9',
        file: 'src/ts/setting/searchIndex.ts',
        type: 'insert',
        where: 'before',
        anchor: '];\n\n/** Page title per route, for the result breadcrumb. */',
        content: `    {
        items: personalAppearanceSettingsItems,
        route: SettingsRoute.Personal,
        subTab: 1,
        tabLabel: () => language.personalSettingsAppearanceTab,
    },
`,
        requires: ['personal-settings:appearance-search-import-1.9'],
    },
    {
        id: 'personal-settings:appearance-search-route-label-1.9',
        file: 'src/ts/setting/searchIndex.ts',
        type: 'insert',
        where: 'after',
        anchor: '        case SettingsRoute.System: return language.system;\n',
        content: "        case SettingsRoute.Personal: return '개인 설정';\n",
        requires: ['personal-settings:routing'],
    },
    {
        id: 'personal-settings:appearance-search-submenu-1.9',
        file: 'src/ts/setting/searchIndex.ts',
        type: 'insert',
        where: 'after',
        anchor: '    [SettingsRoute.Accessibility]: AccessibilitySubmenuIndex,\n',
        content: '    [SettingsRoute.Personal]: PersonalSubmenuIndex,\n',
        requires: ['personal-settings:appearance-search-store-import-1.9'],
    },
    {
        id: 'personal-settings:appearance-search-tests-1.9',
        file: 'src/ts/setting/searchIndex.test.ts',
        type: 'insert',
        where: 'before',
        anchor: "describe('searchSettings — module binding tab', () => {\n",
        managed: managedTypeScript('personal-settings:appearance-search-tests-1.9', `const appearanceDb: any = new Proxy(
    { theme: '', pocketRisuPersonalSettings: undefined },
    { get: (target, key) => key in target ? target[key as keyof typeof target] : '' },
)
const appearanceCtx = { ...ctx, db: appearanceDb }

describe('searchSettings — Personal appearance tab', () => {
    test('indexes a CSS appearance setting with its tab and row target', () => {
        const hit = searchSettings('페이퍼로지', appearanceCtx)
            .find((result) => result.itemId === 'personal.appearance.chatFont')
        expect(hit).toMatchObject({
            route: SettingsRoute.Personal,
            subTab: 1,
            itemId: 'personal.appearance.chatFont',
        })
    })

    test('indexes English appearance keywords on a Korean UI', () => {
        const hit = searchSettings('compact sidebar', appearanceCtx)
            .find((result) => result.itemId === 'personal.appearance.compactSidebar')
        expect(hit?.subTab).toBe(1)
    })
})`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-search-tests-1.9:START',
        after: ['personal-settings:search-index-test-1.9'],
        requires: [
            'personal-settings:appearance-search-source-1.9',
            'personal-settings:appearance-search-route-label-1.9',
            'personal-settings:appearance-search-submenu-1.9',
        ],
    },
    {
        id: 'personal-settings:appearance-a11y-row-label-1.9',
        file: 'src/lib/Setting/Wrappers/SettingRowLayout.svelte',
        type: 'replace',
        anchor: '        <span class="text-sm text-textcolor">{getLabel(item)}</span>\n',
        managed: svelteBlock(
            'personal-settings:appearance-a11y-row-label-1.9',
            '        <span id={`setting-${item.id}-label`} class="text-sm text-textcolor">{getLabel(item)}</span>',
        ),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-a11y-row-label-1.9:START',
        requires: ['personal-settings:appearance-settings-data-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-row-description-1.9',
        file: 'src/lib/Setting/Wrappers/SettingRowLayout.svelte',
        type: 'replace',
        anchor: '        {#if helpText}<p class="text-xs text-textcolor2 mt-0.5 whitespace-pre-line">{helpText}</p>{/if}\n',
        managed: svelteBlock(
            'personal-settings:appearance-a11y-row-description-1.9',
            '        {#if helpText}<p id={`setting-${item.id}-description`} class="text-xs text-textcolor2 mt-0.5 whitespace-pre-line">{helpText}</p>{/if}',
        ),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-a11y-row-description-1.9:START',
        requires: ['personal-settings:appearance-a11y-row-label-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-switch-props-1.9',
        file: 'src/lib/UI/GUI/ShSwitch.svelte',
        type: 'insert',
        where: 'after',
        anchor: '        required?: boolean;\n',
        content: `        ariaLabelledby?: string;
        ariaDescribedby?: string;
`,
    },
    {
        id: 'personal-settings:appearance-a11y-switch-bindings-1.9',
        file: 'src/lib/UI/GUI/ShSwitch.svelte',
        type: 'insert',
        where: 'after',
        anchor: '        required,\n',
        content: `        ariaLabelledby,
        ariaDescribedby,
`,
        requires: ['personal-settings:appearance-a11y-switch-props-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-switch-root-1.9',
        file: 'src/lib/UI/GUI/ShSwitch.svelte',
        type: 'replace',
        anchor: `<SwitchPrimitive.Root
    bind:ref
    bind:checked
    {disabled}
    {name}
    {value}
    {required}
    {onCheckedChange}
    data-slot="switch"
    data-size={size}
    class={cn(
        'peer group/switch relative inline-flex items-center transition-all outline-none ' +
        'after:absolute after:-inset-x-3 after:-inset-y-2 ' +
        'data-disabled:cursor-not-allowed data-disabled:opacity-50 ' +
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-darkbutton ' +
        'focus-visible:border-borderc focus-visible:ring-borderc/50 ' +
        'aria-invalid:ring-draculared/20 aria-invalid:border-draculared ' +
        'shrink-0 rounded-full border border-transparent shadow-xs ' +
        'focus-visible:ring-3 aria-invalid:ring-3 ' +
        'data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] ' +
        'data-[size=sm]:h-[14px] data-[size=sm]:w-[24px]',
        className
    )}
>
`,
        managed: svelteBlock('personal-settings:appearance-a11y-switch-root-1.9', `<SwitchPrimitive.Root
    bind:ref
    bind:checked
    {disabled}
    {name}
    {value}
    {required}
    aria-labelledby={ariaLabelledby}
    aria-describedby={ariaDescribedby}
    {onCheckedChange}
    data-slot="switch"
    data-size={size}
    class={cn(
        'peer group/switch relative inline-flex items-center transition-all outline-none ' +
        'after:absolute after:-inset-x-3 after:-inset-y-2 ' +
        'data-disabled:cursor-not-allowed data-disabled:opacity-50 ' +
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-darkbutton ' +
        'focus-visible:border-borderc focus-visible:ring-borderc/50 ' +
        'aria-invalid:ring-draculared/20 aria-invalid:border-draculared ' +
        'shrink-0 rounded-full border border-transparent shadow-xs ' +
        'focus-visible:ring-3 aria-invalid:ring-3 ' +
        'data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] ' +
        'data-[size=sm]:h-[14px] data-[size=sm]:w-[24px]',
        className
    )}
>`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-a11y-switch-root-1.9:START',
        requires: ['personal-settings:appearance-a11y-switch-bindings-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-setting-check-1.9',
        file: 'src/lib/Setting/Wrappers/SettingCheck.svelte',
        type: 'replace',
        anchor: '            <ShSwitch checked={!!localValue} onCheckedChange={(v) => (localValue = v)} />\n',
        managed: svelteBlock('personal-settings:appearance-a11y-setting-check-1.9', `            <ShSwitch
                checked={!!localValue}
                ariaLabelledby={\`setting-\${item.id}-label\`}
                ariaDescribedby={item.helpKey ? \`setting-\${item.id}-description\` : undefined}
                onCheckedChange={(v) => (localValue = v)}
            />`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-a11y-setting-check-1.9:START',
        requires: [
            'personal-settings:appearance-a11y-row-description-1.9',
            'personal-settings:appearance-a11y-switch-root-1.9',
        ],
    },
    {
        id: 'personal-settings:appearance-a11y-select-input-props-1.9',
        file: 'src/lib/UI/GUI/SelectInput.svelte',
        type: 'insert',
        where: 'after',
        anchor: '        size?: \'sm\'|\'md\'|\'lg\'|\'xl\';\n',
        content: `        ariaLabelledby?: string;
        ariaDescribedby?: string;
`,
    },
    {
        id: 'personal-settings:appearance-a11y-select-input-bindings-1.9',
        file: 'src/lib/UI/GUI/SelectInput.svelte',
        type: 'insert',
        where: 'after',
        anchor: "        size = 'md',\n",
        content: `        ariaLabelledby,
        ariaDescribedby,
`,
        requires: ['personal-settings:appearance-a11y-select-input-props-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-select-input-forward-1.9',
        file: 'src/lib/UI/GUI/SelectInput.svelte',
        type: 'replace',
        anchor: '<ShSelect bind:value {className} {size} {onchange}>\n',
        managed: svelteBlock(
            'personal-settings:appearance-a11y-select-input-forward-1.9',
            '<ShSelect bind:value {className} {size} {ariaLabelledby} {ariaDescribedby} {onchange}>',
        ),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-a11y-select-input-forward-1.9:START',
        requires: ['personal-settings:appearance-a11y-select-input-bindings-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-sh-select-props-1.9',
        file: 'src/lib/UI/GUI/ShSelect.svelte',
        type: 'insert',
        where: 'after',
        anchor: '        size?: \'sm\'|\'md\'|\'lg\'|\'xl\';\n',
        content: `        ariaLabelledby?: string;
        ariaDescribedby?: string;
`,
    },
    {
        id: 'personal-settings:appearance-a11y-sh-select-bindings-1.9',
        file: 'src/lib/UI/GUI/ShSelect.svelte',
        type: 'insert',
        where: 'after',
        anchor: "        size = 'md',\n",
        content: `        ariaLabelledby,
        ariaDescribedby,
`,
        requires: ['personal-settings:appearance-a11y-sh-select-props-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-sh-select-touch-1.9',
        file: 'src/lib/UI/GUI/ShSelect.svelte',
        type: 'replace',
        anchor: `        <select
            bind:this={selectEl}
            bind:value
            {onchange}
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
`,
        managed: svelteBlock('personal-settings:appearance-a11y-sh-select-touch-1.9', `        <select
            bind:this={selectEl}
            bind:value
            aria-labelledby={ariaLabelledby}
            aria-describedby={ariaDescribedby}
            {onchange}
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-a11y-sh-select-touch-1.9:START',
        requires: ['personal-settings:appearance-a11y-sh-select-bindings-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-sh-select-native-1.9',
        file: 'src/lib/UI/GUI/ShSelect.svelte',
        type: 'replace',
        anchor: '    <select bind:this={selectEl} bind:value {onchange} class="sr-only" tabindex={-1}>\n',
        managed: svelteBlock(
            'personal-settings:appearance-a11y-sh-select-native-1.9',
            '    <select bind:this={selectEl} bind:value {onchange} class="sr-only" tabindex={-1} aria-hidden="true">',
        ),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-a11y-sh-select-native-1.9:START',
        requires: ['personal-settings:appearance-a11y-sh-select-touch-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-sh-select-combobox-1.9',
        file: 'src/lib/UI/GUI/ShSelect.svelte',
        type: 'replace',
        anchor: `    <div
        bind:this={triggerEl}
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open ? 'true' : 'false'}
        aria-haspopup="listbox"
        aria-activedescendant={activeDescendant}
        class="flex {heightClasses[size]} items-center justify-between gap-2 rounded-md border border-darkborderc
               bg-transparent {sizeClasses[size]} text-textcolor select-none
               transition-colors cursor-pointer
               hover:bg-selected/30
               focus-visible:border-borderc focus-visible:ring-3 focus-visible:ring-borderc/50
               {className}"
        tabindex={0}
        onclick={() => open ? closeDropdown() : openDropdown()}
        onkeydown={handleKeydown}
    >
`,
        managed: svelteBlock('personal-settings:appearance-a11y-sh-select-combobox-1.9', `    <div
        bind:this={triggerEl}
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open ? 'true' : 'false'}
        aria-haspopup="listbox"
        aria-activedescendant={activeDescendant}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        class="flex {heightClasses[size]} items-center justify-between gap-2 rounded-md border border-darkborderc
               bg-transparent {sizeClasses[size]} text-textcolor select-none
               transition-colors cursor-pointer
               hover:bg-selected/30
               focus-visible:border-borderc focus-visible:ring-3 focus-visible:ring-borderc/50
               {className}"
        tabindex={0}
        onclick={() => open ? closeDropdown() : openDropdown()}
        onkeydown={handleKeydown}
    >`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-a11y-sh-select-combobox-1.9:START',
        requires: ['personal-settings:appearance-a11y-sh-select-native-1.9'],
    },
    {
        id: 'personal-settings:appearance-a11y-setting-select-1.9',
        file: 'src/lib/Setting/Wrappers/SettingSelect.svelte',
        type: 'replace',
        anchor: '            <SelectInput className="w-48" size="sm" bind:value={localValue}>\n',
        managed: svelteBlock('personal-settings:appearance-a11y-setting-select-1.9', `            <SelectInput
                className="w-48"
                size="sm"
                ariaLabelledby={\`setting-\${item.id}-label\`}
                ariaDescribedby={item.helpKey ? \`setting-\${item.id}-description\` : undefined}
                bind:value={localValue}
            >`),
        markerNeedle: 'POCKETRISU-PATCH:personal-settings:appearance-a11y-setting-select-1.9:START',
        requires: [
            'personal-settings:appearance-a11y-row-description-1.9',
            'personal-settings:appearance-a11y-select-input-forward-1.9',
            'personal-settings:appearance-a11y-sh-select-combobox-1.9',
        ],
    },
]

module.exports = units.map((unit) => ({
    ...unit,
    targetVersions,
}))
