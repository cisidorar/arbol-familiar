-- Las fotos de actas ahora viven con la ficha de la persona (media), no con la tarea:
-- así siguen ahí aunque la tarea se cierre o se borre. Se copian los bytes desde research_task_images.
create table if not exists media_files (
  media_id     uuid        primary key references media(id) on delete cascade,
  content_type text        not null,
  data         bytea       not null,
  created_at   timestamptz not null default now()
);
alter table media_files enable row level security;

insert into media_files (media_id, content_type, data)
select m.id, i.content_type, i.data
from media m
join research_task_images i on i.id::text = substring(m.original_url from '[?]id=([0-9a-f-]{36})$')
where m.original_url like '/api/tareas/imagen?id=%'
on conflict (media_id) do nothing;

update media set original_url = '/api/fichas/foto?id=' || id::text, storage_path = 'fichas/' || id::text
where original_url like '/api/tareas/imagen?id=%'
  and exists (select 1 from media_files f where f.media_id = media.id);
