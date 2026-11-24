import { NextResponse } from "next/server";
import { ForbiddenError } from "@/lib/auth/membership";
import { PlanLimitError, PlanRequiredError } from "@/lib/billing/plan";

/** Maps domain errors to JSON HTTP responses for route handlers. */
export function errorResponse(error: unknown) {
  if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof PlanRequiredError || error instanceof PlanLimitError) {
    return NextResponse.json({ error: error.message }, { status: 402 });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
