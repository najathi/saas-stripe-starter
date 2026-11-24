"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function SwitchOrgButton({ organizationId, label = "Open" }: { organizationId: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.organization.setActive({ organizationId });
        router.push("/dashboard");
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}
