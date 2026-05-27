import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

type ProdutoVenda = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; is_receita: boolean; };
type ItemCarrinho = { produto: ProdutoVenda; quantidade: number; };
type PagamentoMisto = { metodo: string; valor: number | '' };

// NOVO: Interface para receber os dados do atendente via Props
interface PDVModuloProps {
  atendente: string;
}

export default function PDVModulo({ atendente }: PDVModuloProps) {
  const [produtos, setProdutos] = useState<ProdutoVenda[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [identificacaoPedido, setIdentificacaoPedido] = useState('');

  const [modoPagamento, setModoPagamento] = useState<'unico' | 'misto'>('unico');
  const [metodoUnico, setMetodoUnico] = useState('PIX');
  const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState<number | ''>('');

  const [pagamentosMistos, setPagamentosMistos] = useState<PagamentoMisto[]>([
    { metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }
  ]);

  const [caixaAberto, setCaixaAberto] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });

  const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: null }), 3000);
  };

  const carregarProdutos = async () => {
    const { data: produtosData } = await supabase.from('produtos').select('*').eq('tipo', 'venda').eq('ativo', true).order('nome');
    const { data: fichasData } = await supabase.from('fichas_tecnicas').select('produto_venda_id');
    const fichasIds = new Set(fichasData?.map(f => f.produto_venda_id));

    if (produtosData) {
      setProdutos(produtosData.map(p => ({
        id: p.id, nome: p.nome, preco_venda: p.preco_venda, quantidade_estoque: p.quantidade_estoque || 0, is_receita: fichasIds.has(p.id)
      })));
    }
  };

  useEffect(() => {
    const iniciarPDV = async () => {
      const { data: caixaData } = await supabase.from('controle_caixa').select('id').eq('status', 'aberto').limit(1).maybeSingle();
      if (!caixaData) return setCaixaAberto(false);
      setCaixaAberto(true);
      carregarProdutos();
    };
    iniciarPDV();
  }, []);

  const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

  const adicionarAoCarrinho = (produto: ProdutoVenda) => {
    if (!produto.is_receita && produto.quantidade_estoque <= 0) return mostrarMensagem('Sem estoque!', 'erro');
    const itemExistente = carrinho.find(item => item.produto.id === produto.id);

    if (itemExistente) {
      if (!produto.is_receita && itemExistente.quantidade >= produto.quantidade_estoque) return mostrarMensagem(`Estoque máximo (${produto.quantidade_estoque} un).`, 'aviso');
      setCarrinho(carrinho.map(item => item.produto.id === produto.id ? { ...item, quantidade: item.quantidade + 1 } : item));
    } else {
      setCarrinho([...carrinho, { produto, quantidade: 1 }]);
    }
  };

  const alterQuantidade = (id: string, delta: number) => {
    setCarrinho(carrinho.map(item => {
      if (item.produto.id === id) {
        const novaQtd = item.quantidade + delta;
        if (delta > 0 && !item.produto.is_receita && novaQtd > item.produto.quantidade_estoque) return item;
        return novaQtd > 0 ? { ...item, quantidade: novaQtd } : item;
      }
      return item;
    }));
  };

  const removerDoCarrinho = (id: string) => setCarrinho(carrinho.filter(item => item.produto.id !== id));

  const totalVenda = useMemo(() => carrinho.reduce((acc, item) => acc + (item.produto.preco_venda * item.quantidade), 0), [carrinho]);
  const totalPagoMisto = pagamentosMistos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);

  const faltaPagarMisto = modoPagamento === 'misto' && totalPagoMisto < totalVenda ? totalVenda - totalPagoMisto : 0;
  const trocoMisto = modoPagamento === 'misto' && totalPagoMisto > totalVenda ? totalPagoMisto - totalVenda : 0;
  const trocoUnico = modoPagamento === 'unico' && metodoUnico === 'Dinheiro' && Number(valorRecebidoDinheiro) > totalVenda ? Number(valorRecebidoDinheiro) - totalVenda : 0;

  const finalizarVenda = async () => {
    if (carrinho.length === 0) return mostrarMensagem('Adicione produtos ao carrinho.', 'aviso');
    if (!identificacaoPedido.trim()) return mostrarMensagem('Informe a identificação.', 'aviso');
    if (modoPagamento === 'misto' && totalPagoMisto < totalVenda) return mostrarMensagem(`Falta receber ${formatarMoeda(faltaPagarMisto)}!`, 'erro');

    let vPix = 0, vDin = 0, vCred = 0, vDeb = 0;
    let metodosStr = '';

    if (modoPagamento === 'unico') {
      vPix = metodoUnico === 'PIX' ? totalVenda : 0;
      vCred = metodoUnico === 'Cartão de Crédito' ? totalVenda : 0;
      vDeb = metodoUnico === 'Cartão de Débito' ? totalVenda : 0;
      vDin = metodoUnico === 'Dinheiro' ? totalVenda : 0;
      metodosStr = metodoUnico;
    } else {
      let trocoRestante = trocoMisto;
      pagamentosMistos.forEach(p => {
        let val = Number(p.valor) || 0;
        if (p.metodo === 'PIX') vPix += val;
        if (p.metodo === 'Cartão de Crédito') vCred += val;
        if (p.metodo === 'Cartão de Débito') vDeb += val;
        if (p.metodo === 'Dinheiro') {
          if (trocoRestante > 0) {
            if (val >= trocoRestante) { val -= trocoRestante; trocoRestante = 0; }
            else { trocoRestante -= val; val = 0; }
          }
          vDin += val;
        }
      });
      metodosStr = Array.from(new Set(pagamentosMistos.map(p => p.metodo))).join(' + ');
    }

    try {
      // ATUALIZADO: Inclui a coluna 'atendente' no payload enviado ao Supabase
      const { data: vendaCriada, error: erroVenda } = await supabase.from('vendas').insert([{
        identificacao_pedido: identificacaoPedido, total: totalVenda, metodo_pagamento: metodosStr,
        valor_pix: vPix, valor_dinheiro: vDin, valor_cartao_credito: vCred, valor_cartao_debito: vDeb,
        atendente: atendente
      }]).select().single();
      if (erroVenda) throw erroVenda;

      const itensParaInserir = carrinho.map(item => ({
        venda_id: vendaCriada.id, produto_id: item.produto.id, quantidade: item.quantidade, preco_unitario: item.produto.preco_venda
      }));
      await supabase.from('itens_venda').insert(itensParaInserir);

      for (const item of carrinho) {
        if (!item.produto.is_receita) {
          const novoEstoque = item.produto.quantidade_estoque - item.quantidade;
          await supabase.from('produtos').update({ quantidade_estoque: novoEstoque }).eq('id', item.produto.id);
        }
      }

      mostrarMensagem('Venda finalizada!', 'sucesso');
      setCarrinho([]); setIdentificacaoPedido(''); setValorRecebidoDinheiro('');
      setPagamentosMistos([{ metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }]);
      carregarProdutos();

    } catch (error) { console.error(error); mostrarMensagem('Erro ao finalizar venda.', 'erro'); }
  };

  if (caixaAberto === null) return <div className="text-center mt-20 animate-pulse">A verificar caixa...</div>;
  if (caixaAberto === false) return (<div className="max-w-md mx-auto bg-white rounded-lg shadow-lg border border-red-200 text-center my-20 p-8"><div className="text-6xl mb-6">🔒</div><h2 className="text-2xl font-bold text-red-600">Caixa Fechado</h2></div>);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full relative">
      {feedback.tipo && (
        <div className={`absolute top-0 right-0 z-50 px-4 py-3 rounded shadow-lg ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
          <p className="text-sm font-semibold">{feedback.msg}</p>
        </div>
      )}

      <div className="flex-1 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 p-4 flex flex-col">
        <h2 className="text-xl font-bold text-cafe-primary mb-4 border-b pb-2">Menu de Produtos</h2>
        <div className="overflow-y-auto flex-1 pr-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {produtos.map(produto => {
              const semEstoque = !produto.is_receita && produto.quantidade_estoque <= 0;
              return (
                <button
                  key={produto.id} onClick={() => adicionarAoCarrinho(produto)} disabled={semEstoque}
                  className={`relative rounded-lg p-3 flex flex-col items-center justify-center text-center transition-all h-28 border ${semEstoque ? 'bg-gray-100 border-red-200 cursor-not-allowed opacity-60' : 'bg-white shadow-sm border-gray-200 hover:border-cafe-primary hover:shadow-md active:scale-95'
                    }`}
                >
                  <span className={`font-semibold text-sm mb-2 line-clamp-2 ${semEstoque ? 'text-gray-500' : 'text-cafe-dark'}`}>{produto.nome}</span>
                  <span className={`font-bold ${semEstoque ? 'text-gray-400' : 'text-cafe-primary'}`}>{formatarMoeda(produto.preco_venda)}</span>
                  {!produto.is_receita && (
                    <div className="absolute top-1 right-1 text-[10px] font-bold">
                      {semEstoque ? <span className="bg-red-500 text-white px-1.5 py-0.5 rounded">Esgotado</span> : <span className="bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">{produto.quantidade_estoque} un</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[400px] bg-white rounded-lg shadow-md border border-cafe-secondary/20 flex flex-col h-full">
        <div className="p-4 bg-cafe-primary text-white rounded-t-lg"><h2 className="text-lg font-bold">Pedido Atual</h2></div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          <ul className="space-y-3">
            {carrinho.map(item => (
              <li key={item.produto.id} className="bg-white p-3 rounded shadow-sm border border-gray-100">
                <div className="flex justify-between font-semibold text-sm mb-2"><span className="truncate pr-2">{item.produto.nome}</span><span>{formatarMoeda(item.produto.preco_venda * item.quantidade)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">{formatarMoeda(item.produto.preco_venda)} un</span>
                  <div className="flex items-center gap-3 bg-gray-100 rounded p-1">
                    <button onClick={() => alterQuantidade(item.produto.id, -1)} className="w-6 h-6 bg-white rounded font-bold shadow-sm">-</button>
                    <span className="text-sm font-bold w-4 text-center">{item.quantidade}</span>
                    <button onClick={() => alterQuantidade(item.produto.id, 1)} className="w-6 h-6 bg-white rounded font-bold shadow-sm">+</button>
                    <button onClick={() => removerDoCarrinho(item.produto.id)} className="ml-2 text-red-500 hover:text-red-700">🗑️</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 border-t border-gray-200 bg-white rounded-b-lg space-y-3">
          <div className="flex justify-between items-center text-2xl font-black border-b pb-2"><span>Total:</span><span className="text-green-600">{formatarMoeda(totalVenda)}</span></div>
          <input type="text" placeholder="Identificação (Ex: Mesa 02)" className="w-full p-2 border border-gray-300 rounded text-center font-bold outline-none focus:ring-2 focus:ring-cafe-primary" value={identificacaoPedido} onChange={(e) => setIdentificacaoPedido(e.target.value)} />

          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setModoPagamento('unico')} className={`flex-1 text-sm py-1 font-bold rounded transition ${modoPagamento === 'unico' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Pagamento Único</button>
            <button onClick={() => setModoPagamento('misto')} className={`flex-1 text-sm py-1 font-bold rounded transition ${modoPagamento === 'misto' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Combinar Formas</button>
          </div>

          {modoPagamento === 'unico' && (
            <div className="space-y-2">
              <select className="w-full p-2 border border-gray-300 rounded bg-white font-bold text-center" value={metodoUnico} onChange={(e) => setMetodoUnico(e.target.value)}>
                <option value="PIX">PIX</option><option value="Cartão de Crédito">Cartão de Crédito</option><option value="Cartão de Débito">Cartão de Débito</option><option value="Dinheiro">Dinheiro</option>
              </select>
              {metodoUnico === 'Dinheiro' && (
                <div className="flex gap-2 items-center bg-gray-50 p-2 rounded border">
                  <span className="text-sm font-semibold whitespace-nowrap">Valor Recebido:</span>
                  <input type="number" placeholder="Para calcular troco" className="w-full p-2 border rounded" value={valorRecebidoDinheiro} onChange={(e) => setValorRecebidoDinheiro(Number(e.target.value))} />
                </div>
              )}
              {trocoUnico > 0 && <div className="text-center font-bold text-blue-600 text-lg">Troco a devolver: {formatarMoeda(trocoUnico)}</div>}
            </div>
          )}

          {modoPagamento === 'misto' && (
            <div className="space-y-2 border p-2 rounded bg-gray-50">
              {pagamentosMistos.map((pm, index) => (
                <div key={index} className="flex gap-2">
                  <select className="flex-1 p-2 border rounded text-sm" value={pm.metodo} onChange={(e) => { const n = [...pagamentosMistos]; n[index].metodo = e.target.value; setPagamentosMistos(n); }}>
                    <option value="PIX">PIX</option><option value="Dinheiro">Dinheiro</option><option value="Cartão de Crédito">Crédito</option><option value="Cartão de Débito">Débito</option>
                  </select>
                  <input type="number" placeholder="Valor" className="flex-1 p-2 border rounded text-sm font-bold" value={pm.valor} onChange={(e) => { const n = [...pagamentosMistos]; n[index].valor = Number(e.target.value); setPagamentosMistos(n); }} />
                  {index > 0 && <button onClick={() => setPagamentosMistos(pagamentosMistos.filter((_, i) => i !== index))} className="text-red-500 font-bold px-2">X</button>}
                </div>
              ))}
              <button onClick={() => setPagamentosMistos([...pagamentosMistos, { metodo: 'Cartão de Crédito', valor: '' }])} className="w-full text-xs font-bold text-cafe-primary hover:underline">+ Adicionar Forma</button>

              <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t">
                <span className={faltaPagarMisto > 0 ? 'text-red-500' : 'text-gray-500'}>Falta: {formatarMoeda(faltaPagarMisto)}</span>
                <span className={trocoMisto > 0 ? 'text-blue-600' : 'text-gray-500'}>Troco: {formatarMoeda(trocoMisto)}</span>
              </div>
            </div>
          )}

          <button onClick={finalizarVenda} className="w-full bg-green-600 text-white font-bold text-lg py-3 rounded shadow-lg active:scale-95">FINALIZAR VENDA</button>
        </div>
      </div>
    </div>
  );
}