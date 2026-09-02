"use client";

import {
  startTransition,
  useActionState,
  useCallback,
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
  const onSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
    (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(() => dispatch(formData));
    },
    [dispatch],
  );
  return { onSubmit, pending, state };
}
