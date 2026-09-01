import { supabase } from './supabase';
import { calcularConsumoReceita } from './estoque';

type AjusteEstoqueVenda = {
  produtoId: string;
  vendaId?: string;
  quantidade: number;
  direcao: 'consumir' | 'reverter';
  atendente: string;
  motivo: string;
};

async function ajustarProduto(produtoId: string, quantidade: number, direcao: 'consumir' | 'reverter', atendente: string, motivo: string, tipoSaida: string, vendaId?: string) {
  const { data: produto, error: erroProduto } = await supabase.from('produtos').select('quantidade_estoque').eq('id', produtoId).single();
  if (erroProduto || !produto) throw erroProduto || new Error('Produto não encontrado.');

  const delta = direcao === 'consumir' ? -quantidade : quantidade;
  const estoqueAtualizado = Number(produto.quantidade_estoque) + delta;
  if (estoqueAtualizado < 0) throw new Error('Estoque insuficiente para concluir a operação.');

  const { error: erroAtualizacao } = await supabase.from('produtos').update({ quantidade_estoque: estoqueAtualizado }).eq('id', produtoId);
  if (erroAtualizacao) throw erroAtualizacao;

  const { error: erroMovimentacao } = await supabase.from('movimentacoes_estoque').insert([{
    produto_id: produtoId,
    quantidade: delta,
    tipo_movimento: direcao === 'consumir' ? tipoSaida : 'Entrada - Estorno Venda',
    motivo,
    atendente,
    venda_id: vendaId || null,
  }]);
  if (erroMovimentacao) throw erroMovimentacao;
}

async function ajustarInsumo(insumoId: string, quantidade: number, direcao: 'consumir' | 'reverter', atendente: string, motivo: string, tipoSaida: string, vendaId?: string) {
  const { data: insumo, error: erroInsumo } = await supabase.from('insumos').select('quantidade_estoque').eq('id', insumoId).single();
  if (erroInsumo || !insumo) throw erroInsumo || new Error('Insumo não encontrado.');

  const delta = direcao === 'consumir' ? -quantidade : quantidade;
  const estoqueAtualizado = Number(insumo.quantidade_estoque) + delta;
  if (estoqueAtualizado < 0) throw new Error('Estoque insuficiente para concluir a operação.');

  const { error: erroAtualizacao } = await supabase.from('insumos').update({ quantidade_estoque: estoqueAtualizado }).eq('id', insumoId);
  if (erroAtualizacao) throw erroAtualizacao;

  const { error: erroMovimentacao } = await supabase.from('movimentacoes_estoque').insert([{
    insumo_id: insumoId,
    quantidade: delta,
    tipo_movimento: direcao === 'consumir' ? tipoSaida : 'Entrada - Estorno Venda',
    motivo,
    atendente,
    venda_id: vendaId || null,
  }]);
  if (erroMovimentacao) throw erroMovimentacao;
}

/** Aplica a baixa ou reversão da venda para revenda, ingredientes e receitas-base. */
export async function ajustarEstoqueDaVenda(ajuste: AjusteEstoqueVenda): Promise<void> {
  if (ajuste.quantidade <= 0) throw new Error('A quantidade da venda deve ser maior que zero.');

  const { data: ficha, error: erroFicha } = await supabase
    .from('fichas_tecnicas')
    .select('id, rendimento_porcoes')
    .eq('produto_venda_id', ajuste.produtoId)
    .maybeSingle();
  if (erroFicha) throw erroFicha;

  if (!ficha) {
    await ajustarProduto(ajuste.produtoId, ajuste.quantidade, ajuste.direcao, ajuste.atendente, ajuste.motivo, 'Saída - Venda', ajuste.vendaId);
    return;
  }

  const { data: itensFicha, error: erroItensFicha } = await supabase
    .from('ficha_ingredientes')
    .select('produto_ingrediente_id, insumo_id, receita_base_id, quantidade_utilizada')
    .eq('ficha_id', ficha.id);
  if (erroItensFicha) throw erroItensFicha;

  for (const itemFicha of itensFicha || []) {
    const quantidadeConsumida = calcularConsumoReceita(ajuste.quantidade, Number(ficha.rendimento_porcoes), Number(itemFicha.quantidade_utilizada));
    if (itemFicha.insumo_id) {
      await ajustarInsumo(itemFicha.insumo_id, quantidadeConsumida, ajuste.direcao, ajuste.atendente, ajuste.motivo, 'Saída - Produção', ajuste.vendaId);
      continue;
    }

    // Compatibilidade temporária com fichas técnicas criadas antes da consolidação de insumos.
    if (itemFicha.produto_ingrediente_id) {
      await ajustarProduto(itemFicha.produto_ingrediente_id, quantidadeConsumida, ajuste.direcao, ajuste.atendente, ajuste.motivo, 'Saída - Produção', ajuste.vendaId);
      continue;
    }

    if (!itemFicha.receita_base_id) continue;
    const { data: base, error: erroBase } = await supabase.from('receitas_base').select('rendimento_peso').eq('id', itemFicha.receita_base_id).single();
    if (erroBase || !base) throw erroBase || new Error('Receita-base não encontrada.');
    const { data: itensBase, error: erroItensBase } = await supabase.from('receitas_base_itens').select('insumo_id, qtd_usada').eq('receita_base_id', itemFicha.receita_base_id);
    if (erroItensBase) throw erroItensBase;

    for (const itemBase of itensBase || []) {
      const quantidadeInsumo = calcularConsumoReceita(quantidadeConsumida, Number(base.rendimento_peso), Number(itemBase.qtd_usada));
      await ajustarInsumo(itemBase.insumo_id, quantidadeInsumo, ajuste.direcao, ajuste.atendente, ajuste.motivo, 'Saída - Produção', ajuste.vendaId);
    }
  }
}
