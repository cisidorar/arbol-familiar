-- Personas eliminadas desde la app que venían del GEDCOM: se recuerda su
-- identificador para que una nueva importación no las vuelva a crear.
create table deleted_persons (
  tree_id     uuid not null references trees(id) on delete cascade,
  gedcom_uid  text not null,
  deleted_at  timestamptz not null default now(),
  primary key (tree_id, gedcom_uid)
);
