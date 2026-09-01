export type CompraEmbalada = {
  quantidadeEmbalagens: number;
  quantidadePorEmbalagem: number;
  valorTotalPago: number;
  fatorCorrecao?: number;
};

export function calcularCompraEmbalada(compra: CompraEmbalada) {
  const quantidadeEmbalagens = Number(compra.quantidadeEmbalagens);
  const quantidadePorEmbalagem = Number(compra.quantidadePorEmbalagem) || 1;
  const valorTotalPago = Number(compra.valorTotalPago);
  const fatorCorrecao = Number(compra.fatorCorrecao) || 1;

  if (quantidadeEmbalagens <= 0 || quantidadePorEmbalagem <= 0 || valorTotalPago < 0) {
    throw new Error('Dados inválidos para compra em embalagem.');
  }

  const quantidadeEstoque = quantidadeEmbalagens * quantidadePorEmbalagem;
  return {
    quantidadeEstoque,
    custoUnitario: (valorTotalPago / quantidadeEstoque) * fatorCorrecao,
  };
}

export function calcularConsumoReceita(quantidadeVendida: number, rendimentoPorcoes: number, quantidadePorReceita: number): number {
  if (quantidadeVendida < 0 || rendimentoPorcoes <= 0 || quantidadePorReceita < 0) {
    throw new Error('Dados inválidos para consumo de receita.');
  }
  return (quantidadeVendida / rendimentoPorcoes) * quantidadePorReceita;
}
