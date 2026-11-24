import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { env } from "@/env";
import { getSession } from "@/lib/auth/session";
import { safeRedirect } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  const redirectTo = safeRedirect((await searchParams).redirect);
  if (await getSession()) redirect(redirectTo);
  return <AuthForm mode="sign-in" googleEnabled={env.googleEnabled} redirectTo={redirectTo} />;
}
