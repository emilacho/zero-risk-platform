# Precios y carta por sede · mecanismo general (16-oct-2026)

Firma de Emilio (16-oct): cada sede tiene su forma de atender, cada fuente se asigna a una sede o a todas, y los precios de una sede nunca pisan los de otra. Esto es un **mecanismo general**: nada está escrito para un cliente; todo es dato por cliente (restaurante con 2 sedes, clínica con 3 consultorios, empresa B2B con 2 bodegas, cliente de una sola sede).

## 1 · El canal de cada sede
Valores: `local` (atiende en sitio) · `solo_entrega` (cocina oculta / despacho) · `ambos` · `sin_local` (online / B2B).

Orden en que se resuelve (el primero que exista):
1. `clients.config.apify.canal_por_sede[<clave de la sede>]` (lo llena el alta o el dueño);
2. el campo `tipo_de_atencion` de la ficha de la sede (texto libre: «solo domicilio», «restaurante y domicilio», «consultorio», «venta online»…);
3. **deducido** (y se rotula así): sin dato, se asume atención en local; si el rubro no compite por cercanía (software, finanzas, apps…), `sin_local`.

Qué cambia según el canal: el radio de competencia. `solo_entrega` → radio de reparto; `local` → radio de local; `ambos` → el mayor de los dos; `sin_local` → no se compite por cercanía (como ya pasaba por rubro). Los radios siguen siendo dato por familia de rubro (`RADIO_POR_FAMILIA_KM`).

## 2 · De qué sede es cada fuente
`clients.config.apify.fuentes_por_sede`, por tipo de fuente:

```json
{
  "sitio_web": "centro",
  "ficha_de_mapas": ["centro", "norte"],
  "reparto": "todas",
  "redes": { "micuenta": "norte", "*": "todas" },
  "punto_de_venta": { "Tienda Centro": "centro", "Cocina Norte": "norte" }
}
```

- Tipos: `sitio_web` · `punto_de_venta` (por tienda) · `ficha_de_mapas` · `redes` (por cuenta) · `reparto` (por dominio).
- Valor: una clave de sede, una lista, `"todas"`, o un objeto `{ <detalle>: <valor> }` (el nombre exacto manda; si no hay exacto, el más largo que lo contiene; `"*"` cubre el resto de los nombres).
- **Sin asignación = todas las sedes.** Un cliente con una sola sede no necesita nada y funciona igual que antes.
- Una asignación a una sede que no existe se **declara** (`declarado_sedes` en el rastro de la corrida) y la fuente queda en «todas»: nunca se pierde.

## 3 · Qué hace con las fichas
- Una ficha de una fuente asignada lleva su sede en la columna `sede` y en `provenance_tag.datos` (`sede`, `sedes`); su título dice «· sede X» y su `ref` termina en `:s:<sede>`.
- «Lo vigente» de un atributo se busca **dentro de la misma sede**: el precio de «Ceviche mixto» de una sede nunca reemplaza al de otra (no es una contradicción). Lo que no tiene sede (anterior a la asignación) lo **adopta** la primera lectura con sede (se retira con su motivo).
- Las ventas del punto de venta por tienda llevan la sede de esa tienda; el total del negocio no es de una sede.
- El resumen vivo muestra los precios **por sede** (cada línea con la suya) cuando alguna ficha tiene sede; si ninguna la tiene, queda como siempre.
- Las fichas **ya guardadas** se reasignan versionando (ficha nueva con `version_de`, la anterior retirada con motivo y fecha; nada se borra): `scripts/ops/asignar-fuentes-a-sedes.ts` (seco por omisión; con `--escribir` guarda la config con respaldo y reasigna). Es idempotente.

## 4 · El mapa de productos se decide por nombre
`mapa-de-items.ts` ya no usa el precio. Exacta · sinónimo (mismas palabras que distinguen el producto) · **probable** (variante de forma —tamaño, entrega— de un solo ítem, o forma abreviada de un solo ítem) · dudosa (varios candidatos, o agrega un ingrediente/sabor) · sin equivalente. El `_meta` del mapa dice `criterio: solo_por_nombre` y a qué sede(s) pertenece la carta con la que se armó.

## 5 · Pruebas
`__tests__/precios-por-sede.test.ts` (36): canal, fuente→sede, vigencia por sede, restaurante / clínica / B2B / cliente de una sede, resumen por sede, tiendas del punto de venta, reasignación (plan, versión, aplicar, fallas), y la **guarda**: ningún nombre de cliente, ciudad o sede en el código del portero (se leen los `.ts` sin comentarios). Mutación: 52 mutantes, 0 vivos.
