"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { createProjectAction, type ActionState } from "@/app/dashboard/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateProjectForm({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createProjectAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-3">
      <form ref={formRef} action={action} className="flex gap-2">
        <Input name="name" placeholder="New project name" aria-label="Project name" required minLength={2} maxLength={60} />
        <Button type="submit" disabled={pending || disabled}>
          {pending ? "Adding…" : "Add project"}
        </Button>
      </form>
      {state.error && (
        <Alert variant={state.upgrade ? "warning" : "destructive"}>
          {state.error}{" "}
          {state.upgrade && (
            <Link href="/dashboard/billing" className="font-medium underline underline-offset-4">
              View plans
            </Link>
          )}
        </Alert>
      )}
    </div>
  );
}
