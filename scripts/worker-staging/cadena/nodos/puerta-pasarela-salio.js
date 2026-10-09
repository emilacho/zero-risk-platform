// PASARELA · ¿SALIÓ? · si el reenvío a la parte original falla, NO se traga el sobre: falla ruidosa (la sala lo ve como `webhook_failed` y reintenta, como hoy)
const r = $input.first().json || {}
const status = Number(r.statusCode)
if (!(status >= 200 && status < 300)) throw new Error('PUERTA_PASARELA_FALLO · la parte original no aceptó el sobre (HTTP ' + String(r.statusCode) + ') · el sobre NO se perdió en silencio')
return [{ json: { resultado: 'pasarela_ok', http: status } }]
