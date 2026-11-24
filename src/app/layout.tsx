import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SaaS Stripe Starter — Next.js, Better Auth, Drizzle, Stripe",
    template: "%s · SaaS Stripe Starter",
  },
  description:
    "Open-source multi-tenant SaaS foundation: authentication, organisations with roles, and Stripe subscription billing per organisation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
