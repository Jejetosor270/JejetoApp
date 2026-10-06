import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { AssistantReply } from "@/domain/assistant/contracts";

export function AssistantReplyView({
  reply,
  onNavigate,
}: {
  reply: AssistantReply;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 break-words">{reply.message}</p>
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
      {reply.moreHref && (
        <Link
          href={reply.moreHref}
          prefetch={false}
          onNavigate={onNavigate}
          className="text-primary focus-visible:ring-ring/30 inline-flex items-center gap-1 rounded text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2"
        >
          Open search <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </div>
  );
}
