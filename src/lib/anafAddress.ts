import type {Locality, State} from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("ro-RO")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueContainedMatch<T>(raw: string, values: T[], label: (value: T) => string): T | undefined {
  const haystack = ` ${normalize(raw)} `;
  const matches = values.filter((value) => {
    const needle = normalize(label(value));
    return needle.length >= 2 && haystack.includes(` ${needle} `);
  });

  return matches.length === 1 ? matches[0] : undefined;
}

export type AnafAddressSuggestions = {
  state?: State;
  locality?: Locality;
  postalCode?: string;
};

/**
 * ANAF currently returns one unstructured address string. These helpers only
 * propose nomenclature matches; callers must require an explicit user action
 * before assigning or saving any suggestion.
 */
export function suggestAnafAddress(
  raw: string | null,
  states: State[],
  localities: Locality[] = [],
): AnafAddressSuggestions {
  if (!raw?.trim()) return {};

  return {
    state: uniqueContainedMatch(raw, states, (state) => state.name),
    locality: uniqueContainedMatch(raw, localities, (locality) => locality.name),
    postalCode: raw.match(/\b\d{6}\b/)?.[0],
  };
}
