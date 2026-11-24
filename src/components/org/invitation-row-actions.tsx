"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function InvitationRowActions({ invitationId, url, canCancel }: { invitationId: string; url: string; canCancel: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
      {canCancel && (
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await authClient.organization.cancelInvitation({ invitationId });
            router.refresh();
          }}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}
