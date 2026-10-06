"use client";

import { MessageSquare, Search, Send, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { askAssistant } from "@/app/(app)/assistant-actions";
import { AssistantReplyView } from "@/components/assistant/assistant-reply";
import { controlVariants } from "@/components/forms/control-styles";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ASSISTANT_CONTEXT_LIMIT,
  ASSISTANT_MESSAGE_LIMIT,
  type AssistantReply,
} from "@/domain/assistant/contracts";
import { cn } from "@/lib/utils";

const TURN_LIMIT = 12;
interface AssistantTurn {
  id: number;
  question: string;
  reply: AssistantReply;
}

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const nextTurn = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const pending = pendingQuestion !== null;

  useEffect(() => {
    const element = conversation.current;
    if (open && element) element.scrollTop = element.scrollHeight;
  }, [open, turns, pendingQuestion]);

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
      setDraft("");
    } catch {
      setError(
        "The assistant is unavailable. Your question is retained; try again.",
      );
    } finally {
      inFlight.current = false;
      setPendingQuestion(null);
      input.current?.focus();
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 shadow-sm"
        >
          <MessageSquare aria-hidden="true" /> Assistant
        </Button>
      </SheetTrigger>
      <SheetContent
        showCloseButton={false}
        className="min-w-0 gap-0 data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <SheetHeader className="border-border bg-muted/50 shrink-0 border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>Assistant</SheetTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || (!turns.length && !draft && !error)}
                onClick={() => {
                  setTurns([]);
                  setDraft("");
                  setError(null);
                  input.current?.focus();
                }}
              >
                New chat
              </Button>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close assistant"
                >
                  <X aria-hidden="true" />
                </Button>
              </SheetClose>
            </div>
          </div>
          <SheetDescription>Read-only record finder</SheetDescription>
        </SheetHeader>
        <div
          ref={conversation}
          className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4"
          role="log"
          aria-label="Assistant conversation"
          aria-live="polite"
          aria-busy={pending}
        >
          {turns.length === 0 && !pending && (
            <div className="space-y-3 py-4 text-sm leading-6">
              <Search
                aria-hidden="true"
                className="text-muted-foreground size-5"
              />
              <p>
                Find Projects, Orders, Billing, Clients or Suppliers by name or
                reference.
              </p>
              <p className="text-muted-foreground">
                Try “Find Order DEMO-001”.
              </p>
              <p className="text-muted-foreground text-xs">
                No record changes. This chat clears when you reload or sign out.
                Only your questions are sent to OpenAI.
              </p>
            </div>
          )}
          {turns.map((turn) => (
            <div className="min-w-0 space-y-3" key={turn.id}>
              <p className="bg-muted rounded-md px-3 py-2 text-sm break-words">
                <span className="sr-only">You: </span>
                {turn.question}
              </p>
              <AssistantReplyView
                reply={turn.reply}
                onNavigate={() => setOpen(false)}
              />
            </div>
          ))}
          {pending && (
            <div className="space-y-3">
              <p className="bg-muted rounded-md px-3 py-2 text-sm break-words">
                <span className="sr-only">You: </span>
                {pendingQuestion}
              </p>
              <p className="text-muted-foreground text-sm" role="status">
                Finding records…
              </p>
            </div>
          )}
        </div>
        <form
          onSubmit={send}
          data-draft-guard="off"
          className="border-border shrink-0 space-y-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <label htmlFor={fieldId} className="text-sm font-medium">
            Find a record
          </label>
          <textarea
            ref={input}
            id={fieldId}
            name="assistantMessage"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={ASSISTANT_MESSAGE_LIMIT}
            readOnly={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            className={cn(
              controlVariants(),
              "h-auto min-h-20 resize-none py-2",
            )}
            placeholder="Name or reference…"
          />
          {error && (
            <p
              id={`${fieldId}-error`}
              role="alert"
              className="text-destructive text-sm"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              Read-only · GPT-6 Luna
            </p>
            <Button
              type="submit"
              disabled={pending || draft.trim().length < 2}
              size="sm"
            >
              <Send aria-hidden="true" /> Send
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
