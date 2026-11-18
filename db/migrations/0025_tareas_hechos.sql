-- Cada tarea de investigación puede ir ligada a los hechos marcados «por revisar» que resuelve,
-- para no mostrarlos dos veces: al tacharla se quita la marca del árbol.
alter table research_tasks add column if not exists event_ids uuid[] not null default '{}';
