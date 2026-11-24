export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
        <p>Open-source SaaS starter · MIT licensed</p>
        <p>
          Built by{" "}
          <a href="https://github.com/najathi" className="font-medium text-foreground underline-offset-4 hover:underline">
            Mohamed Najathi
          </a>{" "}
          · Need a SaaS MVP built?
        </p>
      </div>
    </footer>
  );
}
