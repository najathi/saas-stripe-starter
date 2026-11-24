import { NextResponse } from "next/server";
import { db } from "@/db";
import { getMemberRole } from "@/lib/auth/membership";
import { requireFeature } from "@/lib/billing/plan";
import { getApiContext } from "@/lib/auth/api-context";
import { errorResponse } from "@/lib/http";
import { listProjects } from "@/lib/projects";

/** Example of a plan-gated API: CSV export is a Pro+ feature. */
export async function GET() {
  const ctx = await getApiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (!(await getMemberRole(db, ctx.organizationId, ctx.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await requireFeature(db, ctx.organizationId, "csv-export");

    const rows = await listProjects(db, ctx.organizationId);
    const escape = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const csv = ["id,name,created_at", ...rows.map((p) => [p.id, escape(p.name), p.createdAt.toISOString()].join(","))].join("\n");

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="projects.csv"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
