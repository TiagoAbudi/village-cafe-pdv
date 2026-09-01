import { describe, expect, it } from 'vitest';
import { apurarPagamentos, valoresIguais } from '../lib/money';

describe('apurarPagamentos', () => {
  it('aceita pagamento digital exato', () => {
    expect(apurarPagamentos(20, [{ metodo: 'PIX', valor: 20 }])).toMatchObject({
      aprovado: true, pix: 20, dinheiro: 0, troco: 0,
    });
  });

  it('aceita troco somente em dinheiro', () => {
    expect(apurarPagamentos(20, [{ metodo: 'Dinheiro', valor: 50 }])).toMatchObject({
      aprovado: true, dinheiro: 20, troco: 30,
    });
  });

  it('rejeita excesso em meio digital', () => {
    expect(apurarPagamentos(20, [{ metodo: 'PIX', valor: 25 }])).toMatchObject({ aprovado: false });
  });

  it('rejeita pagamento insuficiente', () => {
    expect(apurarPagamentos(20, [{ metodo: 'Dinheiro', valor: 19.99 }])).toMatchObject({ aprovado: false });
  });

  it('não sofre com imprecisão decimal', () => {
    expect(valoresIguais(0.1 + 0.2, 0.3)).toBe(true);
  });
});
