import type { AnimadexCharacter } from "./types.js";
import { DEFAULT_ANIMA_POSITIVE_QUALITY } from "../stores/generation.svelte.js";

export type CharacterTagLevel = "name" | "name_copyright" | "all";

export type CharacterInsertMode = "add" | "replace";

const GIRL_COUNT_ORDER = ["1girl", "2girls", "3girls", "4girls", "5girls", "6+girls"] as const;

const GIRL_COUNT_SET = new Set<string>([
  ...GIRL_COUNT_ORDER,
  "6girls",
  "1girls",
  "2girl",
  "3girl",
  "4girl",
  "5girl",
]);

const COMPOSITION_TAGS = new Set(["solo", "multiple girls", "multiple_girls"]);

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, " ");
}

function tagKey(tag: string): string {
  return normalizeTag(tag).replace(/ /g, "_");
}

/** Split positive prompt on commas (same convention as artist insert). */
export function splitPromptParts(prompt: string): string[] {
  return prompt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinPromptParts(parts: string[]): string {
  return parts.filter(Boolean).join(", ");
}

function buildQualityAllowlist(): Set<string> {
  const set = new Set<string>();
  for (const chunk of DEFAULT_ANIMA_POSITIVE_QUALITY.split(",")) {
    const n = normalizeTag(chunk);
    if (n) set.add(n);
  }
  for (const t of [
    "safe",
    "highres",
    "absurdres",
    "newest",
    "oldest",
    "masterpiece",
    "best quality",
    "worst quality",
    "low quality",
    "score_9",
    "score_8",
    "score_7",
    "score_6",
    "score_5",
    "score_4",
    "score_3",
    "score_2",
    "score_1",
  ]) {
    set.add(t);
  }
  return set;
}

const QUALITY_ALLOWLIST = buildQualityAllowlist();

export interface CharacterTriggerParts {
  name: string;
  copyright: string;
  copyrightLabel: string;
}

export function parseCharacterTrigger(character: AnimadexCharacter): CharacterTriggerParts {
  const pieces = character.trigger
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const name = pieces[0] ?? character.name.toLowerCase();
  const copyright = pieces[1] ?? character.copyright.replace(/_/g, " ");
  return {
    name,
    copyright,
    copyrightLabel: character.copyright_name,
  };
}

export function buildCharacterInsertText(
  character: AnimadexCharacter,
  level: CharacterTagLevel,
): string {
  const { name, copyright } = parseCharacterTrigger(character);
  if (level === "name") return name;
  if (level === "name_copyright") {
    return copyright ? `${name}, ${copyright}` : name;
  }

  const triggerPieces = character.trigger
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const all: string[] = [];
  for (const piece of [...triggerPieces, ...character.tags]) {
    const key = normalizeTag(piece);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(piece);
  }
  return all.join(", ");
}

export interface PromptCharacterAnalysis {
  parts: string[];
  girlCountTag: string | null;
  hasSolo: boolean;
  hasMultipleGirls: boolean;
  /** Conservatively detected prompt parts that can safely be treated as an existing character block. */
  characterParts: string[];
  existingCharacterLabel: string;
  detectedCopyrightPart: string | null;
  isDuplicate: boolean;
  /** True when we should offer replace vs add another character. */
  needsActionChoice: boolean;
  isMinimalSolo: boolean;
}

function isGenericPart(part: string): boolean {
  const n = normalizeTag(part);
  if (!n) return true;
  if (n.startsWith("@")) return true;
  if (GIRL_COUNT_SET.has(n)) return true;
  if (COMPOSITION_TAGS.has(n)) return true;
  if (QUALITY_ALLOWLIST.has(n)) return true;
  return false;
}

function findGirlCountTag(parts: string[]): string | null {
  for (const p of parts) {
    const n = normalizeTag(p);
    if (GIRL_COUNT_SET.has(n)) return n;
  }
  return null;
}

function characterNameKeys(character: AnimadexCharacter): Set<string> {
  const { name } = parseCharacterTrigger(character);
  const keys = new Set<string>();
  keys.add(normalizeTag(name));
  keys.add(tagKey(name));
  keys.add(normalizeTag(character.slug.replace(/_/g, " ")));
  keys.add(character.slug.toLowerCase());
  return keys;
}

function appearanceKeys(character: AnimadexCharacter): Set<string> {
  const keys = new Set<string>();
  for (const t of character.tags) {
    keys.add(normalizeTag(t));
  }
  return keys;
}

export function analyzePromptForCharacter(
  prompt: string,
  character: AnimadexCharacter,
): PromptCharacterAnalysis {
  const parts = splitPromptParts(prompt);
  const girlCountTag = findGirlCountTag(parts);
  const hasSolo = parts.some((p) => normalizeTag(p) === "solo");
  const hasMultipleGirls = parts.some((p) => normalizeTag(p) === "multiple girls");
  const nameKeys = characterNameKeys(character);

  // Free-form prompts do not preserve which tags came from a previous character
  // insert. Be conservative here: treating every non-generic tag as character
  // identity can delete scene/style tags when the user chooses replace.
  const characterParts: string[] = [];

  const isDuplicate = parts.some((p) => {
    const n = normalizeTag(p);
    return nameKeys.has(n) || nameKeys.has(tagKey(p));
  });

  const detectedCopyrightPart: string | null = null;

  const nonGenericCount = parts.filter((p) => !isGenericPart(p)).length;
  const isMinimalSolo =
    nonGenericCount === 0 &&
    girlCountTag === "1girl" &&
    (!hasSolo || parts.length <= 3);

  const needsActionChoice = !isDuplicate && isMinimalSolo;

  const existingCharacterLabel = girlCountTag === "1girl" ? "1girl" : "";

  return {
    parts,
    girlCountTag,
    hasSolo,
    hasMultipleGirls,
    characterParts,
    existingCharacterLabel,
    detectedCopyrightPart,
    isDuplicate,
    needsActionChoice,
    isMinimalSolo,
  };
}

function bumpGirlCount(parts: string[]): string[] {
  const idx = parts.findIndex((p) => GIRL_COUNT_SET.has(normalizeTag(p)));
  if (idx === -1) {
    return ["2girls", ...parts];
  }
  const current = normalizeTag(parts[idx]);
  const orderIdx = GIRL_COUNT_ORDER.indexOf(current as (typeof GIRL_COUNT_ORDER)[number]);
  const next =
    orderIdx >= 0 && orderIdx < GIRL_COUNT_ORDER.length - 1
      ? GIRL_COUNT_ORDER[orderIdx + 1]
      : "6+girls";
  return parts.map((p, i) => (i === idx ? next : p));
}

function ensureCompositionForAdd(parts: string[]): string[] {
  let next = parts.filter((p) => normalizeTag(p) !== "solo");
  if (!next.some((p) => normalizeTag(p) === "multiple girls")) {
    const girlIdx = next.findIndex((p) => GIRL_COUNT_SET.has(normalizeTag(p)));
    if (girlIdx >= 0) {
      next = [
        ...next.slice(0, girlIdx + 1),
        "multiple girls",
        ...next.slice(girlIdx + 1),
      ];
    } else {
      next = ["multiple girls", ...next];
    }
  }
  return next;
}

function replaceCopyrightPart(
  parts: string[],
  oldCopyright: string | null,
  newCopyright: string,
): string[] {
  if (!oldCopyright) return parts;
  const oldN = normalizeTag(oldCopyright);
  const newSlug = newCopyright.replace(/_/g, " ");
  let replaced = false;
  return parts.map((p) => {
    if (!replaced && normalizeTag(p) === oldN) {
      replaced = true;
      return newSlug;
    }
    return p;
  });
}

function partsToRemoveOnReplace(
  analysis: PromptCharacterAnalysis,
  character: AnimadexCharacter,
): Set<string> {
  const remove = new Set<string>();
  const nameKeys = characterNameKeys(character);
  const appearance = appearanceKeys(character);
  const newCopyrightN = normalizeTag(parseCharacterTrigger(character).copyright);

  for (const p of analysis.parts) {
    const n = normalizeTag(p);
    if (nameKeys.has(n) || nameKeys.has(tagKey(p))) {
      remove.add(p);
      continue;
    }
    if (appearance.has(n)) {
      remove.add(p);
      continue;
    }
    if (analysis.detectedCopyrightPart && p === analysis.detectedCopyrightPart) {
      remove.add(p);
      continue;
    }
    if (n === newCopyrightN) {
      remove.add(p);
    }
  }

  for (const p of analysis.characterParts) {
    remove.add(p);
  }

  return remove;
}

export function applyCharacterInsert(
  prompt: string,
  character: AnimadexCharacter,
  level: CharacterTagLevel,
  mode: CharacterInsertMode,
): string {
  const analysis = analyzePromptForCharacter(prompt, character);
  const insertText = buildCharacterInsertText(character, level);
  const insertParts = splitPromptParts(insertText);
  const { copyright } = parseCharacterTrigger(character);
  const newCopyrightSlug = character.copyright.replace(/_/g, " ");

  let parts = [...analysis.parts];

  if (mode === "replace") {
    const remove = partsToRemoveOnReplace(analysis, character);
    parts = parts.filter((p) => !remove.has(p));
    parts = parts.filter((p) => normalizeTag(p) !== "solo");
    if (level !== "name" && copyright) {
      parts = replaceCopyrightPart(parts, analysis.detectedCopyrightPart, newCopyrightSlug);
    }
  } else {
    parts = bumpGirlCount(parts);
    parts = ensureCompositionForAdd(parts);
    if (level !== "name" && analysis.detectedCopyrightPart) {
      parts = replaceCopyrightPart(parts, analysis.detectedCopyrightPart, newCopyrightSlug);
    }
  }

  if (parts.length === 0 && !analysis.girlCountTag) {
    parts = ["1girl", "solo"];
  }

  return joinPromptParts([...insertParts, ...parts]);
}

export function previewGirlCountAfterAdd(analysis: PromptCharacterAnalysis): string {
  const bumped = bumpGirlCount([...analysis.parts]);
  const tag = findGirlCountTag(bumped);
  return tag ?? "2girls";
}
