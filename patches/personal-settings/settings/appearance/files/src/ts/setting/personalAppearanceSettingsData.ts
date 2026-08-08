import { get } from 'svelte/store'
import type { SettingItem } from './types'
import { SafeModeStore } from '../stores.svelte'
import {
    canWritePersonalAppearance,
    getPersonalAppearanceValue,
    setPersonalAppearanceValue,
    syncPersonalAppearance,
    type PersonalAppearanceLeafPath,
} from '../personalSettings/appearance'

function common(
    path: PersonalAppearanceLeafPath,
): Pick<SettingItem, 'condition' | 'getValue' | 'setValue' | 'onChange'> {
    return {
        condition: (ctx) => canWritePersonalAppearance(ctx.db),
        getValue: (db) => getPersonalAppearanceValue(db, path),
        setValue: (db, value) => {
            setPersonalAppearanceValue(db, path, value)
        },
        onChange: (_value, ctx) => {
            syncPersonalAppearance(ctx.db, get(SafeModeStore))
        },
    }
}

export const personalAppearanceSettingsItems: SettingItem[] = [
    {
        id: 'personal.appearance.enabled',
        type: 'check',
        labelKey: 'personalAppearanceEnabled',
        helpKey: 'personalAppearanceEnabled',
        keywords: ['appearance', 'css', 'master', '꾸미기', '전체'],
        ...common('enabled'),
    },
    {
        id: 'personal.appearance.chatFont',
        type: 'select',
        labelKey: 'personalAppearanceChatFont',
        helpKey: 'personalAppearanceChatFont',
        keywords: ['font', 'paperlogy', '페이퍼로지', '채팅 폰트'],
        options: {
            selectOptions: [
                { value: 'app', labelKey: 'personalAppearanceOptionAppFont' },
                { value: 'paperlogy', label: 'Paperlogy' },
            ],
        },
        ...common('chat.font'),
    },
    {
        id: 'personal.appearance.chatAlignment',
        type: 'select',
        labelKey: 'personalAppearanceChatAlignment',
        helpKey: 'personalAppearanceChatAlignment',
        keywords: ['alignment', 'center', '정렬', '가운데'],
        options: {
            selectOptions: [
                { value: 'left', labelKey: 'personalAppearanceOptionLeft' },
                { value: 'center', labelKey: 'personalAppearanceOptionCenter' },
            ],
        },
        ...common('chat.alignment'),
    },
    {
        id: 'personal.appearance.keepKoreanWords',
        type: 'check',
        labelKey: 'personalAppearanceKeepKoreanWords',
        helpKey: 'personalAppearanceKeepKoreanWords',
        keywords: ['Korean', 'word break', '한글', '단어', '줄바꿈'],
        ...common('chat.keepKoreanWords'),
    },
    {
        id: 'personal.appearance.wrapCodeBlocks',
        type: 'check',
        labelKey: 'personalAppearanceWrapCodeBlocks',
        helpKey: 'personalAppearanceWrapCodeBlocks',
        keywords: ['code', 'pre', 'wrap', '코드', '줄바꿈'],
        ...common('chat.wrapCodeBlocks'),
    },
    {
        id: 'personal.appearance.minimalComposer',
        type: 'check',
        labelKey: 'personalAppearanceMinimalComposer',
        helpKey: 'personalAppearanceMinimalComposer',
        keywords: ['composer', 'input', 'minimal', '입력창', '심플'],
        ...common('composer.minimal'),
    },
    {
        id: 'personal.appearance.textSendIcon',
        type: 'check',
        labelKey: 'personalAppearanceTextSendIcon',
        helpKey: 'personalAppearanceTextSendIcon',
        keywords: ['send', 'icon', 'text', '전송', '문자', '아이콘'],
        ...common('composer.textSendIcon'),
    },
    {
        id: 'personal.appearance.compactSidebar',
        type: 'check',
        labelKey: 'personalAppearanceCompactSidebar',
        helpKey: 'personalAppearanceCompactSidebar',
        keywords: ['sidebar', 'compact', '사이드바', '간격'],
        ...common('sidebar.compact'),
    },
    {
        id: 'personal.appearance.avatarBorder',
        type: 'check',
        labelKey: 'personalAppearanceAvatarBorder',
        helpKey: 'personalAppearanceAvatarBorder',
        keywords: ['avatar', 'border', '아바타', '테두리'],
        ...common('sidebar.avatarBorder'),
    },
    {
        id: 'personal.appearance.panelDividers',
        type: 'check',
        labelKey: 'personalAppearancePanelDividers',
        helpKey: 'personalAppearancePanelDividers',
        keywords: ['panel', 'divider', 'sidebar', '구분선', '패널'],
        ...common('sidebar.panelDividers'),
    },
    {
        id: 'personal.appearance.compactSettings',
        type: 'check',
        labelKey: 'personalAppearanceCompactSettings',
        helpKey: 'personalAppearanceCompactSettings',
        keywords: ['settings', 'compact', '설정', '간격', '압축'],
        ...common('settings.compactControls'),
    },
    {
        id: 'personal.appearance.hideJailbreakToggle',
        type: 'check',
        labelKey: 'personalAppearanceHideJailbreakToggle',
        helpKey: 'personalAppearanceHideJailbreakToggle',
        helpUnrecommended: true,
        keywords: ['jailbreak', 'toggle', 'hide', '탈옥', '숨기기'],
        ...common('visibility.hideJailbreakToggle'),
    },
]
