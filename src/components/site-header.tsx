import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/#features" className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block">
            Features
          </Link>
          <Link href="/pricing" className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
          {signedIn ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Link href="/sign-in" className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
              <Button asChild size="sm">
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
