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

interface CadastroRevendaProps {
  atendente: string;
}

export default function CadastroRevenda({ atendente }: CadastroRevendaProps) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
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

  // ESTADOS PARA ENTRADA EM LOTE (EM MASSA)
  const [modalLoteOpen, setModalLoteOpen] = useState(false);
  const [valoresLote, setValoresLote] = useState<Record<string, number | ''>>({});
  const [termoBuscaLote, setTermoBuscaLote] = useState(''); // NOVO: Busca dentro do Lote

  // Estados para a Edição Completa do Produto
  const [produtoParaEditar, setProdutoParaEditar] = useState<Produto | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editPrecoCusto, setEditPrecoCusto] = useState<number | ''>('');
  const [editPrecoVenda, setEditPrecoVenda] = useState<number | ''>('');
  const [editEstoqueMinimo, setEditEstoqueMinimo] = useState<number | ''>('');
  const [editTamanho, setEditTamanho] = useState<number | ''>('');
  const [editUnidadeMedida, setEditUnidadeMedida] = useState('un');

  // Estado para o campo de busca
  const [termoBusca, setTermoBusca] = useState('');

  // Lógica de filtro para a tabela principal
  const produtosFiltrados = produtos.filter(produto =>
    produto.nome.toLowerCase().includes(termoBusca.toLowerCase())
  );

  // Lógica de filtro para o modal de Lote
  const produtosFiltradosLote = produtos.filter(produto =>
    produto.nome.toLowerCase().includes(termoBuscaLote.toLowerCase())
  );

  const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: null }), 3000);
  };

  const carregarDados = async () => {
    const { data: fichas } = await supabase.from('fichas_tecnicas').select('produto_venda_id');
    const produtosComReceita = new Set(fichas?.map(f => f.produto_venda_id) || []);

    const { data: prodData } = await supabase.from('produtos')
      .select('*').eq('tipo', 'venda').eq('ativo', true).order('nome');

    const { data: movData } = await supabase.from('movimentacoes_estoque')
      .select('id, quantidade, tipo_movimento, motivo, atendente, created_at, produto_id, produtos!inner(nome, unidade_medida, tipo)')
      .eq('produtos.tipo', 'venda')
      .order('created_at', { ascending: false }).limit(50);

    if (prodData) {
      const apenasRevendaPura = prodData.filter(p => !produtosComReceita.has(p.id));
      setProdutos(apenasRevendaPura);
    }

    if (movData) {
      const movPuros = (movData as any[]).filter(m => !produtosComReceita.has(m.produto_id));
      setMovimentacoes(movPuros as unknown as Movimentacao[]);
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
      const { error } = await supabase.from('produtos').update({ ativo: false }).eq('id', produtoParaApagar);
      if (error) throw error;
      mostrarMensagem('Produto inativado com sucesso.', 'sucesso');
      carregarDados();
    } catch (error) { mostrarMensagem('Erro ao remover produto.', 'erro'); } finally { setProdutoParaApagar(null); }
  };

  const confirmarAjusteEstoque = async () => {
    if (!produtoParaAjuste || !ajusteQuantidade || !ajusteTipo) return mostrarMensagem('Preencha a quantidade e o tipo.', 'aviso');

    let novoEstoque = 0;
    const isSaida = ajusteTipo.includes('Saída') || ajusteTipo.includes('Negativa');

    if (isSaida) {
      novoEstoque = produtoParaAjuste.quantidade_estoque - Number(ajusteQuantidade);
    } else {
      novoEstoque = produtoParaAjuste.quantidade_estoque + Number(ajusteQuantidade);
    }

    try {
      const { error: erroUpdate } = await supabase.from('produtos').update({ quantidade_estoque: novoEstoque }).eq('id', produtoParaAjuste.id);
      if (erroUpdate) throw erroUpdate;

      const { error: erroMov } = await supabase.from('movimentacoes_estoque').insert([{
        produto_id: produtoParaAjuste.id,
        quantidade: isSaida ? -Number(ajusteQuantidade) : Number(ajusteQuantidade),
        tipo_movimento: ajusteTipo,
        motivo: ajusteMotivo || 'Ajuste Manual',
        atendente
      }]);
      if (erroMov) throw erroMov;

      mostrarMensagem(`Estoque atualizado e registado!`, 'sucesso');
      carregarDados();
    } catch (error) {
      console.error(error);
      mostrarMensagem('Erro ao atualizar o estoque.', 'erro');
    } finally {
      setProdutoParaAjuste(null); setAjusteQuantidade(''); setAjusteMotivo(''); setAjusteTipo('Entrada - Reposição');
    }
  };

  // LÓGICA DE SALVAMENTO DAS ENTRADAS EM MASSA
  const salvarEntradasEmLote = async () => {
    const itensFiltrados = Object.entries(valoresLote).filter(([_, qtd]) => Number(qtd) > 0);
    if (itensFiltrados.length === 0) return mostrarMensagem('Preencha a quantidade de pelo menos um produto.', 'aviso');

    setCarregando(true);
    try {
      for (const [id, qtd] of itensFiltrados) {
        const prod = produtos.find(p => p.id === id);
        if (!prod) continue;

        const novoEstoque = prod.quantidade_estoque + Number(qtd);

        await supabase.from('produtos').update({ quantidade_estoque: novoEstoque }).eq('id', id);
        await supabase.from('movimentacoes_estoque').insert([{
          produto_id: id,
          quantidade: Number(qtd),
          tipo_movimento: 'Ajuste - Entrada Coletiva',
          motivo: 'Lançamento Rápido em Lote',
          atendente
        }]);
      }

      mostrarMensagem('Estoque de todos os produtos atualizado com sucesso!', 'sucesso');
      setValoresLote({});
      setTermoBuscaLote('');
      setModalLoteOpen(false);
      carregarDados();
    } catch (error) {
      mostrarMensagem('Erro ao registrar entrada em lote.', 'erro');
    } finally {
      setCarregando(false);
    }
  };

  const abrirModalEdicao = (produto: Produto) => {
    setProdutoParaEditar(produto);
    setEditNome(produto.nome);
    setEditPrecoCusto(produto.preco_custo);
    setEditPrecoVenda(produto.preco_venda);
    setEditTamanho(produto.tamanho || '');
    setEditUnidadeMedida(produto.unidade_medida);
    setEditEstoqueMinimo(produto.estoque_minimo);
  };

  const salvarEdicaoProduto = async () => {
    if (!produtoParaEditar || !editNome || !editPrecoVenda) return mostrarMensagem('Nome e Preço de Venda são obrigatórios.', 'aviso');

    try {
      const { error } = await supabase.from('produtos').update({
        nome: editNome,
        preco_custo: Number(editPrecoCusto) || 0,
        preco_venda: Number(editPrecoVenda),
        tamanho: editTamanho !== '' ? Number(editTamanho) : null,
        unidade_medida: editUnidadeMedida,
        estoque_minimo: Number(editEstoqueMinimo) || 5
      }).eq('id', produtoParaEditar.id);

      if (error) throw error;

      mostrarMensagem('Produto atualizado com sucesso!', 'sucesso');
      setProdutoParaEditar(null);
      carregarDados();
    } catch (error) {
      mostrarMensagem('Erro ao atualizar o produto.', 'erro');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-8 relative">
      {feedback.tipo && (
        <div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg transition-all ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
          <p className="text-sm font-semibold">{feedback.msg}</p>
        </div>
      )}

      {/* MODAL: ENTRADA COLETIVA DE PRODUTOS EM LOTE */}
      {modalLoteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden border">
            <div className="p-5 bg-gray-50 border-b flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-gray-800">📥 Lançamento Rápido (Entrada em Lote)</h3>
                <p className="text-xs text-gray-400">Insira as quantidades de reabastecimento direto de uma só vez</p>
              </div>
              <button onClick={() => { setModalLoteOpen(false); setValoresLote({}); setTermoBuscaLote(''); }} className="text-gray-400 hover:text-red-500 font-bold text-xl">×</button>
            </div>

            {/* CAMPO DE PESQUISA DO MODAL */}
            <div className="px-6 pt-4 pb-2 border-b border-gray-100 bg-white">
              <input
                type="text"
                placeholder="Pesquisar produto na lista..."
                className="w-full p-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-cafe-primary transition-colors bg-gray-50"
                value={termoBuscaLote}
                onChange={(e) => setTermoBuscaLote(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {produtosFiltradosLote.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100/50 transition">
                  <div className="flex-1 min-w-0 pr-3">
                    <span className="font-bold block text-gray-800 truncate">{p.nome}</span>
                    <span className="text-xs text-gray-400 font-medium">Estoque atual: {p.quantidade_estoque || 0} {p.unidade_medida}</span>
                  </div>
                  <div className="w-32 flex items-center gap-2">
                    <span className="text-xs font-black text-gray-400">+</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="0"
                      className="w-full p-2 border rounded-lg text-center font-bold outline-none text-sm focus:border-cafe-primary bg-white"
                      value={valoresLote[p.id] || ''}
                      onChange={(e) => setValoresLote({ ...valoresLote, [p.id]: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>
              ))}
              {produtosFiltradosLote.length === 0 && (
                <div className="text-center text-gray-500 italic text-sm py-10">
                  Nenhum produto correspondente encontrado.
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t flex gap-3">
              <button onClick={() => { setModalLoteOpen(false); setValoresLote({}); setTermoBuscaLote(''); }} className="flex-1 py-2.5 bg-white border rounded-xl font-semibold text-sm transition hover:bg-gray-100">Cancelar</button>
              <button
                onClick={salvarEntradasEmLote}
                disabled={carregando}
                className="flex-1 py-2.5 bg-green-600 text-white font-bold rounded-xl text-sm shadow hover:bg-green-700 transition disabled:opacity-50"
              >
                {carregando ? 'A processar estoque...' : 'Confirmar Lote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exclusão */}
      {produtoParaApagar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold text-cafe-dark mb-2">Inativar Produto</h3>
            <p className="text-gray-600 mb-6 text-sm">Remover este produto do PDV? O histórico de vendas será mantido.</p>
            <div className="flex gap-3">
              <button onClick={() => setProdutoParaApagar(null)} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-semibold">Cancelar</button>
              <button onClick={confirmarApagarProduto} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-semibold">Sim, Remover</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ajuste de Estoque (Auditoria) */}
      {produtoParaAjuste && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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

      {/* Modal de Edição Completa do Produto */}
      {produtoParaEditar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-cafe-dark mb-4 border-b pb-2">Editar Cadastro do Produto</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold mb-1">Nome do Produto</label>
                <input type="text" className="w-full p-2 border rounded outline-none" value={editNome} onChange={(e) => setEditNome(e.target.value)} />
              </div>

              <div className="flex gap-2">
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

              <div className="flex gap-2">
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

      <h2 className="text-2xl font-bold text-cafe-primary mb-6 border-b border-cafe-secondary/30 pb-2">Gestão de Revenda (Prontos)</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">

        {/* Formulário de Cadastro */}
        <div className="lg:col-span-1 space-y-4 bg-cafe-bg p-4 rounded-lg border border-gray-200 h-fit">
          <h3 className="font-semibold mb-3">Novo Produto</h3>
          <div><label className="block text-sm font-semibold mb-1">Nome (Ex: Coca-Cola)</label><input type="text" className="w-full p-2 border rounded outline-none" value={nome} onChange={(e) => setNome(e.target.value)} /></div>

          <div className="flex gap-2">
            <div className="flex-1"><label className="block text-sm font-semibold mb-1">Tamanho/Vol.</label><input type="number" placeholder="Ex: 350" className="w-full p-2 border rounded outline-none" value={tamanho} onChange={(e) => setTamanho(e.target.value !== '' ? Number(e.target.value) : '')} /></div>
            <div className="flex-1"><label className="block text-sm font-semibold mb-1">Medida</label><select className="w-full p-2 border rounded bg-white outline-none" value={unidadeMedida} onChange={(e) => setUnidadeMedida(e.target.value)}><option value="un">Unidade (un)</option><option value="ml">Mililitros (ml)</option><option value="l">Litros (l)</option><option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option></select></div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1"><label className="block text-sm font-semibold mb-1">Custo (R$)</label><input type="number" className="w-full p-2 border rounded outline-none" value={precoCusto} onChange={(e) => setPrecoCusto(Number(e.target.value))} /></div>
            <div className="flex-1"><label className="block text-sm font-semibold mb-1">Venda (R$)</label><input type="number" className="w-full p-2 border rounded outline-none" value={precoVenda} onChange={(e) => setPrecoVenda(Number(e.target.value))} /></div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1"><label className="block text-sm font-semibold mb-1">Qtd. Inicial</label><input type="number" className="w-full p-2 border rounded outline-none" value={quantidadeEstoque} onChange={(e) => setQuantidadeEstoque(Number(e.target.value))} /></div>
            <div className="flex-1"><label className="block text-sm font-semibold mb-1">Alerta Mín.</label><input type="number" className="w-full p-2 border rounded outline-none" value={estoqueMinimo} onChange={(e) => setEstoqueMinimo(Number(e.target.value))} /></div>
          </div>
          <button onClick={cadastrarProduto} className="w-full bg-cafe-secondary text-cafe-dark font-bold py-2 rounded shadow mt-2 hover:bg-opacity-90 transition">Cadastrar no PDV</button>
        </div>

        {/* Lista de Produtos Ativos */}
        <div className="lg:col-span-2">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-3">
            <h3 className="font-semibold">Produtos Ativos</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setModalLoteOpen(true)}
                className="bg-green-600 text-white font-bold text-xs px-3 py-2 rounded shadow-sm hover:bg-green-700 transition whitespace-nowrap h-[38px]"
              >
                📥 Entrada em Lote
              </button>
              <input
                type="text"
                placeholder="Buscar produto..."
                className="p-2 border border-gray-300 rounded outline-none text-sm w-full max-w-xs focus:border-cafe-primary transition-colors h-[38px]"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
              />
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto h-[420px]">
            <table className="w-full text-left border-collapse min-w-max relative">
              <thead className="bg-cafe-bg border-b sticky top-0">
                <tr className="text-sm">
                  <th className="p-3 font-semibold text-cafe-primary">Produto</th>
                  <th className="p-3 font-semibold text-cafe-primary">Estoque</th>
                  <th className="p-3 font-semibold text-cafe-primary">Venda</th>
                  <th className="p-3 font-semibold text-center text-cafe-primary">Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.map(p => (
                  <tr key={p.id} className="border-b text-sm hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-medium text-cafe-dark">{p.nome} {p.tamanho ? <span className="text-xs text-gray-500 font-normal">({p.tamanho} {p.unidade_medida})</span> : <span className="text-xs text-gray-400 font-normal">({p.unidade_medida})</span>}</td>
                    <td className="p-3">
                      <span className="font-semibold">{p.quantidade_estoque || 0}</span>
                      {p.quantidade_estoque <= 0 ? <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-800 rounded">Esgotado</span> : p.quantidade_estoque <= (p.estoque_minimo || 5) ? <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-yellow-100 text-yellow-800 rounded">Baixo</span> : <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-green-100 text-green-800 rounded">OK</span>}
                    </td>
                    <td className="p-3 font-bold text-green-600">{formatarMoeda(p.preco_venda)}</td>
                    <td className="p-3 text-center space-x-3">
                      <button onClick={() => setProdutoParaAjuste(p)} className="text-green-600 hover:text-green-800 font-bold text-xs" title="Auditoria de Estoque">Estoque</button>
                      <button onClick={() => abrirModalEdicao(p)} className="text-blue-600 hover:text-blue-800 font-bold text-xs" title="Editar Cadastro">Editar</button>
                      <button onClick={() => setProdutoParaApagar(p.id)} className="text-red-500 hover:text-red-700 font-bold text-lg" title="Remover">x</button>
                    </td>
                  </tr>
                ))}
                {produtosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500 italic">
                      {produtos.length === 0 ? 'Nenhum produto cadastrado.' : 'Nenhum produto encontrado na busca.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t border-cafe-secondary/40">
        <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-4">Histórico de Movimentações (Revenda)</h3>
        <div className="bg-white rounded-lg border shadow-sm overflow-auto h-[400px]">
          <table className="w-full text-left border-collapse text-sm relative">
            <thead className="bg-cafe-bg border-b sticky top-0">
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