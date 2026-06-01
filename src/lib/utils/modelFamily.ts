/**
 * Shared helpers for model-family detection and related metadata signals.
 */

export const MODEL_FAMILIES = [
  "anima",
  "sdxl",
  "illustrious",
  "pony",
  "sd15",
  "sd3",
  "flux",
  "flux1d",
  "flux1s",
  "flux1krea",
  "flux2d",
  "flux2klein9b",
  "flux2klein9bbase",
  "flux2klein4b",
  "flux2klein4bbase",
  "chroma",
  "zib",
  "zit",
  "wan",
  "qwen",
  "auraflow",
  "pixart",
  "hunyuandit",
  "cascade",
  "kolors",
  "mugen",
  "nanosaur",
  "unknown",
] as const;

export type ModelFamily = typeof MODEL_FAMILIES[number];

export interface ModelFamilySignals {
  /** Checkpoint filename or diffusion UNET filename */
  filename?: string | null;
  modelspecArchitecture?: string | null;
  modelspecTags?: string | null;
  civitaiBaseModel?: string | null;
  modelspecPredictionType?: string | null;
  modelspecPredictKey?: string | null;
  headerVPred?: boolean | null;
  /** Backend-resolved model family bucket. */
  modelFamily?: ModelFamily | null;
}

/** True when CivitAI lists the version under an Anima / Wan video base. */
export function civitaiBaseModelIndicatesAnima(baseModel: string | null | undefined): boolean {
  if (!baseModel) return false;
  const bm = baseModel.toLowerCase();
  return (
    bm.includes("anima") ||
    bm.includes("wan video") ||
    bm.includes("wan 2") ||
    bm.includes("wan2") ||
    bm.includes("wan 2.1") ||
    bm === "wan"
  );
}

/** True when modelspec architecture / tags describe Anima or Wan2.1. */
export function modelspecIndicatesAnima(
  architecture: string | null | undefined,
  tags?: string | null,
): boolean {
  const arch = (architecture ?? "").toLowerCase();
  if (arch.includes("anima") || arch.includes("wan")) return true;
  const tagStr = (tags ?? "").toLowerCase();
  if (tagStr.includes("anima")) return true;
  return false;
}

/** Filename / label heuristics for local Anima-family checkpoints and UNET files. */
export function filenameIndicatesAnima(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  if (n.includes("nanosaur") || n.includes("mugen")) return false;
  if (n.includes("anima")) return true;
  if (n.includes("yume")) return true;
  return false;
}

/** Filename heuristic for v-pred SDXL variants. */
export function filenameIndicatesVPred(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  if (n.includes("vpred") || n.includes("v-pred") || n.includes("v_pred")) return true;
  if (n.includes("juice")) return true;
  if (n.includes("2048") && (n.includes("noob") || n.includes("seele"))) return true;
  if (n.includes("seele") && n.includes("pop")) return true;
  return false;
}

function normalizedPredictionToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** True when metadata explicitly marks the model as v-pred. */
export function metadataIndicatesVPred(
  predictionType: string | null | undefined,
  predictKey: string | null | undefined,
  headerVPred?: boolean | null,
): boolean {
  for (const token of [predictionType, predictKey]) {
    const normalized = normalizedPredictionToken(token);
    if (!normalized) continue;
    if (normalized === "v" || normalized.includes("vpred") || normalized === "vprediction") {
      return true;
    }
  }
  return headerVPred === true;
}

/** Combined signal — metadata first, then filename fallback. */
export function signalsIndicateVPred(signals: ModelFamilySignals): boolean {
  if (
    metadataIndicatesVPred(
      signals.modelspecPredictionType,
      signals.modelspecPredictKey,
      signals.headerVPred,
    )
  ) return true;
  return filenameIndicatesVPred(signals.filename);
}

/** Combined signal — backend family first, then filename/CivitAI fallbacks while unknown. */
export function signalsIndicateAnima(signals: ModelFamilySignals): boolean {
  if (signals.modelFamily === "anima") return true;
  if (signals.modelFamily && signals.modelFamily !== "unknown") return false;
  if (filenameIndicatesAnima(signals.filename)) return true;
  if (modelspecIndicatesAnima(signals.modelspecArchitecture, signals.modelspecTags)) return true;
  return civitaiBaseModelIndicatesAnima(signals.civitaiBaseModel);
}
