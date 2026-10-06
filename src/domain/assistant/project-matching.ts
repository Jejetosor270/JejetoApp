export interface ProjectNameCandidate {
  id: string;
  name: string;
  code: string;
}

export interface ProjectNameMatch<T extends ProjectNameCandidate> {
  project: T;
  requiresConfirmation: boolean;
}

const genericTokens = new Set([
  "villa",
  "project",
  "projet",
  "house",
  "building",
]);

/** Normalize spelling presentation, never remove or rewrite numeric identifiers. */
function tokens(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token === "villas" ? "villa" : token));
}

function sameNumbers(query: string[], candidate: string[]) {
  const numbers = (values: string[]) =>
    values.filter((value) => /^\d+$/.test(value)).join(" ");
  return !numbers(query) || numbers(query) === numbers(candidate);
}

/** Substring search must not confuse Villa 1 with Villa 10 or P-1 with P-10. */
export function isProjectPartialMatch(
  query: string,
  project: ProjectNameCandidate,
): boolean {
  const text = query.trim().toLowerCase();
  return [project.name, project.code].some(
    (field) =>
      field.toLowerCase().includes(text) &&
      sameNumbers(tokens(text), tokens(field)),
  );
}

/** One substitution, insertion/deletion or adjacent transposition; no short-token guesses. */
function oneEditApart(left: string, right: string): boolean {
  if (!/^[a-z]{4,}$/.test(left) || !/^[a-z]{4,}$/.test(right)) return false;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const differences: number[] = [];
    for (let index = 0; index < left.length; index++) {
      if (left[index] !== right[index]) differences.push(index);
      if (differences.length > 2) return false;
    }
    if (differences.length === 1) return true;
    const [first, second] = differences;
    return (
      first !== undefined &&
      second === first + 1 &&
      left[first] === right[second] &&
      left[second] === right[first]
    );
  }
  const [shorter, longer] =
    left.length < right.length ? [left, right] : [right, left];
  let shortIndex = 0;
  let skipped = false;
  for (let longIndex = 0; longIndex < longer.length; longIndex++) {
    if (shorter[shortIndex] === longer[longIndex]) shortIndex++;
    else if (skipped) return false;
    else skipped = true;
  }
  return true;
}

type Score = { rank: number; requiresConfirmation: boolean };

function fieldMatch(
  query: string[],
  candidate: string[],
  allowTypos: boolean,
): Score | null {
  if (!candidate.length || !sameNumbers(query, candidate)) return null;
  const numeric = [...query, ...candidate].some((token) => /^\d+$/.test(token));
  const identity = (values: string[]) =>
    (numeric || !allowTypos ? values : [...values].sort()).join(" ");
  if (identity(query) === identity(candidate))
    return { rank: 0, requiresConfirmation: false };
  if (query.length > candidate.length) return null;
  // Numbers bind to their neighboring words: never reorder or typo-correct numeric identities.
  if (numeric && query.some((token) => /^\d+$/.test(token)))
    return ` ${candidate.join(" ")} `.includes(` ${query.join(" ")} `)
      ? {
          rank: 1 + candidate.length - query.length,
          requiresConfirmation: true,
        }
      : null;
  // A common descriptor alone must not create fuzzy/normalized suggestions for every villa.
  if (
    !query.some(
      (token) =>
        !genericTokens.has(token) && token.length >= 3 && /\p{L}/u.test(token),
    )
  )
    return null;
  const remaining = [...candidate];
  const unmatched = query.filter((token) => {
    const index = remaining.indexOf(token);
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
  if (!unmatched.length)
    return {
      rank: 1 + candidate.length - query.length,
      requiresConfirmation: true,
    };
  // Only one token may contain a typo, and codes never receive typo correction.
  if (!allowTypos || unmatched.length !== 1) return null;
  const token = unmatched[0];
  const candidates = token
    ? remaining.filter((value) => oneEditApart(token, value))
    : [];
  if (!candidates.length) return null;
  const distinctiveExact = query.some(
    (value) =>
      !genericTokens.has(value) &&
      value.length >= 3 &&
      candidate.includes(value),
  );
  if (
    !distinctiveExact &&
    candidates.every((value) => genericTokens.has(value))
  )
    return null;
  return {
    rank: 100 + candidate.length - query.length,
    requiresConfirmation: true,
  };
}

/** Bounded callers supply only visible names/codes. No data is sent to a language model. */
export function matchProjectNames<T extends ProjectNameCandidate>(
  query: string,
  projects: readonly T[],
): ProjectNameMatch<T>[] {
  const text = query.trim();
  if (text.length < 2 || text.length > 100) return [];
  const queryTokens = tokens(text);
  if (!queryTokens.length) return [];
  const ranked = projects.flatMap((project) => {
    const scores = [
      fieldMatch(queryTokens, tokens(project.name), true),
      fieldMatch(queryTokens, tokens(project.code), false),
    ].filter((score): score is Score => score !== null);
    const score = scores.sort((left, right) => left.rank - right.rank)[0];
    return score ? [{ project, ...score }] : [];
  });
  // Do not add speculative neighboring spellings when normalized matches exist.
  const hasNormalized = ranked.some((match) => match.rank < 100);
  return ranked
    .filter((match) => !hasNormalized || match.rank < 100)
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.project.name.localeCompare(right.project.name, "en") ||
        left.project.id.localeCompare(right.project.id, "en"),
    )
    .map(({ project, requiresConfirmation }) => ({
      project,
      requiresConfirmation,
    }));
}
