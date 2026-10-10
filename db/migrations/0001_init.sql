-- Esquema inicial: árbol genealógico familiar
-- Compatible con Postgres local y Supabase (RLS listo para activarse en la fase 5).

create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- unaccent() no es IMMUTABLE (depende del diccionario de sesión), así que no se
-- puede usar directo en una columna generada ni en un índice. Esta envoltura
-- fija el diccionario y sí es IMMUTABLE.
create or replace function immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$
  select unaccent('unaccent', $1)
$$;

-- ─────────────────────────────────────────────────────────────────
-- trees: un árbol por investigación; todo lo demás cuelga de tree_id
-- ─────────────────────────────────────────────────────────────────
create table trees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- tree_members: quién accede a un árbol y con qué rol
-- ─────────────────────────────────────────────────────────────────
create table tree_members (
  tree_id     uuid not null references trees(id) on delete cascade,
  user_id     uuid not null, -- referenciará auth.users en Supabase
  role        text not null check (role in ('admin', 'editor', 'lector')),
  invited_at  timestamptz not null default now(),
  primary key (tree_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────
-- persons
-- ─────────────────────────────────────────────────────────────────
create table persons (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references trees(id) on delete cascade,
  sex             text check (sex in ('M', 'F', 'U')) default 'U',
  is_living       boolean not null default true,
  living_reason   text, -- por qué se marcó viva/fallecida: 'deat_record' | 'birth_over_100y' | 'manual'
  gedcom_uid      text, -- _UID o id original (@I1@) para reimportar sin duplicar
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tree_id, gedcom_uid)
);
create index idx_persons_tree on persons(tree_id);

-- ─────────────────────────────────────────────────────────────────
-- person_names: nombres (puede haber más de uno: nacimiento, casada, alias)
-- ─────────────────────────────────────────────────────────────────
create table person_names (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references persons(id) on delete cascade,
  name_type     text not null default 'birth' check (name_type in ('birth', 'married', 'alias', 'religious', 'other')),
  given_names   text,
  surname_pat   text, -- apellido paterno
  surname_mat   text, -- apellido materno
  prefix        text,
  suffix        text,
  display_name  text not null, -- nombre completo tal como se muestra
  search_key    text generated always as (
    lower(immutable_unaccent(coalesce(display_name, '')))
  ) stored,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index idx_person_names_person on person_names(person_id);
create index idx_person_names_search on person_names using gin (search_key gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────
-- families: una unión (matrimonio, convivencia, etc.)
-- ─────────────────────────────────────────────────────────────────
create table families (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  partner1_id   uuid references persons(id) on delete set null,
  partner2_id   uuid references persons(id) on delete set null,
  union_type    text default 'marriage' check (union_type in ('marriage', 'partnership', 'unknown')),
  gedcom_uid    text,
  created_at    timestamptz not null default now(),
  unique (tree_id, gedcom_uid)
);
create index idx_families_tree on families(tree_id);
create index idx_families_partner1 on families(partner1_id);
create index idx_families_partner2 on families(partner2_id);

-- ─────────────────────────────────────────────────────────────────
-- family_children: hijos de una familia, con tipo de filiación
-- ─────────────────────────────────────────────────────────────────
create table family_children (
  family_id     uuid not null references families(id) on delete cascade,
  child_id      uuid not null references persons(id) on delete cascade,
  filiation     text not null default 'biological' check (filiation in ('biological', 'adopted', 'foster', 'step', 'unknown')),
  primary key (family_id, child_id)
);
create index idx_family_children_child on family_children(child_id);

-- ─────────────────────────────────────────────────────────────────
-- places: lugares normalizados (jerarquía libre: comuna/provincia/etc.)
-- ─────────────────────────────────────────────────────────────────
create table places (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  raw_text      text not null, -- texto original del GEDCOM, tal cual
  normalized    text,          -- forma canónica elegida manualmente
  locality      text,
  admin1        text, -- provincia/región
  country       text,
  latitude      numeric,
  longitude     numeric,
  unique (tree_id, raw_text)
);

-- ─────────────────────────────────────────────────────────────────
-- events: hechos (nacimiento, defunción, matrimonio, etc.) de persona o familia
-- ─────────────────────────────────────────────────────────────────
create table events (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references trees(id) on delete cascade,
  person_id       uuid references persons(id) on delete cascade,
  family_id       uuid references families(id) on delete cascade,
  event_type      text not null, -- BIRT, DEAT, MARR, BURI, OCCU, EDUC, RESI, EVEN, DIV, ENGA, NATI...
  event_subtype   text, -- TYPE libre de GEDCOM (p.ej. 'Alternate Birth')
  date_text       text, -- fecha tal como viene en el GEDCOM ("ABT 1850", "28 SEP 1935")
  date_from       date, -- rango interpretado (inicio)
  date_to         date, -- rango interpretado (fin); igual a date_from si es exacta
  place_id        uuid references places(id) on delete set null,
  description     text, -- NOTE, CAUS u otro texto libre
  check (person_id is not null or family_id is not null)
);
create index idx_events_person on events(person_id);
create index idx_events_family on events(family_id);
create index idx_events_tree_type on events(tree_id, event_type);

-- ─────────────────────────────────────────────────────────────────
-- media / media_links: fotos y documentos, enlazables a persona/hecho/fuente
-- ─────────────────────────────────────────────────────────────────
create table media (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references trees(id) on delete cascade,
  storage_path    text not null, -- ruta en Storage o disco local
  original_url    text, -- URL original de MyHeritage, por trazabilidad
  mime_type       text,
  file_size       integer,
  title           text,
  crop_box        jsonb, -- recorte de rostro heredado de MyHeritage: {x1,y1,x2,y2}
  created_at      timestamptz not null default now()
);

create table media_links (
  media_id        uuid not null references media(id) on delete cascade,
  person_id       uuid references persons(id) on delete cascade,
  event_id        uuid references events(id) on delete cascade,
  source_id       uuid, -- fk a sources, declarada más abajo
  is_primary      boolean not null default false,
  check (person_id is not null or event_id is not null or source_id is not null)
);
create index idx_media_links_person on media_links(person_id);

-- ─────────────────────────────────────────────────────────────────
-- sources / citations: evidencia documental
-- ─────────────────────────────────────────────────────────────────
create table sources (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  title         text,
  author        text,
  repository    text,
  url           text,
  gedcom_uid    text,
  created_at    timestamptz not null default now(),
  unique (tree_id, gedcom_uid)
);

alter table media_links
  add constraint media_links_source_fk foreign key (source_id) references sources(id) on delete cascade;

create table citations (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references sources(id) on delete cascade,
  event_id        uuid references events(id) on delete cascade,
  person_name_id  uuid references person_names(id) on delete cascade,
  family_id       uuid references families(id) on delete cascade,
  page            text,
  transcription   text,
  confidence      smallint not null default 0 check (confidence between 0 and 3), -- 0=sin evaluar .. 3=alta
  created_at      timestamptz not null default now(),
  check (event_id is not null or person_name_id is not null or family_id is not null)
);
create index idx_citations_source on citations(source_id);

-- ─────────────────────────────────────────────────────────────────
-- research_tasks: pendientes de investigación
-- ─────────────────────────────────────────────────────────────────
create table research_tasks (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  person_id     uuid references persons(id) on delete set null,
  question      text not null,
  hypothesis    text,
  status        text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'dropped')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- gedcom_raw: etiquetas no reconocidas, para no perder nada al exportar
-- ─────────────────────────────────────────────────────────────────
create table gedcom_raw (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  person_id     uuid references persons(id) on delete cascade,
  family_id     uuid references families(id) on delete cascade,
  gedcom_tag    text not null,
  payload       jsonb not null, -- líneas crudas (nivel, tag, valor) tal como vinieron
  created_at    timestamptz not null default now()
);
