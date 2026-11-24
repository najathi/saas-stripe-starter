"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function InviteForm({ organizationId, canInviteAdmins }: { organizationId: string; canInviteAdmins: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setPending(true);
    setMessage(null);
    const email = String(form.get("email"));
    const { error } = await authClient.organization.inviteMember({
      organizationId,
      email,
      role: form.get("role") === "admin" ? "admin" : "member",
    });
    setPending(false);
    if (error) {
      setMessage({ kind: "error", text: error.message ?? "Could not send invitation." });
      return;
    }
    formEl.reset();
    setMessage({ kind: "success", text: `Invitation created for ${email}. Share the link below.` });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Input name="email" type="email" placeholder="teammate@company.com" aria-label="Email" required />
        <NativeSelect name="role" aria-label="Role" defaultValue="member">
          <option value="member">Member</option>
          {canInviteAdmins && <option value="admin">Admin</option>}
        </NativeSelect>
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Invite"}
        </Button>
      </form>
      {message && <Alert variant={message.kind === "error" ? "destructive" : "success"}>{message.text}</Alert>}
    </div>
  );
}
