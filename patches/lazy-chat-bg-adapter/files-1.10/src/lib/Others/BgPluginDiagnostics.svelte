<script lang="ts">
    import ShButton from 'src/lib/UI/GUI/ShButton.svelte'
    import { clientBuildFetch } from 'src/ts/storage/clientBuildHandshake'
    let opened = $state(false)
    let loading = $state(false)
    let failed = $state(false)
    let rows = $state<Record<string, string | number>[]>([])
    let refresh = $state(0)
    $effect(() => {
        if (!opened) return
        void refresh
        const controller = new AbortController()
        loading = true
        failed = false
        void (async () => {
            try {
                const response = await clientBuildFetch('/api/bg-plugin-diagnostics', {
                    credentials: 'same-origin', signal: controller.signal,
                })
                if (!response.ok) throw new Error('Unavailable')
                const data = await response.json()
                if (!Array.isArray(data.summaries) || data.summaries.length > 50) throw new Error('Invalid')
                const fields = ['createdAt', 'calls', 'nativeFetch', 'risuFetch', 'modelCalls', 'http1xx', 'http2xx', 'http3xx',
                    'http4xx', 'http5xx', 'resolvedWithoutStatus', 'rejected', 'scopeClosed', 'operationCancelled',
                    'entryClosed', 'requestAborted', 'pending', 'durationMs', 'maxDurationMs']
                if (data.summaries.some((row: any) => !row || row.version !== 1
                    || typeof row.id !== 'string' || !/^[a-f0-9-]{36}$/.test(row.id)
                    || typeof row.pluginName !== 'string' || row.pluginName.length > 120
                    || typeof row.pluginVersion !== 'string' || row.pluginVersion.length > 80
                    || fields.some(field => !Number.isSafeInteger(row[field]) || row[field] < 0))) throw new Error('Invalid')
                if (!controller.signal.aborted) rows = data.summaries
            } catch {
                if (!controller.signal.aborted) { failed = true; rows = [] }
            } finally { if (!controller.signal.aborted) loading = false }
        })()
        return () => controller.abort()
    })
</script>

<section class="border border-darkborderc rounded-md p-3 mb-4">
    <div class="flex items-center justify-between gap-2">
        <span class="font-medium">서버 플러그인 진단</span>
        <ShButton variant="outline" onclick={() => { opened = !opened }}> {opened ? '접기' : '보기'} </ShButton>
    </div>
    {#if opened}
        <p class="text-textcolor2 text-xs mt-2">최근 48시간의 작업 종료 요약을 최대 50건 표시합니다. URL·본문·분석 내용은 저장하지 않습니다. HTTP 상태는 응답 헤더 관찰값이며 분석 성공을 뜻하지 않습니다. 재시작 전에 종료되지 않은 작업과 저장 실패의 요약은 없을 수 있습니다.</p>
        <ShButton variant="outline" disabled={loading} onclick={() => { refresh++ }}>새로고침</ShButton>
        {#if loading}<p role="status">불러오는 중</p>
        {:else if failed}<p role="alert">진단 요약을 불러오지 못했습니다. 새로고침으로 다시 확인할 수 있습니다.</p>
        {:else if !rows.length}<p class="text-textcolor2 text-sm">보관된 서버 플러그인 호출 요약이 없습니다.</p>
        {:else}
            <div class="flex flex-col gap-3 mt-3">
                {#each rows as row (row.id)}
                    <article class="border-t border-darkborderc pt-2 text-sm break-words">
                        <p>{row.pluginName} ({row.pluginVersion}) · {new Date(Number(row.createdAt)).toLocaleString()}</p>
                        <p>외부/모델 API 호출 {row.calls}회 · nativeFetch {row.nativeFetch} / risuFetch {row.risuFetch} / 모델 API {row.modelCalls}</p>
                        <p>HTTP 1xx {row.http1xx} · 2xx {row.http2xx} · 3xx {row.http3xx} · 4xx {row.http4xx} · 5xx {row.http5xx}</p>
                        <p>HTTP 상태 없는 반환 {row.resolvedWithoutStatus} · 거절·중단 합계 {row.rejected} · 응답 헤더/API 반환 대기 {row.pending}</p>
                        <p>거절·중단 중 콜백 signal {row.scopeClosed} · 작업 signal {row.operationCancelled} · 플러그인 signal {row.entryClosed} · 요청 signal {row.requestAborted}</p>
                        <p>기타 거절 {Number(row.rejected) - Number(row.scopeClosed) - Number(row.operationCancelled) - Number(row.entryClosed) - Number(row.requestAborted)} · 네트워크 실패 여부가 확인되지 않은 오류도 포함합니다.</p>
                        <p class="text-textcolor2 text-xs">응답 헤더/API 반환·거절까지 누적 {row.durationMs}ms · 최대 {row.maxDurationMs}ms. 먼저 중단된 signal의 소유자를 셉니다. HTTP 상태 없는 반환에는 모델 API의 실패 반환도 포함합니다. 본문 수신·분석 성공과 timeout 원인은 판정하지 않습니다. 내부 proxy 재시도 수는 API 호출 수와 다를 수 있습니다.</p>
                    </article>
                {/each}
            </div>
        {/if}
    {/if}
</section>
