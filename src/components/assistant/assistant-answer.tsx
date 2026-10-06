import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { AssistantAnswer } from "@/domain/assistant/answers";

const linkStyle =
  "text-primary focus-visible:ring-ring/30 rounded underline-offset-4 outline-none hover:underline focus-visible:ring-2";

export function AssistantAnswerView({
  answer,
  onNavigate,
}: {
  answer: AssistantAnswer;
  onNavigate: () => void;
}) {
  return (
    <section className="min-w-0 space-y-3 text-sm" aria-label={answer.title}>
      <h3 className="font-semibold break-words">{answer.title}</h3>
      {answer.paragraphs.map((paragraph) => (
        <p key={paragraph} className="leading-6 break-words">
          {paragraph}
        </p>
      ))}
      {answer.steps && answer.steps.length > 0 && (
        <ol className="list-decimal space-y-2 pl-5 leading-6">
          {answer.steps.map((step) => (
            <li key={step} className="pl-1 break-words">
              {step}
            </li>
          ))}
        </ol>
      )}
      {answer.metrics && answer.metrics.length > 0 && (
        <dl className="border-border divide-border divide-y border-y">
          {answer.metrics.map((metric) => (
            <div
              key={metric.label}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start gap-3 py-2.5"
            >
              <dt className="text-muted-foreground break-words">
                {metric.label}
              </dt>
              <dd className="text-right font-medium break-words tabular-nums">
                {metric.href ? (
                  <Link
                    href={metric.href}
                    prefetch={false}
                    onNavigate={onNavigate}
                    className={linkStyle}
                  >
                    {metric.value ?? "Incomplete"}
                    <span className="sr-only"> — {metric.label}</span>
                  </Link>
                ) : (
                  (metric.value ?? "Incomplete")
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {answer.warnings && answer.warnings.length > 0 && (
        <ul
          className="border-border bg-muted/50 space-y-2 rounded-md border p-3 text-xs leading-5"
          aria-label="Review warnings"
        >
          {answer.warnings.map((warning) => (
            <li key={warning} className="break-words">
              {warning}
            </li>
          ))}
        </ul>
      )}
      {answer.sources && answer.sources.length > 0 && (
        <details className="text-xs">
          <summary className="focus-visible:ring-ring/30 cursor-pointer rounded font-medium outline-none focus-visible:ring-2">
            Sources ({answer.sourceCount ?? answer.sources.length})
          </summary>
          <ul className="mt-2 space-y-2" aria-label="Answer sources">
            {answer.sources.map((source) => (
              <li key={`${source.href}:${source.label}`} className="space-y-1">
                <Link
                  href={source.href}
                  prefetch={false}
                  onNavigate={onNavigate}
                  className={`${linkStyle} break-words`}
                >
                  {source.label}
                </Link>
                {source.note && (
                  <p className="text-muted-foreground leading-5 break-words">
                    {source.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {answer.sourceCount !== undefined &&
            answer.sourceCount > answer.sources.length && (
              <p className="text-muted-foreground mt-2">
                Showing {answer.sources.length} of {answer.sourceCount} sources.
                Open the Project for the full breakdown.
              </p>
            )}
        </details>
      )}
      {answer.links.length > 0 && (
        <ul
          className="flex flex-wrap gap-x-4 gap-y-2"
          aria-label="Answer links"
        >
          {answer.links.map((link) => (
            <li key={`${link.href}:${link.label}`} className="min-w-0">
              <Link
                href={link.href}
                prefetch={false}
                onNavigate={onNavigate}
                className={`${linkStyle} inline-flex max-w-full items-start gap-1 font-medium`}
              >
                <span className="min-w-0 break-words">{link.label}</span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {answer.asOf && (
        <p className="text-muted-foreground text-xs">As of {answer.asOf}</p>
      )}
    </section>
  );
}
