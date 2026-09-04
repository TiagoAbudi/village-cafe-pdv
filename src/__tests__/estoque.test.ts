import { describe, expect, it } from 'vitest';
import { calcularCompraEmbalada, calcularConsumoReceita, converterQuantidadeParaEstoque, unidadesCompativeis } from '../lib/estoque';

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

  it('converte peso e volume para a unidade de controle do estoque', () => {
    expect(converterQuantidadeParaEstoque(432, 'g', 'kg')).toBeCloseTo(0.432);
    expect(converterQuantidadeParaEstoque(750, 'ml', 'l')).toBeCloseTo(0.75);
    expect(unidadesCompativeis('kg')).toEqual(['kg', 'g']);
  });

  it('bloqueia unidades incompatíveis', () => {
    expect(() => converterQuantidadeParaEstoque(1, 'un', 'kg')).toThrow('não é compatível');
  });
});
