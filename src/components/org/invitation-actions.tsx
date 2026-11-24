"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function respond(accept: boolean) {
    setPending(true);
    setError(null);
    const { error } = accept
      ? await authClient.organization.acceptInvitation({ invitationId })
      : await authClient.organization.rejectInvitation({ invitationId });
    if (error) {
      setError(error.message ?? "Could not update the invitation.");
      setPending(false);
      return;
    }
    router.push(accept ? "/dashboard" : "/onboarding");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => respond(true)} disabled={pending}>
          Accept invitation
        </Button>
        <Button variant="outline" onClick={() => respond(false)} disabled={pending}>
          Decline
        </Button>
      </div>
    </div>
  );
}
