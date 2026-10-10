-- Usuarios, sesiones, invitaciones e historial de cambios (edición en la app).
--
-- El login es propio: usuarios y contraseñas viven en esta misma base, sin
-- servicios externos. Las contraseñas se guardan con hash (scrypt) y de las
-- sesiones e invitaciones solo se guarda el hash del token: quien lea la base
-- no puede entrar como otra persona ni reusar un enlace de invitación.

create table users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  name            text not null,
  password_hash   text not null,
  -- Freno a quien prueba contraseñas: intentos fallidos seguidos y bloqueo temporal.
  failed_logins   integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

-- tree_members ya existía (0001) pero su user_id no apuntaba a nada.
alter table tree_members
  add constraint tree_members_user_fk foreign key (user_id) references users(id) on delete cascade;

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index idx_sessions_user on sessions(user_id);

-- Enlaces de un solo uso que genera el admin: invitar a alguien nuevo
-- ('invite') o dejar que alguien ponga una contraseña nueva ('reset').
create table invitations (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  kind          text not null default 'invite' check (kind in ('invite', 'reset')),
  email         text not null,
  role          text not null check (role in ('admin', 'editor', 'lector')),
  token_hash    text not null unique,
  invited_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz
);
create index idx_invitations_tree on invitations(tree_id);

-- Historial: quién cambió qué y cuándo, con el valor anterior y el nuevo.
create table change_log (
  id            bigint generated always as identity primary key,
  tree_id       uuid not null references trees(id) on delete cascade,
  user_id       uuid references users(id) on delete set null,
  user_name     text not null, -- se guarda aparte: sobrevive si se borra el usuario
  person_id     uuid references persons(id) on delete set null,
  person_name   text,
  entity        text not null check (entity in ('person', 'event')),
  entity_id     uuid,
  action        text not null check (action in ('create', 'update', 'delete')),
  before        jsonb,
  after         jsonb,
  created_at    timestamptz not null default now()
);
create index idx_change_log_tree on change_log(tree_id, created_at desc);
create index idx_change_log_person on change_log(person_id, created_at desc);

-- Una persona editada en la app queda marcada: desde ahí la app es la fuente
-- de verdad para ella y el importador de GEDCOM ya no la pisa.
alter table persons
  add column edited_at  timestamptz,
  add column edited_by  uuid references users(id) on delete set null;

alter table events
  add column origin      text not null default 'gedcom' check (origin in ('gedcom', 'manual')),
  add column updated_at  timestamptz,
  add column updated_by  uuid references users(id) on delete set null;
