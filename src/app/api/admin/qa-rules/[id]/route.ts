import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const data: { name?: string; prompt?: string; enabled?: boolean } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return Response.json({ error: "Name cannot be empty" }, { status: 400 });
    data.name = name;
  }
  if (typeof body.prompt === "string") {
    const prompt = body.prompt.trim();
    if (!prompt) return Response.json({ error: "Prompt cannot be empty" }, { status: 400 });
    data.prompt = prompt;
  }
  if (typeof body.enabled === "boolean") {
    data.enabled = body.enabled;
  }

  const rule = await prisma.qaRule.update({ where: { id }, data });
  return Response.json({ rule });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.qaRule.delete({ where: { id } });
  return Response.json({ ok: true });
}
