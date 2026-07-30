<script lang="ts">
    import CheckInput from 'src/lib/UI/GUI/CheckInput.svelte'
    import { DBState } from 'src/ts/stores.svelte'
    import {
        setStayOnCurrentCharacterAfterImport,
        shouldStayOnCurrentCharacterAfterImport,
    } from 'src/ts/personalSettings/importNavigation'

    const stayOnCurrentCharacterAfterImport = $derived(
        shouldStayOnCurrentCharacterAfterImport(DBState.db),
    )
</script>

<div class="flex items-start justify-between gap-4 border-b border-darkborderc py-3">
    <div class="flex min-w-0 flex-col gap-1">
        <span class="font-semibold">캐릭터 임포트 후 현재 화면 유지</span>
        <span class="text-sm text-textcolor2">
            켜면 로컬 카드, 캐릭터 패키지, Realm에서 캐릭터를 임포트해도
            새 캐릭터로 자동 이동하지 않고 임포트를 시작한 화면에 머뭅니다.
            임포트된 캐릭터는 목록에 정상적으로 저장됩니다.
        </span>
        <span class="text-xs text-textcolor2">
            이 설정은 기존 ‘임포트 시 캐릭터로 이동’ 설정보다 우선합니다.
        </span>
    </div>
    <CheckInput
        check={stayOnCurrentCharacterAfterImport}
        onChange={(enabled) => {
            setStayOnCurrentCharacterAfterImport(DBState.db, enabled)
        }}
        name="캐릭터 임포트 후 현재 화면 유지"
        hiddenName
        margin={false}
        className="shrink-0"
    />
</div>
