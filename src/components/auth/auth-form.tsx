"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp } from "@/lib/auth/client";

export function AuthForm({
  mode,
  googleEnabled,
  redirectTo,
}: {
  mode: "sign-in" | "sign-up";
  googleEnabled: boolean;
  redirectTo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const { error } = isSignUp
      ? await signUp.email({ name: String(form.get("name")), email, password })
      : await signIn.email({ email, password });

    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      setPending(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function onGoogle() {
    setPending(true);
    await signIn.social({ provider: "google", callbackURL: redirectTo });
  }

  const otherHref = `${isSignUp ? "/sign-in" : "/sign-up"}${redirectTo !== "/dashboard" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{isSignUp ? "Create your account" : "Welcome back"}</CardTitle>
        <CardDescription>
          {isSignUp ? "Start free — no credit card required." : "Sign in to your workspace."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleEnabled && (
          <>
            <Button type="button" variant="outline" className="w-full" onClick={onGoogle} disabled={pending}>
              Continue with Google
            </Button>
            <div className="relative text-center text-xs uppercase text-muted-foreground">
              <span className="bg-card px-2">or</span>
            </div>
          </>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
            />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account?" : "New here?"}&nbsp;
        <Link href={otherHref} className="font-medium text-foreground underline-offset-4 hover:underline">
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </CardFooter>
    </Card>
  );
}
