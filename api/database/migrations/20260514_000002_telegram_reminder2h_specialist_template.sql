UPDATE telegram_bot_settings
   SET templates = jsonb_set(
     jsonb_set(
       COALESCE(templates, '{}'::jsonb),
       '{uz,reminder2h}',
       CASE
         WHEN COALESCE(templates #>> '{uz,reminder2h}', '') IN (
           '',
           '{date} {time} da {service} darsingiz bor.',
           'Bugun {time} da {service} darsingiz bor.'
         )
         THEN to_jsonb('Bugun {time} da {service} darsingiz bor. Mutaxassis: {specialist}.'::text)
         ELSE templates #> '{uz,reminder2h}'
       END,
       true
     ),
     '{ru,reminder2h}',
     CASE
       WHEN COALESCE(templates #>> '{ru,reminder2h}', '') IN (
         '',
         '{date} в {time} у вас урок {service}.',
         'Сегодня в {time} у вас урок {service}.'
       )
       THEN to_jsonb('Сегодня в {time} у вас урок {service}. Специалист: {specialist}.'::text)
       ELSE templates #> '{ru,reminder2h}'
     END,
     true
   )
 WHERE COALESCE(templates #>> '{uz,reminder2h}', '') IN (
         '',
         '{date} {time} da {service} darsingiz bor.',
         'Bugun {time} da {service} darsingiz bor.'
       )
    OR COALESCE(templates #>> '{ru,reminder2h}', '') IN (
         '',
         '{date} в {time} у вас урок {service}.',
         'Сегодня в {time} у вас урок {service}.'
       );
