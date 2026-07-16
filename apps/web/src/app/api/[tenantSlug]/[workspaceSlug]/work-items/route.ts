import { z } from "zod";
import { NextResponse } from "next/server";
import {
  createWorkspaceWorkItem,
  listWorkspaceWorkItems,
} from "@/modules/work/infrastructure/work-service";
import { readJson, resolveWorkContext, workErrorResponse } from "@/modules/work/presentation/http";

const assigneeSchema = z.object({
  type: z.enum(["user", "agent", "team"]).nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
}).optional();

const createSchema = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(40_000).default(""),
  status: z.enum(["backlog", "todo", "in_progress", "blocked", "review", "done", "cancelled"]).optional(),
  priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
  projectId: z.string().uuid().nullable().optional(),
  parentWorkItemId: z.string().uuid().nullable().optional(),
  reviewPolicy: z.enum(["none", "optional", "required"]).optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  assignee: assigneeSchema,
  enqueue: z.boolean().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug);
    const query = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number(query.get("limit") ?? 50) || 50, 1), 200);
    const offset = Math.min(Math.max(Number(query.get("offset") ?? 0) || 0, 0), 100_000);
    const rows = await listWorkspaceWorkItems({
      workspaceId: context.workspaceId,
      status: (query.get("status") || null) as Parameters<typeof listWorkspaceWorkItems>[0]["status"],
      priority: (query.get("priority") || null) as Parameters<typeof listWorkspaceWorkItems>[0]["priority"],
      query: query.get("q"),
      assigneeAgentId: query.get("assigneeAgentId"),
      projectId: query.get("projectId"),
      labelId: query.get("labelId"),
      creatorUserId: query.get("creatorUserId"),
      due: (["overdue", "today", "week", "none"].includes(query.get("due") ?? "") ? query.get("due") : null) as Parameters<typeof listWorkspaceWorkItems>[0]["due"],
      limit: limit + 1,
      offset,
    });
    return NextResponse.json({ items: rows.slice(0, limit), pagination: { limit, offset, hasMore: rows.length > limit } });
  } catch (error) {
    return workErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  try {
    const { tenantSlug, workspaceSlug } = await params;
    const context = await resolveWorkContext(tenantSlug, workspaceSlug, "member");
    const body = createSchema.parse(await readJson(request));
    const result = await createWorkspaceWorkItem({
      context,
      ...body,
      dueAt: body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return workErrorResponse(error);
  }
}
