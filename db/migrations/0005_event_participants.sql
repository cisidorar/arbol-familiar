-- Personas relacionadas con un hecho (padrinos de un bautismo, testigos…),
-- que pueden o no estar en el árbol todavía.
--
-- person_id es null mientras esa persona no se vincula: el hecho igual
-- guarda su nombre (name_text) y se muestra como texto plano hasta que
-- alguien la busca y la vincula desde el formulario de edición.
create table event_participants (
  id          uuid primary key default gen_random_uuid(),
  tree_id     uuid not null references trees(id) on delete cascade,
  event_id    uuid not null references events(id) on delete cascade,
  role        text not null, -- "Padrino", "Madrina", "Testigo"…
  name_text   text not null,
  person_id   uuid references persons(id) on delete set null,
  position    int not null default 0, -- orden en el que se escribieron
  created_at  timestamptz not null default now()
);
create index idx_event_participants_event on event_participants(event_id, position);
create index idx_event_participants_person on event_participants(person_id);
