import { describe, expect, it } from 'vitest';
import { dataRecorrente, limitesDoDiaLocal } from '../lib/datas';

describe('datas recorrentes', () => {
  it('limita vencimento ao último dia de fevereiro', () => {
    expect(dataRecorrente(2026, 1, 31)).toBe('2026-02-28');
  });

  it('considera ano bissexto', () => {
    expect(dataRecorrente(2028, 1, 31)).toBe('2028-02-29');
  });

  it('cria limites explícitos para o dia comercial brasileiro', () => {
    expect(limitesDoDiaLocal('2026-08-31')).toEqual({
      inicio: '2026-08-31T00:00:00-03:00',
      fim: '2026-08-31T23:59:59.999-03:00',
    });
  });
});
