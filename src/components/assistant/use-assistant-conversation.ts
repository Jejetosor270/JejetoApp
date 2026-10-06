"use client";

import { useRef, useState, type FormEvent } from "react";

import {
  askAssistant,
  readAssistantFinancial,
  readAssistantList,
} from "@/app/(app)/assistant-actions";
import type {
  AssistantFinancialRequest,
  AssistantFinancialTopic,
} from "@/domain/assistant/answers";
import {
  ASSISTANT_CONTEXT_LIMIT,
  type AssistantReply,
} from "@/domain/assistant/contracts";
import type {
  AssistantListPage,
  AssistantPageContext,
} from "@/domain/assistant/lists";

const TURN_LIMIT = 12;
interface AssistantTurn {
  id: number;
  question: string;
  reply: AssistantReply;
}

export function useAssistantConversation(context: AssistantPageContext | null) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [previousList, setPreviousList] = useState<AssistantListPage | null>(
    null,
  );
  const [previousFinancial, setPreviousFinancial] =
    useState<AssistantFinancialRequest | null>(null);
  const [pendingFinancialTopic, setPendingFinancialTopic] =
    useState<AssistantFinancialTopic | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [pendingTurn, setPendingTurn] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const nextTurn = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const pending = pendingQuestion !== null || pendingTurn !== null;

  function rememberScope(reply: AssistantReply) {
    if (reply.listing) {
      setPreviousList({
        query: reply.listing.query,
        page: reply.listing.page,
      });
    }
    setPreviousFinancial(reply.financial ?? null);
    setPendingFinancialTopic(
      reply.financial ? null : (reply.pendingFinancialTopic ?? null),
    );
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (inFlight.current || message.length < 2) return;
    inFlight.current = true;
    setPendingQuestion(message);
    setError(null);
    try {
      const result = await askAssistant({
        message,
        recentMessages: turns
          .slice(-ASSISTANT_CONTEXT_LIMIT)
          .map((turn) => turn.question),
        context,
        previousList,
        previousFinancial,
        pendingFinancialTopic,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const id = nextTurn.current++;
      setTurns((previous) =>
        [...previous, { id, question: message, reply: result.reply }].slice(
          -TURN_LIMIT,
        ),
      );
      rememberScope(result.reply);
      setDraft("");
    } catch {
      setError(
        "JejetoBot is unavailable. Your question is retained; try again.",
      );
    } finally {
      inFlight.current = false;
      setPendingQuestion(null);
      input.current?.focus();
    }
  }

  async function loadList(turnId: number, request: AssistantListPage) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingTurn(turnId);
    setError(null);
    try {
      const result = await readAssistantList(request);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === turnId ? { ...turn, reply: result.reply } : turn,
        ),
      );
      rememberScope(result.reply);
    } catch {
      setError("JejetoBot couldn't load this list. Your results are retained.");
    } finally {
      inFlight.current = false;
      setPendingTurn(null);
    }
  }

  async function loadFinancial(
    turnId: number,
    request: AssistantFinancialRequest,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingTurn(turnId);
    setError(null);
    try {
      const result = await readAssistantFinancial(request);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === turnId ? { ...turn, reply: result.reply } : turn,
        ),
      );
      rememberScope(result.reply);
    } catch {
      setError(
        "JejetoBot couldn't load this Project. Your question is retained.",
      );
    } finally {
      inFlight.current = false;
      setPendingTurn(null);
    }
  }

  function clear() {
    if (inFlight.current) return;
    setTurns([]);
    setPreviousList(null);
    setPreviousFinancial(null);
    setPendingFinancialTopic(null);
    setDraft("");
    setError(null);
    input.current?.focus();
  }

  return {
    draft,
    setDraft,
    turns,
    pendingQuestion,
    pendingTurn,
    pending,
    error,
    input,
    send,
    loadList,
    loadFinancial,
    clear,
  };
}
