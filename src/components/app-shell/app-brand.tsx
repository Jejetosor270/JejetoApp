export function AppBrand({ companyName }: { companyName: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-[0.6875rem] font-semibold tracking-[0.08em] shadow-sm">
        MB
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-tight">
          {companyName}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          Finance operations
        </span>
      </span>
    </div>
  );
}
