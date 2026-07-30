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
        if (ordenacao.coluna !== coluna) return <span className="text-gray-300 ml-2 font-normal opacity-50">↕</span>;
        return ordenacao.direcao === 'asc'
            ? <span className="text-cafe-primary ml-2 font-black">↑</span>
            : <span className="text-cafe-primary ml-2 font-black">↓</span>;
    };

    // Busca principal de Vendas
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

    // Busca os totais gerais do período
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
        <div className="max-w-7xl mx-auto p-4 md:p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-4 md:my-8 relative">

            {/* CABEÇALHO E FILTROS */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4 border-b border-cafe-secondary/30 pb-4">
                <div className="w-full lg:w-auto text-center sm:text-left">
                    <h2 className="text-xl md:text-2xl font-black text-cafe-primary uppercase tracking-wider">Auditoria de Vendas</h2>
                    <p className="text-xs md:text-sm text-gray-500 font-medium mt-0.5">Analise transações detalhadas para conciliação de caixa</p>
                </div>

                {/* DATEPICKER CUSTOMIZADO */}
                <div className="flex flex-col sm:flex-row items-center bg-white rounded-xl border border-gray-200 shadow-sm relative z-40 w-full lg:w-auto">
                    <div className="relative p-2 px-4 flex flex-1 sm:flex-none w-full sm:w-auto flex-col cursor-pointer select-none border-b sm:border-b-0 sm:border-r border-gray-100" onClick={() => { setPopoverInicioAberto(!popoverInicioAberto); setPopoverFimAberto(false); }}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center sm:text-left">Início do Período</span>
                        <span className="font-black text-sm text-cafe-dark mt-0.5 text-center sm:text-left">{formatarDataExibicao(dataInicio)}</span>

                        {popoverInicioAberto && (
                            <div className="absolute top-14 left-0 sm:left-auto bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 w-[280px] z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-4">
                                    <button className="font-black text-gray-400 hover:text-cafe-primary p-2 bg-gray-50 rounded-lg transition" onClick={() => { if (mesInicioView === 0) { setMesInicioView(11); setAnoInicioView(anoInicioView - 1); } else { setMesInicioView(mesInicioView - 1); } }}>&lt;</button>
                                    <span className="font-bold text-sm text-gray-800 uppercase tracking-wide">{MESES[mesInicioView]} {anoInicioView}</span>
                                    <button className="font-black text-gray-400 hover:text-cafe-primary p-2 bg-gray-50 rounded-lg transition" onClick={() => { if (mesInicioView === 11) { setMesInicioView(0); setAnoInicioView(anoInicioView + 1); } else { setMesInicioView(mesInicioView + 1); } }}>&gt;</button>
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-2">
                                    {DIAS_SEMANA.map((d, i) => <div key={`week-ini-${i}`}>{d}</div>)}
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center">
                                    {gerarDiasMes(anoInicioView, mesInicioView).map((dia, idx) => {
                                        if (!dia) return <div key={`empty-ini-${idx}`}></div>;
                                        const dataFormatada = `${anoInicioView}-${String(mesInicioView + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                                        const ativo = dataInicio === dataFormatada;
                                        return (
                                            <button key={`ini-${dia}`} onClick={() => { setDataInicio(dataFormatada); setPopoverInicioAberto(false); }} className={`p-2 text-sm rounded-lg font-bold transition active:scale-95 ${ativo ? 'bg-cafe-primary text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}>{dia}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="relative p-2 px-4 flex flex-1 sm:flex-none w-full sm:w-auto flex-col cursor-pointer select-none" onClick={() => { setPopoverFimAberto(!popoverFimAberto); setPopoverInicioAberto(false); }}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center sm:text-left">Fim do Período</span>
                        <span className="font-black text-sm text-cafe-dark mt-0.5 text-center sm:text-left">{formatarDataExibicao(dataFim)}</span>

                        {popoverFimAberto && (
                            <div className="absolute top-14 right-0 sm:right-auto sm:left-auto bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 w-[280px] z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-4">
                                    <button className="font-black text-gray-400 hover:text-cafe-primary p-2 bg-gray-50 rounded-lg transition" onClick={() => { if (mesFimView === 0) { setMesFimView(11); setAnoFimView(anoFimView - 1); } else { setMesFimView(mesFimView - 1); } }}>&lt;</button>
                                    <span className="font-bold text-sm text-gray-800 uppercase tracking-wide">{MESES[mesFimView]} {anoFimView}</span>
                                    <button className="font-black text-gray-400 hover:text-cafe-primary p-2 bg-gray-50 rounded-lg transition" onClick={() => { if (mesFimView === 11) { setMesFimView(0); setAnoFimView(anoFimView + 1); } else { setMesFimView(mesFimView + 1); } }}>&gt;</button>
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-2">
                                    {DIAS_SEMANA.map((d, i) => <div key={`week-fim-${i}`}>{d}</div>)}
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center">
                                    {gerarDiasMes(anoFimView, mesFimView).map((dia, idx) => {
                                        if (!dia) return <div key={`empty-fim-${idx}`}></div>;
                                        const dataFormatada = `${anoFimView}-${String(mesFimView + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                                        const ativo = dataFim === dataFormatada;
                                        return (
                                            <button key={`fim-${dia}`} onClick={() => { setDataFim(dataFormatada); setPopoverFimAberto(false); }} className={`p-2 text-sm rounded-lg font-bold transition active:scale-95 ${ativo ? 'bg-cafe-primary text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}>{dia}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* RESUMO RÁPIDO DO PERÍODO */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6 z-10 relative">
                <div className="bg-gray-50 border border-gray-200 p-4 md:p-5 rounded-2xl shadow-sm text-center sm:text-left flex flex-col justify-center">
                    <p className="text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Total Geral (Período)</p>
                    <p className="text-2xl md:text-3xl font-black text-gray-800 leading-tight">{formatarMoeda(totaisPeriodo.geral)}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 md:p-5 rounded-2xl shadow-sm text-center sm:text-left flex flex-col justify-center">
                    <p className="text-[10px] md:text-xs font-black text-blue-700 uppercase tracking-widest mb-1">Meios Digitais (Pix/Cartões)</p>
                    <p className="text-2xl md:text-3xl font-black text-blue-800 leading-tight">{formatarMoeda(totaisPeriodo.digital)}</p>
                </div>
                <div className="bg-green-50 border border-green-200 p-4 md:p-5 rounded-2xl shadow-sm text-center sm:text-left flex flex-col justify-center">
                    <p className="text-[10px] md:text-xs font-black text-green-700 uppercase tracking-widest mb-1">Dinheiro (Físico)</p>
                    <p className="text-2xl md:text-3xl font-black text-green-800 leading-tight">{formatarMoeda(totaisPeriodo.dinheiro)}</p>
                </div>
            </div>

            {/* VIEW MOBILE: LISTAGEM DE VENDAS EM CARDS */}
            <div className="md:hidden space-y-3 mb-6">
                {carregando ? (
                    <div className="p-8 text-center text-cafe-primary font-bold animate-pulse text-sm uppercase tracking-widest">Buscando registros...</div>
                ) : vendas.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 italic border border-dashed rounded-xl border-gray-300">Nenhuma venda encontrada neste período.</div>
                ) : (
                    vendas.map(v => (
                        <div key={v.id} onClick={() => abrirDetalhes(v)} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3 active:bg-gray-50 transition cursor-pointer relative overflow-hidden">
                            <div className="absolute left-0 top-0 h-full w-1.5 bg-cafe-secondary/50"></div>
                            <div className="flex justify-between items-start pl-2">
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-0.5">Venda #{v.id.split('-')[0]}</span>
                                    <span className="text-sm font-bold text-gray-800">{formatarDataHora(v.data_venda)}</span>
                                </div>
                                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border border-gray-200 shadow-sm">
                                    {v.metodo_pagamento?.toUpperCase() || 'MISTO'}
                                </span>
                            </div>
                            <div className="flex justify-end items-end pt-2 border-t border-gray-100 pl-2">
                                <span className="font-black text-cafe-dark text-xl">{formatarMoeda(v.total)}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* VIEW DESKTOP: TABELA DE VENDAS COM ORDENAÇÃO */}
            <div className="hidden md:block bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden z-10 relative">
                <table className="w-full text-left text-sm select-none">
                    <thead className="bg-gray-50 text-gray-500 border-b border-gray-200 text-xs uppercase tracking-wider">
                        <tr>
                            <th
                                className="p-4 font-bold cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => alternarOrdenacao('data_venda')}
                            >
                                <div className="flex items-center">Data / Hora {renderizarIconeOrdenacao('data_venda')}</div>
                            </th>
                            <th
                                className="p-4 font-bold cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => alternarOrdenacao('id')}
                            >
                                <div className="flex items-center">Nº Venda {renderizarIconeOrdenacao('id')}</div>
                            </th>
                            <th
                                className="p-4 font-bold cursor-pointer hover:bg-gray-100 transition-colors text-center"
                                onClick={() => alternarOrdenacao('metodo_pagamento')}
                            >
                                <div className="flex items-center justify-center">Método Principal {renderizarIconeOrdenacao('metodo_pagamento')}</div>
                            </th>
                            <th
                                className="p-4 font-bold cursor-pointer hover:bg-gray-100 transition-colors text-right"
                                onClick={() => alternarOrdenacao('total')}
                            >
                                <div className="flex items-center justify-end">Valor Total {renderizarIconeOrdenacao('total')}</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {carregando ? (
                            <tr><td colSpan={4} className="p-8 text-center text-cafe-primary font-bold animate-pulse uppercase tracking-widest text-xs">Buscando e ordenando registros...</td></tr>
                        ) : vendas.length === 0 ? (
                            <tr><td colSpan={4} className="p-10 text-center text-gray-400 italic">Nenhuma venda encontrada neste período.</td></tr>
                        ) : (
                            vendas.map(v => (
                                <tr key={v.id} onClick={() => abrirDetalhes(v)} className="border-b border-gray-100 hover:bg-cafe-bg/50 cursor-pointer transition-colors group">
                                    <td className="p-4 font-bold text-gray-800">{formatarDataHora(v.data_venda)}</td>
                                    <td className="p-4 text-xs font-mono text-gray-500 font-semibold uppercase">#{v.id.split('-')[0]}</td>
                                    <td className="p-4 text-center">
                                        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider border border-gray-200">
                                            {v.metodo_pagamento?.toUpperCase() || 'MISTO'}
                                        </span>
                                    </td>
                                    <td className="p-4 font-black text-cafe-dark text-right text-base">{formatarMoeda(v.total)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* CONTROLES DE PAGINAÇÃO AVANÇADA */}
            {!carregando && totalRegistros > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-center mt-6 px-2 z-10 relative gap-4">

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
                        <span className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">Itens por página:</span>
                        <select
                            value={itensPorPagina}
                            onChange={(e) => setItensPorPagina(Number(e.target.value))}
                            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-base md:text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-cafe-primary cursor-pointer transition shadow-sm"
                        >
                            <option value={15}>15</option>
                            <option value={30}>30</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>

                    <span className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest text-center">
                        Mostrando <span className="text-cafe-dark">{((paginaAtual - 1) * itensPorPagina) + 1}</span> a <span className="text-cafe-dark">{Math.min(paginaAtual * itensPorPagina, totalRegistros)}</span> de <span className="text-cafe-dark">{totalRegistros}</span> vendas
                    </span>

                    <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end">
                        <button
                            disabled={paginaAtual === 1}
                            onClick={() => buscarVendas(1)}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg font-black text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition active:scale-95"
                            title="Primeira Página"
                        >
                            «
                        </button>
                        <button
                            disabled={paginaAtual === 1}
                            onClick={() => buscarVendas(paginaAtual - 1)}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg font-bold text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition active:scale-95"
                        >
                            Ant
                        </button>
                        <span className="px-4 py-2 font-black text-sm text-cafe-primary bg-cafe-bg rounded-lg border border-cafe-secondary/30">
                            {paginaAtual} <span className="text-gray-400 font-medium">/</span> {totalPaginas || 1}
                        </span>
                        <button
                            disabled={paginaAtual >= totalPaginas}
                            onClick={() => buscarVendas(paginaAtual + 1)}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg font-bold text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition active:scale-95"
                        >
                            Próx
                        </button>
                        <button
                            disabled={paginaAtual >= totalPaginas}
                            onClick={() => buscarVendas(totalPaginas)}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg font-black text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition active:scale-95"
                            title="Última Página"
                        >
                            »
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL DE DETALHES DA VENDA */}
            {vendaSelecionada && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-2 md:p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh] border border-gray-200">

                        {/* Header Modal */}
                        <div className="bg-gray-900 p-4 md:p-5 flex justify-between items-center text-white shrink-0">
                            <div>
                                <h3 className="font-black text-lg md:text-xl tracking-tight">Detalhes da Transação</h3>
                                <p className="text-[10px] md:text-xs text-gray-400 font-mono uppercase tracking-widest mt-1">ID: {vendaSelecionada.id}</p>
                            </div>
                            <button onClick={() => setVendaSelecionada(null)} className="text-gray-400 hover:text-white font-black text-2xl px-2 transition">✕</button>
                        </div>

                        {/* Corpo Modal */}
                        <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-gray-50/50 custom-scrollbar">

                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
                                <div className="absolute left-0 top-0 w-1.5 h-full bg-cafe-primary"></div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Data e Hora de Fechamento</p>
                                    <p className="font-bold text-gray-800 text-sm md:text-base">{formatarDataHora(vendaSelecionada.data_venda)}</p>
                                </div>
                                <div className="text-left sm:text-right w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Valor Total da Compra</p>
                                    <p className="text-2xl font-black text-cafe-dark leading-none">{formatarMoeda(vendaSelecionada.total)}</p>
                                </div>
                            </div>

                            <h4 className="font-black text-gray-800 border-b border-gray-200 pb-2 mb-4 text-xs uppercase tracking-wider">Itens Consumidos</h4>

                            {carregandoItens ? (
                                <p className="text-center text-xs font-bold text-gray-500 py-10 animate-pulse uppercase tracking-widest">Extraindo itens do pedido...</p>
                            ) : (
                                <>
                                    {/* View Itens Mobile */}
                                    <div className="md:hidden space-y-3 mb-6">
                                        {itensVenda.map(item => (
                                            <div key={item.id} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm flex flex-col gap-2">
                                                <span className="font-black text-gray-800 leading-tight">{item.produtos?.nome || 'Produto não encontrado'}</span>
                                                <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100 mt-1">
                                                    <span className="text-gray-500 font-bold bg-gray-50 px-2 py-1 rounded text-xs border border-gray-100">{item.quantidade}x {formatarMoeda(item.preco_unitario)}</span>
                                                    <span className="font-black text-cafe-dark">{formatarMoeda(item.subtotal)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* View Itens Desktop */}
                                    <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mb-6">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                                <tr>
                                                    <th className="p-3 font-bold">Produto</th>
                                                    <th className="p-3 font-bold text-center">Qtd</th>
                                                    <th className="p-3 font-bold text-right">Unitário</th>
                                                    <th className="p-3 font-bold text-right">Subtotal</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {itensVenda.map(item => (
                                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="p-3 font-bold text-gray-800">{item.produtos?.nome || 'Produto Removido'}</td>
                                                        <td className="p-3 text-center font-black text-gray-600 bg-gray-50/50">{item.quantidade}</td>
                                                        <td className="p-3 text-right text-gray-500 font-semibold">{formatarMoeda(item.preco_unitario)}</td>
                                                        <td className="p-3 text-right font-black text-cafe-dark">{formatarMoeda(item.subtotal)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            <h4 className="font-black text-gray-800 border-b border-gray-200 pb-2 mb-4 text-xs uppercase tracking-wider">Composição do Pagamento</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                                <div className="bg-green-50/50 border border-green-100 p-3.5 rounded-xl shadow-sm flex justify-between items-center">
                                    <span className="text-[10px] md:text-xs font-black text-green-700 uppercase tracking-widest">💵 Dinheiro</span>
                                    <span className="font-black text-green-800 text-sm md:text-base">{formatarMoeda(vendaSelecionada.valor_dinheiro)}</span>
                                </div>
                                <div className="bg-blue-50/50 border border-blue-100 p-3.5 rounded-xl shadow-sm flex justify-between items-center">
                                    <span className="text-[10px] md:text-xs font-black text-blue-700 uppercase tracking-widest">📱 PIX</span>
                                    <span className="font-black text-blue-800 text-sm md:text-base">{formatarMoeda(vendaSelecionada.valor_pix)}</span>
                                </div>
                                <div className="bg-white border border-gray-200 p-3.5 rounded-xl shadow-sm flex justify-between items-center">
                                    <span className="text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest">💳 C. Crédito</span>
                                    <span className="font-black text-gray-800 text-sm md:text-base">{formatarMoeda(vendaSelecionada.valor_cartao_credito)}</span>
                                </div>
                                <div className="bg-white border border-gray-200 p-3.5 rounded-xl shadow-sm flex justify-between items-center">
                                    <span className="text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest">💳 C. Débito</span>
                                    <span className="font-black text-gray-800 text-sm md:text-base">{formatarMoeda(vendaSelecionada.valor_cartao_debito)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}