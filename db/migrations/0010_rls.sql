-- Seguridad en Supabase: sus tablas del esquema public se exponen por defecto
-- con una API pública (PostgREST) que cualquiera con la clave "anon" puede leer.
-- Esta app no usa esa API: se conecta directo con el rol postgres, que se salta
-- RLS. Activar RLS SIN políticas deja a anon/authenticated sin acceso a nada.
-- (En Postgres local no tiene efecto práctico: el dueño de la tabla la ignora.)
-- Si algún día se agrega una tabla nueva, activarle RLS igual:
--   alter table <tabla> enable row level security;
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
