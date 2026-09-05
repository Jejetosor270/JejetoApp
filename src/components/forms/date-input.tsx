"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "radix-ui";
import { useRef, useState, type InputHTMLAttributes } from "react";
import {
  inputClassName,
  useFieldAccessibility,
} from "@/components/master-data/form-ui";
import {
  addMonthsToDateOnly,
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
  europeanInputToDateOnly,
  formatDateOnly,
  monthGrid,
} from "@/domain/payments/dates";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value" | "defaultValue" | "type"
> & {
  value?: string | undefined;
  defaultValue?: string | undefined;
  onChange?: ((event: { target: { value: string } }) => void) | undefined;
  europeanValue?: boolean;
};

/** Display European dates; submit ISO date-only values without local-time conversion. */
export function DateInput({
  value,
  defaultValue = "",
  onChange,
  name,
  className = inputClassName,
  europeanValue = false,
  ...props
}: Props) {
  const field = useFieldAccessibility();
  const [internal, setInternal] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const raw = value ?? internal;
  const iso = europeanInputToDateOnly(raw);
  const [cursor, setCursor] = useState(iso ?? businessToday());
  const calendar = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const update = (next: string) => {
    const parsed = europeanInputToDateOnly(next);
    const canonical = parsed
      ? europeanValue
        ? formatDateOnly(parsed)
        : parsed
      : next;
    if (value === undefined) setInternal(canonical);
    onChange?.({ target: { value: canonical } });
  };
  const move = (next: string) => {
    setCursor(next);
    requestAnimationFrame(() =>
      calendar.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)
        ?.focus(),
    );
  };
  return (
    <span className="relative block min-w-0">
      <input
        {...props}
        aria-invalid={field.invalid || props["aria-invalid"]}
        aria-describedby={
          [field.errorId, props["aria-describedby"]]
            .filter(Boolean)
            .join(" ") || undefined
        }
        ref={input}
        className={`${className} pr-10`}
        value={iso ? formatDateOnly(iso) : raw}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        inputMode="numeric"
        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
        onChange={(event) => {
          const next = event.target.value;
          event.target.setCustomValidity(
            next && !europeanInputToDateOnly(next)
              ? "Enter a valid date as DD/MM/YYYY."
              : "",
          );
          update(next);
        }}
      />
      <input
        name={name}
        type="hidden"
        disabled={props.disabled}
        value={iso ? (europeanValue ? formatDateOnly(iso) : iso) : raw}
      />
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          if (next) setCursor(iso ?? businessToday());
          setOpen(next);
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={props.disabled || props.readOnly}
            aria-label="Choose date"
            className="focus-visible:ring-ring absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-md focus-visible:ring-2"
          >
            <CalendarDays className="size-4" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            className="bg-popover text-popover-foreground z-[100] w-72 rounded-lg border p-3 shadow-lg"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() =>
                calendar.current
                  ?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)
                  ?.focus(),
              );
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => move(addMonthsToDateOnly(cursor, -1))}
              >
                <ChevronLeft className="size-4" />
              </button>
              <span aria-live="polite" className="text-sm font-medium">
                {new Intl.DateTimeFormat("en-GB", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(dateOnlyToDate(cursor))}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => move(addMonthsToDateOnly(cursor, 1))}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="text-muted-foreground grid grid-cols-7 text-center text-xs">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div
              ref={calendar}
              className="grid grid-cols-7"
              role="group"
              aria-label="Calendar"
            >
              {monthGrid(cursor.slice(0, 7)).map((day) => (
                <button
                  key={day.date}
                  data-date={day.date}
                  type="button"
                  aria-label={formatDateOnly(day.date)}
                  aria-pressed={iso === day.date}
                  tabIndex={cursor === day.date ? 0 : -1}
                  disabled={Boolean(
                    (props.min && day.date < props.min) ||
                    (props.max && day.date > props.max),
                  )}
                  className={`focus-visible:ring-ring h-9 rounded text-sm focus-visible:ring-2 disabled:opacity-30 ${day.date === iso ? "bg-primary text-primary-foreground" : day.inMonth ? "hover:bg-muted" : "text-muted-foreground"}`}
                  onKeyDown={(event) => {
                    const delta: Record<string, number> = {
                      ArrowLeft: -1,
                      ArrowRight: 1,
                      ArrowUp: -7,
                      ArrowDown: 7,
                    };
                    const date = dateOnlyToDate(day.date);
                    let next: string;
                    if (event.key in delta) {
                      date.setUTCDate(
                        date.getUTCDate() + (delta[event.key] ?? 0),
                      );
                      next = dateToDateOnly(date);
                    } else if (
                      event.key === "PageUp" ||
                      event.key === "PageDown"
                    )
                      next = addMonthsToDateOnly(
                        day.date,
                        event.key === "PageUp" ? -1 : 1,
                      );
                    else if (event.key === "Home" || event.key === "End") {
                      const offset = (date.getUTCDay() + 6) % 7;
                      date.setUTCDate(
                        date.getUTCDate() -
                          offset +
                          (event.key === "End" ? 6 : 0),
                      );
                      next = dateToDateOnly(date);
                    } else return;
                    event.preventDefault();
                    move(next);
                  }}
                  onClick={() => {
                    input.current?.setCustomValidity("");
                    update(day.date);
                    input.current?.dispatchEvent(
                      new Event("change", { bubbles: true }),
                    );
                    setOpen(false);
                  }}
                >
                  {dateOnlyToDate(day.date).getUTCDate()}
                </button>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}
