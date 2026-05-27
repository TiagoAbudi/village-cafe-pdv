import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

type ItemVenda = { produto_id: string; quantidade: number; preco_unitario: number; produtos: { nome: string } };
type Venda = { 
  id: string; total: number; metodo_pagamento: string; data_venda: string; identificacao_pedido: string;
  valor_pix: number; valor_dinheiro: number; valor_cartao_credito: number; valor_cartao_debito: number;
  atendente: string; itens_venda: ItemVenda[];
};
type Caixa = { id: string; fundo_inicial: number; status: string; data_abertura: string };
type ProdutoAtivo = { id: string; nome: string; preco_venda: number; quantidade_estoque: number; is_receita: boolean; };
type ItemEdicao = { produto_id: string; nome: string; preco_unitario: number; quantidade: number; is_receita: boolean; };

export default function DashboardModulo() {
  const [caixaAtual, setCaixaAtual] = useState<Caixa | null>(null);
  const [fundoTroco, setFundoTroco] = useState<number | ''>('');
  const [vendasHoje, setVendasHoje] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });
  const [modalConfirmacao, setModalConfirmacao] = useState(false);
  const [vendaParaCancelar, setVendaParaCancelar] = useState<Venda | null>(null);

  // ESTADOS PARA EDIÇÃO DE VENDA
  const [vendaEmEdicao, setVendaEmEdicao] = useState<Venda | null>(null);
  const [carrinhoEdicao, setCarrinhoEdicao] = useState<ItemEdicao[]>([]);
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<ProdutoAtivo[]>([]);
  const [produtoAddId, setProdutoAddId] = useState('');
  
  const [editPix, setEditPix] = useState<number | ''>('');
  const [editDinheiro, setEditDinheiro] = useState<number | ''>('');
  const [editCredito, setEditCredito] = useState<number | ''>('');
  const [editDebito, setEditDebito] = useState<number | ''>('');

  const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: null }), 4000);
  };

  useEffect(() => { verificarStatusCaixa(); }, []);

  const verificarStatusCaixa = async () => {
    setCarregando(true);
    const { data: caixaData } = await supabase.from('controle_caixa').select('*').eq('status', 'aberto').order('data_abertura', { ascending: false }).limit(1).single();
    if (caixaData) {
      setCaixaAtual(caixaData);
      buscarVendasDoCaixa(caixaData.data_abertura);
    } else {
      setCaixaAtual(null);
    }
    setCarregando(false);
  };

  const buscarVendasDoCaixa = async (dataAbertura: string) => {
    const { data } = await supabase.from('vendas').select(`*, itens_venda ( produto_id, quantidade, preco_unitario, produtos ( nome ) )`).gte('data_venda', dataAbertura).order('data_venda', { ascending: false });
    if (data) setVendasHoje(data as unknown as Venda[]);
  };

  const abrirCaixa = async () => {
    if (fundoTroco === '') return mostrarMensagem('Informe o fundo de troco inicial.', 'aviso');
    const { data, error } = await supabase.from('controle_caixa').insert([{ fundo_inicial: Number(fundoTroco), status: 'aberto' }]).select().single();
    if (data && !error) { setCaixaAtual(data); setVendasHoje([]); setFundoTroco(''); mostrarMensagem('Caixa aberto com sucesso!', 'sucesso'); } 
    else { mostrarMensagem('Erro ao abrir o caixa.', 'erro'); }
  };

  const confirmarFechamentoCaixa = async () => {
    setModalConfirmacao(false);
    if (!caixaAtual) return;
    const { error } = await supabase.from('controle_caixa').update({ status: 'fechado', data_fechamento: new Date().toISOString() }).eq('id', caixaAtual.id);
    if (!error) { mostrarMensagem("Caixa fechado. Bom descanso!", 'sucesso'); setCaixaAtual(null); setVendasHoje([]); } 
    else { mostrarMensagem("Erro ao fechar o caixa.", 'erro'); }
  };

  const confirmarCancelamentoVenda = async () => {
    if (!vendaParaCancelar || !caixaAtual) return;
    try {
      const { data: fichas } = await supabase.from('fichas_tecnicas').select('produto_venda_id');
      const fichasIds = new Set(fichas?.map(f => f.produto_venda_id) || []);
      const { data: itens } = await supabase.from('itens_venda').select('produto_id, quantidade').eq('venda_id', vendaParaCancelar.id);

      if (itens) {
        for (const item of itens) {
          if (!fichasIds.has(item.produto_id)) {
            const { data: prod } = await supabase.from('produtos').select('quantidade_estoque').eq('id', item.produto_id).single();
            if (prod) await supabase.from('produtos').update({ quantidade_estoque: Number(prod.quantidade_estoque) + Number(item.quantidade) }).eq('id', item.produto_id);
          }
        }
      }

      await supabase.from('itens_venda').delete().eq('venda_id', vendaParaCancelar.id);
      await supabase.from('vendas').delete().eq('id', vendaParaCancelar.id);

      mostrarMensagem('Venda cancelada e estoque restaurado.', 'sucesso');
      buscarVendasDoCaixa(caixaAtual.data_abertura);
    } catch (error) { mostrarMensagem('Erro ao cancelar a venda.', 'erro'); } 
    finally { setVendaParaCancelar(null); }
  };

  const iniciarEdicao = async (venda: Venda) => {
    setVendaEmEdicao(venda);
    setEditPix(venda.valor_pix || '');
    setEditDinheiro(venda.valor_dinheiro || '');
    setEditCredito(venda.valor_cartao_credito || '');
    setEditDebito(venda.valor_cartao_debito || '');

    const { data: prodData } = await supabase.from('produtos').select('*').eq('tipo', 'venda').eq('ativo', true);
    const { data: fichas } = await supabase.from('fichas_tecnicas').select('produto_venda_id');
    const fichasIds = new Set(fichas?.map(f => f.produto_venda_id) || []);

    if (prodData) {
      setProdutosDisponiveis(prodData.map(p => ({
        id: p.id, nome: p.nome, preco_venda: p.preco_venda, quantidade_estoque: p.quantidade_estoque || 0, is_receita: fichasIds.has(p.id)
      })));
    }

    const itensMapeados = venda.itens_venda.map(item => ({
      produto_id: item.produto_id,
      nome: item.produtos?.nome || 'Desconhecido',
      preco_unitario: item.preco_unitario,
      quantidade: item.quantidade,
      is_receita: fichasIds.has(item.produto_id)
    }));
    setCarrinhoEdicao(itensMapeados);
  };

  const alterarQtdEdicao = (id: string, delta: number) => {
    setCarrinhoEdicao(carrinhoEdicao.map(i => i.produto_id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i).filter(i => i.quantidade > 0));
  };

  const adicionarProdutoEdicao = () => {
    if (!produtoAddId) return;
    const prod = produtosDisponiveis.find(p => p.id === produtoAddId);
    if (!prod) return;

    const existe = carrinhoEdicao.find(i => i.produto_id === prod.id);
    if (existe) {
      alterarQtdEdicao(prod.id, 1);
    } else {
      setCarrinhoEdicao([...carrinhoEdicao, { produto_id: prod.id, nome: prod.nome, preco_unitario: prod.preco_venda, quantidade: 1, is_receita: prod.is_receita }]);
    }
    setProdutoAddId('');
  };

  const totalEdicao = useMemo(() => carrinhoEdicao.reduce((acc, item) => acc + (item.preco_unitario * item.quantidade), 0), [carrinhoEdicao]);
  const totalPagoEdicao = (Number(editPix) || 0) + (Number(editDinheiro) || 0) + (Number(editCredito) || 0) + (Number(editDebito) || 0);

  const salvarEdicaoVenda = async () => {
    if (!vendaEmEdicao || !caixaAtual) return;
    if (carrinhoEdicao.length === 0) return mostrarMensagem('A venda precisa ter pelo menos 1 item. Se quiser zerar, use Cancelar Venda.', 'aviso');
    if (totalPagoEdicao !== totalEdicao) return mostrarMensagem(`Ajuste os pagamentos! O total dos itens é ${formatarMoeda(totalEdicao)} mas os pagamentos somam ${formatarMoeda(totalPagoEdicao)}.`, 'erro');

    try {
      // 1. Restaurar o estoque original da venda antiga (apenas revenda)
      for (const item of vendaEmEdicao.itens_venda) {
        const isReceita = produtosDisponiveis.find(p => p.id === item.produto_id)?.is_receita;
        if (!isReceita) {
          const { data: pData } = await supabase.from('produtos').select('quantidade_estoque').eq('id', item.produto_id).single();
          if (pData) await supabase.from('produtos').update({ quantidade_estoque: Number(pData.quantidade_estoque) + Number(item.quantidade) }).eq('id', item.produto_id);
        }
      }

      // 2. Descontar o estoque novo da edição atual
      for (const item of carrinhoEdicao) {
        if (!item.is_receita) {
          const { data: pData } = await supabase.from('produtos').select('quantidade_estoque').eq('id', item.produto_id).single();
          if (pData) await supabase.from('produtos').update({ quantidade_estoque: Number(pData.quantidade_estoque) - Number(item.quantidade) }).eq('id', item.produto_id);
        }
      }

      // 3. Atualizar Venda e Pagamentos
      let metodosUsados = [];
      if (editPix) metodosUsados.push('PIX');
      if (editDinheiro) metodosUsados.push('Dinheiro');
      if (editCredito) metodosUsados.push('Cartão de Crédito');
      if (editDebito) metodosUsados.push('Cartão de Débito');

      await supabase.from('vendas').update({
        total: totalEdicao, metodo_pagamento: metodosUsados.join(' + '),
        valor_pix: Number(editPix) || 0, valor_dinheiro: Number(editDinheiro) || 0,
        valor_cartao_credito: Number(editCredito) || 0, valor_cartao_debito: Number(editDebito) || 0
      }).eq('id', vendaEmEdicao.id);

      // 4. Recriar os Itens da Venda
      await supabase.from('itens_venda').delete().eq('venda_id', vendaEmEdicao.id);
      const novosItens = carrinhoEdicao.map(item => ({
        venda_id: vendaEmEdicao.id, produto_id: item.produto_id, quantidade: item.quantidade, preco_unitario: item.preco_unitario
      }));
      await supabase.from('itens_venda').insert(novosItens);

      // 5. Histórico de Movimentação (Auditoria)
      await supabase.from('movimentacoes_estoque').insert([{
        produto_id: carrinhoEdicao[0].produto_id, 
        quantidade: 0, tipo_movimento: 'Entrada - Ajuste/Auditoria', 
        motivo: `Edição da Venda ${vendaEmEdicao.identificacao_pedido}`, atendente: vendaEmEdicao.atendente
      }]);

      mostrarMensagem('Venda atualizada com sucesso!', 'sucesso');
      setVendaEmEdicao(null);
      buscarVendasDoCaixa(caixaAtual.data_abertura);

    } catch (error) { console.error(error); mostrarMensagem('Erro ao salvar a edição.', 'erro'); }
  };

  const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  const formatarHora = (dataIso: string) => new Date(dataIso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // TELA DE LOADING
  if (carregando) return <div className="text-center py-10 font-bold text-cafe-primary animate-pulse">A carregar informações do caixa...</div>;
  
  // TELA DE CAIXA FECHADO
  if (!caixaAtual) {
    return (
      <div className="relative max-w-md mx-auto p-6 bg-cafe-card dark:bg-gray-800 rounded-lg shadow-md border border-cafe-secondary/20 dark:border-gray-700 my-12 text-center overflow-hidden transition-colors duration-300">
        {feedback.tipo && (<div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}><p className="text-sm font-semibold">{feedback.msg}</p></div>)}
        <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">💰</div>
        <h2 className="text-2xl font-bold text-cafe-dark dark:text-gray-100 mb-2">Caixa Fechado</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Para iniciar o dia e registar vendas, abra o caixa informando o fundo de troco atual da gaveta.</p>
        <div className="text-left mb-4">
          <label className="block text-sm font-semibold text-cafe-dark dark:text-gray-200 mb-1">Fundo de Troco (R$)</label>
          <input type="number" className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-cafe-secondary text-center text-lg font-bold" value={fundoTroco} onChange={(e) => setFundoTroco(Number(e.target.value))} />
        </div>
        <button onClick={abrirCaixa} className="w-full bg-green-600 text-white font-bold py-3 rounded shadow hover:bg-green-700 active:scale-95">ABRIR CAIXA</button>
      </div>
    );
  }

  const faturamentoTotal = vendasHoje.reduce((acc, v) => acc + Number(v.total), 0);
  const totalPix = vendasHoje.reduce((acc, v: any) => acc + (Number(v.valor_pix) || (v.metodo_pagamento === 'PIX' ? Number(v.total) : 0)), 0);
  const totalCartaoCred = vendasHoje.reduce((acc, v: any) => acc + (Number(v.valor_cartao_credito) || 0) + (v.metodo_pagamento === 'Cartão de Crédito' ? Number(v.total) : 0), 0);
  const totalCartaoDeb = vendasHoje.reduce((acc, v: any) => acc + (Number(v.valor_cartao_debito) || 0) + (v.metodo_pagamento === 'Cartão de Débito' ? Number(v.total) : 0), 0);
  const totalDinheiro = vendasHoje.reduce((acc, v: any) => acc + (Number(v.valor_dinheiro) || (v.metodo_pagamento === 'Dinheiro' ? Number(v.total) : 0)), 0);
  const dinheiroEsperadoNaGaveta = caixaAtual.fundo_inicial + totalDinheiro;

  return (
    <div className="relative max-w-6xl mx-auto p-6 bg-cafe-card dark:bg-gray-900 rounded-lg shadow-md border border-cafe-secondary/20 dark:border-gray-700 my-8 transition-colors duration-300">
      
      {feedback.tipo && (<div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}><p className="text-sm font-semibold">{feedback.msg}</p></div>)}

      {/* MODAL DE EDIÇÃO DE VENDA COMPLETO */}
      {vendaEmEdicao && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-6 border-b dark:border-gray-700 pb-3">
              <h3 className="text-xl font-bold text-cafe-primary dark:text-cafe-secondary">Editar Venda: {vendaEmEdicao.identificacao_pedido}</h3>
              <button onClick={() => setVendaEmEdicao(null)} className="text-gray-500 hover:text-red-500 font-bold text-xl">X</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Carrinho da Edição */}
              <div>
                <h4 className="font-semibold mb-3 dark:text-gray-200">Itens do Pedido</h4>
                <div className="flex gap-2 mb-4">
                  <select className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 text-sm" value={produtoAddId} onChange={(e) => setProdutoAddId(e.target.value)}>
                    <option value="">+ Adicionar Item...</option>
                    {produtosDisponiveis.map(p => <option key={p.id} value={p.id}>{p.nome} - {formatarMoeda(p.preco_venda)}</option>)}
                  </select>
                  <button onClick={adicionarProdutoEdicao} className="bg-cafe-secondary text-cafe-dark font-bold px-3 rounded shadow-sm">Add</button>
                </div>
                
                <ul className="space-y-2 max-h-64 overflow-y-auto pr-2">
                  {carrinhoEdicao.map(item => (
                    <li key={item.produto_id} className="bg-gray-50 dark:bg-gray-700 p-2 rounded border dark:border-gray-600 flex justify-between items-center text-sm">
                      <div>
                        <span className="font-bold block dark:text-gray-100">{item.nome}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatarMoeda(item.preco_unitario)}</span>
                      </div>
                      <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded px-2 py-1 shadow-sm">
                        <button onClick={() => alterarQtdEdicao(item.produto_id, -1)} className="font-bold text-cafe-primary dark:text-cafe-secondary px-2">-</button>
                        <span className="font-bold w-4 text-center dark:text-gray-100">{item.quantidade}</span>
                        <button onClick={() => alterarQtdEdicao(item.produto_id, 1)} className="font-bold text-cafe-primary dark:text-cafe-secondary px-2">+</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pagamentos da Edição */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border dark:border-gray-600">
                <h4 className="font-semibold mb-4 border-b dark:border-gray-600 pb-2 dark:text-gray-200">Refazer Pagamentos</h4>
                
                <div className="flex justify-between items-center text-2xl font-black mb-4">
                  <span className="dark:text-gray-100">Total:</span>
                  <span className="text-blue-600 dark:text-blue-400">{formatarMoeda(totalEdicao)}</span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3"><label className="w-20 text-sm font-semibold dark:text-gray-300">PIX</label><input type="number" className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={editPix} onChange={(e) => setEditPix(Number(e.target.value))} /></div>
                  <div className="flex items-center gap-3"><label className="w-20 text-sm font-semibold dark:text-gray-300">Dinheiro</label><input type="number" className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={editDinheiro} onChange={(e) => setEditDinheiro(Number(e.target.value))} /></div>
                  <div className="flex items-center gap-3"><label className="w-20 text-sm font-semibold dark:text-gray-300">Crédito</label><input type="number" className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={editCredito} onChange={(e) => setEditCredito(Number(e.target.value))} /></div>
                  <div className="flex items-center gap-3"><label className="w-20 text-sm font-semibold dark:text-gray-300">Débito</label><input type="number" className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={editDebito} onChange={(e) => setEditDebito(Number(e.target.value))} /></div>
                </div>

                <div className={`mt-4 text-center font-bold text-sm p-2 rounded ${totalPagoEdicao === totalEdicao ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  Soma dos Pagamentos: {formatarMoeda(totalPagoEdicao)}
                </div>

                <button onClick={salvarEdicaoVenda} className="w-full bg-blue-600 text-white font-bold py-3 rounded mt-4 shadow hover:bg-blue-700 active:scale-95 transition">
                  Salvar Alterações da Venda
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelamento de Venda */}
      {vendaParaCancelar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold text-red-600 mb-2">Cancelar Venda Inteira</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">Deseja cancelar a venda <strong>{vendaParaCancelar.identificacao_pedido}</strong>? O valor será subtraído do caixa e o estoque restaurado.</p>
            <div className="flex gap-3">
              <button onClick={() => setVendaParaCancelar(null)} className="flex-1 bg-gray-100 dark:bg-gray-700 dark:text-white rounded font-semibold transition">Voltar</button>
              <button onClick={confirmarCancelamentoVenda} className="flex-1 bg-red-600 text-white py-2 rounded font-semibold shadow hover:bg-red-700">Sim, Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fechamento Caixa */}
      {modalConfirmacao && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold text-cafe-dark dark:text-gray-100 mb-2">Encerrar Dia</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">Tem a certeza que deseja fechar o caixa de hoje? Não poderá registar mais vendas neste turno.</p>
            <div className="flex gap-3">
              <button onClick={() => setModalConfirmacao(false)} className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 dark:text-white rounded font-semibold transition">Cancelar</button>
              <button onClick={confirmarFechamentoCaixa} className="flex-1 px-4 py-2 bg-red-600 text-white rounded font-semibold shadow hover:bg-red-700 transition">Sim, Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD NORMAL */}
      <div className="flex justify-between items-center mb-6 border-b border-cafe-secondary/30 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-cafe-primary dark:text-cafe-secondary">Fechamento e Dashboard</h2>
          <p className="text-sm text-green-600 font-semibold mt-1">🟢 Caixa Aberto</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => verificarStatusCaixa()} className="bg-cafe-bg dark:bg-gray-800 text-cafe-dark dark:text-gray-100 border border-gray-300 dark:border-gray-600 px-4 py-2 rounded font-bold text-sm shadow-sm hover:bg-gray-50 active:scale-95">Atualizar</button>
          <button onClick={() => setModalConfirmacao(true)} className="bg-red-600 text-white px-4 py-2 rounded font-bold text-sm shadow hover:bg-red-700 active:scale-95">Encerrar Dia</button>
        </div>
      </div>

      <div className="space-y-6 mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-cafe-primary dark:bg-gray-800 border dark:border-gray-700 text-white p-6 rounded-lg shadow text-center">
            <h3 className="text-sm font-semibold opacity-90 mb-1">Total Vendido</h3>
            <span className="text-4xl font-bold">{formatarMoeda(faturamentoTotal)}</span>
          </div>
          <div className="bg-green-600 dark:bg-green-700 border dark:border-green-600 text-white p-6 rounded-lg shadow text-center">
            <h3 className="text-sm font-semibold opacity-90 mb-1">Físico Esperado na Gaveta</h3>
            <span className="text-4xl font-bold">{formatarMoeda(dinheiroEsperadoNaGaveta)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-cafe-bg dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-center"><h4 className="text-gray-500 dark:text-gray-400 font-semibold mb-1 text-sm">Via PIX</h4><span className="text-xl font-bold dark:text-gray-100">{formatarMoeda(totalPix)}</span></div>
          <div className="bg-cafe-bg dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-center"><h4 className="text-gray-500 dark:text-gray-400 font-semibold mb-1 text-sm">C. Crédito</h4><span className="text-xl font-bold dark:text-gray-100">{formatarMoeda(totalCartaoCred)}</span></div>
          <div className="bg-cafe-bg dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-center"><h4 className="text-gray-500 dark:text-gray-400 font-semibold mb-1 text-sm">C. Débito</h4><span className="text-xl font-bold dark:text-gray-100">{formatarMoeda(totalCartaoDeb)}</span></div>
          <div className="bg-cafe-bg dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-center"><h4 className="text-gray-500 dark:text-gray-400 font-semibold mb-1 text-sm">Em Dinheiro</h4><span className="text-xl font-bold dark:text-gray-100">{formatarMoeda(totalDinheiro)}</span></div>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-cafe-primary dark:text-cafe-secondary mb-4 border-b border-cafe-secondary/30 pb-2">Histórico de Vendas (Turno Atual)</h3>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-max">
            <thead className="bg-cafe-bg dark:bg-gray-900 border-b dark:border-gray-700 text-sm">
              <tr>
                <th className="p-3 font-semibold text-cafe-primary dark:text-cafe-secondary w-24">Hora</th>
                <th className="p-3 font-semibold text-cafe-primary dark:text-cafe-secondary w-28">Pedido</th>
                <th className="p-3 font-semibold text-cafe-primary dark:text-cafe-secondary w-36">Atendente</th>
                <th className="p-3 font-semibold text-cafe-primary dark:text-cafe-secondary">Itens do Pedido</th>
                <th className="p-3 font-semibold text-cafe-primary dark:text-cafe-secondary">Pagamento</th>
                <th className="p-3 font-semibold text-cafe-primary dark:text-cafe-secondary text-right">Total</th>
                <th className="p-3 font-semibold text-center text-cafe-primary dark:text-cafe-secondary">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vendasHoje.map(venda => (
                <tr key={venda.id} className="border-b dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="p-3 text-gray-500 dark:text-gray-400">{formatarHora(venda.data_venda)}</td>
                  <td className="p-3 font-bold dark:text-gray-100">{venda.identificacao_pedido}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-300 truncate max-w-[140px] font-medium">{venda.atendente || 'Desconhecido'}</td>
                  <td className="p-3">
                    <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside">
                      {venda.itens_venda?.map((item, idx) => (<li key={idx}><span className="font-semibold">{item.quantidade}x</span> {item.produtos?.nome || 'Item removido'}</li>))}
                    </ul>
                  </td>
                  <td className="p-3"><span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-xs font-semibold">{venda.metodo_pagamento}</span></td>
                  <td className="p-3 font-bold text-green-600 dark:text-green-400 text-right">{formatarMoeda(venda.total)}</td>
                  <td className="p-3 text-center space-x-2">
                    <button onClick={() => iniciarEdicao(venda)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-bold px-2 py-1 bg-blue-50 dark:bg-gray-700 rounded text-xs transition">Editar</button>
                    <button onClick={() => setVendaParaCancelar(venda)} className="text-red-500 hover:text-red-700 dark:text-red-400 font-bold px-2 py-1 bg-red-50 dark:bg-gray-700 rounded text-xs transition">Cancelar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}