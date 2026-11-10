-- Una unión es solo pareja mientras nadie registre un matrimonio.
alter table families alter column union_type set default 'partnership';

-- Las que quedaron como «matrimonio» sin ningún matrimonio registrado pasan a pareja.
-- (Se pueden volver a marcar «Casados» desde la ficha, o al registrar el matrimonio.)
update families f
   set union_type = 'partnership'
 where f.union_type = 'marriage'
   and not exists (select 1 from events e where e.family_id = f.id and e.event_type = 'MARR');
