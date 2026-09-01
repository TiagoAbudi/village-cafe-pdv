import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { valoresIguais } from '../lib/money';

type ItemVenda = { produto_id: string; quantidade: number; preco_unitario: number; custo_unitario?: number | null; produtos: { nome: string } };
type Venda = {
  id: string; total: number; metodo_pagamento: string; data_venda: string; identificacao_pedido: string;
  valor_pix: number; valor_dinheiro: number; valor_cartao_credito: number; valor_cartao_debito: number;
  atendente: string; status?: string; itens_venda: ItemVenda[];
};
type Caixa = { id: string; fundo_inicial: number; status: string; data_abertura: string; data_fechamento?: string; valor_informado_fechamento?: number };
type ProdutoAtivo = { id: string; nome: string; preco_venda: number; preco_custo: number; quantidade_estoque: number; is_receita: boolean; };
type ItemEdicao = { produto_id: string; nome: string; preco_unitario: number; custo_unitario: number; quantidade: number; is_receita: boolean; };

export default function DashboardModulo() {
  const [caixaAtual, setCaixaAtual] = useState<Caixa | null>(null);
  const [fundoTroco, setFundoTroco] = useState<number | ''>('');
  const [vendasHoje, setVendasHoje] = useState<Venda[]>([]);
  const [movimentacoesCaixa, setMovimentacoesCaixa] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });
  const [modalConfirmacao, setModalConfirmacao] = useState(false);
  const [valorFechamentoInput, setValorFechamentoInput] = useState<number | ''>('');
  const [vendaParaCancelar, setVendaParaCancelar] = useState<Venda | null>(null);

  const [modalResumo, setModalResumo] = useState(false);

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

  const buscarVendasDoCaixa = async (caixaId: string, dataAbertura: string) => {
    const selecaoVendas = `*, itens_venda ( produto_id, quantidade, preco_unitario, custo_unitario, produtos ( nome ) )`;
    const [vendasVinculadas, vendasLegadas] = await Promise.all([
      supabase.from('vendas').select(selecaoVendas).eq('caixa_id', caixaId).neq('status', 'Cancelada'),
      supabase.from('vendas').select(selecaoVendas).is('caixa_id', null).gte('data_venda', dataAbertura).neq('status', 'Cancelada'),
    ]);
    const vendas = [...(vendasVinculadas.data || []), ...(vendasLegadas.data || [])]
      .sort((a, b) => new Date(b.data_venda).getTime() - new Date(a.data_venda).getTime());
    setVendasHoje(vendas as unknown as Venda[]);

    const { data: movs } = await supabase.from('movimentacoes_caixa').select('*').eq('caixa_id', caixaId);
    if (movs) setMovimentacoesCaixa(movs);
  };

  const verificarStatusCaixa = async () => {
    setCarregando(true);
    const { data: caixaData } = await supabase.from('controle_caixa').select('*').eq('status', 'aberto').order('data_abertura', { ascending: false }).limit(1).maybeSingle();
    if (caixaData) {
      setCaixaAtual(caixaData);
      buscarVendasDoCaixa(caixaData.id, caixaData.data_abertura);
    } else {
      setCaixaAtual(null);
    }
    setCarregando(false);
  };

  // Intentional: verificarStatusCaixa is stable in this component and should only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { (async () => { await verificarStatusCaixa(); })(); }, []);

  const abrirCaixa = async () => {
    if (fundoTroco === '') return mostrarMensagem('Informe o fundo de troco inicial.', 'aviso');
    const { data, error } = await supabase.from('controle_caixa').insert([{ fundo_inicial: Number(fundoTroco), status: 'aberto' }]).select().single();
    if (data && !error) { setCaixaAtual(data); setVendasHoje([]); setMovimentacoesCaixa([]); setFundoTroco(''); mostrarMensagem('Caixa aberto com sucesso!', 'sucesso'); }
    else { mostrarMensagem('Erro ao abrir o caixa.', 'erro'); }
  };

  const confirmarFechamentoCaixa = async () => {
    if (valorFechamentoInput === '') return mostrarMensagem('Informe a quantidade de dinheiro físico contada na gaveta.', 'aviso');
    if (!caixaAtual) return;

    const { error } = await supabase.from('controle_caixa').update({
      status: 'fechado',
      data_fechamento: new Date().toISOString(),
      valor_informado_fechamento: Number(valorFechamentoInput)
    }).eq('id', caixaAtual.id);

    if (!error) {
      mostrarMensagem("Caixa fechado com conferência registrada. Bom descanso!", 'sucesso');
      setCaixaAtual(null);
      setVendasHoje([]);
      setMovimentacoesCaixa([]);
      setValorFechamentoInput('');
      setModalConfirmacao(false);
    } else {
      mostrarMensagem("Erro ao fechar o caixa.", 'erro');
    }
  };

  // --- ATUALIZADO: CANCELAR VENDA (ESTORNA O BANCO) ---
  const confirmarCancelamentoVenda = async () => {
    if (!vendaParaCancelar || !caixaAtual) return;
    try {
      const { error: erroCancelamento } = await supabase.rpc('cancelar_venda', {
        p_venda_id: vendaParaCancelar.id,
        p_motivo: `Cancelamento de ${vendaParaCancelar.identificacao_pedido}`,
      });
      if (erroCancelamento) throw erroCancelamento;

      mostrarMensagem('Venda cancelada e saldo digital estornado!', 'sucesso');
      buscarVendasDoCaixa(caixaAtual.id, caixaAtual.data_abertura);
    } catch (error) { console.error(error); mostrarMensagem('Erro ao cancelar a venda.', 'erro'); }
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
        id: p.id, nome: p.nome, preco_venda: p.preco_venda, preco_custo: p.preco_custo || 0, quantidade_estoque: p.quantidade_estoque || 0, is_receita: fichasIds.has(p.id)
      })));
    }

    const itensMapeados = venda.itens_venda.map(item => ({
      produto_id: item.produto_id,
      nome: item.produtos?.nome || 'Desconhecido',
      preco_unitario: item.preco_unitario,
      custo_unitario: item.custo_unitario || produtosDisponiveis.find(produto => produto.id === item.produto_id)?.preco_custo || 0,
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
      setCarrinhoEdicao([...carrinhoEdicao, { produto_id: prod.id, nome: prod.nome, preco_unitario: prod.preco_venda, custo_unitario: prod.preco_custo, quantidade: 1, is_receita: prod.is_receita }]);
    }
    setProdutoAddId('');
  };

  const totalEdicao = useMemo(() => carrinhoEdicao.reduce((acc, item) => acc + (item.preco_unitario * item.quantidade), 0), [carrinhoEdicao]);
  const totalPagoEdicao = (Number(editPix) || 0) + (Number(editDinheiro) || 0) + (Number(editCredito) || 0) + (Number(editDebito) || 0);

  // A edição preserva a venda anterior como cancelada e gera uma substituta auditável.
  const salvarEdicaoVenda = async () => {
    if (!vendaEmEdicao || !caixaAtual) return;
    if (carrinhoEdicao.length === 0) return mostrarMensagem('A venda precisa ter pelo menos 1 item. Se quiser zerar, use Cancelar Venda.', 'aviso');
    if (!valoresIguais(totalPagoEdicao, totalEdicao)) return mostrarMensagem(`Ajuste os pagamentos! O total dos itens é ${formatarMoeda(totalEdicao)} mas os pagamentos somam ${formatarMoeda(totalPagoEdicao)}.`, 'erro');

    try {
      const pagamentosRegistrados = [
        ['PIX', Number(editPix) || 0],
        ['Dinheiro', Number(editDinheiro) || 0],
        ['Cartão de Crédito', Number(editCredito) || 0],
        ['Cartão de Débito', Number(editDebito) || 0],
      ].filter(([, valor]) => Number(valor) > 0).map(([metodo, valor]) => ({ metodo, valor }));
      const novosItens = carrinhoEdicao.map(item => ({
        produto_id: item.produto_id, quantidade: item.quantidade, preco_unitario: item.preco_unitario, custo_unitario: item.custo_unitario
      }));
      const { error: erroVenda } = await supabase.rpc('editar_venda', {
        p_venda_id: vendaEmEdicao.id,
        p_identificacao_pedido: vendaEmEdicao.identificacao_pedido,
        p_total: totalEdicao,
        p_desconto: 0,
        p_pagamentos: pagamentosRegistrados,
        p_atendente: vendaEmEdicao.atendente,
        p_itens: novosItens,
      });
      if (erroVenda) throw erroVenda;

      mostrarMensagem('Venda atualizada com sucesso!', 'sucesso');
      setVendaEmEdicao(null);
      buscarVendasDoCaixa(caixaAtual.id, caixaAtual.data_abertura);

    } catch (error) { console.error(error); mostrarMensagem('Erro ao salvar a edição.', 'erro'); }
  };

  const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  const formatarHora = (dataIso: string) => new Date(dataIso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const formatarDataHoraCompleta = (dataIso: string) => new Date(dataIso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const totalPix = useMemo(() => vendasHoje.reduce((acc, v: any) => acc + (Number(v.valor_pix) || (v.metodo_pagamento === 'PIX' ? Number(v.total) : 0)), 0), [vendasHoje]);
  const totalCartaoCred = useMemo(() => vendasHoje.reduce((acc, v: any) => acc + (Number(v.valor_cartao_credito) || (v.metodo_pagamento === 'Cartão de Crédito' ? Number(v.total) : 0)), 0), [vendasHoje]);
  const totalCartaoDeb = useMemo(() => vendasHoje.reduce((acc, v: any) => acc + (Number(v.valor_cartao_debito) || (v.metodo_pagamento === 'Cartão de Débito' ? Number(v.total) : 0)), 0), [vendasHoje]);
  const totalDinheiro = useMemo(() => vendasHoje.reduce((acc, v: any) => acc + (Number(v.valor_dinheiro) || (v.metodo_pagamento === 'Dinheiro' ? Number(v.total) : 0)), 0), [vendasHoje]);
  const faturamentoTotal = useMemo(() => vendasHoje.reduce((acc, v) => acc + Number(v.total), 0), [vendasHoje]);

  const suprimentosTotais = useMemo(() => {
    return movimentacoesCaixa.filter(m => m.tipo === 'suprimento').reduce((acc, m) => acc + Number(m.valor), 0);
  }, [movimentacoesCaixa]);

  const sangriasEDespesasTotais = useMemo(() => {
    return movimentacoesCaixa.filter(m => m.tipo === 'sangria' || m.tipo === 'despesa').reduce((acc, m) => acc + Number(m.valor), 0);
  }, [movimentacoesCaixa]);

  const dinheiroEsperadoNaGaveta = caixaAtual ? caixaAtual.fundo_inicial + totalDinheiro + suprimentosTotais - sangriasEDespesasTotais : 0;
  const qtdVendas = vendasHoje.length;
  const ticketMedio = qtdVendas > 0 ? faturamentoTotal / qtdVendas : 0;

  const handleImprimirResumo = () => {
    const caixa = caixaAtual;
    if (!caixa) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    doc.write(`
      <html>
        <head>
          <title>Resumo de Fechamento de Caixa</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 15px; color: #000; max-width: 280px; margin: 0 auto; font-size: 12px; line-height: 1.4; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .flex { display: flex; justify-content: space-between; }
            .header { font-size: 14px; margin-bottom: 4px; }
            .section-title { font-weight: bold; margin-top: 12px; text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="text-center font-bold header">FECHAMENTO DE CAIXA</div>
          <div class="text-center font-bold">-------------------------</div>
          <div class="flex"><span>Abertura:</span> <span>${formatarDataHoraCompleta(caixa.data_abertura)}</span></div>
          <div class="flex"><span>Operador:</span> <span>${vendasHoje[0]?.atendente || 'Administrador'}</span></div>
          <div class="divider"></div>

          <div class="section-title">MOVIMENTAÇÃO DA GAVETA</div>
          <div class="flex"><span>(+) Fundo Inicial:</span> <span>${formatarMoeda(caixa.fundo_inicial)}</span></div>
          <div class="flex"><span>(+) Vendas Dinheiro:</span> <span>${formatarMoeda(totalDinheiro)}</span></div>
          <div class="flex"><span>(+) Suprimentos:</span> <span>${formatarMoeda(suprimentosTotais)}</span></div>
          <div class="flex"><span>(-) Sangrias/Despesas:</span> <span>-${formatarMoeda(sangriasEDespesasTotais)}</span></div>
          <div class="flex font-bold"><span>(=) Dinheiro em Caixa:</span> <span>${formatarMoeda(dinheiroEsperadoNaGaveta)}</span></div>
          <div class="divider"></div>

          <div class="section-title">FATURAMENTO DIGITAL</div>
          <div class="flex"><span>📱 Via PIX:</span> <span>${formatarMoeda(totalPix)}</span></div>
          <div class="flex"><span>💳 C. Crédito:</span> <span>${formatarMoeda(totalCartaoCred)}</span></div>
          <div class="flex"><span>💳 C. Débito:</span> <span>${formatarMoeda(totalCartaoDeb)}</span></div>
          <div class="divider"></div>

          <div class="section-title">RESUMO DE VENDAS</div>
          <div class="flex"><span>Total Pedidos:</span> <span>${qtdVendas}</span></div>
          <div class="flex"><span>Ticket Médio:</span> <span>${formatarMoeda(ticketMedio)}</span></div>
          <div class="flex font-bold" style="font-size:13px; margin-top:6px;"><span>FATURAMENTO TOTAL:</span> <span>${formatarMoeda(faturamentoTotal)}</span></div>
          
          <div class="text-center" style="margin-top: 40px;">-------------------------</div>
          <div class="text-center">Assinatura do Responsável</div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      document.body.removeChild(iframe);
    }, 200);
  };

  if (carregando) return <div className="text-center py-10 font-bold text-cafe-primary animate-pulse">A carregar informações do caixa...</div>;

  if (!caixaAtual) {
    return (
      <div className="relative max-w-md mx-auto p-4 md:p-6 bg-cafe-card dark:bg-gray-800 rounded-lg shadow-md border border-cafe-secondary/20 dark:border-gray-700 my-8 md:my-12 text-center overflow-hidden transition-colors duration-300 w-[95%]">
        {feedback.tipo && (<div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded shadow-lg ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}><p className="text-sm font-semibold">{feedback.msg}</p></div>)}
        <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">💰</div>
        <h2 className="text-2xl font-bold text-cafe-dark dark:text-gray-100 mb-2">Caixa Fechado</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Para iniciar o dia e registar vendas, abra o caixa informando o fundo de troco atual da gaveta.</p>
        <div className="text-left mb-4">
          <label className="block text-sm font-semibold text-cafe-dark dark:text-gray-200 mb-1">Fundo de Troco (R$)</label>
          {/* Ajuste: text-base no input para evitar zoom automático no iOS */}
          <input type="number" placeholder="Ex: 50,00" className="w-full p-4 md:p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-cafe-secondary text-center text-lg md:text-xl font-bold text-base" value={fundoTroco} onChange={(e) => setFundoTroco(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button onClick={abrirCaixa} className="w-full bg-green-600 text-white font-bold py-4 md:py-3 rounded-lg shadow hover:bg-green-700 active:scale-95 transition">ABRIR CAIXA</button>
      </div>
    );
  }

  const caixa = caixaAtual;

  return (
    <div className="relative max-w-6xl mx-auto p-4 md:p-6 bg-cafe-card dark:bg-gray-900 rounded-lg shadow-md border border-cafe-secondary/20 dark:border-gray-700 my-4 md:my-8 transition-colors duration-300">

      {feedback.tipo && (<div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded shadow-lg ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}><p className="text-sm font-semibold">{feedback.msg}</p></div>)}

      {/* MODAL: RESUMO FINANCEIRO */}
      {modalResumo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden font-sans border border-gray-200 dark:border-gray-700 relative">
            <div className="p-4 md:p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-gray-800 dark:text-white">Resumo do Turno</h3>
                <p className="text-xs text-gray-400 mt-0.5">Fechamento e conferência de valores</p>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={handleImprimirResumo} className="hover:opacity-70 text-base transition p-2 bg-gray-200 dark:bg-gray-700 rounded-lg" title="Imprimir Relatório">🖨️</button>
                <button onClick={() => setModalResumo(false)} className="text-gray-400 hover:text-red-500 font-bold transition text-2xl px-2">✕</button>
              </div>
            </div>

            <div className="p-4 md:p-6 space-y-4 md:space-y-5 text-sm max-h-[75vh] overflow-y-auto">
              <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-100 dark:border-gray-600 flex justify-between">
                <span>Abertura: <strong>{formatarDataHoraCompleta(caixa.data_abertura)}</strong></span>
                <span>Op: <strong>{vendasHoje[0]?.atendente || 'Admin'}</strong></span>
              </div>

              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 space-y-2.5 shadow-sm">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">💵 Movimentação da Gaveta</h4>
                <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>(+) Saldo Inicial:</span><span className="font-medium">{formatarMoeda(caixa.fundo_inicial)}</span></div>
                <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>(+) Vendas em Dinheiro:</span><span className="font-medium text-green-600">{formatarMoeda(totalDinheiro)}</span></div>
                <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>(+) Suprimentos:</span><span className="font-medium text-green-600">{formatarMoeda(suprimentosTotais)}</span></div>
                <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>(-) Sangrias / Despesas:</span><span className="font-medium text-red-500">-{formatarMoeda(sangriasEDespesasTotais)}</span></div>
                <div className="flex justify-between font-bold pt-2 border-t text-gray-800 dark:text-white text-base mt-2"><span>= Dinheiro Esperado:</span><span className="text-cafe-primary dark:text-cafe-secondary">{formatarMoeda(dinheiroEsperadoNaGaveta)}</span></div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 space-y-2.5 shadow-sm">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">📱 Faturamento Digital</h4>
                <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>📱 Via PIX:</span><span className="font-medium">{formatarMoeda(totalPix)}</span></div>
                <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>💳 C. Crédito:</span><span className="font-medium">{formatarMoeda(totalCartaoCred)}</span></div>
                <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>💳 C. Débito:</span><span className="font-medium">{formatarMoeda(totalCartaoDeb)}</span></div>
              </div>

              <div className="bg-gray-900 text-white p-4 rounded-xl space-y-2.5 shadow-md">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">📊 Indicadores Totais do Turno</h4>
                <div className="flex justify-between text-gray-300"><span>Volume de Pedidos:</span><span className="font-bold">{qtdVendas} vendas</span></div>
                <div className="flex justify-between text-gray-300"><span>Ticket Médio:</span><span className="font-bold">{formatarMoeda(ticketMedio)}</span></div>
                <div className="flex justify-between font-black pt-2 border-t border-gray-800 text-lg text-green-400"><span>Faturamento Total:</span><span>{formatarMoeda(faturamentoTotal)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIÇÃO DE VENDA */}
      {vendaEmEdicao && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-4 md:p-6 w-full max-w-4xl h-[95vh] md:h-auto md:max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4 md:mb-6 border-b dark:border-gray-700 pb-3">
              <h3 className="text-lg md:text-xl font-bold text-cafe-primary dark:text-cafe-secondary truncate pr-2">Editar: {vendaEmEdicao.identificacao_pedido}</h3>
              <button onClick={() => setVendaEmEdicao(null)} className="text-gray-500 hover:text-red-500 font-bold text-2xl px-2">✕</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 flex-1">
              {/* Lado Esquerdo: Itens */}
              <div className="flex flex-col">
                <h4 className="font-semibold mb-3 dark:text-gray-200">Itens do Pedido</h4>
                <div className="flex gap-2 mb-4">
                  <select className="flex-1 p-3 md:p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 text-base md:text-sm outline-none" value={produtoAddId} onChange={(e) => setProdutoAddId(e.target.value)}>
                    <option value="">+ Adicionar Item...</option>
                    {produtosDisponiveis.map(p => <option key={p.id} value={p.id}>{p.nome} - {formatarMoeda(p.preco_venda)}</option>)}
                  </select>
                  <button onClick={adicionarProdutoEdicao} className="bg-cafe-secondary text-cafe-dark font-bold px-4 py-3 md:py-2 rounded-lg shadow-sm">Add</button>
                </div>

                <ul className="space-y-2 overflow-y-auto max-h-[30vh] md:max-h-64 pr-2 border-b md:border-none border-gray-200 pb-4 md:pb-0 mb-4 md:mb-0">
                  {carrinhoEdicao.map(item => (
                    <li key={item.produto_id} className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border dark:border-gray-600 flex justify-between items-center text-sm gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-bold block dark:text-gray-100 truncate">{item.nome}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatarMoeda(item.preco_unitario)}</span>
                      </div>
                      <div className="flex items-center gap-2 md:gap-3 bg-white dark:bg-gray-800 rounded-lg px-1 md:px-2 py-1 shadow-sm border border-gray-100 dark:border-gray-600">
                        <button onClick={() => alterarQtdEdicao(item.produto_id, -1)} className="font-bold text-cafe-primary dark:text-cafe-secondary w-8 h-8 rounded hover:bg-gray-100 flex items-center justify-center">-</button>
                        <span className="font-bold w-4 text-center dark:text-gray-100">{item.quantidade}</span>
                        <button onClick={() => alterarQtdEdicao(item.produto_id, 1)} className="font-bold text-cafe-primary dark:text-cafe-secondary w-8 h-8 rounded hover:bg-gray-100 flex items-center justify-center">+</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Lado Direito: Pagamentos */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 md:p-5 rounded-xl border dark:border-gray-600 flex flex-col justify-between">
                <div>
                  <h4 className="font-semibold mb-4 border-b dark:border-gray-600 pb-2 dark:text-gray-200">Refazer Pagamentos</h4>

                  <div className="flex justify-between items-center text-2xl md:text-3xl font-black mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                    <span className="dark:text-gray-100 text-lg">Total:</span>
                    <span className="text-blue-600 dark:text-blue-400">{formatarMoeda(totalEdicao)}</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3"><label className="w-20 text-sm font-semibold dark:text-gray-300">PIX</label><input type="number" placeholder="R$ 0,00" className="flex-1 p-3 md:p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-base outline-none focus:ring-2 focus:ring-blue-400" value={editPix} onChange={(e) => setEditPix(e.target.value === '' ? '' : Number(e.target.value))} /></div>
                    <div className="flex items-center gap-3"><label className="w-20 text-sm font-semibold dark:text-gray-300">Dinheiro</label><input type="number" placeholder="R$ 0,00" className="flex-1 p-3 md:p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-base outline-none focus:ring-2 focus:ring-blue-400" value={editDinheiro} onChange={(e) => setEditDinheiro(e.target.value === '' ? '' : Number(e.target.value))} /></div>
                    <div className="flex items-center gap-3"><label className="w-20 text-sm font-semibold dark:text-gray-300">Crédito</label><input type="number" placeholder="R$ 0,00" className="flex-1 p-3 md:p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-base outline-none focus:ring-2 focus:ring-blue-400" value={editCredito} onChange={(e) => setEditCredito(e.target.value === '' ? '' : Number(e.target.value))} /></div>
                    <div className="flex items-center gap-3"><label className="w-20 text-sm font-semibold dark:text-gray-300">Débito</label><input type="number" placeholder="R$ 0,00" className="flex-1 p-3 md:p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-base outline-none focus:ring-2 focus:ring-blue-400" value={editDebito} onChange={(e) => setEditDebito(e.target.value === '' ? '' : Number(e.target.value))} /></div>
                  </div>

                  <div className={`mt-6 text-center font-bold text-sm p-3 rounded-lg border ${totalPagoEdicao === totalEdicao ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                    Soma dos Pagamentos: {formatarMoeda(totalPagoEdicao)}
                  </div>
                </div>

                <button onClick={salvarEdicaoVenda} className="w-full bg-blue-600 text-white font-bold py-4 md:py-3 rounded-lg mt-6 shadow-lg hover:bg-blue-700 active:scale-95 transition text-lg md:text-base">
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CANCELAMENTO DE VENDA */}
      {vendaParaCancelar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-sm w-full text-center">
            <div className="text-red-500 text-5xl mb-4">⚠️</div>
            <h3 className="text-2xl font-black text-gray-800 dark:text-white mb-2">Cancelar Venda</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm px-2">Deseja cancelar o pedido <strong>{vendaParaCancelar.identificacao_pedido}</strong>? O valor sairá do caixa/banco e o estoque será restaurado.</p>
            <div className="flex gap-3">
              <button onClick={() => setVendaParaCancelar(null)} className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:text-white py-3 rounded-xl font-bold transition">Voltar</button>
              <button onClick={confirmarCancelamentoVenda} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold shadow transition">Sim, Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: FECHAMENTO DE CAIXA */}
      {modalConfirmacao && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 max-w-md w-full border dark:border-gray-700">
            <h3 className="text-2xl font-black text-gray-800 dark:text-white mb-2 text-center">Encerrar Turno</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">Insira abaixo o valor total em dinheiro físico que está na gaveta agora.</p>

            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl mb-6 text-sm">
              <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
                <span className="font-semibold">Esperado no Sistema:</span>
                <span className="font-black text-lg text-cafe-primary dark:text-cafe-secondary">{formatarMoeda(dinheiroEsperadoNaGaveta)}</span>
              </div>
            </div>

            <div className="mb-8">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">Total Contado na Gaveta (R$)</label>
              <input
                type="number"
                className="w-full p-4 border-2 border-gray-200 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/20 text-center text-3xl font-black text-base transition-all"
                value={valorFechamentoInput}
                onChange={(e) => setValorFechamentoInput(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0,00"
                autoFocus
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => { setModalConfirmacao(false); setValorFechamentoInput(''); }} className="w-full sm:flex-1 py-4 sm:py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:text-white rounded-xl font-bold transition">Cancelar</button>
              <button onClick={confirmarFechamentoCaixa} className="w-full sm:flex-1 py-4 sm:py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg transition">Encerrar Caixa</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER DASHBOARD */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 border-b border-cafe-secondary/30 pb-4 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-cafe-primary dark:text-cafe-secondary">Dashboard Financeiro</h2>
          <p className="text-sm text-green-600 font-semibold mt-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse"></span> Caixa Aberto</p>
        </div>
        <div className="flex flex-wrap w-full lg:w-auto gap-2">
          <button onClick={() => setModalResumo(true)} className="flex-1 lg:flex-none justify-center bg-white dark:bg-gray-700 text-cafe-dark dark:text-gray-100 border border-gray-300 dark:border-gray-500 px-4 py-3 md:py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-gray-50 active:scale-95 flex items-center gap-2 transition">
            📊 Resumo
          </button>
          <button onClick={() => verificarStatusCaixa()} className="flex-1 lg:flex-none justify-center bg-cafe-bg dark:bg-gray-800 text-cafe-dark dark:text-gray-100 border border-gray-300 dark:border-gray-600 px-4 py-3 md:py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-gray-50 active:scale-95 transition">
            🔄 Atualizar
          </button>
          <button onClick={() => setModalConfirmacao(true)} className="w-full lg:w-auto bg-red-600 text-white px-6 py-3 md:py-2 rounded-lg font-bold text-sm shadow-md hover:bg-red-700 active:scale-95 transition">
            Encerrar Dia
          </button>
        </div>
      </div>

      {/* CARDS DE MÉTRICAS */}
      <div className="space-y-4 md:space-y-6 mb-8 md:mb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-cafe-primary dark:bg-gray-800 border dark:border-gray-700 text-white p-6 rounded-xl shadow-md flex flex-col justify-center items-center">
            <h3 className="text-sm font-semibold opacity-90 mb-1 uppercase tracking-wider">Total Vendido</h3>
            <span className="text-3xl md:text-4xl font-black">{formatarMoeda(faturamentoTotal)}</span>
          </div>
          <div className="bg-green-600 dark:bg-green-700 border dark:border-green-600 text-white p-6 rounded-xl shadow-md flex flex-col justify-center items-center">
            <h3 className="text-sm font-semibold opacity-90 mb-1 uppercase tracking-wider">Físico Esperado (Gaveta)</h3>
            <span className="text-3xl md:text-4xl font-black">{formatarMoeda(dinheiroEsperadoNaGaveta)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-center shadow-sm"><h4 className="text-gray-500 dark:text-gray-400 font-semibold mb-1 text-xs md:text-sm">Via PIX</h4><span className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalPix)}</span></div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-center shadow-sm"><h4 className="text-gray-500 dark:text-gray-400 font-semibold mb-1 text-xs md:text-sm">C. Crédito</h4><span className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalCartaoCred)}</span></div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-center shadow-sm"><h4 className="text-gray-500 dark:text-gray-400 font-semibold mb-1 text-xs md:text-sm">C. Débito</h4><span className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalCartaoDeb)}</span></div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-center shadow-sm"><h4 className="text-gray-500 dark:text-gray-400 font-semibold mb-1 text-xs md:text-sm">Em Dinheiro</h4><span className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalDinheiro)}</span></div>
        </div>
      </div>

      {/* HISTÓRICO DE VENDAS */}
      <div>
        <h3 className="text-xl font-bold text-cafe-primary dark:text-cafe-secondary mb-4 border-b border-cafe-secondary/30 pb-2">Histórico de Vendas (Turno Atual)</h3>

        {/* VIEW MOBILE: Lista de Cards (visível apenas em telas menores que 'md') */}
        <div className="md:hidden space-y-4 mb-6">
          {vendasHoje.map(venda => (
            <div key={venda.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col gap-3">
              <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-700 pb-2">
                <div>
                  <span className="font-black text-gray-800 dark:text-gray-100 text-lg block">{venda.identificacao_pedido}</span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">⏰ {formatarHora(venda.data_venda)} • 👤 {venda.atendente || 'Admin'}</span>
                </div>
                <span className="font-black text-green-600 dark:text-green-400 text-xl">{formatarMoeda(venda.total)}</span>
              </div>

              <div>
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded text-xs font-semibold inline-block mb-2">💳 {venda.metodo_pagamento}</span>
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {venda.itens_venda?.map((item, idx) => (
                    <li key={idx} className="flex justify-between">
                      <span className="truncate pr-2"><span className="font-bold">{item.quantidade}x</span> {item.produtos?.nome || 'Item removido'}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button onClick={() => iniciarEdicao(venda)} className="flex-1 bg-blue-50 text-blue-600 dark:bg-gray-700 dark:text-blue-400 font-bold py-2.5 rounded-lg text-sm border border-blue-100 dark:border-gray-600 active:scale-95 transition">Editar</button>
                <button onClick={() => setVendaParaCancelar(venda)} className="flex-1 bg-red-50 text-red-600 dark:bg-gray-700 dark:text-red-400 font-bold py-2.5 rounded-lg text-sm border border-red-100 dark:border-gray-600 active:scale-95 transition">Cancelar</button>
              </div>
            </div>
          ))}
          {vendasHoje.length === 0 && (
            <div className="text-center p-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500">
              Nenhuma venda registrada hoje.
            </div>
          )}
        </div>

        {/* VIEW DESKTOP: Tabela (visível apenas em telas 'md' ou maiores) */}
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-max">
            <thead className="bg-cafe-bg dark:bg-gray-900 border-b dark:border-gray-700 text-sm">
              <tr>
                <th className="p-4 font-semibold text-cafe-primary dark:text-cafe-secondary w-24">Hora</th>
                <th className="p-4 font-semibold text-cafe-primary dark:text-cafe-secondary w-32">Pedido</th>
                <th className="p-4 font-semibold text-cafe-primary dark:text-cafe-secondary w-36">Atendente</th>
                <th className="p-4 font-semibold text-cafe-primary dark:text-cafe-secondary">Itens do Pedido</th>
                <th className="p-4 font-semibold text-cafe-primary dark:text-cafe-secondary">Pagamento</th>
                <th className="p-4 font-semibold text-cafe-primary dark:text-cafe-secondary text-right">Total</th>
                <th className="p-4 font-semibold text-center text-cafe-primary dark:text-cafe-secondary">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vendasHoje.map(venda => (
                <tr key={venda.id} className="border-b dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="p-4 text-gray-500 dark:text-gray-400">{formatarHora(venda.data_venda)}</td>
                  <td className="p-4 font-bold dark:text-gray-100">{venda.identificacao_pedido}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-300 truncate max-w-[140px] font-medium">{venda.atendente || 'Desconhecido'}</td>
                  <td className="p-4">
                    <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside">
                      {venda.itens_venda?.map((item, idx) => (<li key={idx}><span className="font-semibold">{item.quantidade}x</span> {item.produtos?.nome || 'Item removido'}</li>))}
                    </ul>
                  </td>
                  <td className="p-4"><span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-xs font-semibold">{venda.metodo_pagamento}</span></td>
                  <td className="p-4 font-bold text-green-600 dark:text-green-400 text-right text-base">{formatarMoeda(venda.total)}</td>
                  <td className="p-4 text-center space-x-2">
                    <button onClick={() => iniciarEdicao(venda)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-bold px-3 py-1.5 bg-blue-50 dark:bg-gray-700 rounded transition border border-blue-100 dark:border-gray-600 hover:bg-blue-100">Editar</button>
                    <button onClick={() => setVendaParaCancelar(venda)} className="text-red-500 hover:text-red-700 dark:text-red-400 font-bold px-3 py-1.5 bg-red-50 dark:bg-gray-700 rounded transition border border-red-100 dark:border-gray-600 hover:bg-red-100">Cancelar</button>
                  </td>
                </tr>
              ))}
              {vendasHoje.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500 italic">Nenhuma venda registrada neste turno.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
