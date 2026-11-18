-- Fotos y capturas de lo que se encuentra al resolver una tarea (por ejemplo, la página de FamilySearch
-- o el acta del Registro Civil). Cuelgan de la tarea; se guardan ya achicadas por el navegador (JPEG).
create table if not exists research_task_images (
  id               uuid        primary key default gen_random_uuid(),
  tree_id          uuid        not null references trees(id) on delete cascade,
  task_id          uuid        not null references research_tasks(id) on delete cascade,
  content_type     text        not null,
  data             bytea       not null,
  note             text        not null default '',
  uploaded_by      uuid        references users(id) on delete set null,
  uploaded_by_name text,
  uploaded_at      timestamptz not null default now()
);
create index if not exists research_task_images_task_idx on research_task_images (task_id, uploaded_at);
alter table research_task_images enable row level security;
