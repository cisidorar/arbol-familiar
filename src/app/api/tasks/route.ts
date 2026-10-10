import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { createTask, listTasks } from "@/lib/data/tasks";
import { validateTask } from "@/lib/tasks";

/** Los pendientes del árbol (o solo los de una persona: ?personId=…). */
export async function GET(request: Request) {
  const { session, denied } = await apiSession();
  if (denied) return denied;
  const personId = new URL(request.url).searchParams.get("personId") ?? undefined;
  return NextResponse.json({ tasks: await listTasks(session.treeId, personId) });
}

/** Crea un pendiente: { title, venue, personId?, askText?, reference?, sourceUrl?, hypothesis? }. */
export async function POST(request: Request) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });

  const v = validateTask(await request.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: "Revisa los campos marcados.", errors: v.errors }, { status: 400 });

  const result = await createTask(session.treeId, v.value, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}
