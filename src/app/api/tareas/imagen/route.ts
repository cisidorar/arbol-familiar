import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { canAdmin } from "@/lib/auth/roles";
import { sniffImage } from "@/lib/data/cemetery-photos";
import { MAX_IMAGES_PER_TASK, MAX_TASK_IMAGE_BYTES, deleteTaskImage, getTaskImage, saveTaskImage } from "@/lib/data/task-images";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tareas es solo para administradoras: lo mismo vale para sus imágenes. */
async function adminSession() {
  const { session, denied } = await apiSession("edit");
  if (denied) return { session: null, denied };
  if (!canAdmin(session.role)) return { session: null, denied: NextResponse.json({ error: "No tienes acceso." }, { status: 403 }) };
  return { session, denied: null };
}

/** La imagen subida: /api/tareas/imagen?id=<id de la imagen>. */
export async function GET(request: Request) {
  const { session, denied } = await adminSession();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  const img = await getTaskImage(session.treeId, id);
  if (!img) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}

/** Sube una imagen a una tarea: formulario con "task" (id de la tarea) y "file" (imagen; el navegador ya la achicó). */
export async function POST(request: Request) {
  const { session, denied } = await adminSession();
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const task = form?.get("task");
  const file = form?.get("file");
  if (typeof task !== "string" || !UUID.test(task) || !(file instanceof File)) return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  if (file.size > MAX_TASK_IMAGE_BYTES) return NextResponse.json({ error: "La foto es muy pesada (máximo 3 MB)." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(buf);
  if (!type) return NextResponse.json({ error: "Eso no parece una foto (usa JPG, PNG o WebP)." }, { status: 400 });
  const saved = await saveTaskImage(session.treeId, task, type, buf, { id: session.user.id, name: session.user.name });
  if (saved === "no-task") return NextResponse.json({ error: "No se encontró la tarea." }, { status: 404 });
  if (saved === "full") return NextResponse.json({ error: `Esta tarea ya tiene ${MAX_IMAGES_PER_TASK} fotos. Quita alguna para subir otra.` }, { status: 409 });
  return NextResponse.json({ ok: true, image: saved });
}

/** Quita una imagen subida. */
export async function DELETE(request: Request) {
  const { session, denied } = await adminSession();
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  await deleteTaskImage(session.treeId, id);
  return NextResponse.json({ ok: true });
}
