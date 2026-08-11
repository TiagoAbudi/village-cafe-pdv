import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type Fornecedor = { id: string; nome: string };
type Produto = {
  id: string; nome: string; preco_custo: number;
  unidade_medida: string; quantidade_estoque: number; estoque_minimo: number; tipo: string;
};
type Movimentacao = {
  id: string; quantidade: number; tipo_movimento: string; motivo: string;
  atendente: string; created_at: string; produtos: { nome: string; unidade_medida: string; tipo: string };
};

interface EntradasComprasProps {
  atendente: string;
}

export default function EntradasCompras({ atendente }: EntradasComprasProps) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [ingredientes, setIngredientes] = useState<Produto[]>([]);
  const [todosProdutos, setTodosProdutos] = useState<Produto[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);

  // Estados Compras
  const [fornecedorId, setFornecedorId] = useState('');
  const [ingredienteId, setIngredienteId] = useState('');
  const [quantidadeComprada, setQuantidadeComprada] = useState<number | ''>('');
  const [valorTotalPago, setValorTotalPago] = useState<number | ''>('');

  // Estados para Contas a Pagar
  const [gerarContaPagar, setGerarContaPagar] = useState(false);
  const [dataVencimento, setDataVencimento] = useState('');

  // Estados Cadastros Rápidos
  const [novoFornecedor, setNovoFornecedor] = useState('');
  const [mostrarNovoFornecedor, setMostrarNovoFornecedor] = useState(false);
  const [novoIngredienteNome, setNovoIngredienteNome] = useState('');
  const [novoIngredienteUnidade, setNovoIngredienteUnidade] = useState('g');
  const [novoIngredienteEstoqueMinimo, setNovoIngredienteEstoqueMinimo] = useState<number | ''>(1000);
  const [mostrarNovoIngrediente, setMostrarNovoIngrediente] = useState(false);

  // Estados Auditoria de Estoque
  const [ajusteProdutoId, setAjusteProdutoId] = useState('');
  const [ajusteTipo, setAjusteTipo] = useState('Saída - Quebra/Desperdício');
  const [ajusteQuantidade, setAjusteQuantidade] = useState<number | ''>('');
  const [ajusteMotivo, setAjusteMotivo] = useState('');

  // Feedbacks e Modais
  const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });
  const [ingredienteParaApagar, setIngredienteParaApagar] = useState<string | null>(null);
  const [fornecedorParaApagar, setFornecedorParaApagar] = useState<Fornecedor | null>(null);
  const [fornecedorParaEditar, setFornecedorParaEditar] = useState<Fornecedor | null>(null);
  const [nomeFornecedorEditado, setNomeFornecedorEditado] = useState('');

  const [termoBuscaIngrediente, setTermoBuscaIngrediente] = useState('');

  const ingredientesFiltrados = ingredientes.filter(ing =>
    ing.nome.toLowerCase().includes(termoBuscaIngrediente.toLowerCase())
  );

  const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: null }), 4000);
  };

  const carregarDados = async () => {
    const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome');
    const { data: ingData } = await supabase.from('produtos').select('*').eq('tipo', 'ingrediente').eq('ativo', true).order('nome');
    const { data: todosData } = await supabase.from('produtos').select('*').eq('tipo', 'ingrediente').eq('ativo', true).order('nome');

    const { data: movData } = await supabase.from('movimentacoes_estoque')
      .select('id, quantidade, tipo_movimento, motivo, atendente, created_at, produtos!inner(nome, unidade_medida, tipo)')
      .eq('produtos.tipo', 'ingrediente')
      .order('created_at', { ascending: false }).limit(30);

    if (fornData) { setFornecedores(fornData); if (fornData.length > 0 && !fornecedorId) setFornecedorId(fornData[0].id); }
    if (ingData) { setIngredientes(ingData); if (ingData.length > 0 && !ingredienteId) setIngredienteId(ingData[0].id); }
    if (todosData) { setTodosProdutos(todosData); if (todosData.length > 0 && !ajusteProdutoId) setAjusteProdutoId(todosData[0].id); }
    if (movData) setMovimentacoes(movData as unknown as Movimentacao[]);
  };

   
  useEffect(() => {
    carregarDados();
  }, []);

  const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  const formatarData = (dataIso: string) => new Date(dataIso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const salvarNovoFornecedor = async () => {
    if (!novoFornecedor) return;
    const { data, error } = await supabase.from('fornecedores').insert([{ nome: novoFornecedor }]).select().single();
    if (!error && data) {
      setFornecedores([...fornecedores, data]); setFornecedorId(data.id); setNovoFornecedor(''); setMostrarNovoFornecedor(false); mostrarMensagem('Fornecedor adicionado!', 'sucesso');
    } else { mostrarMensagem('Erro ao adicionar fornecedor.', 'erro'); }
  };

  const salvarEdicaoFornecedor = async () => {
    if (!fornecedorParaEditar || !nomeFornecedorEditado) return;
    try {
      const { error } = await supabase.from('fornecedores').update({ nome: nomeFornecedorEditado }).eq('id', fornecedorParaEditar.id);
      if (error) throw error;
      mostrarMensagem('Fornecedor atualizado com sucesso!', 'sucesso'); carregarDados();
    } catch (err) { console.error(err); mostrarMensagem('Erro ao atualizar fornecedor.', 'erro'); } finally { setFornecedorParaEditar(null); setNomeFornecedorEditado(''); }
  };

  const confirmarApagarFornecedor = async () => {
    if (!fornecedorParaApagar) return;
    try {
      const { error } = await supabase.from('fornecedores').delete().eq('id', fornecedorParaApagar.id);
      if (error && error.code === '23503') return mostrarMensagem('Bloqueado: Este fornecedor possui compras registadas.', 'aviso');
      if (error) throw error;
      mostrarMensagem('Fornecedor excluído com sucesso.', 'sucesso');
      if (fornecedorId === fornecedorParaApagar.id) setFornecedorId(''); carregarDados();
    } catch (err) { console.error(err); mostrarMensagem('Erro ao excluir fornecedor.', 'erro'); } finally { setFornecedorParaApagar(null); }
  };

  const salvarNovoIngrediente = async () => {
    if (!novoIngredienteNome || !novoIngredienteUnidade) return;
    const { data, error } = await supabase.from('produtos').insert([{
      nome: novoIngredienteNome, tipo: 'ingrediente', unidade_medida: novoIngredienteUnidade, preco_custo: 0, quantidade_estoque: 0, estoque_minimo: Number(novoIngredienteEstoqueMinimo) || 0, ativo: true
    }]).select().single();
    if (!error && data) {
      setIngredientes([...ingredientes, data]); setIngredienteId(data.id); setNovoIngredienteNome(''); setNovoIngredienteUnidade('g'); setNovoIngredienteEstoqueMinimo(1000); setMostrarNovoIngrediente(false); mostrarMensagem('Ingrediente criado!', 'aviso');
    } else { mostrarMensagem('Erro ao criar ingrediente.', 'erro'); }
  };

  const confirmarApagarIngrediente = async () => {
    if (!ingredienteParaApagar) return;
    try {
      const { error } = await supabase.from('produtos').update({ ativo: false }).eq('id', ingredienteParaApagar);
      if (error) throw error;
      mostrarMensagem('Ingrediente removido.', 'sucesso'); carregarDados();
    } catch (err) { console.error(err); mostrarMensagem('Erro ao excluir ingrediente.', 'erro'); } finally { setIngredienteParaApagar(null); }
  };

  const registarEntrada = async () => {
    if (!fornecedorId || !ingredienteId || !quantidadeComprada || !valorTotalPago) return mostrarMensagem('Preencha todos os campos.', 'aviso');
    if (gerarContaPagar && !dataVencimento) return mostrarMensagem('Preencha a data de vencimento da conta.', 'aviso');

    const novoCustoUnitario = Number(valorTotalPago) / Number(quantidadeComprada);
    const produtoAtual = ingredientes.find(ing => ing.id === ingredienteId);
    const estoqueAtualizado = (produtoAtual?.quantidade_estoque || 0) + Number(quantidadeComprada);
    const nomeForn = fornecedores.find(f => f.id === fornecedorId)?.nome || '';
    const nomeIngrediente = produtoAtual?.nome || 'Produto';

    try {
      const { error: erroEntrada } = await supabase.from('entradas').insert([{ fornecedor_id: fornecedorId, total_nota: valorTotalPago }]);
      if (erroEntrada) throw erroEntrada;

      const { error: erroUpdate } = await supabase.from('produtos').update({ preco_custo: novoCustoUnitario, quantidade_estoque: estoqueAtualizado }).eq('id', ingredienteId);
      if (erroUpdate) throw erroUpdate;

      await supabase.from('movimentacoes_estoque').insert([{
        produto_id: ingredienteId, quantidade: Number(quantidadeComprada), tipo_movimento: 'Entrada - Compra', motivo: `Nota Fornecedor: ${nomeForn}`, atendente
      }]);

      if (gerarContaPagar) {
        await supabase.from('contas_pagar').insert([{
          descricao: `Compra de Estoque: ${nomeIngrediente}`,
          fornecedor_id: fornecedorId,
          valor: Number(valorTotalPago),
          data_vencimento: dataVencimento,
          status: 'Pendente'
        }]);
      }

      mostrarMensagem(gerarContaPagar ? 'Entrada e Conta a Pagar registadas com sucesso!' : 'Entrada registada! Stock atualizado.', 'sucesso');
      setQuantidadeComprada('');
      setValorTotalPago('');
      setGerarContaPagar(false);
      setDataVencimento('');
      carregarDados();
    } catch (err) { 
      console.error(err); 
      mostrarMensagem('Ocorreu um erro ao gravar a entrada.', 'erro'); 
    }
  };

  const registarAjusteAuditoria = async () => {
    if (!ajusteProdutoId || !ajusteQuantidade || !ajusteTipo) return mostrarMensagem('Preencha o produto, tipo e quantidade.', 'aviso');

    const produtoAtual = todosProdutos.find(p => p.id === ajusteProdutoId);
    if (!produtoAtual) return;

    const isSaida = ajusteTipo.includes('Saída');

    const novoEstoque = isSaida 
      ? produtoAtual.quantidade_estoque - Number(ajusteQuantidade)
      : produtoAtual.quantidade_estoque + Number(ajusteQuantidade);

    try {
      const { error: erroUpdate } = await supabase.from('produtos').update({ quantidade_estoque: novoEstoque }).eq('id', ajusteProdutoId);
      if (erroUpdate) throw erroUpdate;

      const { error: erroMov } = await supabase.from('movimentacoes_estoque').insert([{
        produto_id: ajusteProdutoId,
        quantidade: isSaida ? -Number(ajusteQuantidade) : Number(ajusteQuantidade),
        tipo_movimento: ajusteTipo,
        motivo: ajusteMotivo || 'Não informado',
        atendente
      }]);
      if (erroMov) throw erroMov;

      mostrarMensagem('Ajuste de stock registado com sucesso.', 'sucesso');
      setAjusteQuantidade(''); setAjusteMotivo(''); carregarDados();
    } catch (error) {
      console.error(error);
      mostrarMensagem('Erro ao ajustar stock.', 'erro');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-4 md:my-8 relative">

      {/* FEEDBACK TOAST */}
      {feedback.tipo && (
        <div className={`fixed top-4 right-4 z-[200] px-4 py-3 rounded-lg shadow-lg transition-all ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
          <span className="font-semibold text-sm">{feedback.msg}</span>
        </div>
      )}

      {/* MODAIS (Exclusão e Edição) */}
      {ingredienteParaApagar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center border">
            <div className="text-red-500 text-5xl mb-3">⚠️</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Excluir Ingrediente</h3>
            <p className="text-sm text-gray-600 mb-6">Esta ação removerá o ingrediente das opções.</p>
            <div className="flex gap-3">
              <button onClick={() => setIngredienteParaApagar(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-3 rounded-xl font-bold transition text-gray-700">Cancelar</button>
              <button onClick={confirmarApagarIngrediente} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition shadow-md">Excluir</button>
            </div>
          </div>
        </div>
      )}
      {fornecedorParaApagar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center border">
            <div className="text-red-500 text-5xl mb-3">⚠️</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Excluir Fornecedor</h3>
            <p className="text-sm text-gray-600 mb-6">Confirma a exclusão deste fornecedor?</p>
            <div className="flex gap-3">
              <button onClick={() => setFornecedorParaApagar(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-3 rounded-xl font-bold transition text-gray-700">Cancelar</button>
              <button onClick={confirmarApagarFornecedor} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition shadow-md">Excluir</button>
            </div>
          </div>
        </div>
      )}
      {fornecedorParaEditar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border">
            <h3 className="text-xl font-black text-cafe-dark mb-4 border-b pb-2">Editar Fornecedor</h3>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Fornecedor</label>
            <input type="text" className="w-full p-3 border border-gray-300 rounded-lg mb-6 outline-none focus:ring-2 focus:ring-blue-400 text-base bg-gray-50" value={nomeFornecedorEditado} onChange={(e) => setNomeFornecedorEditado(e.target.value)} autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setFornecedorParaEditar(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-3 rounded-xl font-bold transition text-gray-700">Cancelar</button>
              <button onClick={salvarEdicaoFornecedor} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition shadow-md">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER DA PÁGINA */}
      <h2 className="text-2xl font-black text-cafe-primary mb-6 border-b border-cafe-secondary/30 pb-3">Gestão de Compras e Estoque</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

        {/* COLUNA ESQUERDA: Registro de Compras e Fornecedores */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-6">
            <h3 className="font-black text-cafe-dark text-lg border-b border-gray-100 pb-2 mb-4 uppercase tracking-wider text-sm">Registar Nota de Compra</h3>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Fornecedor / Supermercado</label>
                <button onClick={() => setMostrarNovoFornecedor(!mostrarNovoFornecedor)} className="text-xs text-blue-600 font-bold hover:underline bg-blue-50 px-2 py-0.5 rounded">
                  {mostrarNovoFornecedor ? 'Cancelar' : '+ Cadastrar Novo'}
                </button>
              </div>
              {mostrarNovoFornecedor ? (
                <div className="flex flex-col sm:flex-row gap-2 animate-fade-in">
                  <input type="text" placeholder="Nome do fornecedor" className="flex-1 p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white" value={novoFornecedor} onChange={(e) => setNovoFornecedor(e.target.value)} />
                  <button onClick={salvarNovoFornecedor} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold shadow transition">Salvar</button>
                </div>
              ) : (
                <select className="w-full p-3 border border-gray-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Ingrediente Comprado</label>
                  <button onClick={() => setMostrarNovoIngrediente(!mostrarNovoIngrediente)} className="text-xs text-blue-600 font-bold hover:underline bg-blue-50 px-2 py-0.5 rounded">
                    {mostrarNovoIngrediente ? 'Cancelar' : '+ Cadastrar Novo'}
                  </button>
                </div>
                {mostrarNovoIngrediente ? (
                  <div className="space-y-3 bg-white p-3 md:p-4 rounded-lg border border-blue-100 shadow-inner animate-fade-in">
                    <input type="text" placeholder="Nome do ingrediente" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-base md:text-sm" value={novoIngredienteNome} onChange={(e) => setNovoIngredienteNome(e.target.value)} />
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select className="w-full sm:flex-1 p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-base md:text-sm bg-gray-50" value={novoIngredienteUnidade} onChange={(e) => setNovoIngredienteUnidade(e.target.value)}>
                        <option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option><option value="ml">Mililitros (ml)</option><option value="l">Litros (l)</option><option value="unidade">Unidade (un)</option>
                      </select>
                      <input type="number" placeholder="Alerta Min." className="w-full sm:flex-1 p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-base md:text-sm" value={novoIngredienteEstoqueMinimo} onChange={(e) => setNovoIngredienteEstoqueMinimo(Number(e.target.value))} />
                    </div>
                    <button onClick={salvarNovoIngrediente} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold mt-1 shadow transition">Salvar Ingrediente</button>
                  </div>
                ) : (
                  <select className="w-full p-3 border border-gray-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm" value={ingredienteId} onChange={(e) => setIngredienteId(e.target.value)}>
                    {ingredientes.map(ing => <option key={ing.id} value={ing.id}>{ing.nome} (Atual: {ing.quantidade_estoque || 0}{ing.unidade_medida})</option>)}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Qtd. Comprada</label>
                  <input type="number" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white" value={quantidadeComprada} onChange={(e) => setQuantidadeComprada(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Valor Pago (R$)</label>
                  <input type="number" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm font-bold text-red-600 bg-red-50" value={valorTotalPago} onChange={(e) => setValorTotalPago(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" />
                </div>
              </div>

              {/* CHECKBOX E DATA DE VENCIMENTO */}
              <div className="bg-white border border-gray-200 p-3 rounded-lg flex flex-col gap-3 shadow-sm">
                <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-cafe-dark select-none">
                  <input type="checkbox" checked={gerarContaPagar} onChange={(e) => setGerarContaPagar(e.target.checked)} className="w-5 h-5 text-cafe-primary rounded border-gray-300" />
                  Gerar Conta a Pagar (Boleto/A Prazo)?
                </label>
                {gerarContaPagar && (
                  <div className="animate-fade-in pl-8">
                    <label className="block text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">Vencimento da Conta</label>
                    <input type="date" className="w-full p-3 md:p-2 border border-red-200 rounded-lg outline-none text-base md:text-sm text-red-700 bg-red-50 focus:ring-2 focus:ring-red-400" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} />
                  </div>
                )}
              </div>

              <button onClick={registarEntrada} className="w-full bg-cafe-primary text-white font-black uppercase tracking-wider py-4 md:py-3.5 rounded-xl shadow-lg hover:bg-cafe-dark transition active:scale-95 mt-2">
                Gravar Compra e Estoque
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-black text-cafe-dark text-sm uppercase tracking-wider">Fornecedores Cadastrados</h3>
            </div>

            {/* VIEW MOBILE: Fornecedores */}
            <div className="md:hidden max-h-[300px] overflow-y-auto p-2">
              {fornecedores.map(f => (
                <div key={f.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100 mb-2">
                  <span className="font-bold text-gray-800 text-sm">{f.nome}</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setFornecedorParaEditar(f); setNomeFornecedorEditado(f.nome); }} className="bg-blue-50 text-blue-600 w-8 h-8 rounded-lg flex items-center justify-center font-bold">✎</button>
                    <button onClick={() => setFornecedorParaApagar(f)} className="bg-red-50 text-red-600 w-8 h-8 rounded-lg flex items-center justify-center font-bold">🗑</button>
                  </div>
                </div>
              ))}
              {fornecedores.length === 0 && <p className="text-center text-gray-400 text-sm py-4 italic">Nenhum fornecedor.</p>}
            </div>

            {/* VIEW DESKTOP: Fornecedores */}
            <div className="hidden md:block overflow-auto max-h-[250px] custom-scrollbar">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-3 font-bold text-gray-600 uppercase text-xs">Nome do Fornecedor</th>
                    <th className="p-3 font-bold text-center text-gray-600 uppercase text-xs">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {fornecedores.map(f => (
                    <tr key={f.id} className="border-b hover:bg-gray-50 transition">
                      <td className="p-3 font-semibold text-gray-800">{f.nome}</td>
                      <td className="p-3 text-center space-x-3">
                        <button onClick={() => { setFornecedorParaEditar(f); setNomeFornecedorEditado(f.nome); }} className="text-blue-600 hover:text-blue-800 font-bold bg-blue-50 px-3 py-1 rounded transition">Editar</button>
                        <button onClick={() => setFornecedorParaApagar(f)} className="text-red-500 hover:text-red-700 font-bold bg-red-50 px-3 py-1 rounded transition">Excluir</button>
                      </td>
                    </tr>
                  ))}
                  {fornecedores.length === 0 && <tr><td colSpan={2} className="p-4 text-center text-gray-400 italic">Nenhum fornecedor cadastrado.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: Inventário de Ingredientes */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden">
          <div className="p-4 md:p-5 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h3 className="font-black text-cafe-dark text-sm uppercase tracking-wider">Inventário de Base</h3>
            <input
              type="text"
              placeholder="🔍 Buscar ingrediente..."
              className="w-full sm:max-w-[220px] p-3 md:p-2 border border-gray-300 rounded-lg outline-none text-base md:text-sm focus:ring-2 focus:ring-cafe-primary bg-white shadow-sm"
              value={termoBuscaIngrediente}
              onChange={(e) => setTermoBuscaIngrediente(e.target.value)}
            />
          </div>

          {/* VIEW MOBILE: Inventário */}
          <div className="md:hidden flex-1 overflow-y-auto max-h-[60vh] p-3 space-y-3 bg-gray-50/50">
            {ingredientesFiltrados.map(ing => {
              const semEstoque = ing.quantidade_estoque <= 0;
              const alerta = ing.quantidade_estoque <= (ing.estoque_minimo || 0);
              return (
                <div key={ing.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative">
                  <button onClick={() => setIngredienteParaApagar(ing.id)} className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 font-black rounded-lg transition">✕</button>
                  <h4 className="font-black text-gray-800 text-base mb-2 pr-8">{ing.nome}</h4>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-gray-50 p-2 rounded-lg border border-gray-100 flex flex-col">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Estoque</span>
                      <span className="font-black text-gray-800 text-lg leading-none mt-1">
                        {ing.quantidade_estoque || 0} <span className="text-xs font-bold text-gray-500">{ing.unidade_medida}</span>
                      </span>
                      {semEstoque ? <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded mt-1 w-max">Zerado</span> : alerta ? <span className="text-[9px] bg-yellow-100 text-yellow-700 font-bold px-1.5 py-0.5 rounded mt-1 w-max">Baixo</span> : null}
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg border border-gray-100 flex flex-col">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Custo Médio</span>
                      <span className="font-bold text-gray-600 mt-1">{formatarMoeda(ing.preco_custo)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            {ingredientesFiltrados.length === 0 && <p className="text-center text-gray-400 italic py-6 text-sm">Nenhum ingrediente base.</p>}
          </div>

          {/* VIEW DESKTOP: Inventário */}
          <div className="hidden md:block flex-1 overflow-y-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-4 font-bold text-gray-600 uppercase text-xs">Ingrediente</th>
                  <th className="p-4 font-bold text-gray-600 uppercase text-xs">Estoque</th>
                  <th className="p-4 font-bold text-gray-600 uppercase text-xs">Custo Unit.</th>
                  <th className="p-4 font-bold text-center text-gray-600 uppercase text-xs">Remover</th>
                </tr>
              </thead>
              <tbody>
                {ingredientesFiltrados.map(ing => (
                  <tr key={ing.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="p-4 font-bold text-gray-800">{ing.nome}</td>
                    <td className="p-4">
                      <span className="font-black text-gray-800 text-base">{ing.quantidade_estoque || 0}</span> <span className="text-xs font-bold text-gray-500">{ing.unidade_medida}</span>
                      {ing.quantidade_estoque <= 0 ? <span className="block mt-1 px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 rounded w-max">Sem Estoque</span> : ing.quantidade_estoque <= (ing.estoque_minimo || 0) ? <span className="block mt-1 px-2 py-0.5 text-[10px] font-bold bg-yellow-100 text-yellow-800 rounded w-max">Baixo</span> : null}
                    </td>
                    <td className="p-4 text-gray-600 font-semibold">{formatarMoeda(ing.preco_custo)}</td>
                    <td className="p-4 text-center">
                      <button onClick={() => setIngredienteParaApagar(ing.id)} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 w-8 h-8 rounded-lg font-black transition">✕</button>
                    </td>
                  </tr>
                ))}
                {ingredientesFiltrados.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-400 italic">Nenhum ingrediente base na lista.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-8 border-t border-cafe-secondary/40 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* AUDITORIA DE ESTOQUE */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <h3 className="font-black text-cafe-dark text-sm border-b border-gray-100 pb-3 mb-4 uppercase tracking-wider">Auditoria / Ajuste Manual</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ingrediente a Ajustar</label>
                <select className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm font-semibold text-gray-700" value={ajusteProdutoId} onChange={(e) => setAjusteProdutoId(e.target.value)}>
                  {todosProdutos.map(p => <option key={p.id} value={p.id}>{p.nome} (Atual: {p.quantidade_estoque} {p.tipo === 'venda' ? 'un' : p.unidade_medida})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Ajuste</label>
                  <select className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm font-semibold text-gray-700" value={ajusteTipo} onChange={(e) => setAjusteTipo(e.target.value)}>
                    <option value="Saída - Quebra/Desperdício">🔴 Saída (Quebra/Desperdício)</option>
                    <option value="Saída - Vencimento">🔴 Saída (Vencimento)</option>
                    <option value="Saída - Consumo Interno">🔴 Saída (Consumo Interno)</option>
                    <option value="Entrada - Ajuste/Auditoria">🟢 Entrada (Ajuste/Sobra)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Qtd a {ajusteTipo.includes('Saída') ? 'Remover' : 'Adicionar'}</label>
                  <input type="number" min="0" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm font-bold text-center bg-white" value={ajusteQuantidade} onChange={(e) => setAjusteQuantidade(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo (Opcional)</label>
                <input type="text" placeholder="Ex: Garrafa caiu e partiu" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-white" value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)} />
              </div>

              <button onClick={registarAjusteAuditoria} className={`w-full text-white font-black uppercase tracking-wider py-4 md:py-3.5 rounded-xl shadow-md transition active:scale-95 mt-2 ${ajusteTipo.includes('Saída') ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                Confirmar Ajuste
              </button>
            </div>
          </div>
        </div>

        {/* HISTÓRICO DE MOVIMENTAÇÕES */}
        <div className="lg:col-span-2">
          <h3 className="font-black text-cafe-dark text-sm border-b pb-2 mb-4 uppercase tracking-wider">Histórico de Movimentações (Últimos 30)</h3>

          {/* VIEW MOBILE: Cards do Histórico */}
          <div className="md:hidden space-y-3 max-h-[60vh] overflow-y-auto pb-4">
            {movimentacoes.map(mov => {
              const isEntrada = mov.tipo_movimento.includes('Entrada');
              return (
                <div key={mov.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{formatarData(mov.created_at)}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${isEntrada ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {mov.tipo_movimento}
                    </span>
                  </div>
                  <h4 className="font-black text-gray-800 text-base">{mov.produtos?.nome}</h4>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1">
                    <p className="text-xs text-gray-600 italic mb-2 leading-tight">"{mov.motivo}"</p>
                    <div className="flex justify-between items-end pt-2 border-t border-gray-200 mt-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Resp: {mov.atendente}</span>
                      <span className={`font-black text-lg ${isEntrada ? 'text-green-600' : 'text-red-600'}`}>
                        {mov.quantidade > 0 ? '+' : ''}{mov.quantidade} <span className="text-xs font-bold text-gray-500">{mov.produtos?.tipo === 'venda' ? 'un' : mov.produtos?.unidade_medida}</span>
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            {movimentacoes.length === 0 && <p className="text-center text-gray-400 italic text-sm py-6">Nenhum movimento registrado.</p>}
          </div>

          {/* VIEW DESKTOP: Tabela do Histórico */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-auto h-[480px] custom-scrollbar">
            <table className="w-full text-left border-collapse text-sm relative">
              <thead className="bg-gray-50 border-b sticky top-0 z-10 text-gray-600 uppercase tracking-wider text-xs">
                <tr>
                  <th className="p-4 font-bold">Data/Hora</th>
                  <th className="p-4 font-bold">Produto</th>
                  <th className="p-4 font-bold">Movimento</th>
                  <th className="p-4 font-bold">Motivo</th>
                  <th className="p-4 font-bold text-center">Qtd</th>
                  <th className="p-4 font-bold">Usuário</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map(mov => {
                  const isEntrada = mov.tipo_movimento.includes('Entrada');
                  return (
                    <tr key={mov.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-gray-500 text-xs font-semibold">{formatarData(mov.created_at)}</td>
                      <td className="p-4 font-bold text-gray-800">{mov.produtos?.nome}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${isEntrada ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                          {mov.tipo_movimento}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500 text-xs max-w-[200px] truncate" title={mov.motivo}>{mov.motivo}</td>
                      <td className={`p-4 text-center font-black ${isEntrada ? 'text-green-600' : 'text-red-600'}`}>
                        {mov.quantidade > 0 ? '+' : ''}{mov.quantidade} <span className="text-xs font-bold text-gray-400">{mov.produtos?.tipo === 'venda' ? 'un' : mov.produtos?.unidade_medida}</span>
                      </td>
                      <td className="p-4 text-xs font-bold text-gray-600 uppercase">{mov.atendente}</td>
                    </tr>
                  )
                })}
                {movimentacoes.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500 italic">Nenhum movimento registado ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}