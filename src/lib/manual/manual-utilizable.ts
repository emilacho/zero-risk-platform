/**
 * MANUAL UTILIZABLE · la ÚNICA regla de «este manual se puede usar para producir» (GO Lenovo 2026-11-10 18:14Z).
 * La lógica vive en `manual-utilizable-logica.js` (JS puro) porque las guardas de n8n pegan ESE MISMO texto; aquí solo se le pone tipo.
 * Aprobado = pasó la vara automática O lo validó el dueño. Una validación de la jefatura sola no cuenta.
 * (No confundir con `planEsperaAlManual` de `manual-primero.ts`: esa es la firma de Emilio del 3-nov, «el plan espera a que el DUEÑO apruebe», otra decisión.)
 */
export interface ManualUtilizable { utilizable: boolean; por: 'vara' | 'dueno' | null; motivo: string }
interface Logica { manualUtilizable(m: unknown): ManualUtilizable }
const L = require('./manual-utilizable-logica.js') as Logica

export const manualUtilizable = (fila: unknown): ManualUtilizable => L.manualUtilizable(fila)
