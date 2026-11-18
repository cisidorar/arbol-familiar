-- Cada foto subida a una tarea puede quedar ligada a uno de los enlaces de la tarea (null = de la tarea en general).
alter table research_task_images add column if not exists link_url text;
