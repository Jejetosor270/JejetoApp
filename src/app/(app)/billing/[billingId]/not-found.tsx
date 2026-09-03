import Link from "next/link";

export default function BillingNotFound() {
  return (
    <section className="bg-card rounded-lg border p-6">
      <h1 className="text-xl font-semibold">Billing Event not found</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        This Billing Event does not exist or is no longer available.
      </p>
      <Link
        className="text-primary mt-4 inline-block text-sm underline"
        href="/billing"
      >
        Return to Client Billing
      </Link>
    </section>
  );
}
