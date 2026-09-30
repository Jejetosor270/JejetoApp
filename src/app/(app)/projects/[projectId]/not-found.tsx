import Link from "next/link";
export default function ProjectNotFound() {
  return (
    <section className="record-surface space-y-3">
      <h1 className="text-lg font-semibold">Project not found</h1>
      <p className="text-muted-foreground text-sm">
        This Project is unavailable or has been moved to Trash.
      </p>
      <Link className="text-sm underline" href="/projects">
        Back to Projects
      </Link>
    </section>
  );
}
