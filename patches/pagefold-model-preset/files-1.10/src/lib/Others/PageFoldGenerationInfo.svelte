<script lang="ts">
    import type { PageFoldGenerationInfo } from 'src/ts/pagefold/metrics';
    import { language } from 'src/lang';

    interface Props { info: PageFoldGenerationInfo }
    let { info }: Props = $props();

    const wire = $derived(info.actualWireInputTokens ?? info.predictedWireInputTokens);
    const cost = $derived(info.actualInputCostUsd ?? info.predictedInputCostUsd);
    const signed = $derived(info.signedTokenDelta ?? (info.canonicalSourceTokenEstimate - wire));
    const signedTone = $derived(signed >= 0 ? 'text-success' : 'text-amber-400');
</script>

<section class="mt-4 rounded-md border border-darkborderc p-3" aria-labelledby="pagefold-generation-title">
    <h3 id="pagefold-generation-title" class="text-sm font-semibold text-textcolor mb-2">
        {language.pageFoldGenerationTitle}
    </h3>
    <div class="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
        <span class="text-textcolor2">{language.pageFoldGenerationMode}</span>
        <span class="justify-self-end text-textcolor">{info.mode}</span>
        <span class="text-textcolor2">{language.pageFoldGenerationPdf}</span>
        <span class="justify-self-end text-textcolor">{info.pdfPages}p · {info.pdfBytes.toLocaleString()} B</span>
        <span class="text-textcolor2">{language.pageFoldGenerationSource}</span>
        <span class="justify-self-end text-textcolor">{info.canonicalSourceTokenEstimate.toLocaleString()}</span>
        <span class="text-textcolor2">{info.actualWireInputTokens === undefined ? language.pageFoldGenerationWirePredicted : language.pageFoldGenerationWireActual}</span>
        <span class="justify-self-end text-textcolor">{wire.toLocaleString()}</span>
        <span class="text-textcolor2">{language.pageFoldGenerationDelta}</span>
        <span class="justify-self-end {signedTone}">{signed > 0 ? '+' : ''}{signed.toLocaleString()}</span>
        <span class="text-textcolor2">{language.pageFoldGenerationCost}</span>
        <span class="justify-self-end text-textcolor">{cost === undefined ? language.pageFoldPriceUnconfirmed : `$${cost.toFixed(9)}`}</span>
        <span class="text-textcolor2">{language.pageFoldGenerationPricing}</span>
        <span class="justify-self-end text-textcolor max-w-52 truncate">{info.pricingSource ?? language.pageFoldPriceUnconfirmed}</span>
    </div>
</section>
