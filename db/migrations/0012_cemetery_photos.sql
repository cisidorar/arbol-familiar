-- Fotos de los cementerios que sube la familia (la foto que se muestra arriba de cada cementerio).
-- Se guardan como imagen JPEG ya achicada por el navegador. Una por cementerio y árbol;
-- subir otra reemplaza a la anterior. La clave es la misma que usa la página (CemeteryGroup.key).
create table if not exists cemetery_photos (
  tree_id        uuid        not null references trees(id) on delete cascade,
  cemetery_key   text        not null,
  content_type   text        not null,
  data           bytea       not null,
  uploaded_by    uuid        references users(id) on delete set null,
  uploaded_by_name text,
  uploaded_at    timestamptz not null default now(),
  primary key (tree_id, cemetery_key)
);
alter table cemetery_photos enable row level security;
