import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { deleteTask, updateTask } from "@/lib/data/tasks";
import { validateTask } from "@/lib/tasks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

/** Guarda el pendiente completo (mismos campos que al crearlo, más status y result). */
export async function PUT(request: Request, { params }: Context) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });

  const v = validateTask(await request.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: "Revisa los campos marcados.", errors: v.errors }, { status: 400 });

  const result = await updateTask(session.treeId, id, v.value, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}

export async function DELETE(request: Request, { params }: Context) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id) || !(await deleteTask(session.treeId, id))) {
    return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
