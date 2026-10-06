import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AssistantAnswerView } from "@/components/assistant/assistant-answer";
import type { AssistantFinancialRequest } from "@/domain/assistant/answers";
import type { AssistantReply } from "@/domain/assistant/contracts";
import type { AssistantListPage } from "@/domain/assistant/lists";

export function AssistantReplyView({
  reply,
  onNavigate,
  disabled = false,
  busy = false,
  onLoadList,
  onLoadFinancial,
}: {
  reply: AssistantReply;
  onNavigate: () => void;
  disabled?: boolean;
  busy?: boolean;
  onLoadList: (request: AssistantListPage) => void;
  onLoadFinancial: (request: AssistantFinancialRequest) => void;
}) {
  const listing = reply.listing;
  const start = listing ? (listing.page - 1) * listing.pageSize + 1 : 0;
  const end = listing
    ? Math.min(start + reply.results.length - 1, listing.total)
    : 0;
  const hasRange = reply.results.length > 0 && start <= end;
  return (
    <div className="space-y-3" aria-busy={busy}>
      {!reply.answer && (!listing || reply.results.length === 0) && (
        <p className="text-sm leading-6 break-words">{reply.message}</p>
      )}
      {reply.answer && (
        <AssistantAnswerView answer={reply.answer} onNavigate={onNavigate} />
      )}
      {reply.financialClarification && (
        <ul className="space-y-2" aria-label="Choose a Project">
          {reply.financialClarification.choices.map((choice) => (
            <li key={choice.id}>
              <Button
                variant="outline"
                disabled={disabled}
                className="h-auto w-full justify-start py-2 text-left whitespace-normal"
                onClick={() => {
                  if (!reply.financialClarification) return;
                  onLoadFinancial({
                    projectId: choice.id,
                    topic: reply.financialClarification.topic,
                  });
                }}
              >
                <span className="min-w-0 space-y-1 break-words">
                  <span className="block">{choice.label}</span>
                  <span className="text-muted-foreground block text-xs font-normal">
                    {choice.context}
                  </span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {listing && (
        <div className="space-y-2">
          <p className="text-sm tabular-nums" aria-label="Result count">
            {hasRange
              ? `${start}–${end} of ${listing.total} records`
              : `${reply.results.length} shown · ${listing.total} matches`}
          </p>
          {listing.filters.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Applied filters">
              {listing.filters.map((filter) => (
                <li
                  key={filter}
                  className="bg-muted text-muted-foreground max-w-full rounded px-2 py-1 text-xs break-words"
                >
                  {filter}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {reply.clarification && (
        <ul className="space-y-2" aria-label="Choose a record">
          {reply.clarification.choices.map((choice) => (
            <li key={`${choice.field}:${choice.id}`}>
              <Button
                variant="outline"
                disabled={disabled}
                className="h-auto w-full justify-start py-2 text-left whitespace-normal"
                onClick={() => {
                  if (!reply.clarification) return;
                  onLoadList({
                    query: {
                      ...reply.clarification.query,
                      [choice.field]: choice.id,
                    },
                    page: 1,
                  });
                }}
              >
                <span className="min-w-0 space-y-1 break-words">
                  <span className="block">{choice.label}</span>
                  <span className="text-muted-foreground block text-xs font-normal">
                    {choice.context}
                  </span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {reply.results.length > 0 && (
        <ul className="space-y-2" aria-label="Matching records">
          {reply.results.map((record) => (
            <li key={`${record.type}:${record.id}`}>
              <Link
                href={record.href}
                prefetch={false}
                onNavigate={onNavigate}
                className="border-border bg-card hover:bg-muted focus-visible:ring-ring/30 flex min-w-0 items-start gap-2 rounded-md border p-3 outline-none focus-visible:ring-2"
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="text-muted-foreground block text-xs">
                    {record.type}
                  </span>
                  <span className="block text-sm font-medium break-words">
                    {record.label}
                  </span>
                  <span className="text-muted-foreground block text-xs leading-5 break-words">
                    {record.context}
                  </span>
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {listing && (
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          aria-label="List pages"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !listing.hasPrevious}
            onClick={() =>
              onLoadList({ query: listing.query, page: listing.page - 1 })
            }
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            Page {listing.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !listing.hasNext}
            onClick={() =>
              onLoadList({ query: listing.query, page: listing.page + 1 })
            }
          >
            Next
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-muted-foreground text-sm">
          Loading records…
        </p>
      )}
      {reply.moreHref && (
        <Link
          href={reply.moreHref}
          prefetch={false}
          onNavigate={onNavigate}
          className="text-primary focus-visible:ring-ring/30 inline-flex items-center gap-1 rounded text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2"
        >
          {reply.moreLabel ?? "Open search"}{" "}
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </div>
  );
}
