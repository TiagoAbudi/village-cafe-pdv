import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type Produto = {
  id: string; nome: string; preco_custo: number; preco_venda: number;
  quantidade_estoque: number; estoque_minimo: number;
  tamanho: number | null; unidade_medida: string;
};

type Movimentacao = {
  id: string; quantidade: number; tipo_movimento: string; motivo: string;
  atendente: string; created_at: string; produtos: { nome: string; unidade_medida: string };
};

type ItemCarrinhoLote = {
  produtoId: string;
  nome: string;
  unidade_medida: string;
  qtd: number | '';
  custoUnitario: number | '';
  precoVenda: number | '';
};

interface CadastroRevendaProps {
  atendente: string;
}

export default function CadastroRevenda({ atendente }: CadastroRevendaProps) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [caixaAtivo, setCaixaAtivo] = useState<any | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Estados do Formulário de Cadastro
  const [nome, setNome] = useState('');
  const [precoCusto, setPrecoCusto] = useState<number | ''>('');
  const [precoVenda, setPrecoVenda] = useState<number | ''>('');
  const [quantidadeEstoque, setQuantidadeEstoque] = useState<number | ''>('');
  const [estoqueMinimo, setEstoqueMinimo] = useState<number | ''>(5);
  const [tamanho, setTamanho] = useState<number | ''>('');
  const [unidadeMedida, setUnidadeMedida] = useState('un');

  // Feedbacks e Modais
  const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });
  const [produtoParaApagar, setProdutoParaApagar] = useState<string | null>(null);

  // Estados para o Ajuste de Estoque (Auditoria Individual)
  const [produtoParaAjuste, setProdutoParaAjuste] = useState<Produto | null>(null);
  const [ajusteTipo, setAjusteTipo] = useState('Entrada - Reposição');
  const [ajusteQuantidade, setAjusteQuantidade] = useState<number | ''>('');
  const [ajusteMotivo, setAjusteMotivo] = useState('');

  // ESTADOS DO NOVO CARRINHO DE LOTE (COMPRA DE ESTOQUE)
  const [modalLoteOpen, setModalLoteOpen] = useState(false);
  const [termoBuscaLote, setTermoBuscaLote] = useState('');
  const [carrinhoLote, setCarrinhoLote] = useState<ItemCarrinhoLote[]>([]);
  const [metodoPagamentoLote, setMetodoPagamentoLote] = useState('PIX');
  const [fornecedorLoteId, setFornecedorLoteId] = useState('');
  const [dataVencimentoLote, setDataVencimentoLote] = useState('');

  // Estados para a Edição Completa do Produto
  const [produtoParaEditar, setProdutoParaEditar] = useState<Produto | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editPrecoCusto, setEditPrecoCusto] = useState<number | ''>('');
  const [editPrecoVenda, setEditPrecoVenda] = useState<number | ''>('');
  const [editEstoqueMinimo, setEditEstoqueMinimo] = useState<number | ''>('');
  const [editTamanho, setEditTamanho] = useState<number | ''>('');
  const [editUnidadeMedida, setEditUnidadeMedida] = useState('un');

  const [termoBusca, setTermoBusca] = useState('');

  const produtosFiltrados = produtos.filter(produto => produto.nome.toLowerCase().includes(termoBusca.toLowerCase()));
  const produtosFiltradosLote = produtos.filter(produto => produto.nome.toLowerCase().includes(termoBuscaLote.toLowerCase()));

  const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: null }), 3000);
  };

  const carregarDados = async () => {
    const { data: fichas } = await supabase.from('fichas_tecnicas').select('produto_venda_id');
    const produtosComReceita = new Set(fichas?.map(f => f.produto_venda_id) || []);

    const { data: prodData } = await supabase.from('produtos').select('*').eq('tipo', 'venda').eq('ativo', true).order('nome');
    const { data: movData } = await supabase.from('movimentacoes_estoque').select('id, quantidade, tipo_movimento, motivo, atendente, created_at, produto_id, produtos!inner(nome, unidade_medida, tipo)').eq('produtos.tipo', 'venda').order('created_at', { ascending: false }).limit(50);
    const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome');
    const { data: caixaData } = await supabase.from('controle_caixa').select('*').eq('status', 'aberto').order('data_abertura', { ascending: false }).limit(1).maybeSingle();

    if (fornData) setFornecedores(fornData);
    if (caixaData) setCaixaAtivo(caixaData);

    if (prodData) {
      setProdutos(prodData.filter(p => !produtosComReceita.has(p.id)));
    }
    if (movData) {
      setMovimentacoes((movData as any[]).filter(m => !produtosComReceita.has(m.produto_id)) as unknown as Movimentacao[]);
    }
  };

  useEffect(() => { carregarDados(); }, []);

  const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  const formatarData = (dataIso: string) => new Date(dataIso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const cadastrarProduto = async () => {
    if (!nome || !precoVenda) return mostrarMensagem('Preencha pelo menos o nome e o preço de venda.', 'aviso');

    try {
      const { data: produtoCriado, error: erroProd } = await supabase.from('produtos').insert([{
        nome, tipo: 'venda', preco_custo: Number(precoCusto) || 0, preco_venda: Number(precoVenda),
        unidade_medida: unidadeMedida, tamanho: tamanho !== '' ? Number(tamanho) : null,
        quantidade_estoque: Number(quantidadeEstoque) || 0, estoque_minimo: Number(estoqueMinimo) || 5, ativo: true
      }]).select().single();

      if (erroProd) throw erroProd;

      if (Number(quantidadeEstoque) > 0) {
        await supabase.from('movimentacoes_estoque').insert([{
          produto_id: produtoCriado.id, quantidade: Number(quantidadeEstoque),
          tipo_movimento: 'Entrada - Estoque Inicial', motivo: 'Cadastro de Produto Novo', atendente
        }]);
      }

      mostrarMensagem('Produto cadastrado com sucesso!', 'sucesso');
      setNome(''); setPrecoCusto(''); setPrecoVenda(''); setQuantidadeEstoque('');
      setEstoqueMinimo(5); setTamanho(''); setUnidadeMedida('un');
      carregarDados();
    } catch (error) { mostrarMensagem('Erro ao cadastrar produto.', 'erro'); }
  };

  const confirmarApagarProduto = async () => {
    if (!produtoParaApagar) return;
    try {
      await supabase.from('produtos').update({ ativo: false }).eq('id', produtoParaApagar);
      mostrarMensagem('Produto inativado.', 'sucesso');
      carregarDados();
    } catch (error) { mostrarMensagem('Erro.', 'erro'); } finally { setProdutoParaApagar(null); }
  };

  const abrirModalEdicao = (produto: Produto) => {
    setProdutoParaEditar(produto);
    setEditNome(produto.nome);
    setEditPrecoCusto(produto.preco_custo);
    setEditPrecoVenda(produto.preco_venda);
    setEditTamanho(produto.tamanho || '');
    setEditUnidadeMedida(produto.unidade_medida);
    setEditEstoqueMinimo(produto.estoque_minimo || 5);
  };

  const confirmarAjusteEstoque = async () => {
    if (!produtoParaAjuste || !ajusteQuantidade || !ajusteTipo) return mostrarMensagem('Preencha a quantidade e o tipo.', 'aviso');

    const isSaida = ajusteTipo.includes('Saída') || ajusteTipo.includes('Negativa');
    const novoEstoque = isSaida ? produtoParaAjuste.quantidade_estoque - Number(ajusteQuantidade) : produtoParaAjuste.quantidade_estoque + Number(ajusteQuantidade);

    try {
      await supabase.from('produtos').update({ quantidade_estoque: novoEstoque }).eq('id', produtoParaAjuste.id);
      await supabase.from('movimentacoes_estoque').insert([{
        produto_id: produtoParaAjuste.id, quantidade: isSaida ? -Number(ajusteQuantidade) : Number(ajusteQuantidade),
        tipo_movimento: ajusteTipo, motivo: ajusteMotivo || 'Ajuste Manual', atendente
      }]);
      mostrarMensagem(`Estoque atualizado!`, 'sucesso');
      carregarDados();
    } catch (error) { mostrarMensagem('Erro ao atualizar.', 'erro'); } finally {
      setProdutoParaAjuste(null); setAjusteQuantidade(''); setAjusteMotivo(''); setAjusteTipo('Entrada - Reposição');
    }
  };

  // ----- FUNÇÕES DO CARRINHO DE LOTE -----
  const adicionarAoLote = (p: Produto) => {
    if (carrinhoLote.some(item => item.produtoId === p.id)) return;
    setCarrinhoLote([{
      produtoId: p.id,
      nome: p.nome,
      unidade_medida: p.unidade_medida,
      qtd: 1,
      custoUnitario: p.preco_custo || 0,
      precoVenda: p.preco_venda || 0
    }, ...carrinhoLote]);
  };

  const atualizarLote = (id: string, campo: keyof ItemCarrinhoLote, valor: any) => {
    setCarrinhoLote(carrinhoLote.map(item => item.produtoId === id ? { ...item, [campo]: valor } : item));
  };

  const removerDoLote = (id: string) => {
    setCarrinhoLote(carrinhoLote.filter(item => item.produtoId !== id));
  };

  const salvarEntradasEmLote = async () => {
    if (carrinhoLote.length === 0) return mostrarMensagem('O carrinho está vazio.', 'aviso');
    if (carrinhoLote.some(item => !item.qtd || Number(item.qtd) <= 0)) return mostrarMensagem('Qtd inválida no carrinho.', 'aviso');

    const totalCustoLote = carrinhoLote.reduce((acc, item) => acc + (Number(item.qtd) * Number(item.custoUnitario || 0)), 0);

    if (metodoPagamentoLote === 'Conta a Pagar' && !dataVencimentoLote && totalCustoLote > 0) {
      return mostrarMensagem('Informe a data de vencimento para compras a prazo.', 'aviso');
    }

    if (metodoPagamentoLote === 'Dinheiro' && !caixaAtivo && totalCustoLote > 0) {
      return mostrarMensagem('Não é possível pagar em dinheiro com o caixa fechado.', 'erro');
    }

    setCarregando(true);
    try {
      // 1. Atualizar Estoques e Preços
      for (const item of carrinhoLote) {
        const prod = produtos.find(p => p.id === item.produtoId);
        if (!prod) continue;

        const qtd = Number(item.qtd);
        const novoEstoque = prod.quantidade_estoque + qtd;

        await supabase.from('produtos').update({
          quantidade_estoque: novoEstoque,
          preco_custo: Number(item.custoUnitario || 0),
          preco_venda: Number(item.precoVenda || 0)
        }).eq('id', item.produtoId);

        await supabase.from('movimentacoes_estoque').insert([{
          produto_id: item.produtoId, quantidade: qtd, tipo_movimento: 'Entrada - Compra Lote', motivo: 'Abastecimento via Lote', atendente
        }]);
      }

      // 2. Registrar Transação Financeira (Se houve gasto)
      if (totalCustoLote > 0) {
        const dataHoje = new Date().toISOString().split('T')[0];
        const isPago = metodoPagamentoLote !== 'Conta a Pagar';

        const { error: erroConta } = await supabase.from('contas_pagar').insert([{
          descricao: 'Compra de Estoque (Lote de Entrada)',
          fornecedor_id: fornecedorLoteId || null,
          valor: totalCustoLote,
          data_vencimento: isPago ? dataHoje : dataVencimentoLote,
          data_pagamento: isPago ? dataHoje : null,
          status: isPago ? 'Pago' : 'Pendente',
          metodo_pagamento: isPago ? metodoPagamentoLote : null
        }]);

        if (erroConta) throw erroConta;

        if (isPago) {
          if (metodoPagamentoLote === 'Dinheiro' && caixaAtivo) {
            await supabase.from('movimentacoes_caixa').insert([{
              caixa_id: caixaAtivo.id, tipo: 'despesa', valor: totalCustoLote, descricao: `Pago: Compra Estoque (Lote)`
            }]);
          } else if (metodoPagamentoLote === 'PIX' || metodoPagamentoLote === 'Cartão de Débito' || metodoPagamentoLote === 'Transferência') {
            const { data: banco } = await supabase.from('conta_bancaria').select('saldo').eq('id', 1).single();
            if (banco) {
              await supabase.from('conta_bancaria').update({ saldo: Number(banco.saldo) - totalCustoLote }).eq('id', 1);
            }
          }
        }
      }

      mostrarMensagem('Lote processado e financeiro atualizado!', 'sucesso');
      setCarrinhoLote([]); setTermoBuscaLote(''); setModalLoteOpen(false);
      setMetodoPagamentoLote('PIX'); setFornecedorLoteId(''); setDataVencimentoLote('');
      carregarDados();
    } catch (error) { mostrarMensagem('Erro ao registrar entrada.', 'erro'); } finally { setCarregando(false); }
  };

  const salvarEdicaoProduto = async () => {
    if (!produtoParaEditar || !editNome || !editPrecoVenda) return;
    try {
      await supabase.from('produtos').update({
        nome: editNome, preco_custo: Number(editPrecoCusto) || 0, preco_venda: Number(editPrecoVenda),
        tamanho: editTamanho !== '' ? Number(editTamanho) : null, unidade_medida: editUnidadeMedida, estoque_minimo: Number(editEstoqueMinimo) || 5
      }).eq('id', produtoParaEditar.id);
      mostrarMensagem('Produto atualizado!', 'sucesso'); setProdutoParaEditar(null); carregarDados();
    } catch (error) { mostrarMensagem('Erro ao atualizar.', 'erro'); }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-8 relative">
      {feedback.tipo && (
        <div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg transition-all ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
          <p className="text-sm font-semibold">{feedback.msg}</p>
        </div>
      )}

      {/* NOVO MODAL: CARRINHO DE ENTRADA EM LOTE */}
      {modalLoteOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border">

            <div className="p-5 bg-gray-900 border-b flex justify-between items-center text-white">
              <div>
                <h3 className="text-lg font-black tracking-wide">📥 Compra de Estoque (Lote)</h3>
                <p className="text-xs text-gray-400 mt-0.5">Adicione produtos, atualize os custos e registre o pagamento.</p>
              </div>
              <button onClick={() => { setModalLoteOpen(false); setCarrinhoLote([]); }} className="text-gray-400 hover:text-white font-black text-xl px-2">✕</button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* ESQUERDA: BUSCA DE PRODUTOS */}
              <div className="w-1/2 border-r flex flex-col bg-white">
                <div className="p-4 border-b bg-gray-50">
                  <input
                    type="text"
                    placeholder="Pesquisar produto no catálogo..."
                    className="w-full p-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-cafe-primary bg-white shadow-sm"
                    value={termoBuscaLote}
                    onChange={(e) => setTermoBuscaLote(e.target.value)}
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {produtosFiltradosLote.map((p) => {
                    const noCarrinho = carrinhoLote.some(i => i.produtoId === p.id);
                    return (
                      <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border transition ${noCarrinho ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200 hover:border-blue-400 shadow-sm'}`}>
                        <div className="flex-1 min-w-0 pr-3">
                          <span className="font-bold text-sm block text-gray-800 truncate">{p.nome}</span>
                          <span className="text-xs text-gray-500 font-medium block mt-0.5">Estoque atual: <strong className="text-gray-700">{p.quantidade_estoque || 0}</strong> {p.unidade_medida}</span>
                        </div>
                        <button
                          disabled={noCarrinho}
                          onClick={() => adicionarAoLote(p)}
                          className={`px-3 py-1.5 text-xs font-bold rounded shadow-sm transition ${noCarrinho ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'}`}
                        >
                          {noCarrinho ? 'No Carrinho' : '+ Adicionar'}
                        </button>
                      </div>
                    );
                  })}
                  {produtosFiltradosLote.length === 0 && <p className="text-center text-gray-400 italic text-sm mt-10">Produto não encontrado.</p>}
                </div>
              </div>

              {/* DIREITA: CARRINHO E FORMULÁRIO FINANCEIRO */}
              <div className="w-1/2 flex flex-col bg-gray-50">
                <div className="p-3 bg-gray-200 border-b flex justify-between items-center shadow-inner">
                  <span className="text-xs font-black text-gray-600 uppercase tracking-widest">🛒 Itens Selecionados</span>
                  <span className="text-xs font-bold bg-gray-400 text-white px-2 py-0.5 rounded-full">{carrinhoLote.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {carrinhoLote.length === 0 ? (
                    <div className="text-center py-20 opacity-40 flex flex-col items-center">
                      <span className="text-5xl mb-3 grayscale">📦</span>
                      <p className="text-sm font-bold text-gray-600 uppercase">O carrinho está vazio</p>
                      <p className="text-xs text-gray-500 mt-1">Pesquise e adicione produtos ao lado.</p>
                    </div>
                  ) : (
                    carrinhoLote.map(item => (
                      <div key={item.produtoId} className="bg-white p-3 border rounded-xl shadow-sm relative group hover:border-gray-300 transition">
                        <button onClick={() => removerDoLote(item.produtoId)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 font-black px-2 opacity-0 group-hover:opacity-100 transition">✕</button>
                        <p className="font-bold text-sm mb-3 pr-6 text-gray-800">{item.nome}</p>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Qtd (Compra)</label>
                            <input type="number" min="1" value={item.qtd} onChange={e => atualizarLote(item.produtoId, 'qtd', e.target.value)} className="w-full p-1.5 border rounded text-sm font-bold outline-none focus:border-blue-500 bg-gray-50 text-center" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Custo Un. (R$)</label>
                            <input type="number" min="0" value={item.custoUnitario} onChange={e => atualizarLote(item.produtoId, 'custoUnitario', e.target.value)} className="w-full p-1.5 border rounded text-sm font-bold outline-none focus:border-red-400 bg-red-50 text-red-700" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Venda (R$)</label>
                            <input type="number" min="0" value={item.precoVenda} onChange={e => atualizarLote(item.produtoId, 'precoVenda', e.target.value)} className="w-full p-1.5 border rounded text-sm font-bold outline-none focus:border-green-500 bg-green-50 text-green-700" />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* PAINEL DE CHECKOUT / FINANCEIRO */}
                <div className="bg-white border-t p-5 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-10">
                  <div className="flex justify-between items-end mb-4 border-b pb-4">
                    <div>
                      <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Custo Total do Lote</span>
                      <span className="text-3xl font-black text-red-600">{formatarMoeda(carrinhoLote.reduce((acc, item) => acc + (Number(item.qtd) * Number(item.custoUnitario)), 0))}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Forma de Pagamento</label>
                        <select className="w-full p-2.5 border rounded bg-gray-50 outline-none text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-100" value={metodoPagamentoLote} onChange={(e) => setMetodoPagamentoLote(e.target.value)}>
                          <option value="PIX">📱 PIX (Debita do Banco)</option>
                          <option value="Dinheiro">💵 Dinheiro (Debita da Gaveta)</option>
                          <option value="Cartão de Débito">💳 Débito (Debita do Banco)</option>
                          <option value="Cartão de Crédito">💳 Crédito</option>
                          <option value="Conta a Pagar">⏳ A Prazo (Gera Conta Pagar)</option>
                        </select>
                      </div>
                      {metodoPagamentoLote === 'Conta a Pagar' ? (
                        <div className="animate-fade-in">
                          <label className="block text-[10px] font-bold text-red-500 uppercase mb-1">Data de Vencimento</label>
                          <input type="date" className="w-full p-2.5 border rounded bg-white outline-none text-xs font-bold border-red-200 text-red-700" value={dataVencimentoLote} onChange={(e) => setDataVencimentoLote(e.target.value)} />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Fornecedor (Opcional)</label>
                          <select className="w-full p-2.5 border rounded bg-gray-50 outline-none text-xs text-gray-600 cursor-pointer" value={fornecedorLoteId} onChange={(e) => setFornecedorLoteId(e.target.value)}>
                            <option value="">Sem fornecedor...</option>
                            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                          </select>
                        </div>
                      )}
                    </div>

                    {metodoPagamentoLote === 'Conta a Pagar' && (
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Fornecedor (Opcional)</label>
                        <select className="w-full p-2 border rounded bg-gray-50 outline-none text-xs text-gray-600 cursor-pointer" value={fornecedorLoteId} onChange={(e) => setFornecedorLoteId(e.target.value)}>
                          <option value="">Sem fornecedor...</option>
                          {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={salvarEntradasEmLote}
                    disabled={carregando}
                    className="w-full py-3.5 bg-green-600 text-white font-black uppercase tracking-widest rounded-xl text-sm shadow-lg shadow-green-600/30 hover:bg-green-700 hover:shadow-green-700/40 transition disabled:opacity-50 active:scale-[0.99]"
                  >
                    {carregando ? 'A Processar...' : 'Confirmar Compra e Estoque'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exclusão e Ajuste Manual */}
      {produtoParaApagar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full"><h3 className="text-xl font-bold mb-2">Inativar Produto</h3><p className="text-sm mb-6">Remover do PDV?</p><div className="flex gap-3"><button onClick={() => setProdutoParaApagar(null)} className="flex-1 px-4 py-2 bg-gray-100 rounded">Cancelar</button><button onClick={confirmarApagarProduto} className="flex-1 px-4 py-2 bg-red-600 text-white rounded">Remover</button></div></div>
        </div>
      )}

      {produtoParaAjuste && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold text-cafe-dark mb-2">Ajustar Estoque</h3>
            <p className="text-gray-600 mb-4 text-sm">Produto: <strong>{produtoParaAjuste.nome}</strong> (Atual: {produtoParaAjuste.quantidade_estoque})</p>

            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-sm font-semibold mb-1">Tipo de Movimento</label>
                <select className="w-full p-2 border rounded bg-white outline-none" value={ajusteTipo} onChange={(e) => setAjusteTipo(e.target.value)}>
                  <option value="Entrada - Reposição">🟢 Entrada (Reposição/Compra)</option>
                  <option value="Ajuste - Correção (Entrada)">⚠️ Ajuste (Correção Positiva / Testes)</option>
                  <option value="Ajuste - Correção (Saída)">⚠️ Ajuste (Correção Negativa / Testes)</option>
                  <option value="Saída - Quebra/Desperdício">🔴 Saída (Quebra/Desperdício)</option>
                  <option value="Saída - Vencimento">🔴 Saída (Vencimento)</option>
                  <option value="Saída - Consumo Interno">🔴 Saída (Consumo Interno)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Qtd a {ajusteTipo.includes('Saída') || ajusteTipo.includes('Negativa') ? 'Remover' : 'Adicionar'}</label>
                <input type="number" min="1" className="w-full p-2 border rounded outline-none font-bold text-center" value={ajusteQuantidade} onChange={(e) => setAjusteQuantidade(Number(e.target.value))} autoFocus />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Motivo (Opcional)</label>
                <input type="text" placeholder="Ex: Produto de testes..." className="w-full p-2 border rounded outline-none text-sm" value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setProdutoParaAjuste(null); setAjusteQuantidade(''); setAjusteMotivo(''); setAjusteTipo('Entrada - Reposição'); }} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-semibold transition">Cancelar</button>
              <button onClick={confirmarAjusteEstoque} className={`flex-1 px-4 py-2 text-white rounded font-semibold transition shadow ${ajusteTipo.includes('Ajuste') ? 'bg-amber-500 hover:bg-amber-600' : ajusteTipo.includes('Saída') ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {produtoParaEditar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-cafe-dark mb-4 border-b pb-2">Editar Cadastro do Produto</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold mb-1">Nome do Produto</label>
                <input type="text" className="w-full p-2 border rounded outline-none" value={editNome} onChange={(e) => setEditNome(e.target.value)} />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-semibold mb-1">Tamanho/Vol.</label>
                  <input type="number" className="w-full p-2 border rounded outline-none" value={editTamanho} onChange={(e) => setEditTamanho(e.target.value !== '' ? Number(e.target.value) : '')} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold mb-1">Medida</label>
                  <select className="w-full p-2 border rounded bg-white outline-none" value={editUnidadeMedida} onChange={(e) => setEditUnidadeMedida(e.target.value)}>
                    <option value="un">Unidade (un)</option>
                    <option value="ml">Mililitros (ml)</option>
                    <option value="l">Litros (l)</option>
                    <option value="g">Gramas (g)</option>
                    <option value="kg">Quilos (kg)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-semibold mb-1">Custo (R$)</label>
                  <input type="number" className="w-full p-2 border rounded outline-none" value={editPrecoCusto} onChange={(e) => setEditPrecoCusto(Number(e.target.value))} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold mb-1">Venda (R$)</label>
                  <input type="number" className="w-full p-2 border rounded outline-none" value={editPrecoVenda} onChange={(e) => setEditPrecoVenda(Number(e.target.value))} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Alerta Mínimo de Estoque</label>
                <input type="number" className="w-full p-2 border rounded outline-none" value={editEstoqueMinimo} onChange={(e) => setEditEstoqueMinimo(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setProdutoParaEditar(null)} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-semibold transition">Cancelar</button>
              <button onClick={salvarEdicaoProduto} className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded font-semibold transition shadow">
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold text-cafe-primary mb-6 border-b pb-2">Gestão de Revenda (Prontos)</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <div className="lg:col-span-1 space-y-4 bg-cafe-bg p-4 rounded-lg border h-fit">
          <h3 className="font-semibold mb-3">Novo Produto (Cadastro)</h3>
          <input type="text" className="w-full p-2 border rounded" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do Produto" />
          <div className="flex gap-2"><input type="number" className="w-full p-2 border rounded" value={tamanho} onChange={(e) => setTamanho(e.target.value !== '' ? Number(e.target.value) : '')} placeholder="Vol." /><select className="w-full p-2 border rounded" value={unidadeMedida} onChange={(e) => setUnidadeMedida(e.target.value)}><option value="un">un</option><option value="ml">ml</option><option value="l">l</option><option value="g">g</option><option value="kg">kg</option></select></div>
          <div className="flex gap-2"><input type="number" className="w-full p-2 border rounded" value={precoCusto} onChange={(e) => setPrecoCusto(Number(e.target.value))} placeholder="Custo (R$)" /><input type="number" className="w-full p-2 border rounded" value={precoVenda} onChange={(e) => setPrecoVenda(Number(e.target.value))} placeholder="Venda (R$)" /></div>
          <div className="flex gap-2"><input type="number" className="w-full p-2 border rounded" value={quantidadeEstoque} onChange={(e) => setQuantidadeEstoque(Number(e.target.value))} placeholder="Qtd" /><input type="number" className="w-full p-2 border rounded" value={estoqueMinimo} onChange={(e) => setEstoqueMinimo(Number(e.target.value))} placeholder="Mínimo" /></div>
          <button onClick={cadastrarProduto} className="w-full bg-cafe-secondary font-bold py-2 rounded">Cadastrar Produto</button>
        </div>

        <div className="lg:col-span-2">
          <div className="flex justify-between items-center gap-3 mb-3">
            <h3 className="font-semibold">Estoque Atual</h3>
            <div className="flex gap-2">
              <button onClick={() => setModalLoteOpen(true)} className="bg-green-600 text-white font-bold text-xs px-4 py-2 rounded shadow hover:bg-green-700">📦 Comprar / Abastecer</button>
              <input type="text" placeholder="Buscar..." className="p-2 border rounded text-sm w-48 focus:border-cafe-primary outline-none" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} />
            </div>
          </div>
          <div className="bg-white rounded-lg border shadow-sm overflow-auto h-[420px]">
            <table className="w-full text-left text-sm relative border-collapse">
              <thead className="bg-cafe-bg border-b sticky top-0 z-10">
                <tr><th className="p-3">Produto</th><th className="p-3">Estoque</th><th className="p-3">Venda</th><th className="p-3 text-center">Ações</th></tr>
              </thead>
              <tbody>
                {produtosFiltrados.map(p => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium text-cafe-dark">{p.nome} {p.tamanho && <span className="text-xs text-gray-500">({p.tamanho}{p.unidade_medida})</span>}</td>
                    <td className="p-3"><span className="font-semibold">{p.quantidade_estoque || 0}</span></td>
                    <td className="p-3 font-bold text-green-600">{formatarMoeda(p.preco_venda)}</td>
                    <td className="p-3 text-center space-x-3">
                      <button onClick={() => setProdutoParaAjuste(p)} className="text-amber-600 font-bold text-xs">Ajuste</button>
                      <button onClick={() => abrirModalEdicao(p)} className="text-blue-600 font-bold text-xs">Editar</button>
                      <button onClick={() => setProdutoParaApagar(p.id)} className="text-red-500 font-bold text-base">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t border-cafe-secondary/40">
        <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-4">Histórico de Movimentações (Revenda)</h3>
        <div className="bg-white rounded-lg border shadow-sm overflow-auto h-[400px]">
          <table className="w-full text-left border-collapse text-sm relative">
            <thead className="bg-cafe-bg border-b sticky top-0 z-10">
              <tr>
                <th className="p-3 font-semibold text-cafe-primary">Data/Hora</th>
                <th className="p-3 font-semibold text-cafe-primary">Produto</th>
                <th className="p-3 font-semibold text-cafe-primary">Movimento</th>
                <th className="p-3 font-semibold text-cafe-primary">Motivo</th>
                <th className="p-3 font-semibold text-cafe-primary">Qtd</th>
                <th className="p-3 font-semibold text-cafe-primary">Utilizador</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map(mov => {
                const isAjuste = mov.tipo_movimento.includes('Ajuste');
                const isEntrada = mov.tipo_movimento.includes('Entrada');
                return (
                  <tr key={mov.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500 text-xs">{formatarData(mov.created_at)}</td>
                    <td className="p-3 font-medium text-cafe-dark">{mov.produtos?.nome}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${isAjuste ? 'bg-amber-100 text-amber-800 border border-amber-200' : isEntrada ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {mov.tipo_movimento}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 text-xs max-w-[200px] truncate" title={mov.motivo}>{mov.motivo}</td>
                    <td className={`p-3 font-bold ${isAjuste ? 'text-amber-600' : isEntrada ? 'text-green-600' : 'text-red-600'}`}>{mov.quantidade > 0 ? '+' : ''}{mov.quantidade} <span className="text-xs font-normal text-gray-500">un</span></td>
                    <td className="p-3 text-xs text-gray-600 font-semibold">{mov.atendente}</td>
                  </tr>
                )
              })}
              {movimentacoes.length === 0 && (<tr><td colSpan={6} className="p-6 text-center text-gray-500 italic">Nenhum movimento registado ainda.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}