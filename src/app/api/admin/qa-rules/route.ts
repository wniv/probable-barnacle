import { auth } from "@/auth";
import { generateUniqueRuleType } from "@/lib/qarules";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!name) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }
  if (!prompt) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  const type = await generateUniqueRuleType(name);
  const rule = await prisma.qaRule.create({ data: { name, prompt, type } });
  return Response.json({ rule }, { status: 201 });
}
