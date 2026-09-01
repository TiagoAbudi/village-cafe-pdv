import { describe, expect, it } from 'vitest';
import { calcularCompraEmbalada, calcularConsumoReceita } from '../lib/estoque';

describe('cálculos de estoque', () => {
  it('calcula estoque e custo por unidade de uma compra em embalagens', () => {
    expect(calcularCompraEmbalada({ quantidadeEmbalagens: 2, quantidadePorEmbalagem: 12, valorTotalPago: 120 })).toEqual({
      quantidadeEstoque: 24,
      custoUnitario: 5,
    });
  });

  it('calcula consumo proporcional de receita', () => {
    expect(calcularConsumoReceita(3, 10, 500)).toBe(150);
  });
});
