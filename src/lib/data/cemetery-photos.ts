// Fotos de cementerios subidas por la familia (una por cementerio).

import { getPool } from "../db/pool";

export const MAX_PHOTO_BYTES = 2_000_000;

/** Qué cementerios tienen foto propia, con la fecha (sirve para que el navegador la vuelva a pedir al cambiarla). */
export async function listUploadedPhotos(treeId: string): Promise<Map<string, { version: number; by: string | null }>> {
  const { rows } = await getPool().query(
    `select cemetery_key, (extract(epoch from uploaded_at) * 1000)::bigint as v, uploaded_by_name from cemetery_photos where tree_id = $1`,
    [treeId],
  );
  return new Map(rows.map((r) => [r.cemetery_key as string, { version: Number(r.v), by: (r.uploaded_by_name as string | null) ?? null }]));
}

export async function getUploadedPhoto(treeId: string, key: string): Promise<{ type: string; data: Buffer } | null> {
  const { rows } = await getPool().query(`select content_type, data from cemetery_photos where tree_id = $1 and cemetery_key = $2`, [treeId, key]);
  return rows[0] ? { type: rows[0].content_type, data: rows[0].data } : null;
}

export async function saveUploadedPhoto(treeId: string, key: string, type: string, data: Buffer, actor: { id: string; name: string }) {
  await getPool().query(
    `insert into cemetery_photos (tree_id, cemetery_key, content_type, data, uploaded_by, uploaded_by_name)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (tree_id, cemetery_key)
     do update set content_type = excluded.content_type, data = excluded.data, uploaded_by = excluded.uploaded_by,
                   uploaded_by_name = excluded.uploaded_by_name, uploaded_at = now()`,
    [treeId, key, type, data, actor.id, actor.name],
  );
}

export async function deleteUploadedPhoto(treeId: string, key: string): Promise<void> {
  await getPool().query(`delete from cemetery_photos where tree_id = $1 and cemetery_key = $2`, [treeId, key]);
}

/** ¿Es una imagen JPEG, PNG o WebP de verdad? (mira los primeros bytes, no lo que dice el navegador) */
export function sniffImage(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}
