-- REVERSA de 202610312006 · cadena_config.planeacion.lista_de_control · 31-oct (CC#1) · NO APLICADA
-- Quita SOLO la clave `lista_de_control` del objeto; `redactor` (202610312001) e `indicacion` (202610312004) quedan intactos. Sin fila, no hace nada.
BEGIN;
UPDATE public.cadena_config
   SET valor = valor - 'lista_de_control',
       actualizado_en = now()
 WHERE clave = 'planeacion'
   AND jsonb_typeof(valor) = 'object'
   AND (valor ? 'lista_de_control');
COMMIT;
