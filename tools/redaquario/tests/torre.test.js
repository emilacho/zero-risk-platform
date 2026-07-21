// RedAquario · tests de la TORRE DE CONTROL (spec §Pieza B).
// Congela la silueta §144 de cada ping + valida cronómetros mecánicos.

import { describe, it, expect } from 'vitest';
import {
  Torre, pingDespego, pingAterrizo, pingTodosEnTierra,
  pingDemorado, pingColgado, pingDecision, pingCosto, fmtUsd,
} from '../lib/torre.js';

describe('Catálogo de pings · silueta fija §144', () => {
  it('🛫 despegó', () => {
    expect(pingDespego('CC#3', 'RedAquario', '14:05')).toBe('🛫 CC#3 · RedAquario · despegó 14:05');
  });
  it('🛬 aterrizó con costo', () => {
    expect(pingAterrizo('CC#1', 'apify', 'PR listo', 0)).toBe('🛬 CC#1 · apify · aterrizó OK · PR listo · $0.00');
  });
  it('⚠️ demorado', () => {
    expect(pingDemorado('CC#2', 35)).toBe('⚠️ CC#2 · demorado · sin señal hace 35 min');
  });
  it('🔴 colgado', () => {
    expect(pingColgado('CC#3', 'esperando GO', 'decisión Emilio')).toBe('🔴 CC#3 · colgado · esperando GO · requiere decisión Emilio');
  });
  it('🔔 decisión', () => {
    expect(pingDecision('gasto $8', 'A/B')).toBe('🔔 DECISIÓN · gasto $8 · A/B');
  });
  it('💰 costo', () => {
    expect(pingCosto('spend $3.20 hoy')).toBe('💰 spend $3.20 hoy');
  });
  it('✅ todos en tierra', () => {
    const t = pingTodosEnTierra([{ cc: 'CC#1', resumen: 'ok' }, { cc: 'CC#3', resumen: 'ok' }], 'veredicto');
    expect(t).toContain('✅ TODOS EN TIERRA · 2 vuelos');
    expect(t).toContain('próximo: veredicto');
  });
  it('fmtUsd tolera basura → 0.00', () => {
    expect(fmtUsd(undefined)).toBe('0.00');
    expect(fmtUsd(1.5)).toBe('1.50');
  });
});

describe('Torre · registro de vuelos + cronómetros', () => {
  const NOW = 1784662200;

  it('despego abre vuelo · aterrizo lo cierra', () => {
    const t = new Torre({ cronometro_demora_min: 30 });
    t.despego('CC#3', 'tarea', NOW);
    expect(t.vuelosAbiertos()).toHaveLength(1);
    t.aterrizo('CC#3', 'listo', 2.0, NOW + 60);
    expect(t.vuelosAbiertos()).toHaveLength(0);
  });

  it('tick emite ⚠️ una sola vez tras superar el umbral', () => {
    const t = new Torre({ cronometro_demora_min: 30 });
    t.despego('CC#3', 'tarea', NOW);
    expect(t.tick(NOW + 10 * 60)).toHaveLength(0);          // 10 min · aún no
    const p1 = t.tick(NOW + 31 * 60);
    expect(p1).toHaveLength(1);                              // 31 min · demorado
    expect(p1[0].texto).toContain('⚠️ CC#3');
    expect(t.tick(NOW + 40 * 60)).toHaveLength(0);          // no re-avisa
  });

  it('colgado retira el vuelo y devuelve el ping 🔴', () => {
    const t = new Torre({});
    t.despego('CC#2', 'tarea', NOW);
    const p = t.colgado('CC#2', 'proceso murió sin reporte', 'revisión');
    expect(p).toContain('🔴 CC#2');
    expect(t.vuelosAbiertos()).toHaveLength(0);
  });
});
