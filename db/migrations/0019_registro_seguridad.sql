-- Registro de seguridad: entradas, intentos fallidos y acciones de administración
-- (invitaciones, cambios de rol, accesos quitados). También sirve para limitar los
-- intentos de entrada por conexión (IP). Se lee desde Administración.
create table if not exists security_log (
  id          bigserial   primary key,
  created_at  timestamptz not null default now(),
  event       text        not null,
  user_id     uuid        references users(id) on delete set null,
  email       text,
  ip          text,
  detail      jsonb
);
create index if not exists security_log_ip_idx on security_log (ip, created_at);
create index if not exists security_log_created_idx on security_log (created_at desc);
alter table security_log enable row level security;
