-- Encargo 6 · 18-nov · comentarios de la industria en el MISMO lugar que los de la competencia (un solo lugar para comentarios).
-- Aditiva: las filas de hoy quedan `nivel='competencia'`. Las nuevas de la industria llevan su capa, su vía y su vigencia.
-- El paso `comentarios_industria` entra a la lista de pasos diarios (se publica APAGADO: PORTERO_COMENTARIOS_INDUSTRIA).

alter table public.cerebro_comentarios_competencia
  add column if not exists nivel text not null default 'competencia',
  add column if not exists capa text,
  add column if not exists via text,
  add column if not exists vigente_hasta timestamptz;

alter table public.cerebro_comentarios_competencia drop constraint if exists cerebro_comentarios_competencia_nivel_check;
alter table public.cerebro_comentarios_competencia add constraint cerebro_comentarios_competencia_nivel_check check (nivel in ('competencia', 'industria'));

alter table public.cerebro_comentarios_competencia drop constraint if exists cerebro_comentarios_competencia_red_check;
alter table public.cerebro_comentarios_competencia add constraint cerebro_comentarios_competencia_red_check check (red in ('tiktok', 'instagram', 'x', 'facebook', 'youtube'));

-- la industria se lee por cliente, nivel y red (la última lectura por red decide si toca esta semana)
create index if not exists cerebro_comentarios_competencia_nivel on public.cerebro_comentarios_competencia (client_id, nivel, red, observado_en desc);

alter table public.cerebro_pasos_diarios drop constraint if exists cerebro_pasos_diarios_paso_check;
alter table public.cerebro_pasos_diarios add constraint cerebro_pasos_diarios_paso_check check (paso in (
  'cuentas_y_comentarios', 'tendencias', 'bodega', 'transcripcion',
  'anuncios_google', 'busquedas_google', 'horas_de_mas_gente', 'eventos_locales', 'comentarios_ig_fb', 'foros',
  'comentarios_industria'
));
