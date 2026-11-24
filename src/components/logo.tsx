import Link from "next/link";
import { Layers } from "lucide-react";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Layers className="size-4" />
      </span>
      <span>Starter</span>
    </Link>
  );
}
