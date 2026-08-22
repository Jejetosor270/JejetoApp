import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { getAuthenticatedUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="bg-muted/35 flex min-h-svh items-center justify-center px-4 py-10 sm:px-6">
      <section
        aria-labelledby="login-heading"
        className="bg-card w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8"
      >
        <div className="mb-7">
          <p className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">
            MB Interiors
          </p>
          <h1
            id="login-heading"
            className="mt-3 text-2xl font-semibold tracking-tight"
          >
            Sign in to procurement
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Use your employee account to access the internal workspace.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
