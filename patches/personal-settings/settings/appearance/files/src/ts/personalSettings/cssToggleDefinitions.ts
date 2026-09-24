import type { PersonalAppearanceFeature } from "./appearanceValues"

export interface CssToggleDefinition {
    id: Exclude<PersonalAppearanceFeature, "chat.font">
    token: string
    settingId: string
    revision: number
    name: string
    description: string
    css: string
}

export const cssToggleDefinitions: readonly CssToggleDefinition[] = [
    {
        "id": "chat.alignment",
        "token": "chat-align-center",
        "settingId": "personal.appearance.chatAlignment",
        "revision": 1,
        "name": "메시지 가운데 정렬",
        "description": "목록·인용·코드·표는 왼쪽 정렬을 유지합니다.",
        "css": "html[data-pocketrisu-css~=\"chat-align-center\"]\n  .default-chat-screen.nodeonly-standard .risu-chat[data-chat-index] .chattext {\n  text-align: center;\n}\n\nhtml[data-pocketrisu-css~=\"chat-align-center\"]\n  .default-chat-screen.nodeonly-standard .risu-chat[data-chat-index] .chattext\n  :is(ul, ol, blockquote, pre, table) {\n  text-align: left;\n}\n"
    },
    {
        "id": "chat.keepKoreanWords",
        "token": "chat-keep-korean-words",
        "settingId": "personal.appearance.keepKoreanWords",
        "revision": 1,
        "name": "한글 단어 끊김 방지",
        "description": "긴 URL은 줄바꿈하고 코드는 제외합니다.",
        "css": "html[data-pocketrisu-css~=\"chat-keep-korean-words\"]\n  .default-chat-screen.nodeonly-standard .risu-chat[data-chat-index] .chattext\n  :where(p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption) {\n  word-break: keep-all;\n  overflow-wrap: anywhere;\n}\n"
    },
    {
        "id": "chat.wrapCodeBlocks",
        "token": "chat-wrap-code-blocks",
        "settingId": "personal.appearance.wrapCodeBlocks",
        "revision": 1,
        "name": "블록 코드 줄바꿈",
        "description": "블록 코드의 긴 줄을 화면에 맞춥니다.",
        "css": "html[data-pocketrisu-css~=\"chat-wrap-code-blocks\"]\n  .default-chat-screen.nodeonly-standard .risu-chat[data-chat-index] .chattext pre > code {\n  white-space: pre-wrap;\n  word-break: normal;\n  overflow-wrap: anywhere;\n}\n\nhtml[data-pocketrisu-css~=\"chat-wrap-code-blocks\"]\n  .default-chat-screen.nodeonly-standard .risu-chat[data-chat-index] .chattext pre {\n  overflow-x: auto;\n}\n"
    },
    {
        "id": "composer.minimal",
        "token": "composer-minimal",
        "settingId": "personal.appearance.minimalComposer",
        "revision": 1,
        "name": "심플 입력창",
        "description": "입력창의 여백과 버튼 강조를 줄입니다.",
        "css": "html[data-pocketrisu-css~=\"composer-minimal\"]\n  .default-chat-screen.nodeonly-standard [data-risu-composer] {\n  gap: 0.125rem;\n  border-radius: 0.5rem;\n  background: transparent;\n  padding: 0.25rem;\n}\n\nhtml[data-pocketrisu-css~=\"composer-minimal\"]\n  .default-chat-screen.nodeonly-standard [data-risu-composer] > button {\n  width: 2rem;\n  height: 2rem;\n  background: transparent;\n  opacity: 0.55;\n}\n\nhtml[data-pocketrisu-css~=\"composer-minimal\"]\n  .default-chat-screen.nodeonly-standard [data-risu-composer] > button:hover,\nhtml[data-pocketrisu-css~=\"composer-minimal\"]\n  .default-chat-screen.nodeonly-standard [data-risu-composer] > button:focus-visible {\n  opacity: 1;\n}\n"
    },
    {
        "id": "composer.textSendIcon",
        "token": "composer-text-send-icon",
        "settingId": "personal.appearance.textSendIcon",
        "revision": 1,
        "name": "문자형 전송 아이콘",
        "description": "일반 전송 아이콘만 변경합니다.",
        "css": "html[data-pocketrisu-css~=\"composer-text-send-icon\"] [data-personal-send-default] { display: none; }\nhtml[data-pocketrisu-css~=\"composer-text-send-icon\"] [data-personal-send-text] { display: inline; }\nhtml[data-pocketrisu-css~=\"composer-text-send-icon\"] [data-personal-send-text]::before { content: \"▶\"; }\n"
    },
    {
        "id": "sidebar.compact",
        "token": "sidebar-compact",
        "settingId": "personal.appearance.compactSidebar",
        "revision": 1,
        "name": "컴팩트 사이드바 간격",
        "description": "드래그 판정 영역은 보존합니다.",
        "css": "html[data-pocketrisu-css~=\"sidebar-compact\"] .rs-sidebar .character-list [data-spacer-index] {\n  position: relative;\n  height: 0.625rem;\n  min-height: 0.625rem;\n}\n\nhtml[data-pocketrisu-css~=\"sidebar-compact\"] .rs-sidebar .character-list [data-spacer-index]::before {\n  content: \"\";\n  position: absolute;\n  inset: -0.1875rem 0;\n}\n"
    },
    {
        "id": "sidebar.avatarBorder",
        "token": "sidebar-avatar-border",
        "settingId": "personal.appearance.avatarBorder",
        "revision": 1,
        "name": "아바타 테두리",
        "description": "현재 테마 색상의 테두리를 표시합니다.",
        "css": "html[data-pocketrisu-css~=\"sidebar-avatar-border\"] .rs-sidebar .avatar {\n  border: 1px solid var(--risu-theme-borderc);\n  border-radius: 0.375rem;\n  box-sizing: border-box;\n}\n"
    },
    {
        "id": "sidebar.panelDividers",
        "token": "sidebar-panel-dividers",
        "settingId": "personal.appearance.panelDividers",
        "revision": 1,
        "name": "패널 구분선",
        "description": "패널 사이에 세로 구분선을 표시합니다.",
        "css": "html[data-pocketrisu-css~=\"sidebar-panel-dividers\"] :is(.rs-sidebar, .setting-area.risu-sidebar, .rs-setting-cont-3) {\n  border-right: 1px solid var(--risu-theme-borderc);\n}\n"
    },
    {
        "id": "settings.compactControls",
        "token": "settings-compact-controls",
        "settingId": "personal.appearance.compactSettings",
        "revision": 1,
        "name": "설정 행 간격 압축",
        "description": "일반 설정 행의 세로 여백을 줄입니다.",
        "css": "html[data-pocketrisu-css~=\"settings-compact-controls\"] .rs-setting-cont-4 [data-setting-id] {\n  padding-block: 0.5rem;\n}\n"
    },
    {
        "id": "visibility.hideJailbreakToggle",
        "token": "visibility-hide-jailbreak-toggle",
        "settingId": "personal.appearance.hideJailbreakToggle",
        "revision": 1,
        "name": "탈옥 토글 숨기기",
        "description": "컨트롤만 숨기며 현재 값은 보존합니다.",
        "css": "html[data-pocketrisu-css~=\"visibility-hide-jailbreak-toggle\"] [data-personal-jailbreak] { display: none; }\n"
    }
]
