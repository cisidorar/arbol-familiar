-- Hechos de data/investigacion.json que se editaron o borraron en la app.
--
-- Esos hechos viven en un archivo, no en la base. Al editar uno desde la
-- ficha se guarda como un hecho normal (tabla events) y acá queda anotado que
-- el del archivo ya no se muestra para esa persona; al borrarlo, solo queda
-- la anotación. `fact_key` identifica el hecho por su contenido.
create table research_overrides (
  person_id   uuid not null references persons(id) on delete cascade,
  fact_key    text not null,
  event_id    uuid references events(id) on delete set null, -- el hecho que lo reemplaza; null = se borró
  created_at  timestamptz not null default now(),
  created_by  uuid references users(id) on delete set null,
  primary key (person_id, fact_key)
);
