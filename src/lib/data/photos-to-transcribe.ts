// Fotos de actas ya guardadas en las fichas que todavía no tienen la transcripción exacta.

import { getPool } from "../db/pool";

export type PhotoToTranscribe = {
  id: string;
  original_url: string;
  title: string | null;
  transcription: string | null;
  personas: { id: string; name: string }[];
};

export async function listPhotosToTranscribe(treeId: string): Promise<PhotoToTranscribe[]> {
  const { rows } = await getPool().query(
    `select m.id, m.original_url, m.title, m.transcription,
            coalesce(json_agg(distinct jsonb_build_object('id', p.id, 'name', n.display_name)) filter (where p.id is not null), '[]') as personas
       from media m
       left join media_links ml on ml.media_id = m.id
       left join persons p on p.id = ml.person_id
       left join person_names n on n.person_id = p.id and n.is_primary
      where m.tree_id = $1 and m.original_url like '/api/fichas/foto?id=%'
        and (m.transcription is null or m.transcription = '' or m.transcription like 'Lectura parcial%')
      group by m.id
      order by m.created_at`,
    [treeId],
  );
  return rows.map((r) => ({ id: r.id, original_url: r.original_url, title: r.title, transcription: r.transcription, personas: r.personas }));
}
