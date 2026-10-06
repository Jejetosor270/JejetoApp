"use client";

import { MessageSquare, Search, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { AssistantReplyView } from "@/components/assistant/assistant-reply";
import { useAssistantConversation } from "@/components/assistant/use-assistant-conversation";
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
import { ASSISTANT_MESSAGE_LIMIT } from "@/domain/assistant/contracts";
import { assistantContextFromPath } from "@/domain/assistant/lists";
import { cn } from "@/lib/utils";

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const context = assistantContextFromPath(usePathname());
  const {
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
    clear,
  } = useAssistantConversation(context);
  const conversation = useRef<HTMLDivElement>(null);
  const fieldId = useId();

  useEffect(() => {
    const element = conversation.current;
    const latest = element?.querySelector<HTMLElement>(
      "[data-assistant-turn]:last-child",
    );
    if (open && element && latest) {
      element.scrollTop +=
        latest.getBoundingClientRect().top -
        element.getBoundingClientRect().top;
    }
  }, [open, turns.length, pendingQuestion]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 shadow-sm"
        >
          <MessageSquare aria-hidden="true" /> JejetoBot
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
            <SheetTitle>JejetoBot</SheetTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || (!turns.length && !draft && !error)}
                onClick={clear}
              >
                New chat
              </Button>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close JejetoBot"
                >
                  <X aria-hidden="true" />
                </Button>
              </SheetClose>
            </div>
          </div>
          <SheetDescription>Read-only record assistant</SheetDescription>
          {context && (
            <p
              className="text-muted-foreground text-xs"
              aria-label="Page context"
            >
              Context: {context.kind} page
            </p>
          )}
        </SheetHeader>
        <div
          ref={conversation}
          className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4"
          role="log"
          aria-label="JejetoBot conversation"
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
                Find and filter Projects, Orders, Billing, Clients or Suppliers.
              </p>
              <p className="text-muted-foreground">
                Try “Orders for supplier Acme” or “Overdue invoices in this
                Project”.
              </p>
              <p className="text-muted-foreground text-xs">
                No record changes. This chat clears when you reload or sign out.
                Questions and search criteria go to OpenAI; record results stay
                in the app.
              </p>
            </div>
          )}
          {turns.map((turn) => (
            <div
              className="min-w-0 space-y-3"
              key={turn.id}
              data-assistant-turn
            >
              <p className="bg-muted rounded-md px-3 py-2 text-sm break-words">
                <span className="sr-only">You: </span>
                {turn.question}
              </p>
              <AssistantReplyView
                reply={turn.reply}
                onNavigate={() => setOpen(false)}
                disabled={pending}
                busy={pendingTurn === turn.id}
                onLoadList={(request) => loadList(turn.id, request)}
              />
            </div>
          ))}
          {pendingQuestion !== null && (
            <div className="space-y-3" data-assistant-turn>
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
            Ask JejetoBot
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
            placeholder="Find records or narrow a list…"
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
