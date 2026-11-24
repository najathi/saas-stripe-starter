"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

const NEW_ORG = "__new__";

export function OrgSwitcher({
  organizations,
  activeId,
}: {
  organizations: { id: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <NativeSelect
      aria-label="Switch organisation"
      className="w-full"
      value={activeId}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        if (value === NEW_ORG) return router.push("/onboarding");
        startTransition(async () => {
          await authClient.organization.setActive({ organizationId: value });
          router.refresh();
        });
      }}
    >
      {organizations.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
      <option value={NEW_ORG}>+ New organisation</option>
    </NativeSelect>
  );
}
