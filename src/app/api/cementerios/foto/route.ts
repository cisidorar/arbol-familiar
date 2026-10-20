import { NextResponse } from "next/server";
import { apiSession, sameOrigin } from "@/lib/auth/session";
import { MAX_PHOTO_BYTES, deleteUploadedPhoto, getUploadedPhoto, saveUploadedPhoto, sniffImage } from "@/lib/data/cemetery-photos";

const validKey = (k: unknown): k is string => typeof k === "string" && k.length > 0 && k.length <= 200;

/** La foto que subió la familia: /api/cementerios/foto?k=<clave del cementerio>. */
export async function GET(request: Request) {
  const { session, denied } = await apiSession();
  if (denied) return denied;
  const key = new URL(request.url).searchParams.get("k");
  if (!validKey(key)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  const photo = await getUploadedPhoto(session.treeId, key);
  if (!photo) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}

/** Sube o reemplaza la foto: formulario con "k" (clave) y "file" (imagen; el navegador ya la achicó). */
export async function POST(request: Request) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const key = form?.get("k");
  const file = form?.get("file");
  if (!validKey(key) || !(file instanceof File)) return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "La foto es muy pesada (máximo 2 MB)." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(buf);
  if (!type) return NextResponse.json({ error: "Eso no parece una foto (usa JPG, PNG o WebP)." }, { status: 400 });
  await saveUploadedPhoto(session.treeId, key, type, buf, { id: session.user.id, name: session.user.name });
  return NextResponse.json({ ok: true, version: Date.now() });
}

/** Quita la foto subida (vuelve la foto inicial, si la hay). */
export async function DELETE(request: Request) {
  const { session, denied } = await apiSession("edit");
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Pedido no permitido." }, { status: 403 });
  const key = new URL(request.url).searchParams.get("k");
  if (!validKey(key)) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  await deleteUploadedPhoto(session.treeId, key);
  return NextResponse.json({ ok: true });
}
