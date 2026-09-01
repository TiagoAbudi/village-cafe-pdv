import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { dataLocalISO, limitesDoDiaLocal } from '../lib/datas';

type ProdutoVendido = { nome: string; quantidade: number; faturamento: number; custo: number; lucro: number };

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function DashboardRendimentos() {
    const hojeDate = new Date();
    const hojeStr = dataLocalISO(hojeDate);
    const primeiroDiaDoMesStr = dataLocalISO(new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1));

    const [dataInicio, setDataInicio] = useState(primeiroDiaDoMesStr);
    const [dataFim, setDataFim] = useState(hojeStr);
    const [vendas, setVendas] = useState<any[]>([]);
    const [carregando, setCarregando] = useState(true);

    const [popoverInicioAberto, setPopoverInicioAberto] = useState(false);
    const [popoverFimAberto, setPopoverFimAberto] = useState(false);

    const [mesInicioView, setMesInicioView] = useState(hojeDate.getMonth());
    const [anoInicioView, setAnoInicioView] = useState(hojeDate.getFullYear());

    const [mesFimView, setMesFimView] = useState(hojeDate.getMonth());
    const [anoFimView, setAnoFimView] = useState(hojeDate.getFullYear());

    const [tooltip, setTooltip] = useState<{ visivel: boolean; p: any | null }>({ visivel: false, p: null });

    const carregarDadosDashboard = useCallback(async () => {
        setCarregando(true);
        try {
            const { inicio: dataInicioFiltro } = limitesDoDiaLocal(dataInicio);
            const { fim: dataFimFiltro } = limitesDoDiaLocal(dataFim);

            // MOTOR DE BUSCA SEM LIMITE (PULA A BARREIRA DOS 1000)
            let todasVendas: any[] = [];
            let de = 0;
            const limite = 1000;
            let temMais = true;

            while (temMais) {
                const { data, error } = await supabase
                    .from('vendas')
                    .select(`
                        *,
                        itens_venda (
                            quantidade,
                            preco_unitario,
                            custo_unitario,
                            produtos (
                                nome,
                                preco_custo
                            )
                        )
                    `)
                    .gte('data_venda', dataInicioFiltro)
                    .lte('data_venda', dataFimFiltro)
                    .neq('status', 'Cancelada')
                    .order('data_venda', { ascending: false })
                    .range(de, de + limite - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    todasVendas = [...todasVendas, ...data];
                    if (data.length < limite) {
                        temMais = false; // Veio menos de 1000, acabou
                    } else {
                        de += limite; // Prepara para buscar os próximos 1000
                    }
                } else {
                    temMais = false;
                }
            }

            setVendas(todasVendas);
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
        } finally {
            setCarregando(false);
        }
    }, [dataInicio, dataFim]);

    useEffect(() => { void carregarDadosDashboard(); }, [carregarDadosDashboard]);

    const gerarDiasMes = (ano: number, mes: number) => {
        const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
        const totalDias = new Date(ano, mes + 1, 0).getDate();
        const dias = [];
        for (let i = 0; i < primeiroDiaSemana; i++) dias.push(null);
        for (let i = 1; i <= totalDias; i++) dias.push(i);
        return dias;
    };

    const formatarDataExibicao = (dataIso: string) => {
        if (!dataIso) return '';
        const [ano, mes, dia] = dataIso.split('-');
        return `${dia}/${mes}/${ano}`;
    };

    const definirPeriodoFast = (tipo: 'hoje' | '7dias' | 'mes') => {
        const dataAtual = new Date();
        const hojeString = dataLocalISO(dataAtual);

        if (tipo === 'hoje') {
            setDataInicio(hojeString);
            setDataFim(hojeString);
        } else if (tipo === '7dias') {
            const seteDiasAtras = new Date();
            seteDiasAtras.setDate(dataAtual.getDate() - 7);
            setDataInicio(dataLocalISO(seteDiasAtras));
            setDataFim(hojeString);
        } else if (tipo === 'mes') {
            setDataInicio(primeiroDiaDoMesStr);
            setDataFim(hojeString);
        }
        setPopoverInicioAberto(false);
        setPopoverFimAberto(false);
    };

    const metricas = useMemo(() => {
        let faturamentoTotal = 0;
        let lucroTotal = 0;
        let custoTotal = 0;
        let totalPix = 0;
        let totalDinheiro = 0;
        let totalCredito = 0;
        let totalDebito = 0;

        const contagemProdutos: { [key: string]: { qtd: number; fat: number; custo: number } } = {};
        const vendasPorDia: Record<string, { valor: number, qtd: number, custo: number }> = {};

        vendas.forEach((venda) => {
            faturamentoTotal += venda.total;
            totalPix += venda.valor_pix || 0;
            totalDinheiro += venda.valor_dinheiro || 0;
            totalCredito += venda.valor_cartao_credito || 0;
            totalDebito += venda.valor_cartao_debito || 0;

            const diaStr = venda.data_venda.split('T')[0];
            if (!vendasPorDia[diaStr]) vendasPorDia[diaStr] = { valor: 0, qtd: 0, custo: 0 };
            vendasPorDia[diaStr].valor += venda.total;
            vendasPorDia[diaStr].qtd += 1;

            venda.itens_venda?.forEach((item: any) => {
                const precoVendaItem = item.preco_unitario * item.quantidade;
                const precoCustoItem = Number(item.custo_unitario ?? item.produtos?.preco_custo ?? 0) * item.quantidade;

                lucroTotal += (precoVendaItem - precoCustoItem);
                custoTotal += precoCustoItem;

                vendasPorDia[diaStr].custo += precoCustoItem;

                const nomeProd = item.produtos?.nome || 'Produto Removido';
                if (!contagemProdutos[nomeProd]) {
                    contagemProdutos[nomeProd] = { qtd: 0, fat: 0, custo: 0 };
                }
                contagemProdutos[nomeProd].qtd += item.quantidade;
                contagemProdutos[nomeProd].fat += precoVendaItem;
                contagemProdutos[nomeProd].custo += precoCustoItem;
            });
        });

        const totalVendasCount = vendas.length;
        const ticketMedio = totalVendasCount > 0 ? faturamentoTotal / totalVendasCount : 0;

        const produtosMaisVendidos: ProdutoVendido[] = Object.keys(contagemProdutos)
            .map((nome) => ({
                nome,
                quantidade: contagemProdutos[nome].qtd,
                faturamento: contagemProdutos[nome].fat,
                custo: contagemProdutos[nome].custo,
                lucro: contagemProdutos[nome].fat - contagemProdutos[nome].custo,
            }))
            .sort((a, b) => b.quantidade - a.quantidade)
            .slice(0, 5);

        const graficoDados = Object.keys(vendasPorDia).sort().map(dia => {
            const [, mes, d] = dia.split('-');
            const valorDia = vendasPorDia[dia].valor;
            const custoDia = vendasPorDia[dia].custo;

            return {
                dataCurta: `${d}/${mes}`,
                valor: valorDia,
                custo: custoDia,
                lucro: valorDia - custoDia,
                qtd: vendasPorDia[dia].qtd
            };
        });

        const maxValorGrafico = Math.max(...graficoDados.map(g => g.valor), 1);

        return {
            faturamentoTotal,
            lucroTotal,
            custoTotal,
            ticketMedio,
            totalVendasCount,
            produtosMaisVendidos,
            graficoDados,
            maxValorGrafico,
            financeiro: { totalPix, totalDinheiro, totalCredito, totalDebito }
        };
    }, [vendas]);

    const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

    // ---------- CÁLCULOS DO GRÁFICO SVG (CORRIGIDO PARA NÃO CORTAR O BALÃO) ----------
    const numPontos = Math.max(metricas.graficoDados.length, 1);

    // Margens super protegidas para caber as extremidades da esquerda e direita
    const padX = 120;
    const svgWidth = Math.max(800, numPontos * 130);

    // Altura gigante para caber perfeitamente o tooltip no ponto mais alto
    const svgHeight = 480;
    const padYTop = 240; // O teto máximo da linha agora é bem mais pra baixo
    const padYBot = 400; // O chão da linha

    const usableWidth = svgWidth - padX * 2;
    const usableHeight = padYBot - padYTop;

    const pts = metricas.graficoDados.map((d, i) => {
        const x = numPontos === 1 ? svgWidth / 2 : padX + (i / (numPontos - 1)) * usableWidth;
        const y = padYBot - (d.valor / metricas.maxValorGrafico) * usableHeight;
        return { ...d, x, y };
    });

    const pathLinha = pts.length > 0 ? `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}` : '';
    const pathArea = pts.length > 0 ? `${pathLinha} L ${pts[pts.length - 1].x},${padYBot} L ${pts[0].x},${padYBot} Z` : '';

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 my-4 space-y-6 relative">

            {/* Cabeçalho e Filtros */}
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 xl:gap-6 z-30 relative">
                <div className="w-full xl:w-auto text-center xl:text-left">
                    <h2 className="text-xl md:text-2xl font-black text-cafe-dark tracking-tight uppercase">Painel de Rendimentos</h2>
                    <p className="text-xs md:text-sm text-gray-500 font-medium mt-0.5">Métricas de faturação, margem e performance do negócio</p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
                    {/* Botões Rápidos */}
                    <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-inner w-full sm:w-auto justify-between">
                        <button onClick={() => definirPeriodoFast('hoje')} className={`flex-1 sm:flex-none px-4 md:px-3 py-2.5 md:py-1.5 text-sm md:text-xs font-bold rounded-lg transition-all ${dataInicio === hojeStr && dataFim === hojeStr ? 'bg-white text-cafe-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Hoje</button>
                                            <button onClick={() => definirPeriodoFast('7dias')} className={`flex-1 sm:flex-none px-4 md:px-3 py-2.5 md:py-1.5 text-sm md:text-xs font-bold rounded-lg transition-all ${dataInicio === dataLocalISO(new Date(new Date().setDate(hojeDate.getDate() - 7))) ? 'bg-white text-cafe-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>7 Dias</button>
                        <button onClick={() => definirPeriodoFast('mes')} className={`flex-1 sm:flex-none px-4 md:px-3 py-2.5 md:py-1.5 text-sm md:text-xs font-bold rounded-lg transition-all ${dataInicio === primeiroDiaDoMesStr && dataFim === hojeStr ? 'bg-white text-cafe-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Este Mês</button>
                    </div>

                    {/* Seletores Customizados */}
                    <div className="flex items-center bg-white rounded-xl border border-gray-200 shadow-sm relative w-full sm:w-auto">
                        <div className="relative p-2 px-4 flex flex-1 sm:flex-none flex-col cursor-pointer select-none border-r border-gray-100" onClick={() => { setPopoverInicioAberto(!popoverInicioAberto); setPopoverFimAberto(false); }}>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center sm:text-left">Início</span>
                            <span className="font-black text-sm md:text-sm text-cafe-dark mt-0.5 text-center sm:text-left">{formatarDataExibicao(dataInicio)}</span>
                            {popoverInicioAberto && (
                                <div className="absolute top-14 left-0 sm:left-auto sm:-left-4 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 w-[280px] z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-between items-center mb-4">
                                        <button className="font-black text-gray-400 hover:text-cafe-primary p-2 bg-gray-50 rounded-lg transition" onClick={() => { if (mesInicioView === 0) { setMesInicioView(11); setAnoInicioView(anoInicioView - 1); } else { setMesInicioView(mesInicioView - 1); } }}>&lt;</button>
                                        <span className="font-bold text-sm text-gray-800 uppercase tracking-wide">{MESES[mesInicioView]} {anoInicioView}</span>
                                        <button className="font-black text-gray-400 hover:text-cafe-primary p-2 bg-gray-50 rounded-lg transition" onClick={() => { if (mesInicioView === 11) { setMesInicioView(0); setAnoInicioView(anoInicioView + 1); } else { setMesInicioView(mesInicioView + 1); } }}>&gt;</button>
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-2">
                                        {DIAS_SEMANA.map((d, i) => <div key={`dw-${i}`}>{d}</div>)}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center">
                                        {gerarDiasMes(anoInicioView, mesInicioView).map((dia, idx) => {
                                            if (!dia) return <div key={`empty-${idx}`}></div>;
                                            const dataFormatada = `${anoInicioView}-${String(mesInicioView + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                                            const ativo = dataInicio === dataFormatada;
                                            return (
                                                <button key={dia} onClick={() => { setDataInicio(dataFormatada); setPopoverInicioAberto(false); }} className={`p-2 text-sm rounded-lg font-bold transition active:scale-95 ${ativo ? 'bg-cafe-primary text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}>{dia}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative p-2 px-4 flex flex-1 sm:flex-none flex-col cursor-pointer select-none" onClick={() => { setPopoverFimAberto(!popoverFimAberto); setPopoverInicioAberto(false); }}>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center sm:text-left">Fim</span>
                            <span className="font-black text-sm md:text-sm text-cafe-dark mt-0.5 text-center sm:text-left">{formatarDataExibicao(dataFim)}</span>
                            {popoverFimAberto && (
                                <div className="absolute top-14 right-0 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 w-[280px] z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-between items-center mb-4">
                                        <button className="font-black text-gray-400 hover:text-cafe-primary p-2 bg-gray-50 rounded-lg transition" onClick={() => { if (mesFimView === 0) { setMesFimView(11); setAnoFimView(anoFimView - 1); } else { setMesFimView(mesFimView - 1); } }}>&lt;</button>
                                        <span className="font-bold text-sm text-gray-800 uppercase tracking-wide">{MESES[mesFimView]} {anoFimView}</span>
                                        <button className="font-black text-gray-400 hover:text-cafe-primary p-2 bg-gray-50 rounded-lg transition" onClick={() => { if (mesFimView === 11) { setMesFimView(0); setAnoFimView(anoFimView + 1); } else { setMesFimView(mesFimView + 1); } }}>&gt;</button>
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-2">
                                        {DIAS_SEMANA.map((d, i) => <div key={`dw-end-${i}`}>{d}</div>)}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center">
                                        {gerarDiasMes(anoFimView, mesFimView).map((dia, idx) => {
                                            if (!dia) return <div key={`empty-end-${idx}`}></div>;
                                            const dataFormatada = `${anoFimView}-${String(mesFimView + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                                            const ativo = dataFim === dataFormatada;
                                            return (
                                                <button key={dia} onClick={() => { setDataFim(dataFormatada); setPopoverFimAberto(false); }} className={`p-2 text-sm rounded-lg font-bold transition active:scale-95 ${ativo ? 'bg-cafe-primary text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}>{dia}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {carregando ? (
                <div className="text-center py-20 font-black text-gray-400 animate-pulse text-lg tracking-widest uppercase">
                    A processar dados financeiros...
                </div>
            ) : (
                <>
                    {/* CARDS DOS KPIS PRINCIPAIS */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 z-10 relative">
                        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <span className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest leading-tight">Faturamento Bruto</span>
                            <span className="text-2xl md:text-3xl font-black text-cafe-dark mt-2 mb-1 truncate">{formatarMoeda(metricas.faturamentoTotal)}</span>
                            <span className="text-[10px] text-green-600 font-bold hidden sm:block">● Entradas totais</span>
                        </div>

                        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between border-l-4 border-l-green-500">
                            <span className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest leading-tight">Lucro Bruto</span>
                            <span className="text-2xl md:text-3xl font-black text-green-600 mt-2 mb-1 truncate">{formatarMoeda(metricas.lucroTotal)}</span>
                            <span className="text-[10px] text-gray-500 font-bold hidden sm:block">Receitas (-) Custos Fichas</span>
                        </div>

                        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between border-l-4 border-l-blue-500">
                            <span className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest leading-tight">Ticket Médio</span>
                            <span className="text-2xl md:text-3xl font-black text-blue-600 mt-2 mb-1 truncate">{formatarMoeda(metricas.ticketMedio)}</span>
                            <span className="text-[10px] text-gray-500 font-bold hidden sm:block">Média gasta por mesa/pedido</span>
                        </div>

                        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between border-l-4 border-l-purple-500">
                            <span className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest leading-tight">Volume Vendas</span>
                            <span className="text-2xl md:text-3xl font-black text-purple-600 mt-2 mb-1 truncate">{metricas.totalVendasCount} <span className="text-sm font-bold text-gray-400">pedidos</span></span>
                            <span className="text-[10px] text-gray-500 font-bold hidden sm:block">Pedidos finalizados no período</span>
                        </div>
                    </div>

                    {/* GRÁFICO DE LINHAS COM FUNDO PRETO ATUALIZADO */}
                    <div className="bg-gray-900 p-4 md:p-6 rounded-2xl shadow-xl border border-gray-800 mt-6 relative z-0">
                        <h3 className="font-black text-gray-300 mb-2 text-xs md:text-sm uppercase tracking-widest border-b border-gray-800 pb-2">Evolução do Faturamento Diário</h3>

                        {pts.length === 0 ? (
                            <p className="text-center text-gray-600 py-16 italic font-bold">Sem vendas registradas neste período.</p>
                        ) : (
                            <div className="w-full relative pb-2 pt-2 md:pt-4">
                                <div className="w-full overflow-x-auto overflow-y-hidden custom-scrollbar relative">
                                    <div className="relative" style={{ height: `${svgHeight}px`, minWidth: `${svgWidth}px` }}>

                                        {tooltip.visivel && tooltip.p && (
                                            <div
                                                className="absolute z-50 bg-white text-gray-800 p-3 md:p-4 rounded-xl shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-full transition-opacity duration-100 min-w-[160px] border border-gray-200"
                                                style={{
                                                    left: `${(tooltip.p.x / svgWidth) * 100}%`,
                                                    top: `calc(${(tooltip.p.y / svgHeight) * 100}% - 25px)`
                                                }}
                                            >
                                                <div className="font-black text-sm text-center border-b border-gray-200 pb-2 mb-3 text-cafe-dark">{tooltip.p.dataCurta}</div>

                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center text-xs text-gray-600 font-bold gap-3">
                                                        <span>Bruto:</span>
                                                        <span className="font-black text-gray-900 ml-3">{formatarMoeda(tooltip.p.valor)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-gray-600 font-bold gap-3">
                                                        <span>Custo:</span>
                                                        <span className="font-black text-red-500 ml-3">{formatarMoeda(tooltip.p.custo)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-gray-600 font-bold bg-green-50 p-1.5 rounded-md border border-green-100 gap-3">
                                                        <span className="text-green-800">Lucro:</span>
                                                        <span className="font-black text-green-700 ml-3">{formatarMoeda(tooltip.p.lucro)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-center text-xs text-gray-500 mt-3 pt-2 border-t border-gray-200 font-bold gap-3">
                                                    <span>Qtd Vendas:</span>
                                                    <span className="font-black text-blue-600 ml-2">{tooltip.p.qtd} un</span>
                                                </div>

                                                <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full border-[8px] border-transparent border-t-white"></div>
                                            </div>
                                        )}

                                        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full absolute inset-0 overflow-visible">
                                            <defs>
                                                <linearGradient id="gradientLinha" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.6} />
                                                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>

                                            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                                const yPos = padYTop + (usableHeight * ratio);
                                                return <line key={idx} x1={padX} y1={yPos} x2={svgWidth - padX} y2={yPos} stroke="#374151" strokeWidth="1" strokeDasharray="4 4" />
                                            })}

                                            {pts.length > 1 && <path d={pathArea} fill="url(#gradientLinha)" />}
                                            {pts.length > 1 && <path d={pathLinha} fill="none" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
                                            {pts.length === 1 && <circle cx={pts[0].x} cy={pts[0].y} r="6" fill="#38bdf8" />}

                                            {pts.map((p, i) => (
                                                <g
                                                    key={i}
                                                    onMouseEnter={() => setTooltip({ visivel: true, p })}
                                                    onMouseLeave={() => setTooltip({ visivel: false, p: null })}
                                                    onClick={() => setTooltip(prev => ({ visivel: !prev.visivel, p }))}
                                                    className="cursor-pointer md:cursor-crosshair outline-none"
                                                >
                                                    {tooltip.visivel && tooltip.p?.dataCurta === p.dataCurta && (
                                                        <line x1={p.x} y1={padYTop} x2={p.x} y2={padYBot} stroke="#6b7280" strokeWidth="1.5" strokeDasharray="3 3" />
                                                    )}

                                                    <text x={p.x} y={padYBot + 25} textAnchor="middle" fill="#9ca3af" fontSize="11" fontWeight="bold">{p.dataCurta}</text>

                                                    <circle cx={p.x} cy={p.y} r="25" fill="transparent" />

                                                    <circle
                                                        cx={p.x}
                                                        cy={p.y}
                                                        r={tooltip.visivel && tooltip.p?.dataCurta === p.dataCurta ? "7" : "4"}
                                                        className="fill-gray-900 stroke-[#38bdf8] transition-all"
                                                        strokeWidth="3"
                                                    />
                                                </g>
                                            ))}
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* GRIDS INFERIORES */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
                            <h3 className="font-black text-cafe-dark mb-4 border-b border-gray-100 pb-2 text-sm uppercase tracking-wider">Detalhamento de Entradas</h3>
                            <div className="space-y-3 flex-1 flex flex-col">
                                <div className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl"><span className="text-xs md:text-sm text-gray-600 font-bold uppercase tracking-wide">📱 PIX</span><span className="font-black text-gray-800 text-sm md:text-base">{formatarMoeda(metricas.financeiro.totalPix)}</span></div>
                                <div className="flex justify-between items-center p-2.5 bg-green-50/50 rounded-xl border border-green-50"><span className="text-xs md:text-sm text-green-700 font-bold uppercase tracking-wide">💵 Dinheiro</span><span className="font-black text-green-700 text-sm md:text-base">{formatarMoeda(metricas.financeiro.totalDinheiro)}</span></div>
                                <div className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl"><span className="text-xs md:text-sm text-gray-600 font-bold uppercase tracking-wide">💳 C. Crédito</span><span className="font-black text-gray-800 text-sm md:text-base">{formatarMoeda(metricas.financeiro.totalCredito)}</span></div>
                                <div className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl"><span className="text-xs md:text-sm text-gray-600 font-bold uppercase tracking-wide">💳 C. Débito</span><span className="font-black text-gray-800 text-sm md:text-base">{formatarMoeda(metricas.financeiro.totalDebito)}</span></div>

                                <div className="mt-auto pt-4 space-y-3 border-t-2 border-dashed border-gray-200">
                                    <div className="flex justify-between items-center bg-blue-50 p-3 rounded-xl border border-blue-100">
                                        <span className="text-xs text-blue-800 font-black uppercase tracking-wider">Bruto Total</span>
                                        <span className="font-black text-lg text-blue-700">{formatarMoeda(metricas.faturamentoTotal)}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-red-50 p-3 rounded-xl border border-red-100">
                                        <span className="text-xs text-red-800 font-black uppercase tracking-wider">Custo Produtos</span>
                                        <span className="font-black text-lg text-red-600">-{formatarMoeda(metricas.custoTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
                            <h3 className="font-black text-cafe-dark mb-4 border-b border-gray-100 pb-2 text-sm uppercase tracking-wider">Top 5 Produtos (Curva ABC)</h3>

                            {/* VIEW MOBILE: Lista de Cards */}
                            <div className="md:hidden space-y-3">
                                {metricas.produtosMaisVendidos.map((prod, idx) => (
                                    <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-cafe-primary"></div>
                                        <div className="flex justify-between items-start">
                                            <span className="font-black text-gray-800 text-base leading-tight pr-4">{idx + 1}. {prod.nome}</span>
                                            <span className="bg-white border border-gray-200 text-cafe-dark font-black px-2 py-1 rounded-md text-xs whitespace-nowrap shadow-sm">{prod.quantidade} un</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div className="bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm">
                                                <span className="block text-[10px] text-gray-400 uppercase font-black tracking-widest mb-1">Custo</span>
                                                <span className="font-bold text-red-500">{formatarMoeda(prod.custo)}</span>
                                            </div>
                                            <div className="bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm">
                                                <span className="block text-[10px] text-gray-400 uppercase font-black tracking-widest mb-1">Faturou</span>
                                                <span className="font-bold text-gray-800">{formatarMoeda(prod.faturamento)}</span>
                                            </div>
                                        </div>
                                        <div className="bg-green-100/50 p-3 rounded-lg border border-green-200 flex justify-between items-center mt-1">
                                            <span className="text-[10px] text-green-800 uppercase font-black tracking-widest">Lucro Gerado</span>
                                            <span className="font-black text-green-700 text-lg">{formatarMoeda(prod.lucro)}</span>
                                        </div>
                                    </div>
                                ))}
                                {metricas.produtosMaisVendidos.length === 0 && (
                                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500 font-medium text-sm">
                                        Nenhuma venda registada no período.
                                    </div>
                                )}
                            </div>

                            {/* VIEW DESKTOP: Tabela */}
                            <div className="hidden md:block overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="text-gray-400 font-black text-xs uppercase tracking-wider border-b border-gray-200 bg-gray-50">
                                            <th className="p-3">Produto</th>
                                            <th className="p-3 text-center">Volume</th>
                                            <th className="p-3 text-right">Custo</th>
                                            <th className="p-3 text-right">Faturamento</th>
                                            <th className="p-3 text-right">Lucro</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metricas.produtosMaisVendidos.map((prod, idx) => (
                                            <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                                                <td className="p-3 font-bold text-gray-800 text-base">{idx + 1}. {prod.nome}</td>
                                                <td className="p-3 text-center font-black text-gray-600 bg-gray-50/50">{prod.quantidade} <span className="text-xs font-bold text-gray-400">un</span></td>
                                                <td className="p-3 text-right text-red-500 font-semibold">{formatarMoeda(prod.custo)}</td>
                                                <td className="p-3 text-right font-black text-gray-700">{formatarMoeda(prod.faturamento)}</td>
                                                <td className="p-3 text-right font-black text-green-600 text-base">{formatarMoeda(prod.lucro)}</td>
                                            </tr>
                                        ))}
                                        {metricas.produtosMaisVendidos.length === 0 && (
                                            <tr><td colSpan={5} className="text-center py-10 text-gray-400 italic font-medium">Nenhuma venda registada.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
