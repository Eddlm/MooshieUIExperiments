<script lang="ts">
  import { generation } from "../../stores/generation.svelte.js";
  import InfoTip from "../ui/InfoTip.svelte";
  import EditableValue from "../ui/EditableValue.svelte";
  import { scrollCapture } from "../../utils/scrollCapture.js";
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between gap-3">
    <div>
      <label class="text-xs text-neutral-300">
        Custom sigmas
        <InfoTip text="Override the model's native noise range. Enabling this uses Mooshie's custom sampling workflow for the primary generation pass." />
      </label>
      <p class="mt-0.5 text-[10px] text-neutral-500">Keep off for the model-native sampler schedule.</p>
    </div>
    <button
      class="relative h-5 w-10 shrink-0 rounded-full transition-colors {generation.customSigmasEnabled ? 'bg-indigo-600' : 'bg-neutral-700'}"
      onclick={() => (generation.customSigmasEnabled = !generation.customSigmasEnabled)}
      role="switch"
      aria-checked={generation.customSigmasEnabled}
      aria-label="Enable custom sigmas"
    >
      <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform {generation.customSigmasEnabled ? 'translate-x-5' : ''}"></span>
    </button>
  </div>

  {#if generation.customSigmasEnabled}
    <div use:scrollCapture>
      <label class="flex items-center justify-between text-xs text-neutral-400 mb-1">
        <span>Noise Start <InfoTip text="Sigma max: the noise level at the first sampling step." /></span>
        <EditableValue value={generation.customSigmaMax} min={5} max={15} step={0.01} decimals={2} onchange={(v) => generation.customSigmaMax = v} />
      </label>
      <input
        type="range"
        bind:value={generation.customSigmaMax}
        min="5"
        max="15"
        step="0.01"
        style="direction: rtl"
        class="w-full accent-indigo-500"
      />
      <p class="mt-0.5 text-[10px] text-neutral-500">15.00 — 5.00</p>
    </div>

    <div use:scrollCapture>
      <label class="flex items-center justify-between text-xs text-neutral-400 mb-1">
        <span>Noise End <InfoTip text="Sigma min: the lowest non-zero noise level before final denoising." /></span>
        <EditableValue value={generation.customSigmaMin} min={0.01} max={0.99} step={0.01} decimals={2} onchange={(v) => generation.customSigmaMin = v} />
      </label>
      <input
        type="range"
        bind:value={generation.customSigmaMin}
        min="0.01"
        max="0.99"
        step="0.01"
        class="w-full accent-indigo-500"
      />
      <p class="mt-0.5 text-[10px] text-neutral-500">0.01 — 0.99</p>
    </div>

    <div use:scrollCapture>
      <label class="flex items-center justify-between text-xs text-neutral-400 mb-1">
        <span>Eta <InfoTip text="Controls stochasticity for compatible ancestral and SDE samplers. Zero makes them deterministic." /></span>
        <EditableValue value={generation.customEta} min={0} max={1} step={0.01} decimals={2} onchange={(v) => generation.customEta = v} />
      </label>
      <input
        type="range"
        bind:value={generation.customEta}
        min="0"
        max="1"
        step="0.01"
        class="w-full accent-indigo-500"
      />
      <p class="mt-0.5 text-[10px] text-neutral-500">0.00 — 1.00</p>
    </div>

    <div use:scrollCapture>
      <label class="flex items-center justify-between text-xs text-neutral-400 mb-1">
        <span>Noise Scale <InfoTip text="Scales the amplitude of noise injected by compatible ancestral and SDE samplers. One is the normal amount." /></span>
        <EditableValue value={generation.customSNoise} min={0} max={2} step={0.01} decimals={2} onchange={(v) => generation.customSNoise = v} />
      </label>
      <input
        type="range"
        bind:value={generation.customSNoise}
        min="0"
        max="2"
        step="0.01"
        class="w-full accent-indigo-500"
      />
      <p class="mt-0.5 text-[10px] text-neutral-500">0.00 — 2.00</p>
    </div>

    <p class="text-[10px] text-neutral-500">Eta and Noise Scale apply to compatible ancestral and DPM++ SDE samplers; other samplers ignore them.</p>
  {/if}
</div>
