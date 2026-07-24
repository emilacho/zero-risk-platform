@echo off
REM RedAquario · shim que hace pasar al stand-in por el ejecutable `claude` (misma firma de args).
REM $0 · no llama a ninguna API. Se usa SOLO en la prueba viva.
node "%~dp0stand-in-cc.js" %*
