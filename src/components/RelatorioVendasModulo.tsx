import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Tipagens
type Venda = {
    id: string;
    data_venda: string;
    total: number;
    metodo_pagamento: string;
    valor_dinheiro: number;
    valor_pix: number;
    valor_cartao_credito: number;
    valor_cartao_debito: number;
    caixa_id?: string;
};

type ItemVenda = {
    id: string;
    venda_id: string;
    produto_id: string;
    quantidade: number;
    preco_unitario: number;
    subtotal: number;
    produtos?: {
        nome: string;
    };
};

type ColunaOrdenacao = 'data_venda' | 'id' | 'metodo_pagamento' | 'total';

// Constantes do DatePicker
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function RelatorioVendasModulo() {
    const hojeDate = new Date();

    // Filtros de Data (Padrão: Últimos 10 dias)
    const [dataInicio, setDataInicio] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });
    const [dataFim, setDataFim] = useState(() => hojeDate.toISOString().split('T')[0]);

    // Estados do DatePicker Customizado
    const [popoverInicioAberto, setPopoverInicioAberto] = useState(false);
    const [popoverFimAberto, setPopoverFimAberto] = useState(false);

    // Inicia a visualização do calendário na data correspondente
    const [mesInicioView, setMesInicioView] = useState(() => {
        const d = new Date();
        return d.getMonth();
    });
    const [anoInicioView, setAnoInicioView] = useState(() => {
        const d = new Date();
        return d.getFullYear();
    });

    const [mesFimView, setMesFimView] = useState(hojeDate.getMonth());
    const [anoFimView, setAnoFimView] = useState(hojeDate.getFullYear());

    // Estados da Tabela, Paginação e Ordenação
    const [vendas, setVendas] = useState<Venda[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [paginaAtual, setPaginaAtual] = useState(1);
    const [totalRegistros, setTotalRegistros] = useState(0);
    const [itensPorPagina, setItensPorPagina] = useState(15);
    const [ordenacao, setOrdenacao] = useState<{ coluna: ColunaOrdenacao; direcao: 'asc' | 'desc' }>({
        coluna: 'data_venda',
        direcao: 'desc'
    });

    // TOTALIZADORES DO PERÍODO
    const [totaisPeriodo, setTotaisPeriodo] = useState({ digital: 0, dinheiro: 0, geral: 0 });

    // Estados do Modal de Detalhes
    const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null);
    const [itensVenda, setItensVenda] = useState<ItemVenda[]>([]);
    const [carregandoItens, setCarregandoItens] = useState(false);

    // Formatação e Helpers
    const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
    const formatarDataHora = (dataIso: string) => new Date(dataIso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const formatarDataExibicao = (dataIso: string) => {
        if (!dataIso) return '';
        const [ano, mes, dia] = dataIso.split('-');
        return `${dia}/${mes}/${ano}`;
    };

    const gerarDiasMes = (ano: number, mes: number) => {
        const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
        const totalDias = new Date(ano, mes + 1, 0).getDate();
        const dias = [];
        for (let i = 0; i < primeiroDiaSemana; i++) dias.push(null);
        for (let i = 1; i <= totalDias; i++) dias.push(i);
        return dias;
    };

    // Lógica de Alternar Ordenação
    const alternarOrdenacao = (colunaClicada: ColunaOrdenacao) => {
        setPaginaAtual(1);
        if (ordenacao.coluna === colunaClicada) {
            setOrdenacao({
                coluna: colunaClicada,
                direcao: ordenacao.direcao === 'asc' ? 'desc' : 'asc'
            });
        } else {
            setOrdenacao({ coluna: colunaClicada, direcao: 'desc' });
        }
    };

    const renderizarIconeOrdenacao = (coluna: ColunaOrdenacao) => {
        if (ordenacao.coluna !== coluna) return <span className="text-gray-300 ml-2 font-normal">↕</span>;
        return ordenacao.direcao === 'asc'
            ? <span className="text-blue-600 ml-2 font-black">↑</span>
            : <span className="text-blue-600 ml-2 font-black">↓</span>;
    };

    // Busca principal de Vendas (Mantido igual pois usa range que ignora o limite de 1000 total)
    const buscarVendas = async (pagina = 1) => {
        setCarregando(true);
        try {
            const dataFimAjustada = `${dataFim}T23:59:59.999Z`;
            const dataInicioAjustada = `${dataInicio}T00:00:00.000Z`;

            const from = (pagina - 1) * itensPorPagina;
            const to = from + itensPorPagina - 1;

            const { data, count, error } = await supabase
                .from('vendas')
                .select('*', { count: 'exact' })
                .gte('data_venda', dataInicioAjustada)
                .lte('data_venda', dataFimAjustada)
                .order(ordenacao.coluna, { ascending: ordenacao.direcao === 'asc' })
                .range(from, to);

            if (error) throw error;

            setVendas(data || []);
            if (count !== null) setTotalRegistros(count);
            setPaginaAtual(pagina);
        } catch (error) {
            console.error('Erro ao buscar vendas:', error);
            alert('Erro ao carregar o relatório de vendas.');
        } finally {
            setCarregando(false);
        }
    };

    // Busca os totais gerais do período (NOVO MOTOR PARA PASSAR DE 1000 REGISTROS)
    useEffect(() => {
        const carregarTotaisPeriodo = async () => {
            try {
                const dataFimAjustada = `${dataFim}T23:59:59.999Z`;
                const dataInicioAjustada = `${dataInicio}T00:00:00.000Z`;

                let todasVendasTotais: any[] = [];
                let de = 0;
                const limite = 1000;
                let temMais = true;

                while (temMais) {
                    const { data, error } = await supabase
                        .from('vendas')
                        .select('total, valor_dinheiro, valor_pix, valor_cartao_credito, valor_cartao_debito, metodo_pagamento')
                        .gte('data_venda', dataInicioAjustada)
                        .lte('data_venda', dataFimAjustada)
                        .range(de, de + limite - 1);

                    if (error) throw error;

                    if (data && data.length > 0) {
                        todasVendasTotais = [...todasVendasTotais, ...data];
                        if (data.length < limite) {
                            temMais = false;
                        } else {
                            de += limite;
                        }
                    } else {
                        temMais = false;
                    }
                }

                let pix = 0, din = 0, cred = 0, deb = 0, total = 0;

                todasVendasTotais.forEach(v => {
                    const t = Number(v.total) || 0;
                    total += t;

                    const p = Number(v.valor_pix) || 0;
                    const d = Number(v.valor_dinheiro) || 0;
                    const c = Number(v.valor_cartao_credito) || 0;
                    const de = Number(v.valor_cartao_debito) || 0;

                    if (p + d + c + de > 0) {
                        pix += p; din += d; cred += c; deb += de;
                    } else {
                        const m = String(v.metodo_pagamento || '').trim().toLowerCase();
                        if (m.includes('pix')) pix += t;
                        else if (m.includes('dinheiro')) din += t;
                        else if (m.includes('crédito') || m.includes('credito')) cred += t;
                        else if (m.includes('débito') || m.includes('debito')) deb += t;
                        else din += t;
                    }
                });

                setTotaisPeriodo({
                    digital: pix + cred + deb,
                    dinheiro: din,
                    geral: total
                });

            } catch (error) {
                console.error('Erro ao calcular totais do período:', error);
            }
        };

        carregarTotaisPeriodo();
    }, [dataInicio, dataFim]);

    // Busca detalhes da venda
    const abrirDetalhes = async (venda: Venda) => {
        setVendaSelecionada(venda);
        setCarregandoItens(true);
        setItensVenda([]);

        try {
            const { data, error } = await supabase
                .from('itens_venda')
                .select('*, produtos(nome)')
                .eq('venda_id', venda.id);

            if (error) throw error;
            setItensVenda(data || []);
        } catch (error) {
            console.error('Erro ao buscar itens:', error);
        } finally {
            setCarregandoItens(false);
        }
    };

    // Recarrega quando os filtros, a ordenação ou os itens por página mudam
    useEffect(() => {
        buscarVendas(1);
    }, [dataInicio, dataFim, ordenacao, itensPorPagina]);

    const totalPaginas = Math.ceil(totalRegistros / itensPorPagina);

    return (
        <div className="max-w-7xl mx-auto p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-8">

            {/* CABEÇALHO E FILTROS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b pb-4">
                <div>
                    <h2 className="text-2xl font-black text-cafe-primary">Auditoria de Vendas</h2>
                    <p className="text-sm text-gray-500">Analise transações detalhadas para encontrar divergências de caixa.</p>
                </div>

                {/* DATEPICKER CUSTOMIZADO */}
                <div className="flex items-center bg-white rounded-xl border border-gray-200 shadow-sm relative z-40">
                    <div className="relative p-2 px-4 flex flex-col cursor-pointer select-none" onClick={() => { setPopoverInicioAberto(!popoverInicioAberto); setPopoverFimAberto(false); }}>
                        <span className="text-[9px] font-bold text-gray-400 uppercase">Início</span>
                        <span className="font-bold text-sm text-gray-700 mt-0.5">{formatarDataExibicao(dataInicio)}</span>
                        {popoverInicioAberto && (
                            <div className="absolute top-14 left-0 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-64 z-50" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-3">
                                    <button className="font-black text-gray-400 hover:text-gray-700 px-1" onClick={() => { if (mesInicioView === 0) { setMesInicioView(11); setAnoInicioView(anoInicioView - 1); } else { setMesInicioView(mesInicioView - 1); } }}>&lt;</button>
                                    <span className="font-bold text-xs text-gray-700 uppercase tracking-wide">{MESES[mesInicioView]} {anoInicioView}</span>
                                    <button className="font-black text-gray-400 hover:text-gray-700 px-1" onClick={() => { if (mesInicioView === 11) { setMesInicioView(0); setAnoInicioView(anoInicioView + 1); } else { setMesInicioView(mesInicioView + 1); } }}>&gt;</button>
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-1">
                                    {DIAS_SEMANA.map((d, i) => <div key={`week-ini-${i}`}>{d}</div>)}
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center">
                                    {gerarDiasMes(anoInicioView, mesInicioView).map((dia, idx) => {
                                        if (!dia) return <div key={`empty-ini-${idx}`}></div>;
                                        const dataFormatada = `${anoInicioView}-${String(mesInicioView + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                                        const ativo = dataInicio === dataFormatada;
                                        return (
                                            <button key={`ini-${dia}`} onClick={() => { setDataInicio(dataFormatada); setPopoverInicioAberto(false); }} className={`p-1 text-xs rounded-md font-semibold transition ${ativo ? 'bg-cafe-primary text-white font-bold' : 'text-gray-600 hover:bg-gray-100'}`}>{dia}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1"></div>

                    <div className="relative p-2 px-4 flex flex-col cursor-pointer select-none" onClick={() => { setPopoverFimAberto(!popoverFimAberto); setPopoverInicioAberto(false); }}>
                        <span className="text-[9px] font-bold text-gray-400 uppercase">Fim</span>
                        <span className="font-bold text-sm text-gray-700 mt-0.5">{formatarDataExibicao(dataFim)}</span>
                        {popoverFimAberto && (
                            <div className="absolute top-14 right-0 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-64 z-50" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-3">
                                    <button className="font-black text-gray-400 hover:text-gray-700 px-1" onClick={() => { if (mesFimView === 0) { setMesFimView(11); setAnoFimView(anoFimView - 1); } else { setMesFimView(mesFimView - 1); } }}>&lt;</button>
                                    <span className="font-bold text-xs text-gray-700 uppercase tracking-wide">{MESES[mesFimView]} {anoFimView}</span>
                                    <button className="font-black text-gray-400 hover:text-gray-700 px-1" onClick={() => { if (mesFimView === 11) { setMesFimView(0); setAnoFimView(anoFimView + 1); } else { setMesFimView(mesFimView + 1); } }}>&gt;</button>
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-1">
                                    {DIAS_SEMANA.map((d, i) => <div key={`week-fim-${i}`}>{d}</div>)}
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center">
                                    {gerarDiasMes(anoFimView, mesFimView).map((dia, idx) => {
                                        if (!dia) return <div key={`empty-fim-${idx}`}></div>;
                                        const dataFormatada = `${anoFimView}-${String(mesFimView + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                                        const ativo = dataFim === dataFormatada;
                                        return (
                                            <button key={`fim-${dia}`} onClick={() => { setDataFim(dataFormatada); setPopoverFimAberto(false); }} className={`p-1 text-xs rounded-md font-semibold transition ${ativo ? 'bg-cafe-primary text-white font-bold' : 'text-gray-600 hover:bg-gray-100'}`}>{dia}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* RESUMO RÁPIDO DO PERÍODO */}
            <div className="grid grid-cols-3 gap-4 mb-6 z-10 relative">
                <div className="bg-gray-50 border p-3 rounded-lg">
                    <p className="text-xs font-bold text-gray-500">Total Geral (Período)</p>
                    <p className="text-lg font-black text-gray-800">{formatarMoeda(totaisPeriodo.geral)}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg">
                    <p className="text-xs font-bold text-blue-600">Total Digital (PIX/Cartões)</p>
                    <p className="text-lg font-black text-blue-800">{formatarMoeda(totaisPeriodo.digital)}</p>
                </div>
                <div className="bg-green-50 border border-green-100 p-3 rounded-lg">
                    <p className="text-xs font-bold text-green-600">Total Dinheiro</p>
                    <p className="text-lg font-black text-green-800">{formatarMoeda(totaisPeriodo.dinheiro)}</p>
                </div>
            </div>

            {/* TABELA DE VENDAS COM ORDENAÇÃO */}
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden z-10 relative">
                <table className="w-full text-left text-sm select-none">
                    <thead className="bg-gray-100 text-gray-600 border-b">
                        <tr>
                            <th
                                className="p-4 font-bold cursor-pointer hover:bg-gray-200 transition-colors"
                                onClick={() => alternarOrdenacao('data_venda')}
                            >
                                <div className="flex items-center">Data / Hora {renderizarIconeOrdenacao('data_venda')}</div>
                            </th>
                            <th
                                className="p-4 font-bold cursor-pointer hover:bg-gray-200 transition-colors"
                                onClick={() => alternarOrdenacao('id')}
                            >
                                <div className="flex items-center">Nº Venda {renderizarIconeOrdenacao('id')}</div>
                            </th>
                            <th
                                className="p-4 font-bold cursor-pointer hover:bg-gray-200 transition-colors text-center"
                                onClick={() => alternarOrdenacao('metodo_pagamento')}
                            >
                                <div className="flex items-center justify-center">Método Principal {renderizarIconeOrdenacao('metodo_pagamento')}</div>
                            </th>
                            <th
                                className="p-4 font-bold cursor-pointer hover:bg-gray-200 transition-colors text-right"
                                onClick={() => alternarOrdenacao('total')}
                            >
                                <div className="flex items-center justify-end">Valor Total {renderizarIconeOrdenacao('total')}</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {carregando ? (
                            <tr><td colSpan={4} className="p-8 text-center text-gray-500 font-bold animate-pulse">Buscando e ordenando registros...</td></tr>
                        ) : vendas.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-gray-500 italic">Nenhuma venda encontrada neste período.</td></tr>
                        ) : (
                            vendas.map(v => (
                                <tr key={v.id} onClick={() => abrirDetalhes(v)} className="border-b hover:bg-blue-50/50 cursor-pointer transition group">
                                    <td className="p-4 font-semibold text-gray-700">{formatarDataHora(v.data_venda)}</td>
                                    <td className="p-4 text-xs font-mono text-gray-400">#{v.id.split('-')[0]}</td>
                                    <td className="p-4 text-center">
                                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-bold border">
                                            {v.metodo_pagamento?.toUpperCase() || 'MISTO'}
                                        </span>
                                    </td>
                                    <td className="p-4 font-black text-gray-800 text-right">{formatarMoeda(v.total)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* CONTROLES DE PAGINAÇÃO AVANÇADA */}
            {!carregando && totalRegistros > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-center mt-4 px-2 z-10 relative gap-4">

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500">Itens por página:</span>
                        <select
                            value={itensPorPagina}
                            onChange={(e) => setItensPorPagina(Number(e.target.value))}
                            className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-bold text-gray-700 outline-none hover:border-gray-400 cursor-pointer transition"
                        >
                            <option value={15}>15</option>
                            <option value={30}>30</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>

                    <span className="text-xs font-semibold text-gray-500 text-center">
                        Mostrando {(paginaAtual - 1) * itensPorPagina + 1} a {Math.min(paginaAtual * itensPorPagina, totalRegistros)} de {totalRegistros} vendas
                    </span>

                    <div className="flex gap-1">
                        <button
                            disabled={paginaAtual === 1}
                            onClick={() => buscarVendas(1)}
                            className="px-3 py-1 bg-white border rounded font-bold text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            title="Primeira Página"
                        >
                            «
                        </button>
                        <button
                            disabled={paginaAtual === 1}
                            onClick={() => buscarVendas(paginaAtual - 1)}
                            className="px-3 py-1 bg-white border rounded font-bold text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Anterior
                        </button>
                        <span className="px-3 py-1 font-bold text-sm text-gray-700 bg-gray-100 rounded">
                            {paginaAtual} / {totalPaginas || 1}
                        </span>
                        <button
                            disabled={paginaAtual >= totalPaginas}
                            onClick={() => buscarVendas(paginaAtual + 1)}
                            className="px-3 py-1 bg-white border rounded font-bold text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Próxima
                        </button>
                        <button
                            disabled={paginaAtual >= totalPaginas}
                            onClick={() => buscarVendas(totalPaginas)}
                            className="px-3 py-1 bg-white border rounded font-bold text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            title="Última Página"
                        >
                            »
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL DE DETALHES DA VENDA */}
            {vendaSelecionada && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                        {/* Header Modal */}
                        <div className="bg-gray-900 p-5 flex justify-between items-center text-white">
                            <div>
                                <h3 className="font-black text-lg">Detalhes da Venda</h3>
                                <p className="text-xs text-gray-400 font-mono">ID: {vendaSelecionada.id}</p>
                            </div>
                            <button onClick={() => setVendaSelecionada(null)} className="text-gray-400 hover:text-white font-black text-xl px-2">✕</button>
                        </div>

                        {/* Corpo Modal */}
                        <div className="p-6 overflow-y-auto flex-1 bg-gray-50">

                            <div className="flex justify-between items-start mb-6 bg-white p-4 rounded-lg border shadow-sm">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase">Data e Hora</p>
                                    <p className="font-bold text-gray-800">{formatarDataHora(vendaSelecionada.data_venda)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Valor Total</p>
                                    <p className="text-xl font-black text-green-600">{formatarMoeda(vendaSelecionada.total)}</p>
                                </div>
                            </div>

                            <h4 className="font-black text-gray-700 border-b pb-2 mb-3 text-sm uppercase">Itens Vendidos</h4>

                            {carregandoItens ? (
                                <p className="text-center text-sm font-bold text-gray-500 py-6 animate-pulse">Carregando itens...</p>
                            ) : (
                                <div className="bg-white border rounded-lg overflow-hidden shadow-sm mb-6">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="p-3 font-bold text-gray-600">Produto</th>
                                                <th className="p-3 font-bold text-center text-gray-600">Qtd</th>
                                                <th className="p-3 font-bold text-right text-gray-600">Unitário</th>
                                                <th className="p-3 font-bold text-right text-gray-600">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {itensVenda.map(item => (
                                                <tr key={item.id} className="border-t">
                                                    <td className="p-3 font-semibold text-gray-800">{item.produtos?.nome || 'Produto não encontrado'}</td>
                                                    <td className="p-3 text-center font-bold text-gray-600">{item.quantidade}</td>
                                                    <td className="p-3 text-right text-gray-500">{formatarMoeda(item.preco_unitario)}</td>
                                                    <td className="p-3 text-right font-bold text-gray-800">{formatarMoeda(item.subtotal)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <h4 className="font-black text-gray-700 border-b pb-2 mb-3 text-sm uppercase">Composição de Pagamento</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white border p-3 rounded shadow-sm flex justify-between">
                                    <span className="text-sm font-bold text-gray-500">💵 Dinheiro:</span>
                                    <span className="font-bold">{formatarMoeda(vendaSelecionada.valor_dinheiro)}</span>
                                </div>
                                <div className="bg-white border p-3 rounded shadow-sm flex justify-between">
                                    <span className="text-sm font-bold text-gray-500">📱 PIX:</span>
                                    <span className="font-bold">{formatarMoeda(vendaSelecionada.valor_pix)}</span>
                                </div>
                                <div className="bg-white border p-3 rounded shadow-sm flex justify-between">
                                    <span className="text-sm font-bold text-gray-500">💳 Crédito:</span>
                                    <span className="font-bold">{formatarMoeda(vendaSelecionada.valor_cartao_credito)}</span>
                                </div>
                                <div className="bg-white border p-3 rounded shadow-sm flex justify-between">
                                    <span className="text-sm font-bold text-gray-500">💳 Débito:</span>
                                    <span className="font-bold">{formatarMoeda(vendaSelecionada.valor_cartao_debito)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}