-- Dónde se resuelve cada tarea de investigación: familysearch, registro_civil, familia, internet, app o cuidado.
alter table research_tasks add column if not exists channel text not null default 'familysearch';
