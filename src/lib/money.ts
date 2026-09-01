export type MetodoPagamento = 'PIX' | 'Dinheiro' | 'Cartão de Crédito' | 'Cartão de Débito' | 'Transferência';

export type Pagamento = {
  metodo: MetodoPagamento;
  valor: number;
};

export type PagamentoApurado = {
  aprovado: boolean;
  erro?: string;
  totalRecebido: number;
  troco: number;
  pix: number;
  dinheiro: number;
  credito: number;
  debito: number;
  transferencia: number;
  metodos: string;
};

const paraCentavos = (valor: number) => Math.round((Number(valor) || 0) * 100);
const deCentavos = (valor: number) => valor / 100;

/**
 * Normaliza pagamentos para o valor efetivamente recebido pela operação.
 * Troco só pode vir de dinheiro: pagamentos digitais devem somar exatamente
 * o valor devido, pois não há estorno automático de PIX/cartão no checkout.
 */
export function apurarPagamentos(total: number, pagamentos: Pagamento[]): PagamentoApurado {
  const totalCentavos = paraCentavos(total);
  const base: PagamentoApurado = {
    aprovado: false,
    totalRecebido: 0,
    troco: 0,
    pix: 0,
    dinheiro: 0,
    credito: 0,
    debito: 0,
    transferencia: 0,
    metodos: '',
  };

  if (totalCentavos < 0) return { ...base, erro: 'O total não pode ser negativo.' };
  if (pagamentos.length === 0) return { ...base, erro: 'Informe uma forma de pagamento.' };

  const porMetodo = new Map<MetodoPagamento, number>();
  for (const pagamento of pagamentos) {
    const valor = paraCentavos(pagamento.valor);
    if (valor < 0) return { ...base, erro: 'Nenhum pagamento pode ser negativo.' };
    if (valor === 0) continue;
    porMetodo.set(pagamento.metodo, (porMetodo.get(pagamento.metodo) || 0) + valor);
  }

  const totalRecebido = [...porMetodo.values()].reduce((soma, valor) => soma + valor, 0);
  if (totalRecebido < totalCentavos) {
    return { ...base, totalRecebido: deCentavos(totalRecebido), erro: 'O pagamento é menor que o total da operação.' };
  }

  const dinheiroInformado = porMetodo.get('Dinheiro') || 0;
  const totalDigital = totalRecebido - dinheiroInformado;
  if (totalDigital > totalCentavos) {
    return {
      ...base,
      totalRecebido: deCentavos(totalRecebido),
      erro: 'Pagamentos digitais não podem exceder o total. O troco deve ser informado em dinheiro.',
    };
  }

  const troco = totalRecebido - totalCentavos;
  const dinheiroEfetivo = dinheiroInformado - troco;
  const metodos = [...porMetodo.keys()].join(' + ');

  return {
    aprovado: true,
    totalRecebido: deCentavos(totalRecebido),
    troco: deCentavos(troco),
    pix: deCentavos(porMetodo.get('PIX') || 0),
    dinheiro: deCentavos(dinheiroEfetivo),
    credito: deCentavos(porMetodo.get('Cartão de Crédito') || 0),
    debito: deCentavos(porMetodo.get('Cartão de Débito') || 0),
    transferencia: deCentavos(porMetodo.get('Transferência') || 0),
    metodos,
  };
}

export function valoresIguais(valorA: number, valorB: number): boolean {
  return paraCentavos(valorA) === paraCentavos(valorB);
}
