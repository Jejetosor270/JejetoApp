"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  type FormEventHandler,
} from "react";

type FormAction<State> = (
  state: Awaited<State>,
  formData: FormData,
) => Promise<State> | State;

/**
 * Submits a snapshot of the form without React's successful-action reset.
 * Expected server validation failures therefore leave every DOM draft value in place.
 */
export function usePersistentActionState<State>(
  action: FormAction<State>,
  initialState: Awaited<State>,
) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (
      pending ||
      !formRef.current ||
      typeof state !== "object" ||
      state === null ||
      !("status" in state)
    )
      return;
    if (state.status === "success") delete formRef.current.dataset.dirty;
    if (state.status === "error") {
      const field = formRef.current.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      if (field) {
        let ancestor = field.parentElement;
        while (ancestor && ancestor !== formRef.current) {
          if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
          ancestor = ancestor.parentElement;
        }
        field.scrollIntoView({ block: "center", behavior: "smooth" });
        field.focus();
      }
    }
  }, [state, pending]);
  const onSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
    (event) => {
      event.preventDefault();
      formRef.current = event.currentTarget;
      const formData = new FormData(event.currentTarget);
      startTransition(() => dispatch(formData));
    },
    [dispatch],
  );
  return { onSubmit, pending, state };
}
