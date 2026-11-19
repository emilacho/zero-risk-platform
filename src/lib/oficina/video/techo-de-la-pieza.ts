/**
 * 19-nov · G5 · EL TECHO DE LA PIEZA DE VIDEO (GO Lenovo 03:26Z · pregunta de Emilio «¿y si un cliente pide miniseries?»).
 *
 * La duración de una pieza la decide la pieza (el brief y la mesa, dentro de `limites.video.segundos_min/max` de la plantilla). Lo que NO se puede pasar es
 * lo que aguanta la cadena por donde sale el video; aquí queda el más bajo, leído en el código de cada tramo (nada inventado):
 *  · el render de la composición (`services/render-html/src/logica.ts` · `LIMITES.segundos_max` = 120 s; 12 min de render como mucho) ← EL MÁS BAJO
 *  · el unidor de planos (`services/agent-runner/src/lib/video-unir.ts`): hasta 30 clips de hasta 30 s (900 s); ffmpeg tiene 300 s para unir y la plataforma espera 600 s
 *  · el clip del proveedor: lo dice la ficha del modelo (`video/parametros.ts`, Seedance 2.5 = 4–30 s): un plano más largo se rechaza plano por plano
 *  · el dinero: los topes crecen por segundo de la pieza más larga; a 120 s caben en el techo de la base (`TOPE_MAXIMO_DEL_SOBRE_USD`), lo prueba `g5-video-largo`
 * 🟡 SIN MEDIR (se mide sin gastar en el proveedor, uniendo en Railway clips que ya están guardados): cuánto tarda ffmpeg en unir 120 s y si el mp4 cabe en el almacén.
 * Si la medición da menos, este número baja a lo medido.
 */
export const TECHO_DE_LA_PIEZA_S = 120
