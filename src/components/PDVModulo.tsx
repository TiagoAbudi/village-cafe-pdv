import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

type ProdutoVenda = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; is_receita: boolean; };
type ItemCarrinho = { produto: ProdutoVenda; quantidade: number; };
type PagamentoMisto = { metodo: string; valor: number | '' };

interface PDVModuloProps {
  atendente: string;
}

export default function PDVModulo({ atendente }: PDVModuloProps) {
  const [produtos, setProdutos] = useState<ProdutoVenda[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [identificacaoPedido, setIdentificacaoPedido] = useState('');

  const [desconto, setDesconto] = useState<number | ''>('');

  const [modoPagamento, setModoPagamento] = useState<'unico' | 'misto'>('unico');
  const [metodoUnico, setMetodoUnico] = useState('PIX');
  const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState<number | ''>('');

  const [pagamentosMistos, setPagamentosMistos] = useState<PagamentoMisto[]>([
    { metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }
  ]);

  const [caixaAberto, setCaixaAberto] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });
  const [finalizando, setFinalizando] = useState(false);

  const [buscaProduto, setBuscaProduto] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState(buscaProduto);

  // Debounce da busca para reduzir chamadas e melhorar UX
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(buscaProduto), 300);
    return () => clearTimeout(t);
  }, [buscaProduto]);

  const produtosFiltrados = useMemo(() => {
    return produtos.filter(p =>
      p.nome.toLowerCase().includes(buscaDebounced.toLowerCase())
    );
  }, [produtos, buscaDebounced]);

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
  const valorDesconto = Number(desconto) || 0;
  const totalComDesconto = Math.max(0, totalVenda - valorDesconto);

  const totalPagoMisto = pagamentosMistos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);

  const faltaPagarMisto = modoPagamento === 'misto' && totalPagoMisto < totalComDesconto ? totalComDesconto - totalPagoMisto : 0;
  const trocoMisto = modoPagamento === 'misto' && totalPagoMisto > totalComDesconto ? totalPagoMisto - totalComDesconto : 0;
  const trocoUnico = modoPagamento === 'unico' && metodoUnico === 'Dinheiro' && Number(valorRecebidoDinheiro) > totalComDesconto ? Number(valorRecebidoDinheiro) - totalComDesconto : 0;

  const finalizarVenda = async () => {
    if (carrinho.length === 0) return mostrarMensagem('Adicione produtos ao carrinho.', 'aviso');
    if (modoPagamento === 'misto' && totalPagoMisto < totalComDesconto) return mostrarMensagem(`Falta receber ${formatarMoeda(faltaPagarMisto)}!`, 'erro');

    setFinalizando(true);

    let vPix = 0, vDin = 0, vCred = 0, vDeb = 0;

    if (modoPagamento === 'unico') {
      vPix = metodoUnico === 'PIX' ? totalComDesconto : 0;
      vCred = metodoUnico === 'Cartão de Crédito' ? totalComDesconto : 0;
      vDeb = metodoUnico === 'Cartão de Débito' ? totalComDesconto : 0;
      vDin = metodoUnico === 'Dinheiro' ? totalComDesconto : 0;
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
    }

    const metodosStr = modoPagamento === 'unico' ? metodoUnico : Array.from(new Set(pagamentosMistos.map(p => p.metodo))).join(' + ');

    try {
      const identificacaoFinal = identificacaoPedido.trim() || 'Venda Balcão';

      const { data: vendaCriada, error: erroVenda } = await supabase.from('vendas').insert([{
        identificacao_pedido: identificacaoFinal,
        total: totalComDesconto,
        desconto: valorDesconto,
        metodo_pagamento: metodosStr,
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
      setCarrinho([]); setIdentificacaoPedido(''); setValorRecebidoDinheiro(''); setDesconto('');
      setPagamentosMistos([{ metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }]);
      carregarProdutos();

    } catch (error) {
      console.error(error);
      mostrarMensagem('Erro ao finalizar venda.', 'erro');
    } finally {
      setFinalizando(false);
    }
  };

  if (caixaAberto === null) return <div className="text-center mt-20 animate-pulse font-bold text-cafe-primary">Verificando caixa...</div>;
  if (caixaAberto === false) return (<div className="max-w-md mx-auto bg-white rounded-lg shadow-lg border border-red-200 text-center my-20 p-8"><div className="text-6xl mb-6">🔒</div><h2 className="text-2xl font-bold text-red-600">Caixa Fechado</h2><p className="text-gray-500 mt-2">Abra o caixa no Dashboard para acessar o PDV.</p></div>);

  return (
    // NOTA: items-start é crucial aqui para o sticky funcionar na coluna da direita
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start relative w-full pb-10">

      {/* Feedbacks de tela */}
      {feedback.tipo && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded shadow-lg ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
          <p className="text-sm font-semibold">{feedback.msg}</p>
        </div>
      )}

      {/* LADO ESQUERDO: Produtos */}
      <div className="w-full flex-1 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 p-4 flex flex-col">
        <h2 className="text-xl font-bold text-cafe-primary mb-4 border-b pb-2">Menu de Produtos</h2>

        <div className="mb-4">
          <input
            type="text"
            placeholder="🔍 Buscar produto..."
            value={buscaProduto}
            onChange={(e) => setBuscaProduto(e.target.value)}
            className="w-full p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-cafe-primary outline-none text-base"
          />
        </div>

        {/* NOTA: max-h responsivo para não criar telas infinitas no celular */}
        <div className="space-y-3 overflow-y-auto max-h-[50vh] lg:max-h-[calc(100vh-250px)] pr-2">
          {produtosFiltrados.map(produto => {
            const semEstoque = !produto.is_receita && produto.quantidade_estoque <= 0;
            const estoqueBaixo = !produto.is_receita && produto.quantidade_estoque > 0 && produto.quantidade_estoque <= 5;

            return (
              <div key={produto.id} className="bg-white border rounded-lg p-3 flex justify-between items-center hover:shadow-md transition">
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="font-semibold truncate text-sm md:text-base">{produto.nome}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                    <span className="font-bold text-cafe-primary">{formatarMoeda(produto.preco_venda)}</span>
                    {!produto.is_receita && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${semEstoque ? 'bg-red-100 text-red-700' : estoqueBaixo ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {produto.quantidade_estoque} un
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => adicionarAoCarrinho(produto)}
                  disabled={semEstoque}
                  className={`flex-shrink-0 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full font-bold text-xl md:text-2xl transition shadow-sm ${semEstoque ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-cafe-primary text-white hover:bg-cafe-dark active:scale-95'}`}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* LADO DIREITO: Carrinho & Pagamento (Sticky no Desktop) */}
      <div className="w-full lg:w-[420px] bg-white rounded-lg shadow-md border border-cafe-secondary/20 flex flex-col sticky top-4">
        <div className="p-4 bg-cafe-primary text-white rounded-t-lg">
          <h2 className="text-lg font-bold flex justify-between">
            <span>Pedido Atual</span>
            <span className="bg-white/20 px-2 py-0.5 rounded text-sm">{carrinho.reduce((acc, i) => acc + i.quantidade, 0)} itens</span>
          </h2>
        </div>

        {/* Lista do carrinho adaptada para touch */}
        <div className="flex-1 overflow-y-auto max-h-[35vh] lg:max-h-[300px] p-4 bg-gray-50">
          {carrinho.length === 0 ? (
            <p className="text-center text-gray-400 font-semibold italic py-6">O carrinho está vazio.</p>
          ) : (
            <ul className="space-y-3">
              {carrinho.map(item => (
                <li key={item.produto.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                  <div className="flex justify-between font-semibold text-sm mb-3">
                    <span className="truncate pr-2">{item.produto.nome}</span>
                    <span className="text-cafe-primary">{formatarMoeda(item.produto.preco_venda * item.quantidade)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{formatarMoeda(item.produto.preco_venda)} un</span>

                    <div className="flex items-center gap-3 bg-gray-50 border rounded-lg p-1">
                      {/* Touch targets maiores (w-8 h-8) */}
                      <button onClick={() => alterQuantidade(item.produto.id, -1)} className="w-8 h-8 bg-white border rounded font-bold shadow-sm active:bg-gray-100">-</button>
                      <span className="text-sm font-bold w-6 text-center">{item.quantidade}</span>
                      <button onClick={() => alterQuantidade(item.produto.id, 1)} className="w-8 h-8 bg-cafe-primary text-white rounded font-bold shadow-sm active:bg-cafe-dark">+</button>

                      <div className="w-px h-6 bg-gray-200 mx-1"></div>

                      <button onClick={() => removerDoCarrinho(item.produto.id)} className="w-8 h-8 text-red-500 hover:text-red-700 hover:bg-red-50 rounded flex items-center justify-center transition">
                        🗑️
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Resumo e Pagamento */}
        <div className="p-4 border-t border-gray-200 bg-white rounded-b-lg space-y-4">
          <div className="space-y-2 mb-2">
            <div className="flex justify-between items-center text-sm font-semibold text-gray-600">
              <span>Subtotal:</span><span>{formatarMoeda(totalVenda)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-600">Desconto:</span>
              <input
                type="number"
                placeholder="R$ 0,00"
                className="flex-1 p-2 border border-red-200 rounded text-right font-bold text-red-600 outline-none focus:ring-1 focus:ring-red-400 bg-red-50 text-base"
                value={desconto}
                onChange={(e) => setDesconto(Number(e.target.value) >= 0 ? Number(e.target.value) : '')}
              />
            </div>
          </div>

          <div className="flex justify-between items-end text-2xl font-black border-b border-gray-200 pb-3">
            <span className="text-gray-800 text-lg mb-1">Total:</span>
            <span className="text-green-600 text-3xl">{formatarMoeda(totalComDesconto)}</span>
          </div>

          <input type="text" placeholder="Identificação (Ex: Mesa 02)" className="w-full p-3 border border-gray-300 rounded text-center font-bold outline-none focus:ring-2 focus:ring-cafe-primary text-base" value={identificacaoPedido} onChange={(e) => setIdentificacaoPedido(e.target.value)} />

          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setModoPagamento('unico')} className={`flex-1 text-sm py-2 font-bold rounded transition ${modoPagamento === 'unico' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Único</button>
            <button onClick={() => setModoPagamento('misto')} className={`flex-1 text-sm py-2 font-bold rounded transition ${modoPagamento === 'misto' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Misto</button>
          </div>

          {modoPagamento === 'unico' && (
            <div className="space-y-3">
              <select className="w-full p-3 border border-gray-300 rounded bg-white font-bold text-center text-base outline-none focus:ring-2 focus:ring-cafe-primary" value={metodoUnico} onChange={(e) => setMetodoUnico(e.target.value)}>
                <option value="PIX">PIX</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
              {metodoUnico === 'Dinheiro' && (
                <div className="flex gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200">
                  <span className="text-sm font-semibold whitespace-nowrap px-1">Recebido:</span>
                  <input type="number" placeholder="Para troco..." className="w-full p-2 border rounded font-bold text-base outline-none focus:ring-1 focus:ring-gray-300" value={valorRecebidoDinheiro} onChange={(e) => setValorRecebidoDinheiro(Number(e.target.value))} />
                </div>
              )}
              {trocoUnico > 0 && <div className="text-center font-black text-blue-600 text-lg bg-blue-50 p-2 rounded border border-blue-100">Troco: {formatarMoeda(trocoUnico)}</div>}
            </div>
          )}

          {modoPagamento === 'misto' && (
            <div className="space-y-3 border p-3 rounded-lg bg-gray-50">
              {pagamentosMistos.map((pm, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <select className="flex-1 p-2 border rounded text-sm font-semibold bg-white outline-none" value={pm.metodo} onChange={(e) => { const n = [...pagamentosMistos]; n[index].metodo = e.target.value; setPagamentosMistos(n); }}>
                    <option value="PIX">PIX</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão de Crédito">Crédito</option>
                    <option value="Cartão de Débito">Débito</option>
                  </select>
                  <input type="number" placeholder="Valor" className="w-24 p-2 border rounded text-sm font-bold text-base outline-none" value={pm.valor} onChange={(e) => { const n = [...pagamentosMistos]; n[index].valor = Number(e.target.value); setPagamentosMistos(n); }} />
                  {index > 0 && <button onClick={() => setPagamentosMistos(pagamentosMistos.filter((_, i) => i !== index))} className="w-8 h-8 flex items-center justify-center text-red-500 font-bold bg-white border rounded shadow-sm hover:bg-red-50">X</button>}
                </div>
              ))}
              <button onClick={() => setPagamentosMistos([...pagamentosMistos, { metodo: 'Cartão de Crédito', valor: '' }])} className="w-full text-xs font-bold text-cafe-primary hover:underline bg-white py-2 border border-dashed rounded">+ Adicionar Forma</button>

              <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200">
                <span className={faltaPagarMisto > 0 ? 'text-red-500' : 'text-gray-500'}>Falta: {formatarMoeda(faltaPagarMisto)}</span>
                <span className={trocoMisto > 0 ? 'text-blue-600' : 'text-gray-500'}>Troco: {formatarMoeda(trocoMisto)}</span>
              </div>
            </div>
          )}

          <button onClick={finalizarVenda} disabled={finalizando} className="w-full bg-green-600 text-white font-black text-lg py-4 rounded-lg shadow-lg hover:bg-green-700 active:scale-95 transition mt-2 disabled:opacity-70 disabled:cursor-not-allowed">
            {finalizando ? 'PROCESSANDO...' : 'FINALIZAR VENDA'}
          </button>
        </div>
      </div>
    </div>
  );
}