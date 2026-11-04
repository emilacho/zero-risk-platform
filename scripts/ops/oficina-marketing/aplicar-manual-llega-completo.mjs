/**
 * 04-nov · aplica `manual-llega-completo.mjs` sobre un RESPALDO FRESCO del flujo vivo (no sobre `vivo/`, que puede ir atrás del vivo):
 *   node aplicar-manual-llega-completo.mjs <manual|pedir|trabajo-manual|trabajo-alta|trabajo-turnos|plan-guarda|plan-guarda-fuente> <respaldo.json> <salida.json>
 * No toca la red: el respaldo se saca con `n8n-flujo.mjs respaldar` y la salida se publica con `n8n-flujo.mjs restaurar --ejecutar`.
 */
import fs from 'node:fs'
import { construirManualCompleto, construirPedirCambiosCompleto } from './manual-llega-completo.mjs'
import { construirTrabajoDeCadaLlamadaManual } from './trabajo-de-cada-llamada-manual.mjs'
import { construirTrabajoDeCadaLlamadaAlta } from './trabajo-de-cada-llamada-alta.mjs'
import { construirTrabajoDeCadaLlamadaTurnos } from './trabajo-de-cada-llamada-turnos.mjs'
import { construirSegundaMitadSinErrorCrudo } from './plan-segunda-mitad-sin-error-crudo.mjs'
import { construirTrabajoDeCadaLlamadaPlanPlataforma } from './trabajo-de-cada-llamada-plan-plataforma.mjs'
import { construirTrabajoDeCadaLlamadaPlan } from './trabajo-de-cada-llamada-plan.mjs'
import { construirArregloSintaxisRedactor } from './plan-arreglo-sintaxis-redactor.mjs'
import { construirCalendarioAlRedactor } from './plan-calendario-al-redactor.mjs'
import { construirPdfSinCitas } from './plan-pdf-sin-citas.mjs'
import { construirPlanPausaDeFinanzas } from './plan-pausa-de-finanzas.mjs'
import { construirTopesAlta, construirTopeLentes } from './topes-en-el-origen.mjs'
import { construirReescrituraRellenaLoGuardado } from './reescritura-rellena-lo-guardado.mjs'
import { construirJuezVeLoMismo } from './manual-juez-ve-lo-mismo.mjs'
import { construirManualTopeReal } from './manual-tope-real.mjs'
import { construirPlanSedeYFinanzasAbrir } from './plan-sede-y-finanzas-abrir.mjs'
import { construirPlanPaso0Siempre } from './plan-paso0-siempre.mjs'
import { construirPlanManualCompleto } from './plan-manual-completo.mjs'
import { construirPlanEsperaPdfYCierre } from './plan-espera-pdf-y-cierre.mjs'
import { corregirFuenteDeAprobacionDelDueno } from './plan-guarda-acepta-aprobacion-humana.mjs'
import { construirPlanMuereAvisandoYCerrando } from './plan-guarda-acepta-aprobacion-humana.mjs'
import { construirGuardaAceptaAprobacionHumana } from './plan-guarda-acepta-aprobacion-humana.mjs'

const [cual, entrada, salida] = process.argv.slice(2)
if (!['manual', 'pedir', 'trabajo-manual', 'trabajo-alta', 'trabajo-turnos', 'plan-guarda', 'plan-guarda-fuente', 'plan-espera', 'trabajo-plan', 'trabajo-plan-plataforma', 'segunda-mitad', 'plan-manual', 'plan-paso0', 'plan-sede-fin', 'manual-tope', 'juez-igual', 'reescritura-guardado', 'topes-alta', 'topes-lentes', 'plan-pausa', 'pdf-sin-citas', 'plan-arreglo-sintaxis', 'plan-calendario'].includes(cual) || !entrada || !salida) { console.error('uso: <manual|pedir> <respaldo.json> <salida.json>'); process.exit(1) }
const f = JSON.parse(fs.readFileSync(entrada, 'utf8'))
if (cual === 'manual') construirManualCompleto(f); else if (cual === 'pdf-sin-citas') construirPdfSinCitas(f); else if (cual === 'plan-arreglo-sintaxis') construirArregloSintaxisRedactor(f); else if (cual === 'plan-calendario') construirCalendarioAlRedactor(f); else if (cual === 'plan-pausa') construirPlanPausaDeFinanzas(f); else if (cual === 'topes-alta') construirTopesAlta(f); else if (cual === 'topes-lentes') construirTopeLentes(f); else if (cual === 'reescritura-guardado') construirReescrituraRellenaLoGuardado(f); else if (cual === 'juez-igual') construirJuezVeLoMismo(f); else if (cual === 'manual-tope') construirManualTopeReal(f); else if (cual === 'plan-sede-fin') construirPlanSedeYFinanzasAbrir(f); else if (cual === 'plan-paso0') construirPlanPaso0Siempre(f); else if (cual === 'plan-manual') construirPlanManualCompleto(f); else if (cual === 'segunda-mitad') construirSegundaMitadSinErrorCrudo(f); else if (cual === 'trabajo-plan-plataforma') construirTrabajoDeCadaLlamadaPlanPlataforma(f); else if (cual === 'trabajo-plan') construirTrabajoDeCadaLlamadaPlan(f); else if (cual === 'plan-espera') construirPlanEsperaPdfYCierre(f); else if (cual === 'plan-guarda-fuente') corregirFuenteDeAprobacionDelDueno(f); else if (cual === 'plan-guarda') { construirGuardaAceptaAprobacionHumana(f); construirPlanMuereAvisandoYCerrando(f) } else if (cual === 'trabajo-turnos') construirTrabajoDeCadaLlamadaTurnos(f); else if (cual === 'trabajo-alta') construirTrabajoDeCadaLlamadaAlta(f); else if (cual === 'trabajo-manual') construirTrabajoDeCadaLlamadaManual(f); else construirPedirCambiosCompleto(f)
fs.writeFileSync(salida, JSON.stringify(f, null, 2) + '\n')
console.log('ok →', salida)
