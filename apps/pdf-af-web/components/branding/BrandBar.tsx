export function BrandBar() {
  return (
    <header className="surface px-4 py-4 md:px-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)] md:text-3xl">
            PDF Auto Fixer
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Add a file. It checks right away.</p>
        </div>
      </div>
    </header>
  );
}
