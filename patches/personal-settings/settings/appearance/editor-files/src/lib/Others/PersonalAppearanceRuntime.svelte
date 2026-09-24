<script lang="ts">
    import { onDestroy } from 'svelte'
    import { DBState, SafeModeStore } from 'src/ts/stores.svelte'
    import { syncPersonalAppearance } from 'src/ts/personalSettings/appearance'
    import { disposePersonalAppearance, syncCustomFont } from 'src/ts/personalSettings/appearanceEditor'
    import { personalCssStatus } from 'src/ts/personalSettings/cssToggleRuntime'
    $effect(() => {
        $personalCssStatus.recovery
        $personalCssStatus.validation
        syncPersonalAppearance(DBState.db, $SafeModeStore)
        syncCustomFont()
    })
    onDestroy(disposePersonalAppearance)
</script>
