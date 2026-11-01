/**
 * 01-nov · EQUIPO DEL MANUAL · parte 1 · las palabras «prohibidas» del manual llevan su INTENCIÓN (contrato de CC1, 01-nov).
 * Flujo `ssLtwYPt7zxuvnM2` (onboarding · brand book). Cambia SOLO dos nodos:
 *   · «[BB] Fan-out prep» · la sección del editor pide, además de `forbidden_words[]` (que sigue plana), `palabras_con_intencion[]`: objetos
 *     `{ texto, intencion: 'estilo'|'legal', fuente?: { cita, origen }, porque }`. Por defecto `estilo`; `legal` solo con la cita literal de la evidencia; `del_dueno` nunca
 *     (solo lo declara el dueño). Superlativos y promesas genéricas no van aquí (regla E3 del manual).
 *   · «[BB] Consolidador» · une las tres lentes (como `_listaUnion`), sanea cada objeto (intención fuera del enum, `legal` sin cita ⇒ `estilo`; cualquier `del_dueno` de una lente ⇒ `estilo`),
 *     deduplica sin distinguir mayúsculas (si dos lentes la nombran, gana la `legal` con cita) y, si una palabra con intención no está en `forbidden_words`, la AGREGA ahí (solo agrega).
 * «[BB] Promote prep» NO cambia: ya manda el borrador entero dentro de `brand_book` (`Object.assign({}, draft, …)`), así `palabras_con_intencion` viaja a `POST /api/brand-book/{cliente}`.
 * Sin la clave nueva en las lentes, el resultado es idéntico a hoy (lista vacía).
 */
import { cambiarCodigo } from './lib.mjs'

export const INTENCIONES = ['estilo', 'legal', 'del_dueno']

const ANCLA_SECCION = "  + ' + mensajes_clave[] (3-5 · desde los dolores/objetivos del ICP + el positioning).' + _FRASE_EJ_R62;"
const SECCION_NUEVA = `  + ' + mensajes_clave[] (3-5 · desde los dolores/objetivos del ICP + el positioning).'
  + ' + palabras_con_intencion[] (OPCIONAL · para las palabras de forbidden_words que merezcan contexto · cada una un objeto { texto, intencion, porque }.'
  + ' intencion es "estilo" salvo que la EVIDENCIA traiga la cita literal de una norma o regla: entonces "legal" y agrega fuente { cita, origen }.'
  + ' NUNCA marques "del_dueno" · eso solo lo declara el dueño. Los superlativos y las promesas genéricas (el mejor, único, garantizado) NO van en esta lista).' + _FRASE_EJ_R62;`

const ANCLA_UNION = `const brandBookDraft = {`
const FUNCION_UNION = `// PALABRAS CON INTENCIÓN (01-nov · contrato de CC1) · une las 3 lentes, sanea y deduplica. Solo AGREGA: sin la clave nueva en ninguna lente, la lista queda vacía y todo igual que hoy.
const _intencionSana = (o) => {
  const t = String(o.texto == null ? '' : o.texto).trim();
  if (!t) return null;
  const f = (o.fuente && typeof o.fuente === 'object') ? o.fuente : null;
  const cita = f ? String(f.cita == null ? '' : f.cita).trim() : '';
  let i = String(o.intencion == null ? '' : o.intencion).trim().toLowerCase();
  if (i !== 'legal' && i !== 'del_dueno') i = 'estilo';
  if (i === 'legal' && !cita) i = 'estilo';
  if (i === 'del_dueno') i = 'estilo'; // un agente NO fabrica un bloqueo «del dueño»: ese entra solo por la puerta del dueño (POST /api/tablero/manual-palabra)
  const out = { texto: t, intencion: i, porque: String(o.porque == null ? '' : o.porque).trim() };
  if (i !== 'estilo' && f) out.fuente = f;
  return out;
};
const _palabrasConIntencion = () => {
  const vistos = new Map(); const out = [];
  for (const l of [editor, strat, cs]) {
    const arr = (l.structured && l.structured.palabras_con_intencion) || [];
    if (!Array.isArray(arr)) continue;
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const s = _intencionSana(raw);
      if (!s) continue;
      const k = s.texto.toLowerCase();
      if (!vistos.has(k)) { vistos.set(k, out.length); out.push(s); continue; }
      const previa = out[vistos.get(k)];
      if (previa.intencion === 'estilo' && s.intencion !== 'estilo') out[vistos.get(k)] = s;
    }
  }
  return out;
};
const _pci = _palabrasConIntencion();
const _forbiddenUnion = (() => {
  const base = _listaUnion('forbidden_words'); const vistos = new Set(base.map((x) => x.toLowerCase()));
  for (const p of _pci) { if (!vistos.has(p.texto.toLowerCase())) { vistos.add(p.texto.toLowerCase()); base.push(p.texto); } }
  return base;
})();

const brandBookDraft = {`

const ANCLA_FORBIDDEN = `  forbidden_words: _listaUnion('forbidden_words'),`
const FORBIDDEN_NUEVO = `  forbidden_words: _forbiddenUnion,
  palabras_con_intencion: _pci,`

export function construirPalabrasConIntencion(f) {
  cambiarCodigo(f, '[BB] Fan-out prep', ANCLA_SECCION, SECCION_NUEVA)
  cambiarCodigo(f, '[BB] Consolidador', ANCLA_UNION, FUNCION_UNION)
  cambiarCodigo(f, '[BB] Consolidador', ANCLA_FORBIDDEN, FORBIDDEN_NUEVO)
}
