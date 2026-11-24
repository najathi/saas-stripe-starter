import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { isPlanId } from "@/config/plans";
import { env } from "@/env";
import { getSession } from "@/lib/auth/session";
import { safeRedirect } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const fallback = isPlanId(params.plan) && params.plan !== "free" ? `/onboarding?plan=${params.plan}` : "/onboarding";
  const redirectTo = safeRedirect(params.redirect, fallback);
  if (await getSession()) redirect(redirectTo);
  return <AuthForm mode="sign-up" googleEnabled={env.googleEnabled} redirectTo={redirectTo} />;
}
