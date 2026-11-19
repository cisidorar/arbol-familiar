import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth/session";
import { canAdmin } from "@/lib/auth/roles";
import { getPool } from "@/lib/db/pool";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Foto de un acta vinculada a una ficha: /api/fichas/foto?id=<id de media>. Solo administradoras, igual que las de Tareas. */
export async function GET(request: Request) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!canAdmin(session.role)) return NextResponse.json({ error: "No tienes acceso." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  const { rows } = await getPool().query(
    `select f.content_type, f.data from media_files f join media m on m.id = f.media_id where f.media_id = $1 and m.tree_id = $2`,
    [id, session.treeId],
  );
  if (!rows[0]) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  return new Response(new Uint8Array(rows[0].data), {
    headers: { "Content-Type": rows[0].content_type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
