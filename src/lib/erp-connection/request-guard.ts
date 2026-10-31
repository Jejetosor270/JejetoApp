import "server-only";

const WINDOW_MS = 60_000;
const MAX_TRACKED_OWNERS = 100;

interface RequestState {
  active: number;
  attempts: number[];
}

export class ErpConnectionLimitError extends Error {
  constructor() {
    super("The ERP connection is busy. Wait a minute and try again.");
    this.name = "ErpConnectionLimitError";
  }
}

/** In-instance burst protection only; this is not a distributed request quota. */
export function createErpConnectionRequestGuard(
  now: () => number = Date.now,
  limits = { requests: 30, concurrent: 2 },
) {
  const owners = new Map<string, RequestState>();
  return async function withRequest<T>(
    ownerId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const time = now();
    for (const [id, state] of owners) {
      state.attempts = state.attempts.filter((at) => at > time - WINDOW_MS);
      if (state.active === 0 && state.attempts.length === 0) owners.delete(id);
    }
    const state = owners.get(ownerId) ?? { active: 0, attempts: [] };
    if (
      state.active >= limits.concurrent ||
      state.attempts.length >= limits.requests ||
      (!owners.has(ownerId) && owners.size >= MAX_TRACKED_OWNERS)
    ) {
      throw new ErpConnectionLimitError();
    }
    state.active += 1;
    state.attempts.push(time);
    owners.set(ownerId, state);
    try {
      return await work();
    } finally {
      state.active -= 1;
    }
  };
}

export const withErpConnectionRequest = createErpConnectionRequestGuard();

// A legacy JSON-RPC batch must not bypass the work limit of a single HTTP request.
export const withErpConnectionTool = createErpConnectionRequestGuard();

// Shared cap before credential lookup: invalid keys must not create unbounded DB work.
// No caller-supplied IP/header is trusted as a quota identity.
export const withErpConnectionIngress = createErpConnectionRequestGuard(
  Date.now,
  {
    requests: 120,
    concurrent: 8,
  },
);
