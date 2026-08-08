<script lang="ts">
    import { DBState, SafeModeStore } from 'src/ts/stores.svelte'
    import { syncPersonalAppearance } from 'src/ts/personalSettings/appearance'

    $effect(() => {
        syncPersonalAppearance(DBState.db, $SafeModeStore)
    })
</script>
