import "server-only";

const windowMilliseconds = 60_000;
const maximumRequestsPerWindow = 4;

interface UserRequestState {
  active: boolean;
  attempts: number[];
}

const requestState = new Map<string, UserRequestState>();

export class QuoteExtractionBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteExtractionBusyError";
  }
}

export async function withQuoteExtractionGuard<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const state = requestState.get(userId) ?? { active: false, attempts: [] };
  state.attempts = state.attempts.filter(
    (attempt) => now - attempt < windowMilliseconds,
  );
  if (state.active) {
    throw new QuoteExtractionBusyError(
      "A quote is already being processed for your account. Wait for it to finish before trying again.",
    );
  }
  if (state.attempts.length >= maximumRequestsPerWindow) {
    throw new QuoteExtractionBusyError(
      "Too many quote extraction attempts were started. Wait a minute and try again.",
    );
  }
  state.active = true;
  state.attempts.push(now);
  requestState.set(userId, state);
  try {
    return await operation();
  } finally {
    state.active = false;
  }
}

export function resetQuoteExtractionGuardForTests(): void {
  requestState.clear();
}
