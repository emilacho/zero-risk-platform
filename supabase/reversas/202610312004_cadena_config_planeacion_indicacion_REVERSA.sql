-- REVERSA de 202610312004 · cadena_config.planeacion.indicacion · 31-oct (CC#1) · NO APLICADA
-- Quita SOLO la clave `indicacion` del objeto; el `redactor` (202610312001) queda intacto. Sin fila, no hace nada.
BEGIN;
UPDATE public.cadena_config
   SET valor = valor - 'indicacion',
       actualizado_en = now()
 WHERE clave = 'planeacion'
   AND jsonb_typeof(valor) = 'object'
   AND (valor ? 'indicacion');
COMMIT;
