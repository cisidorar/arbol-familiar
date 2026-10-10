-- Pendientes de investigación (lo que hay que pedir o mirar fuera de la app)
-- y código territorial de los lugares (para el mapa de orígenes).
--
-- research_tasks existe desde 0001 y nunca se usó: `question` pasa a ser el
-- título del pendiente y se le agregan los campos que faltaban.

alter table research_tasks
  add column venue             text not null default 'otro'
    check (venue in ('registro_civil_linea', 'registro_civil_oficina', 'familysearch_casa',
                     'familysearch_centro', 'familia', 'parroquia', 'cementerio', 'otro')),
  add column ask_text          text,   -- qué pedir, listo para decirlo o mostrarlo en la ventanilla
  add column reference         text,   -- datos para pedirlo: nombre, fecha, circunscripción, nº de inscripción
  add column source_url        text,   -- enlace del registro (FamilySearch, etc.)
  add column result            text,   -- lo que se encontró
  add column resolved_event_id uuid references events(id) on delete set null,
  add column seed_key          text,   -- identifica a los pendientes cargados desde un script (para no duplicarlos)
  add column created_by        uuid references users(id) on delete set null,
  add column updated_by        uuid references users(id) on delete set null;

create unique index idx_research_tasks_seed on research_tasks(tree_id, seed_key) where seed_key is not null;
create index idx_research_tasks_tree on research_tasks(tree_id, status);

-- Código oficial de la comuna y de la región (CUT, como texto: "13301" = Colina, "13" = Metropolitana).
-- Los llena scripts/normalize-places.ts; el mapa se une a los lugares por este código, no por el texto.
alter table places
  add column comuna_code text,
  add column region_code text;
