// E67 (CC#1 2026-09-16) · la llave de despacho es fail-closed en el despachador:
// sin `SALA_DISPATCH_KEY` el ONBOARD no dispara. Los tests que ejercen el camino
// feliz necesitan UNA llave de prueba; los que prueban el cierre la borran a mano.
process.env.SALA_DISPATCH_KEY ??= 'test-dispatch-key-e67'
