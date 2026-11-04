# Para SOLO la plataforma del doble chequeo: el proceso con «dev -p 4200» y sus hijos. Nunca por nombre genérico: otros empleados tienen sus propios servidores.
$todos = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
foreach ($p in ($todos | Where-Object { $_.CommandLine -match 'next dev -p 4200' })) {
  foreach ($h in ($todos | Where-Object { $_.ParentProcessId -eq $p.ProcessId })) { Stop-Process -Id $h.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
