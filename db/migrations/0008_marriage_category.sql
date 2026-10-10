-- MyHeritage exportaba el matrimonio de algunas parejas como "MARS" (en
-- GEDCOM, capitulaciones): se pasa a matrimonio (MARR), que es lo que son en
-- este archivo, para que salgan como "Matrimonio" y cuenten como tal al
-- agregar uno nuevo. Si la pareja ya tiene un matrimonio, se deja como está.
update events e
   set event_type = 'MARR'
 where e.event_type = 'MARS'
   and e.family_id is not null
   and not exists (
     select 1 from events m where m.family_id = e.family_id and m.event_type = 'MARR'
   );
