-- Los hechos investigados (antes solo en data/investigacion.json, que no viaja
-- al publicar la app) ahora viven en la base. El archivo sigue siendo la forma
-- cómoda de editarlos: `npm run investigacion -- subir` lo copia aquí.
create table research_files (
  tree_id    uuid primary key references trees(id) on delete cascade,
  content    jsonb not null,
  updated_at timestamptz not null default now()
);
alter table research_files enable row level security;
