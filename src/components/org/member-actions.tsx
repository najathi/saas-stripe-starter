"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function MemberActions({
  organizationId,
  memberId,
  role,
  canUpdate,
  canRemove,
}: {
  organizationId: string;
  memberId: string;
  role: string;
  canUpdate: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error: { message?: string } | null }>) {
    setPending(true);
    setError(null);
    const { error } = await fn();
    setPending(false);
    if (error) setError(error.message ?? "Action failed.");
    else router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {canUpdate ? (
        <NativeSelect
          aria-label="Role"
          className="h-8 text-xs"
          value={role}
          disabled={pending}
          onChange={(e) =>
            run(() =>
              authClient.organization.updateMemberRole({
                organizationId,
                memberId,
                role: e.target.value as "owner" | "admin" | "member",
              }),
            )
          }
        >
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
        </NativeSelect>
      ) : (
        <span className="text-xs capitalize text-muted-foreground">{role}</span>
      )}
      {canRemove && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => authClient.organization.removeMember({ organizationId, memberIdOrEmail: memberId }))}
        >
          Remove
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
