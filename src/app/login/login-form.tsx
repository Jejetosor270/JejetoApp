"use client";

import { LoaderCircle, LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

function getSafeCallbackUrl(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(
    searchParams.has("error")
      ? "Unable to sign in with those details. Check your email and password."
      : null,
  );
  const [isPending, startTransition] = useTransition();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));

  function submit(formData: FormData): void {
    const email = formData.get("email");
    const password = formData.get("password");

    if (typeof email !== "string" || typeof password !== "string") {
      setErrorMessage("Enter your email and password to continue.");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const result = await signIn("credentials", {
        callbackUrl,
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setErrorMessage(
          "Unable to sign in with those details. Check your email and password.",
        );
        return;
      }

      router.replace(callbackUrl);
      router.refresh();
    });
  }

  return (
    <form action={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <Button className="w-full" disabled={isPending} size="lg" type="submit">
        {isPending ? (
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin"
            data-icon="inline-start"
          />
        ) : (
          <LogIn aria-hidden="true" data-icon="inline-start" />
        )}
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
