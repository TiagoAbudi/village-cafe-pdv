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

  // NOVO: Estados para Contas a Pagar
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

  // Novo estado para o campo de busca de ingredientes
  const [termoBuscaIngrediente, setTermoBuscaIngrediente] = useState('');

  // Lógica de filtro para a tabela de ingredientes
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

  useEffect(() => { carregarDados(); }, []);

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
    } catch (error) { mostrarMensagem('Erro ao atualizar fornecedor.', 'erro'); } finally { setFornecedorParaEditar(null); setNomeFornecedorEditado(''); }
  };

  const confirmarApagarFornecedor = async () => {
    if (!fornecedorParaApagar) return;
    try {
      const { error } = await supabase.from('fornecedores').delete().eq('id', fornecedorParaApagar.id);
      if (error && error.code === '23503') return mostrarMensagem('Bloqueado: Este fornecedor possui compras registadas.', 'aviso');
      if (error) throw error;
      mostrarMensagem('Fornecedor excluído com sucesso.', 'sucesso');
      if (fornecedorId === fornecedorParaApagar.id) setFornecedorId(''); carregarDados();
    } catch (error) { mostrarMensagem('Erro ao excluir fornecedor.', 'erro'); } finally { setFornecedorParaApagar(null); }
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
    } catch (error) { mostrarMensagem('Erro ao excluir ingrediente.', 'erro'); } finally { setIngredienteParaApagar(null); }
  };

  // ATUALIZADO: Registar Entrada agora grava no histórico e lança Contas a Pagar
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

      // Grava no Histórico de Movimentações
      await supabase.from('movimentacoes_estoque').insert([{
        produto_id: ingredienteId, quantidade: Number(quantidadeComprada), tipo_movimento: 'Entrada - Compra', motivo: `Nota Fornecedor: ${nomeForn}`, atendente
      }]);

      // NOVO BLOCO: Lançar Conta a Pagar
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
    } catch (error) { mostrarMensagem('Ocorreu um erro ao gravar a entrada.', 'erro'); }
  };

  const registarAjusteAuditoria = async () => {
    if (!ajusteProdutoId || !ajusteQuantidade || !ajusteTipo) return mostrarMensagem('Preencha o produto, tipo e quantidade.', 'aviso');

    const produtoAtual = todosProdutos.find(p => p.id === ajusteProdutoId);
    if (!produtoAtual) return;

    let novoEstoque = 0;
    const isSaida = ajusteTipo.includes('Saída');

    if (isSaida) {
      novoEstoque = produtoAtual.quantidade_estoque - Number(ajusteQuantidade);
    } else {
      novoEstoque = produtoAtual.quantidade_estoque + Number(ajusteQuantidade);
    }

    try {
      const { error: erroUpdate } = await supabase.from('produtos').update({ quantidade_estoque: novoEstoque }).eq('id', ajusteProdutoId);
      if (erroUpdate) throw erroUpdate;

      // ATUALIZADO: Agora capturamos o erro do insert para não falhar silenciosamente
      const { error: erroMov } = await supabase.from('movimentacoes_estoque').insert([{
        produto_id: ajusteProdutoId,
        quantidade: isSaida ? -Number(ajusteQuantidade) : Number(ajusteQuantidade),
        tipo_movimento: ajusteTipo,
        motivo: ajusteMotivo || 'Não informado',
        atendente
      }]);
      if (erroMov) throw erroMov; // <--- ADICIONE ESTA LINHA

      mostrarMensagem('Ajuste de stock registado com sucesso.', 'sucesso');
      setAjusteQuantidade(''); setAjusteMotivo(''); carregarDados();
    } catch (error) {
      console.error(error);
      mostrarMensagem('Erro ao ajustar stock.', 'erro');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-8 relative">

      {feedback.tipo && (
        <div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg transition-all ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
          <span className="font-semibold">{feedback.msg}</span>
        </div>
      )}

      {ingredienteParaApagar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-xl font-bold mb-2">Excluir Ingrediente</h3><div className="flex gap-3 mt-6"><button onClick={() => setIngredienteParaApagar(null)} className="flex-1 bg-gray-100 py-2 rounded font-semibold">Cancelar</button><button onClick={confirmarApagarIngrediente} className="flex-1 bg-red-600 text-white py-2 rounded font-semibold">Excluir</button></div></div></div>
      )}
      {fornecedorParaApagar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-xl font-bold mb-2">Excluir Fornecedor</h3><div className="flex gap-3 mt-6"><button onClick={() => setFornecedorParaApagar(null)} className="flex-1 bg-gray-100 py-2 rounded font-semibold">Cancelar</button><button onClick={confirmarApagarFornecedor} className="flex-1 bg-red-600 text-white py-2 rounded font-semibold">Excluir</button></div></div></div>
      )}
      {fornecedorParaEditar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-xl font-bold mb-2">Editar Fornecedor</h3><input type="text" className="w-full p-2 border rounded my-4 outline-none" value={nomeFornecedorEditado} onChange={(e) => setNomeFornecedorEditado(e.target.value)} autoFocus /><div className="flex gap-3"><button onClick={() => setFornecedorParaEditar(null)} className="flex-1 bg-gray-100 py-2 rounded font-semibold">Cancelar</button><button onClick={salvarEdicaoFornecedor} className="flex-1 bg-blue-600 text-white py-2 rounded font-semibold">Salvar</button></div></div></div>
      )}

      <h2 className="text-2xl font-bold text-cafe-primary mb-6 border-b border-cafe-secondary/30 pb-2">Gestão de Compras e Estoque</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

        <div className="space-y-8">
          <div className="space-y-4">
            <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2">Registar Nota de Compra</h3>

            <div className="bg-cafe-bg p-4 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold">Fornecedor / Supermercado</label>
                <button onClick={() => setMostrarNovoFornecedor(!mostrarNovoFornecedor)} className="text-xs text-cafe-secondary font-bold hover:underline">{mostrarNovoFornecedor ? 'Cancelar' : '+ Novo'}</button>
              </div>
              {mostrarNovoFornecedor ? (
                <div className="flex gap-2"><input type="text" className="flex-1 p-2 border rounded outline-none" value={novoFornecedor} onChange={(e) => setNovoFornecedor(e.target.value)} /><button onClick={salvarNovoFornecedor} className="bg-green-600 text-white px-4 py-2 rounded font-bold">Salvar</button></div>
              ) : (
                <select className="w-full p-2 border rounded bg-white outline-none" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}><option value="">Selecione...</option>{fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
              )}
            </div>

            <div className="bg-cafe-bg p-4 rounded-lg border border-gray-200 space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2"><label className="text-sm font-semibold">Ingrediente Comprado</label><button onClick={() => setMostrarNovoIngrediente(!mostrarNovoIngrediente)} className="text-xs text-cafe-secondary font-bold hover:underline">{mostrarNovoIngrediente ? 'Cancelar' : '+ Novo'}</button></div>
                {mostrarNovoIngrediente ? (
                  <div className="space-y-2 bg-white p-3 rounded border"><input type="text" placeholder="Nome" className="w-full p-2 border rounded outline-none" value={novoIngredienteNome} onChange={(e) => setNovoIngredienteNome(e.target.value)} /><div className="flex gap-2"><select className="flex-1 p-2 border rounded outline-none" value={novoIngredienteUnidade} onChange={(e) => setNovoIngredienteUnidade(e.target.value)}><option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option><option value="ml">Mililitros (ml)</option><option value="l">Litros (l)</option><option value="unidade">Unidade (un)</option></select><input type="number" placeholder="Alerta Min" className="flex-1 p-2 border rounded outline-none" value={novoIngredienteEstoqueMinimo} onChange={(e) => setNovoIngredienteEstoqueMinimo(Number(e.target.value))} /></div><button onClick={salvarNovoIngrediente} className="w-full bg-green-600 text-white py-2 rounded font-bold mt-2">Salvar</button></div>
                ) : (
                  <select className="w-full p-2 border rounded bg-white outline-none" value={ingredienteId} onChange={(e) => setIngredienteId(e.target.value)}>{ingredientes.map(ing => <option key={ing.id} value={ing.id}>{ing.nome} (Atual: {ing.quantidade_estoque || 0}{ing.unidade_medida})</option>)}</select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold mb-1">Qtd. Comprada</label><input type="number" className="w-full p-2 border rounded outline-none" value={quantidadeComprada} onChange={(e) => setQuantidadeComprada(Number(e.target.value))} /></div>
                <div><label className="block text-sm font-semibold mb-1">Valor Pago (R$)</label><input type="number" className="w-full p-2 border rounded outline-none" value={valorTotalPago} onChange={(e) => setValorTotalPago(Number(e.target.value))} /></div>
              </div>

              {/* CHECKBOX E DATA DE VENCIMENTO */}
              <div className="bg-gray-50 border border-gray-200 p-3 rounded flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-cafe-dark">
                  <input type="checkbox" checked={gerarContaPagar} onChange={(e) => setGerarContaPagar(e.target.checked)} className="w-4 h-4 text-cafe-primary" />
                  Gerar Conta a Pagar (Boleto/A Prazo)?
                </label>
                {gerarContaPagar && (
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-gray-600">Vencimento da Conta</label>
                    <input type="date" className="w-full p-2 border rounded outline-none text-sm" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} />
                  </div>
                )}
              </div>

              <button onClick={registarEntrada} className="w-full bg-cafe-primary text-white font-bold py-3 rounded shadow hover:bg-cafe-dark transition">Gravar Compra e Atualizar Estoque</button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-3">Fornecedores</h3>
            <div className="bg-white rounded-lg border shadow-sm overflow-auto h-[193px]">
              <table className="w-full text-left border-collapse text-sm relative">
                <thead className="bg-cafe-bg border-b sticky top-0">
                  <tr>
                    <th className="p-3 font-semibold text-cafe-primary">Nome</th>
                    <th className="p-3 font-semibold text-center text-cafe-primary">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {fornecedores.map(f => (
                    <tr key={f.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{f.nome}</td>
                      <td className="p-3 text-center space-x-3">
                        <button onClick={() => { setFornecedorParaEditar(f); setNomeFornecedorEditado(f.nome); }} className="text-blue-600 hover:underline">Editar</button>
                        <button onClick={() => setFornecedorParaApagar(f)} className="text-red-500 font-bold text-lg px-2">x</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h3 className="font-semibold text-cafe-dark text-lg">Inventário (Ingredientes Base)</h3>
            <input
              type="text"
              placeholder="Buscar ingrediente..."
              className="p-2 border border-gray-300 rounded outline-none text-sm w-full max-w-[200px] focus:border-cafe-primary transition-colors"
              value={termoBuscaIngrediente}
              onChange={(e) => setTermoBuscaIngrediente(e.target.value)}
            />
          </div>
          <div className="bg-white rounded-lg border shadow-sm overflow-auto h-[580px]">
            <table className="w-full text-left border-collapse min-w-max text-sm relative">
              <thead className="bg-cafe-bg border-b sticky top-0">
                <tr><th className="p-3 font-semibold text-cafe-primary">Ingrediente</th><th className="p-3 font-semibold text-cafe-primary">Estoque</th><th className="p-3 font-semibold text-cafe-primary">Custo</th><th className="p-3 font-semibold text-center text-cafe-primary">Ação</th></tr>
              </thead>
              <tbody>
                {ingredientesFiltrados.map(ing => (
                  <tr key={ing.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{ing.nome}</td>
                    <td className="p-3"><span className="font-semibold">{ing.quantidade_estoque || 0}</span> <span className="text-xs text-gray-500">{ing.unidade_medida}</span>
                      {ing.quantidade_estoque <= 0 ? <span className="block mt-1 px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 rounded w-max">Sem Estoque</span> : ing.quantidade_estoque <= (ing.estoque_minimo || 0) ? <span className="block mt-1 px-2 py-0.5 text-[10px] font-bold bg-yellow-100 text-yellow-800 rounded w-max">Baixo</span> : null}
                    </td>
                    <td className="p-3 text-gray-500 text-xs">{formatarMoeda(ing.preco_custo)}</td>
                    <td className="p-3 text-center"><button onClick={() => setIngredienteParaApagar(ing.id)} className="text-red-500 font-bold px-2 text-lg">x</button></td>
                  </tr>
                ))}
                {ingredientesFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500 italic">
                      {ingredientes.length === 0 ? 'Nenhum ingrediente cadastrado.' : 'Nenhum ingrediente encontrado na busca.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-8 border-t border-cafe-secondary/40 grid grid-cols-1 lg:grid-cols-3 gap-8">

        <div className="lg:col-span-1 space-y-4">
          <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2">Auditoria e Ajuste Manual</h3>
          <div className="bg-cafe-bg p-4 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Ingrediente a Ajustar</label>
              <select className="w-full p-2 border rounded bg-white outline-none" value={ajusteProdutoId} onChange={(e) => setAjusteProdutoId(e.target.value)}>
                {todosProdutos.map(p => <option key={p.id} value={p.id}>{p.nome} (Atual: {p.quantidade_estoque} {p.tipo === 'venda' ? 'un' : p.unidade_medida})</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block text-sm font-semibold mb-1">Tipo de Ajuste</label>
                <select className="w-full p-2 border rounded bg-white outline-none" value={ajusteTipo} onChange={(e) => setAjusteTipo(e.target.value)}>
                  <option value="Saída - Quebra/Desperdício">🔴 Saída (Quebra/Desperdício)</option>
                  <option value="Saída - Vencimento">🔴 Saída (Vencimento)</option>
                  <option value="Saída - Consumo Interno">🔴 Saída (Consumo Interno)</option>
                  <option value="Entrada - Ajuste/Auditoria">🟢 Entrada (Ajuste/Sobra)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold mb-1">Quantidade a {ajusteTipo.includes('Saída') ? 'Remover' : 'Adicionar'}</label>
                <input type="number" min="0" className="w-full p-2 border rounded outline-none font-bold text-center" value={ajusteQuantidade} onChange={(e) => setAjusteQuantidade(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">Motivo (Opcional)</label>
              <input type="text" placeholder="Ex: Garrafa caiu e partiu" className="w-full p-2 border rounded outline-none text-sm" value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)} />
            </div>

            <button onClick={registarAjusteAuditoria} className={`w-full text-white font-bold py-2 rounded shadow transition ${ajusteTipo.includes('Saída') ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
              Confirmar Ajuste
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-4">Histórico de Movimentações (Últimos 30)</h3>
          <div className="bg-white rounded-lg border shadow-sm overflow-auto h-[400px]">
            <table className="w-full text-left border-collapse text-sm relative">
              <thead className="bg-cafe-bg border-b sticky top-0">
                <tr>
                  <th className="p-3 font-semibold text-cafe-primary">Data/Hora</th>
                  <th className="p-3 font-semibold text-cafe-primary">Produto</th>
                  <th className="p-3 font-semibold text-cafe-primary">Movimento</th>
                  <th className="p-3 font-semibold text-cafe-primary">Motivo</th>
                  <th className="p-3 font-semibold text-cafe-primary">Qtd</th>
                  <th className="p-3 font-semibold text-cafe-primary">Usuário</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map(mov => {
                  const isEntrada = mov.tipo_movimento.includes('Entrada');
                  return (
                    <tr key={mov.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-gray-500 text-xs">{formatarData(mov.created_at)}</td>
                      <td className="p-3 font-medium">{mov.produtos?.nome}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${isEntrada ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {mov.tipo_movimento}
                        </span>
                      </td>
                      <td className="p-3 text-gray-500 text-xs max-w-[150px] truncate" title={mov.motivo}>{mov.motivo}</td>
                      <td className={`p-3 font-bold ${isEntrada ? 'text-green-600' : 'text-red-600'}`}>
                        {mov.quantidade > 0 ? '+' : ''}{mov.quantidade} <span className="text-xs font-normal text-gray-500">{mov.produtos?.tipo === 'venda' ? 'un' : mov.produtos?.unidade_medida}</span>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{mov.atendente}</td>
                    </tr>
                  )
                })}
                {movimentacoes.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-gray-500 italic">Nenhum movimento registado ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}