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

type PagamentoMisto = { metodo: string; valor: number | '' };

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

  // ESTADOS DO CARRINHO DE LOTE (COMPRA DE ESTOQUE)
  const [modalLoteOpen, setModalLoteOpen] = useState(false);
  const [abaLoteMobile, setAbaLoteMobile] = useState<'busca' | 'carrinho'>('busca');
  const [termoBuscaLote, setTermoBuscaLote] = useState('');
  const [carrinhoLote, setCarrinhoLote] = useState<ItemCarrinhoLote[]>([]);

  // Novos estados para Pagamento Misto
  const [modoPagamentoLote, setModoPagamentoLote] = useState<'unico' | 'misto'>('unico');
  const [metodoPagamentoLote, setMetodoPagamentoLote] = useState('PIX');
  const [pagamentosMistosLote, setPagamentosMistosLote] = useState<PagamentoMisto[]>([
    { metodo: 'PIX', valor: '' }, { metodo: 'Conta a Pagar', valor: '' }
  ]);

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
    } catch (error) { mostrarMensagem('Erro ao inativar.', 'erro'); } finally { setProdutoParaApagar(null); }
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

  // Cálculos dinâmicos para o Pagamento Misto
  const totalCustoLote = carrinhoLote.reduce((acc, item) => acc + (Number(item.qtd) * Number(item.custoUnitario || 0)), 0);
  const totalPagoMistoLote = pagamentosMistosLote.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  const faltaPagarMistoLote = modoPagamentoLote === 'misto' && totalPagoMistoLote < totalCustoLote ? totalCustoLote - totalPagoMistoLote : 0;
  const trocoMistoLote = modoPagamentoLote === 'misto' && totalPagoMistoLote > totalCustoLote ? totalPagoMistoLote - totalCustoLote : 0;

  const salvarEntradasEmLote = async () => {
    if (carrinhoLote.length === 0) return mostrarMensagem('O carrinho está vazio.', 'aviso');
    if (carrinhoLote.some(item => !item.qtd || Number(item.qtd) <= 0)) return mostrarMensagem('Qtd inválida no carrinho.', 'aviso');

    // Validação Financeira e Distribuição dos Pagamentos
    let vPix = 0, vDin = 0, vCred = 0, vDeb = 0, vTrans = 0, vPrazo = 0;
    let metodosImediatos: string[] = [];

    if (modoPagamentoLote === 'unico') {
      if (metodoPagamentoLote === 'Conta a Pagar') {
        if (!dataVencimentoLote && totalCustoLote > 0) return mostrarMensagem('Informe a data de vencimento para compras a prazo.', 'aviso');
        vPrazo = totalCustoLote;
      } else {
        if (metodoPagamentoLote === 'PIX') vPix = totalCustoLote;
        if (metodoPagamentoLote === 'Dinheiro') vDin = totalCustoLote;
        if (metodoPagamentoLote === 'Cartão de Crédito') vCred = totalCustoLote;
        if (metodoPagamentoLote === 'Cartão de Débito') vDeb = totalCustoLote;
        if (metodoPagamentoLote === 'Transferência') vTrans = totalCustoLote;
        metodosImediatos.push(metodoPagamentoLote);
      }
    } else {
      if (totalPagoMistoLote < totalCustoLote) return mostrarMensagem(`Falta alocar ${formatarMoeda(faltaPagarMistoLote)} nos pagamentos!`, 'erro');

      const temPrazo = pagamentosMistosLote.some(p => p.metodo === 'Conta a Pagar' && Number(p.valor) > 0);
      if (temPrazo && !dataVencimentoLote) {
        return mostrarMensagem('Informe a data de vencimento para o valor a prazo.', 'aviso');
      }

      let trocoRestante = trocoMistoLote;
      pagamentosMistosLote.forEach(p => {
        let val = Number(p.valor) || 0;
        if (val <= 0) return;

        if (p.metodo === 'Conta a Pagar') {
          vPrazo += val;
        } else {
          if (p.metodo === 'PIX') { vPix += val; metodosImediatos.push('PIX'); }
          if (p.metodo === 'Cartão de Crédito') { vCred += val; metodosImediatos.push('Cartão de Crédito'); }
          if (p.metodo === 'Cartão de Débito') { vDeb += val; metodosImediatos.push('Cartão de Débito'); }
          if (p.metodo === 'Transferência') { vTrans += val; metodosImediatos.push('Transferência'); }
          if (p.metodo === 'Dinheiro') {
            if (trocoRestante > 0) {
              if (val >= trocoRestante) { val -= trocoRestante; trocoRestante = 0; }
              else { trocoRestante -= val; val = 0; }
            }
            vDin += val;
            if (val > 0) metodosImediatos.push('Dinheiro');
          }
        }
      });
    }

    const valorImediatoTotal = vPix + vDin + vCred + vDeb + vTrans;

    if (vDin > 0 && !caixaAtivo) {
      return mostrarMensagem('Não é possível retirar dinheiro da gaveta com o caixa fechado.', 'erro');
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

      // 2. Registrar Transação Financeira
      if (totalCustoLote > 0) {
        const dataHoje = new Date().toISOString().split('T')[0];

        // Lançar valor imediato (PIX, Dinheiro, Cartões)
        if (valorImediatoTotal > 0) {
          const metodosUnicos = Array.from(new Set(metodosImediatos)).join(' + ');

          await supabase.from('contas_pagar').insert([{
            descricao: `Compra Lote (Pagamento Imediato)`,
            fornecedor_id: fornecedorLoteId || null,
            valor: valorImediatoTotal,
            data_vencimento: dataHoje,
            data_pagamento: dataHoje,
            status: 'Pago',
            metodo_pagamento: metodosUnicos
          }]);

          if (vDin > 0 && caixaAtivo) {
            await supabase.from('movimentacoes_caixa').insert([{
              caixa_id: caixaAtivo.id, tipo: 'despesa', valor: vDin, descricao: `Pago: Compra Estoque (Lote)`
            }]);
          }

          const valorBanco = vPix + vDeb + vTrans;
          if (valorBanco > 0) {
            const { data: banco } = await supabase.from('conta_bancaria').select('saldo').eq('id', 1).single();
            if (banco) {
              await supabase.from('conta_bancaria').update({ saldo: Number(banco.saldo) - valorBanco }).eq('id', 1);
            }
          }
        }

        // Lançar valor a prazo (Contas a Pagar)
        if (vPrazo > 0) {
          await supabase.from('contas_pagar').insert([{
            descricao: `Compra Lote (A Prazo)`,
            fornecedor_id: fornecedorLoteId || null,
            valor: vPrazo,
            data_vencimento: dataVencimentoLote,
            data_pagamento: null,
            status: 'Pendente',
            metodo_pagamento: null
          }]);
        }
      }

      mostrarMensagem('Lote processado e financeiro atualizado!', 'sucesso');
      setCarrinhoLote([]); setTermoBuscaLote(''); setModalLoteOpen(false);
      setModoPagamentoLote('unico'); setMetodoPagamentoLote('PIX'); setFornecedorLoteId(''); setDataVencimentoLote('');
      setPagamentosMistosLote([{ metodo: 'PIX', valor: '' }, { metodo: 'Conta a Pagar', valor: '' }]);
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

  // Verifica se o campo de Data de Vencimento deve ser exibido
  const mostraVencimentoLote = (modoPagamentoLote === 'unico' && metodoPagamentoLote === 'Conta a Pagar') ||
    (modoPagamentoLote === 'misto' && pagamentosMistosLote.some(p => p.metodo === 'Conta a Pagar' && Number(p.valor) > 0));

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-4 md:my-8 relative">
      {/* Feedback Toast */}
      {feedback.tipo && (
        <div className={`fixed top-4 right-4 z-[200] px-4 py-3 rounded shadow-lg transition-all ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
          <p className="text-sm font-semibold">{feedback.msg}</p>
        </div>
      )}

      {/* MODAL: CARRINHO DE ENTRADA EM LOTE */}
      {/* MODAL: CARRINHO DE ENTRADA EM LOTE */}
      {modalLoteOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-0 md:p-4">
          <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-5xl h-full md:h-[85vh] flex flex-col overflow-hidden border-0 md:border">

            <div className="p-4 md:p-5 bg-gray-900 md:border-b flex justify-between items-center text-white shrink-0 pt-safe-top">
              <div>
                <h3 className="text-lg font-black tracking-wide">📥 Compra (Lote)</h3>
                <p className="text-xs text-gray-400 mt-0.5 hidden md:block">Adicione produtos, atualize custos e divida o pagamento.</p>
              </div>
              <button onClick={() => { setModalLoteOpen(false); setCarrinhoLote([]); setAbaLoteMobile('busca'); }} className="text-gray-400 hover:text-red-500 font-black text-2xl px-2">✕</button>
            </div>

            {/* NAVEGAÇÃO MOBILE (TABS) */}
            <div className="lg:hidden flex bg-gray-100 p-1.5 shrink-0 border-b">
              <button
                onClick={() => setAbaLoteMobile('busca')}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition ${abaLoteMobile === 'busca' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500'}`}
              >
                🔍 Buscar Produtos
              </button>
              <button
                onClick={() => setAbaLoteMobile('carrinho')}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition flex items-center justify-center gap-2 ${abaLoteMobile === 'carrinho' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500'}`}
              >
                🛒 Carrinho
                {carrinhoLote.length > 0 && (
                  <span className={`${abaLoteMobile === 'carrinho' ? 'bg-cafe-primary text-white' : 'bg-gray-400 text-white'} px-2 py-0.5 rounded-full text-[10px]`}>
                    {carrinhoLote.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
              {/* ESQUERDA: BUSCA DE PRODUTOS */}
              <div className={`${abaLoteMobile === 'busca' ? 'flex' : 'hidden'} lg:flex w-full lg:w-1/2 border-r-0 lg:border-r flex-col bg-white h-full shrink-0 lg:shrink`}>
                <div className="p-3 md:p-4 border-b bg-gray-50">
                  <input
                    type="text"
                    placeholder="Pesquisar produto no catálogo..."
                    className="w-full p-3.5 md:p-2.5 border border-gray-300 rounded-lg outline-none text-base md:text-sm focus:ring-2 focus:ring-cafe-primary bg-white shadow-sm"
                    value={termoBuscaLote}
                    onChange={(e) => setTermoBuscaLote(e.target.value)}
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 pb-24 lg:pb-4 custom-scrollbar">
                  {produtosFiltradosLote.map((p) => {
                    const noCarrinho = carrinhoLote.some(i => i.produtoId === p.id);
                    return (
                      <div key={p.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 md:p-3 rounded-xl border transition gap-2 ${noCarrinho ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200 hover:border-blue-400 shadow-sm'}`}>
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-base md:text-sm block text-gray-800 truncate">{p.nome}</span>
                          <span className="text-xs text-gray-500 font-medium block mt-0.5">Estoque atual: <strong className="text-gray-700">{p.quantidade_estoque || 0}</strong> {p.unidade_medida}</span>
                        </div>
                        <button
                          disabled={noCarrinho}
                          onClick={() => adicionarAoLote(p)}
                          className={`w-full sm:w-auto px-4 py-3 sm:py-1.5 text-sm sm:text-xs font-bold rounded-lg shadow-sm transition ${noCarrinho ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 active:scale-95'}`}
                        >
                          {noCarrinho ? 'No Carrinho' : '+ Adicionar'}
                        </button>
                      </div>
                    );
                  })}
                  {produtosFiltradosLote.length === 0 && <p className="text-center text-gray-400 italic text-sm mt-6">Produto não encontrado.</p>}
                </div>

                {/* Botão flutuante mobile para ir ao carrinho rapidamente */}
                {abaLoteMobile === 'busca' && carrinhoLote.length > 0 && (
                  <div className="lg:hidden absolute bottom-4 left-4 right-4 z-50">
                    <button onClick={() => setAbaLoteMobile('carrinho')} className="w-full bg-green-600 text-white font-black py-4 rounded-xl shadow-[0_4px_14px_0_rgba(22,163,74,0.39)] hover:bg-green-700 active:scale-95 transition flex justify-center items-center gap-2">
                      Ver Carrinho ({carrinhoLote.length}) e Pagar
                    </button>
                  </div>
                )}
              </div>

              {/* DIREITA: CARRINHO E FORMULÁRIO FINANCEIRO */}
              <div className={`${abaLoteMobile === 'carrinho' ? 'flex' : 'hidden'} lg:flex w-full lg:w-1/2 flex-col bg-gray-50 flex-1 h-full overflow-hidden shrink-0 lg:shrink`}>
                <div className="hidden lg:flex p-3 bg-gray-200 border-b justify-between items-center shadow-inner shrink-0">
                  <span className="text-xs font-black text-gray-600 uppercase tracking-widest">🛒 Itens Selecionados</span>
                  <span className="text-xs font-bold bg-gray-500 text-white px-2 py-0.5 rounded-full">{carrinhoLote.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 custom-scrollbar min-h-[20vh]">
                  {carrinhoLote.length === 0 ? (
                    <div className="text-center py-10 md:py-20 opacity-40 flex flex-col items-center">
                      <span className="text-5xl mb-3 grayscale">📦</span>
                      <p className="text-sm font-bold text-gray-600 uppercase">O carrinho está vazio</p>
                      <button onClick={() => setAbaLoteMobile('busca')} className="lg:hidden mt-4 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-bold text-xs">Voltar à Busca</button>
                    </div>
                  ) : (
                    carrinhoLote.map(item => (
                      <div key={item.produtoId} className="bg-white p-3.5 md:p-3 border rounded-xl shadow-sm relative group">
                        <button onClick={() => removerDoLote(item.produtoId)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 font-black w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-red-50 rounded-lg transition">✕</button>
                        <p className="font-bold text-sm mb-3 pr-10 text-gray-800">{item.nome}</p>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Qtd</label>
                            <input type="number" min="1" value={item.qtd} onChange={e => atualizarLote(item.produtoId, 'qtd', e.target.value)} className="w-full p-2.5 md:p-2 border rounded-lg text-base md:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-center" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Custo (R$)</label>
                            <input type="number" min="0" value={item.custoUnitario} onChange={e => atualizarLote(item.produtoId, 'custoUnitario', e.target.value)} className="w-full p-2.5 md:p-2 border rounded-lg text-base md:text-sm font-bold outline-none focus:ring-2 focus:ring-red-300 bg-red-50 text-red-700" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Venda (R$)</label>
                            <input type="number" min="0" value={item.precoVenda} onChange={e => atualizarLote(item.produtoId, 'precoVenda', e.target.value)} className="w-full p-2.5 md:p-2 border rounded-lg text-base md:text-sm font-bold outline-none focus:ring-2 focus:ring-green-400 bg-green-50 text-green-700" />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* PAINEL DE CHECKOUT / FINANCEIRO */}
                <div className="bg-white border-t p-4 md:p-5 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-10 shrink-0 pb-safe-bottom">
                  <div className="flex justify-between items-end mb-3 border-b pb-3">
                    <div>
                      <span className="block text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Custo Total do Lote</span>
                      <span className="text-2xl md:text-3xl font-black text-red-600">{formatarMoeda(totalCustoLote)}</span>
                    </div>
                  </div>

                  {/* Seletor de Modo de Pagamento */}
                  <div className="flex bg-gray-100 p-1 rounded-lg mb-3">
                    <button onClick={() => setModoPagamentoLote('unico')} className={`flex-1 text-xs md:text-sm py-2.5 md:py-2 font-bold rounded-lg transition ${modoPagamentoLote === 'unico' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Pagamento Único</button>
                    <button onClick={() => setModoPagamentoLote('misto')} className={`flex-1 text-xs md:text-sm py-2.5 md:py-2 font-bold rounded-lg transition ${modoPagamentoLote === 'misto' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Combinar Formas</button>
                  </div>

                  <div className="space-y-3 mb-4 max-h-[35vh] lg:max-h-[25vh] overflow-y-auto pr-1 custom-scrollbar">

                    {/* Pagamento Único */}
                    {modoPagamentoLote === 'unico' && (
                      <div className="animate-fade-in">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Forma de Pagamento</label>
                        <select className="w-full p-3.5 md:p-2.5 border rounded-lg bg-gray-50 outline-none text-base md:text-sm font-bold text-gray-700 cursor-pointer focus:ring-2 focus:ring-blue-300" value={metodoPagamentoLote} onChange={(e) => setMetodoPagamentoLote(e.target.value)}>
                          <option value="PIX">📱 PIX (Debita Banco)</option>
                          <option value="Dinheiro">💵 Dinheiro (Gaveta)</option>
                          <option value="Cartão de Débito">💳 Débito</option>
                          <option value="Cartão de Crédito">💳 Crédito</option>
                          <option value="Transferência">🏦 Transferência</option>
                          <option value="Conta a Pagar">⏳ A Prazo (Conta a Pagar)</option>
                        </select>
                      </div>
                    )}

                    {/* Pagamento Misto */}
                    {modoPagamentoLote === 'misto' && (
                      <div className="space-y-2 border p-3 rounded-xl bg-gray-50 animate-fade-in">
                        {pagamentosMistosLote.map((pm, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <select className="flex-1 p-2.5 md:p-2 border rounded-lg font-semibold text-base md:text-sm bg-white outline-none focus:ring-2 focus:ring-blue-300" value={pm.metodo} onChange={(e) => { const n = [...pagamentosMistosLote]; n[index].metodo = e.target.value; setPagamentosMistosLote(n); }}>
                              <option value="PIX">PIX</option>
                              <option value="Dinheiro">Dinheiro</option>
                              <option value="Cartão de Crédito">Crédito</option>
                              <option value="Cartão de Débito">Débito</option>
                              <option value="Transferência">Transf.</option>
                              <option value="Conta a Pagar">A Prazo</option>
                            </select>
                            <input type="number" placeholder="R$" className="w-24 md:w-28 p-2.5 md:p-2 border rounded-lg font-bold text-base md:text-sm outline-none focus:ring-2 focus:ring-blue-300" value={pm.valor} onChange={(e) => { const n = [...pagamentosMistosLote]; n[index].valor = Number(e.target.value); setPagamentosMistosLote(n); }} />
                            {index > 0 && <button onClick={() => setPagamentosMistosLote(pagamentosMistosLote.filter((_, i) => i !== index))} className="w-9 h-9 md:w-8 md:h-8 flex items-center justify-center text-red-500 font-black bg-white border rounded-lg shadow-sm hover:bg-red-50">✕</button>}
                          </div>
                        ))}
                        <button onClick={() => setPagamentosMistosLote([...pagamentosMistosLote, { metodo: 'Cartão de Crédito', valor: '' }])} className="w-full text-xs font-bold text-blue-600 py-3 md:py-2 bg-white border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition">+ Adicionar Forma</button>

                        <div className="flex justify-between text-xs font-bold mt-2 pt-2 border-t border-gray-200">
                          <span className={faltaPagarMistoLote > 0 ? 'text-red-500' : 'text-gray-500'}>Falta: {formatarMoeda(faltaPagarMistoLote)}</span>
                          <span className={trocoMistoLote > 0 ? 'text-blue-600' : 'text-gray-500'}>Troco: {formatarMoeda(trocoMistoLote)}</span>
                        </div>
                      </div>
                    )}

                    {/* Vencimento e Fornecedor Dinâmico */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                      {mostraVencimentoLote && (
                        <div>
                          <label className="block text-[10px] font-bold text-red-500 uppercase mb-1">Vencimento (A Prazo)</label>
                          <input type="date" className="w-full p-3.5 md:p-2 border rounded-lg bg-white outline-none text-base md:text-sm font-bold border-red-200 text-red-700 focus:ring-2 focus:ring-red-400" value={dataVencimentoLote} onChange={(e) => setDataVencimentoLote(e.target.value)} />
                        </div>
                      )}
                      <div className={mostraVencimentoLote ? "" : "sm:col-span-2"}>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Fornecedor (Opcional)</label>
                        <select className="w-full p-3.5 md:p-2 border rounded-lg bg-gray-50 outline-none text-base md:text-sm text-gray-600 cursor-pointer" value={fornecedorLoteId} onChange={(e) => setFornecedorLoteId(e.target.value)}>
                          <option value="">Sem fornecedor...</option>
                          {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={salvarEntradasEmLote}
                    disabled={carregando}
                    className="w-full py-4 bg-green-600 text-white font-black uppercase tracking-widest rounded-xl text-sm shadow-lg hover:bg-green-700 active:scale-95 transition disabled:opacity-50 mt-1"
                  >
                    {carregando ? 'A Processar...' : 'Confirmar Compra'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exclusão */}
      {produtoParaApagar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full text-center">
            <div className="text-red-500 text-4xl mb-3">⚠️</div>
            <h3 className="text-xl font-bold mb-2">Inativar Produto</h3>
            <p className="text-sm text-gray-600 mb-6">Tem certeza que deseja remover este produto do PDV?</p>
            <div className="flex gap-3">
              <button onClick={() => setProdutoParaApagar(null)} className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold transition">Cancelar</button>
              <button onClick={confirmarApagarProduto} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md transition">Remover</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajuste Manual */}
      {produtoParaAjuste && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full border">
            <h3 className="text-xl font-black text-cafe-dark mb-2">Ajustar Estoque</h3>
            <p className="text-gray-600 mb-4 text-sm bg-gray-50 p-2 rounded-lg border">
              Produto: <strong className="block text-gray-800">{produtoParaAjuste.nome}</strong>
              <span className="text-xs block mt-1">Atual: <span className="font-bold">{produtoParaAjuste.quantidade_estoque} {produtoParaAjuste.unidade_medida}</span></span>
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de Movimento</label>
                <select className="w-full p-3 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-cafe-primary text-base md:text-sm" value={ajusteTipo} onChange={(e) => setAjusteTipo(e.target.value)}>
                  <option value="Entrada - Reposição">🟢 Entrada (Reposição/Compra)</option>
                  <option value="Ajuste - Correção (Entrada)">⚠️ Ajuste (Correção Positiva)</option>
                  <option value="Ajuste - Correção (Saída)">⚠️ Ajuste (Correção Negativa)</option>
                  <option value="Saída - Quebra/Desperdício">🔴 Saída (Quebra/Desperdício)</option>
                  <option value="Saída - Vencimento">🔴 Saída (Vencimento)</option>
                  <option value="Saída - Consumo Interno">🔴 Saída (Consumo Interno)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Qtd a {ajusteTipo.includes('Saída') || ajusteTipo.includes('Negativa') ? 'Remover' : 'Adicionar'}</label>
                <input type="number" min="1" className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-cafe-primary font-bold text-center text-base md:text-sm" value={ajusteQuantidade} onChange={(e) => setAjusteQuantidade(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Motivo (Opcional)</label>
                <input type="text" placeholder="Ex: Ajuste de inventário..." className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-cafe-primary text-base md:text-sm" value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setProdutoParaAjuste(null); setAjusteQuantidade(''); setAjusteMotivo(''); setAjusteTipo('Entrada - Reposição'); }} className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold transition">Cancelar</button>
              <button onClick={confirmarAjusteEstoque} className={`flex-1 px-4 py-3 text-white rounded-xl font-bold transition shadow-md active:scale-95 ${ajusteTipo.includes('Ajuste') ? 'bg-amber-500 hover:bg-amber-600' : ajusteTipo.includes('Saída') ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edição */}
      {produtoParaEditar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 md:p-6 w-full max-w-lg border max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-cafe-dark mb-4 border-b pb-3">Editar Produto</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold mb-1 text-gray-700">Nome do Produto</label>
                <input type="text" className="w-full p-3 md:p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-base md:text-sm" value={editNome} onChange={(e) => setEditNome(e.target.value)} />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-bold mb-1 text-gray-700">Tamanho/Vol.</label>
                  <input type="number" className="w-full p-3 md:p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-base md:text-sm" value={editTamanho} onChange={(e) => setEditTamanho(e.target.value !== '' ? Number(e.target.value) : '')} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold mb-1 text-gray-700">Medida</label>
                  <select className="w-full p-3 md:p-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-400 text-base md:text-sm" value={editUnidadeMedida} onChange={(e) => setEditUnidadeMedida(e.target.value)}>
                    <option value="un">Unidade (un)</option>
                    <option value="ml">Mililitros (ml)</option>
                    <option value="l">Litros (l)</option>
                    <option value="g">Gramas (g)</option>
                    <option value="kg">Quilos (kg)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-bold mb-1 text-gray-700">Custo (R$)</label>
                  <input type="number" className="w-full p-3 md:p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-base md:text-sm bg-gray-50" value={editPrecoCusto} onChange={(e) => setEditPrecoCusto(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold mb-1 text-gray-700">Venda (R$)</label>
                  <input type="number" className="w-full p-3 md:p-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-400 text-base md:text-sm font-bold text-green-700 bg-green-50" value={editPrecoVenda} onChange={(e) => setEditPrecoVenda(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1 text-gray-700">Alerta Mínimo de Estoque</label>
                <input type="number" className="w-full p-3 md:p-2 border rounded-lg outline-none focus:ring-2 focus:ring-amber-400 text-base md:text-sm" value={editEstoqueMinimo} onChange={(e) => setEditEstoqueMinimo(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => setProdutoParaEditar(null)} className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold transition">Cancelar</button>
              <button onClick={salvarEdicaoProduto} className="flex-1 px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold transition shadow-md">
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <h2 className="text-xl md:text-2xl font-bold text-cafe-primary mb-6 border-b pb-3">Gestão de Estoque (Produtos Prontos)</h2>

      {/* SESSÃO PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">

        {/* CADASTRO NOVO PRODUTO */}
        <div className="lg:col-span-1 space-y-4 bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm h-fit">
          <h3 className="font-black text-gray-800 border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider text-sm">Novo Produto</h3>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Nome</label>
            <input type="text" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Refrigerante Lata" />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Tam/Vol.</label>
              <input type="number" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white" value={tamanho} onChange={(e) => setTamanho(e.target.value !== '' ? Number(e.target.value) : '')} placeholder="Ex: 350" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Medida</label>
              <select className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white" value={unidadeMedida} onChange={(e) => setUnidadeMedida(e.target.value)}>
                <option value="un">un</option><option value="ml">ml</option><option value="l">l</option><option value="g">g</option><option value="kg">kg</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Custo (R$)</label>
              <input type="number" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white" value={precoCusto} onChange={(e) => setPrecoCusto(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Venda (R$)</label>
              <input type="number" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white font-bold text-green-700" value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Qtd Atual</label>
              <input type="number" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white" value={quantidadeEstoque} onChange={(e) => setQuantidadeEstoque(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Alerta Min.</label>
              <input type="number" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white" value={estoqueMinimo} onChange={(e) => setEstoqueMinimo(e.target.value === '' ? '' : Number(e.target.value))} placeholder="5" />
            </div>
          </div>

          <button onClick={cadastrarProduto} className="w-full bg-cafe-primary hover:bg-cafe-dark text-white font-black uppercase tracking-wider py-4 md:py-3 rounded-xl shadow-md transition active:scale-95 mt-2">
            Salvar Produto
          </button>
        </div>

        {/* ESTOQUE ATUAL */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <h3 className="font-black text-gray-800 uppercase tracking-wider text-sm">Catálogo e Estoque</h3>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button onClick={() => setModalLoteOpen(true)} className="w-full sm:w-auto bg-green-600 text-white font-bold text-sm px-4 py-3 md:py-2 rounded-lg shadow-sm hover:bg-green-700 transition active:scale-95">
                📦 Comprar / Abastecer
              </button>
              <input type="text" placeholder="🔍 Buscar produto..." className="w-full sm:w-48 p-3 md:p-2 border border-gray-300 rounded-lg text-base md:text-sm outline-none focus:ring-2 focus:ring-cafe-primary bg-white" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} />
            </div>
          </div>

          {/* VIEW MOBILE: Cards */}
          <div className="md:hidden space-y-3 overflow-y-auto max-h-[60vh] pb-4">
            {produtosFiltrados.map(p => {
              const alertaEstoque = p.quantidade_estoque <= p.estoque_minimo;
              return (
                <div key={p.id} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <span className="font-black text-gray-800 text-lg leading-tight pr-2">{p.nome} {p.tamanho && <span className="text-sm text-gray-500 font-semibold">({p.tamanho}{p.unidade_medida})</span>}</span>
                    <span className="text-green-600 font-black text-xl">{formatarMoeda(p.preco_venda)}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500 uppercase">Em Estoque:</span>
                    <span className={`font-black text-lg ${alertaEstoque ? 'text-red-600' : 'text-gray-800'}`}>
                      {p.quantidade_estoque} <span className="text-sm font-bold text-gray-500">{p.unidade_medida}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <button onClick={() => setProdutoParaAjuste(p)} className="bg-amber-50 text-amber-700 font-bold py-2.5 rounded-lg text-sm border border-amber-200 active:bg-amber-100 transition">Ajuste</button>
                    <button onClick={() => abrirModalEdicao(p)} className="bg-blue-50 text-blue-700 font-bold py-2.5 rounded-lg text-sm border border-blue-200 active:bg-blue-100 transition">Editar</button>
                    <button onClick={() => setProdutoParaApagar(p.id)} className="bg-red-50 text-red-600 font-bold py-2.5 rounded-lg text-sm border border-red-200 active:bg-red-100 transition">Excluir</button>
                  </div>
                </div>
              )
            })}
            {produtosFiltrados.length === 0 && <p className="text-center text-gray-400 italic py-6 text-sm">Nenhum produto encontrado.</p>}
          </div>

          {/* VIEW DESKTOP: Tabela */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-auto h-[420px]">
            <table className="w-full text-left text-sm relative border-collapse">
              <thead className="bg-gray-50 border-b sticky top-0 z-10 text-gray-600 uppercase tracking-wider text-xs">
                <tr><th className="p-4 font-bold">Produto</th><th className="p-4 font-bold text-center">Estoque</th><th className="p-4 font-bold">Venda</th><th className="p-4 font-bold text-center">Ações</th></tr>
              </thead>
              <tbody>
                {produtosFiltrados.map(p => {
                  const alertaEstoque = p.quantidade_estoque <= p.estoque_minimo;
                  return (
                    <tr key={p.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-bold text-gray-800">{p.nome} {p.tamanho && <span className="text-xs text-gray-500 font-semibold ml-1">({p.tamanho}{p.unidade_medida})</span>}</td>
                      <td className="p-4 text-center">
                        <span className={`font-black px-2 py-1 rounded-lg ${alertaEstoque ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                          {p.quantidade_estoque || 0}
                        </span>
                      </td>
                      <td className="p-4 font-black text-green-600">{formatarMoeda(p.preco_venda)}</td>
                      <td className="p-4 text-center space-x-2">
                        <button onClick={() => setProdutoParaAjuste(p)} className="text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-100 px-3 py-1.5 rounded-lg font-bold text-xs transition">Ajuste</button>
                        <button onClick={() => abrirModalEdicao(p)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-lg font-bold text-xs transition">Editar</button>
                        <button onClick={() => setProdutoParaApagar(p.id)} className="text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 px-3 py-1.5 rounded-lg font-bold text-xs transition">Excluir</button>
                      </td>
                    </tr>
                  )
                })}
                {produtosFiltrados.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-500 italic">Nenhum produto na lista.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* HISTÓRICO DE MOVIMENTAÇÕES */}
      <div className="pt-8 border-t border-gray-200">
        <h3 className="font-black text-gray-800 uppercase tracking-wider text-sm mb-4">Histórico de Movimentações</h3>

        {/* VIEW MOBILE: Cards */}
        <div className="md:hidden space-y-3 max-h-[50vh] overflow-y-auto pb-4">
          {movimentacoes.map(mov => {
            const isAjuste = mov.tipo_movimento.includes('Ajuste');
            const isEntrada = mov.tipo_movimento.includes('Entrada');
            return (
              <div key={mov.id} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{formatarData(mov.created_at)}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${isAjuste ? 'bg-amber-100 text-amber-800' : isEntrada ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {mov.tipo_movimento}
                  </span>
                </div>
                <span className="font-black text-gray-800">{mov.produtos?.nome}</span>
                <div className="bg-gray-50 p-2 rounded-lg border mt-1">
                  <span className="text-xs text-gray-500 italic block mb-1">"{mov.motivo}"</span>
                  <div className="flex justify-between items-center pt-1 border-t border-gray-200 mt-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Resp: {mov.atendente}</span>
                    <span className={`font-black text-lg ${isAjuste ? 'text-amber-600' : isEntrada ? 'text-green-600' : 'text-red-600'}`}>
                      {mov.quantidade > 0 ? '+' : ''}{mov.quantidade} <span className="text-xs font-bold text-gray-500">un</span>
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
          {movimentacoes.length === 0 && <p className="text-center text-gray-400 italic text-sm py-4">Nenhum movimento registrado.</p>}
        </div>

        {/* VIEW DESKTOP: Tabela */}
        <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-auto h-[400px]">
          <table className="w-full text-left border-collapse text-sm relative">
            <thead className="bg-gray-50 border-b sticky top-0 z-10 text-gray-600 uppercase tracking-wider text-xs">
              <tr>
                <th className="p-4 font-bold">Data/Hora</th>
                <th className="p-4 font-bold">Produto</th>
                <th className="p-4 font-bold">Movimento</th>
                <th className="p-4 font-bold">Motivo</th>
                <th className="p-4 font-bold text-center">Qtd</th>
                <th className="p-4 font-bold">Utilizador</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map(mov => {
                const isAjuste = mov.tipo_movimento.includes('Ajuste');
                const isEntrada = mov.tipo_movimento.includes('Entrada');
                return (
                  <tr key={mov.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500 text-xs font-semibold">{formatarData(mov.created_at)}</td>
                    <td className="p-4 font-bold text-gray-800">{mov.produtos?.nome}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold ${isAjuste ? 'bg-amber-100 text-amber-800 border border-amber-200' : isEntrada ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {mov.tipo_movimento}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 text-xs max-w-[200px] truncate" title={mov.motivo}>{mov.motivo}</td>
                    <td className={`p-4 text-center font-black ${isAjuste ? 'text-amber-600' : isEntrada ? 'text-green-600' : 'text-red-600'}`}>
                      {mov.quantidade > 0 ? '+' : ''}{mov.quantidade} <span className="text-xs font-bold text-gray-400">un</span>
                    </td>
                    <td className="p-4 text-xs text-gray-600 font-bold uppercase">{mov.atendente}</td>
                  </tr>
                )
              })}
              {movimentacoes.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-gray-500 italic">Nenhum movimento registrado ainda.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}