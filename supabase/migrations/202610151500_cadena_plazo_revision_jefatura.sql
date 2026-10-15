-- J7 · brief / plan en SECO · el plazo de la espera «antes de pasar» · CC#1 · 2026-10-15 · PROPUESTA · NO APLICADA
-- 🔴 UNA FILA de datos en `cadena_plazos` (nada de esquema, sin tablas nuevas). Sin ella `abrirEsperaDe` FALLA FUERTE («no se crea una espera sin reloj»): la cadena no retiene a ciegas.
-- 🔴 Solo se usa si la jefatura abre una revisión de la estrategia o del calendario; con la jefatura apagada nadie crea una espera de este tipo (la cadena es la de siempre).
-- 🔴 Al vencer, la cadena SIGUE (`pasar_sin_revision`) y se avisa: la jefatura nunca deja a una campaña de rehén. Números = PROPUESTA (no medidos), se cambian con un UPDATE.
-- REVERSA: supabase/reversas/202610151500_cadena_plazo_revision_jefatura_REVERSA.sql (se niega si hay esperas de este tipo).
BEGIN;

INSERT INTO public.cadena_plazos (tipo, recordatorio_horas, alerta_horas, vence_horas, vence_regla, accion_al_vencer, descripcion) VALUES
  ('revision_jefatura', 4, 12, 24, NULL, 'pasar_sin_revision', 'La jefatura revisa la estrategia o el calendario ENTRE guardar y pasar. Al vencer sin cierre la cadena sigue sin la revisión y se avisa; nunca queda esperando para siempre.')
ON CONFLICT (tipo) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
