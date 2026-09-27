<script lang="ts">
    import { onMount } from 'svelte'
    import { v4 } from 'uuid'
    import { forageStorage } from 'src/ts/globalApi.svelte'
    import { clientBuildFetch } from 'src/ts/storage/clientBuildHandshake'

    type Rule = { id: string, name: string, enabled: boolean, destination: string, header: string, valueKind: 'conversation-session' }
    let rules: Rule[] = $state([])
    let revision = $state(0)
    let loaded = $state(false)
    let busy = $state(false)
    let status = $state('')
    let mounted = false
    const controller = new AbortController()

    async function request(save: boolean) {
        if (busy) return
        busy = true
        status = save ? '저장 중…' : '불러오는 중…'
        try {
            const auth = await forageStorage.createAuth()
            const response = await clientBuildFetch('/api/external-request-headers', {
                method: save ? 'PUT' : 'GET',
                headers: { 'Content-Type': 'application/json', 'risu-auth': auth },
                ...(save ? { body: JSON.stringify({ revision, rules }) } : {}),
                signal: controller.signal,
            })
            if (!response.ok) {
                if (response.status === 409) throw new Error('다른 기기에서 설정이 변경됐습니다. 다시 불러온 뒤 편집하세요.')
                if (response.status === 400) throw new Error('규칙의 이름, HTTPS 목적지, 헤더 이름을 확인하세요. 인증·쿠키·내부 헤더는 사용할 수 없습니다.')
                throw new Error(`설정을 처리하지 못했습니다 (HTTP ${response.status}).`)
            }
            const data = await response.json()
            if (!mounted) return
            rules = data.rules
            revision = data.revision
            loaded = true
            status = save ? '서버에 저장했습니다.' : ''
        } catch (error) {
            if (mounted) status = error instanceof Error ? error.message : '설정을 처리하지 못했습니다.'
        } finally { if (mounted) busy = false }
    }

    onMount(() => {
        mounted = true
        void request(false)
        return () => { mounted = false; controller.abort() }
    })
</script>

<section class="flex flex-col gap-4">
    <h2 class="text-lg font-bold">외부 요청 헤더 규칙</h2>
    <p>서버를 거치는 요청에만 적용됩니다. 브라우저가 목적지에 직접 보내는 요청에는 적용되지 않습니다.</p>
    <p>같은 대화에는 같은 세션 ID를 사용합니다. 대화 정보가 없는 요청과 연결 검사는 규칙별 공통 ID를 사용합니다. 기존 헤더는 덮어쓰지 않습니다.</p>
    <fieldset disabled={busy || !loaded} class="flex flex-col gap-4">
        {#each rules as rule (rule.id)}
            <div class="border border-bordercolor rounded p-3 flex flex-col gap-2">
                <label><input type="checkbox" bind:checked={rule.enabled} /> 활성</label>
                <label>규칙 이름<input class="w-full bg-bgcolor border rounded p-2" bind:value={rule.name} maxlength="120" /></label>
                <label>HTTPS 목적지와 경로<input class="w-full bg-bgcolor border rounded p-2" bind:value={rule.destination} placeholder="https://api.example.com/v1" /></label>
                <p class="text-sm">호스트와 포트는 정확히 일치해야 하며, 경로는 지정한 경로 또는 그 하위 경로에 적용됩니다. 쿼리·와일드카드는 사용할 수 없습니다.</p>
                <label>헤더 이름<input class="w-full bg-bgcolor border rounded p-2" bind:value={rule.header} placeholder="x-session-id" /></label>
                <p>값: 대화별 세션 ID</p>
                <button type="button" class="border rounded p-2" onclick={() => { rules = rules.filter(item => item.id !== rule.id) }}>규칙 삭제</button>
            </div>
        {/each}
        <button type="button" class="border rounded p-2" disabled={rules.length >= 32} onclick={() => {
            rules = [...rules, { id: v4(), name: '', enabled: false, destination: '', header: '', valueKind: 'conversation-session' }]
        }}>규칙 추가</button>
        <button type="button" class="border rounded p-2" onclick={() => request(true)}>서버에 저장</button>
    </fieldset>
    <button type="button" class="border rounded p-2" disabled={busy} onclick={() => request(false)}>다시 불러오기 (미저장 편집 취소)</button>
    <p role="status" aria-live="polite">{status}</p>
</section>
