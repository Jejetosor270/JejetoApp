import "server-only";

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 8;
const MAX_ACTIVE_REQUESTS = 4;
const MAX_TRACKED_USERS = 1_000;

interface RequestState {
  active: boolean;
  attempts: number[];
}

export class AssistantLimitError extends Error {
  constructor() {
    super("JejetoBot is busy. Please wait a minute and try again.");
    this.name = "AssistantLimitError";
  }
}

/** Per-instance burst protection, not a distributed quota or spending guarantee. */
export function createAssistantRequestGuard(now: () => number = Date.now) {
  const users = new Map<string, RequestState>();
  let activeRequests = 0;

  return async function withRequest<T>(
    userId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const cutoff = now() - WINDOW_MS;
    for (const [id, state] of users) {
      state.attempts = state.attempts.filter((time) => time > cutoff);
      if (!state.active && state.attempts.length === 0) users.delete(id);
    }

    const state = users.get(userId) ?? { active: false, attempts: [] };
    if (
      state.active ||
      state.attempts.length >= REQUESTS_PER_WINDOW ||
      activeRequests >= MAX_ACTIVE_REQUESTS ||
      (!users.has(userId) && users.size >= MAX_TRACKED_USERS)
    ) {
      throw new AssistantLimitError();
    }

    state.active = true;
    state.attempts.push(now());
    users.set(userId, state);
    activeRequests += 1;
    try {
      return await work();
    } finally {
      state.active = false;
      activeRequests -= 1;
    }
  };
}

export const withAssistantRequest = createAssistantRequestGuard();
