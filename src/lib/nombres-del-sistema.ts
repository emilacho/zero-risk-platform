/**
 * 10-nov · los nombres propios del sistema, en UN solo lugar (`raw/tasks/2026-11-10-RESPUESTA-LENOVO-a-CC1-CC4-CC6-nombres-de-departamentos.md`,
 * Emilio 09-nov 23:29Z). Nadie los escribe a mano: la ficha de decisión y quien los necesite los lee de aquí.
 * Se escriben con mayúscula en cada palabra principal. `corto` es lo que va cuando el completo no cabe; nunca «Financiero» ni «Plan de 90 días».
 */
export const DEPARTAMENTOS = {
  marketing: { oficina: 'marketing', nombre: 'Departamento de Marketing', corto: 'Marketing' },
  finanzas: { oficina: 'finanzas', nombre: 'Departamento de Finanzas', corto: 'Finanzas' },
} as const
/** 10-nov · el plan se llama «Plan de Marketing» (regla de nombres de Emilio 09-nov; Lenovo en `RESPUESTA-LENOVO-a-CC4-CC1-CC6-310-aprobado-con-ajustes.md`). Nunca «plan de 90 días» en lo que lee Emilio */
export const PLAN_DE_MARKETING = 'Plan de Marketing'
export type ClaveDeDepartamento = keyof typeof DEPARTAMENTOS
export type Departamento = (typeof DEPARTAMENTOS)[ClaveDeDepartamento]

/** las oficinas que pertenecen a cada departamento (la clave, sin tildes ni «oficina de») */
export const DEPARTAMENTO_DE_LA_OFICINA: Record<string, ClaveDeDepartamento> = {
  financiera: 'finanzas', finanzas: 'finanzas',
  marketing: 'marketing', planeacion: 'marketing', creativa: 'marketing',
}
