import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

type ProdutoVendido = { nome: string; quantidade: number; faturamento: number; custo: number; lucro: number };

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function DashboardRendimentos() {
    const hojeDate = new Date();
    const hojeStr = hojeDate.toISOString().split('T')[0];
    const primeiroDiaDoMesStr = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1).toISOString().split('T')[0];

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

    const carregarDadosDashboard = async () => {
        setCarregando(true);
        try {
            const dataInicioFiltro = `${dataInicio}T00:00:00.000Z`;
            const dataFimFiltro = `${dataFim}T23:59:59.999Z`;

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
                            produtos (
                                nome,
                                preco_custo
                            )
                        )
                    `)
                    .gte('data_venda', dataInicioFiltro)
                    .lte('data_venda', dataFimFiltro)
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
    };

    useEffect(() => {
        carregarDadosDashboard();
    }, [dataInicio, dataFim]);

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
        const hojeString = dataAtual.toISOString().split('T')[0];

        if (tipo === 'hoje') {
            setDataInicio(hojeString);
            setDataFim(hojeString);
        } else if (tipo === '7dias') {
            const seteDiasAtras = new Date();
            seteDiasAtras.setDate(dataAtual.getDate() - 7);
            setDataInicio(seteDiasAtras.toISOString().split('T')[0]);
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
                const precoCustoItem = (item.produtos?.preco_custo || 0) * item.quantidade;

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
    }, [vendas, dataInicio, dataFim]);

    const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

    // ---------- CÁLCULOS DO GRÁFICO SVG ----------
    const numPontos = Math.max(metricas.graficoDados.length, 1);
    const svgWidth = Math.max(800, numPontos * 100);
    const svgHeight = 320;

    const padX = 70;
    const padYTop = 100;
    const padYBot = 270;

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
        <div className="max-w-6xl mx-auto p-6 my-4 space-y-6 relative">

            {/* Cabeçalho */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 z-30 relative">
                <div>
                    <h2 className="text-2xl font-black text-cafe-dark tracking-tight">Painel de Rendimentos</h2>
                    <p className="text-sm text-gray-400 font-medium mt-0.5">Métricas de faturação, margem e performance do salão</p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-inner h-fit">
                        <button onClick={() => definirPeriodoFast('hoje')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${dataInicio === hojeStr && dataFim === hojeStr ? 'bg-white text-cafe-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Hoje</button>
                        <button onClick={() => definirPeriodoFast('7dias')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${dataInicio === new Date(new Date().setDate(hojeDate.getDate() - 7)).toISOString().split('T')[0] ? 'bg-white text-cafe-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>7 Dias</button>
                        <button onClick={() => definirPeriodoFast('mes')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${dataInicio === primeiroDiaDoMesStr && dataFim === hojeStr ? 'bg-white text-cafe-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Este Mês</button>
                    </div>

                    <div className="flex items-center bg-white rounded-xl border border-gray-200 shadow-sm relative">
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
                                        {DIAS_SEMANA.map(d => <div key={d}>{d}</div>)}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center">
                                        {gerarDiasMes(anoInicioView, mesInicioView).map((dia, idx) => {
                                            if (!dia) return <div key={`empty-${idx}`}></div>;
                                            const dataFormatada = `${anoInicioView}-${String(mesInicioView + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                                            const ativo = dataInicio === dataFormatada;
                                            return (
                                                <button key={dia} onClick={() => { setDataInicio(dataFormatada); setPopoverInicioAberto(false); }} className={`p-1 text-xs rounded-md font-semibold transition ${ativo ? 'bg-cafe-primary text-white font-bold' : 'text-gray-600 hover:bg-gray-100'}`}>{dia}</button>
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
                                        {DIAS_SEMANA.map(d => <div key={d}>{d}</div>)}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1 text-center">
                                        {gerarDiasMes(anoFimView, mesFimView).map((dia, idx) => {
                                            if (!dia) return <div key={`empty-${idx}`}></div>;
                                            const dataFormatada = `${anoFimView}-${String(mesFimView + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                                            const ativo = dataFim === dataFormatada;
                                            return (
                                                <button key={dia} onClick={() => { setDataFim(dataFormatada); setPopoverFimAberto(false); }} className={`p-1 text-xs rounded-md font-semibold transition ${ativo ? 'bg-cafe-primary text-white font-bold' : 'text-gray-600 hover:bg-gray-100'}`}>{dia}</button>
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
                <div className="text-center py-20 font-bold text-cafe-primary animate-pulse text-lg">A processar relatórios financeiros...</div>
            ) : (
                <>
                    {/* CARDS DOS KPIS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 z-10 relative">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Faturamento Total</span>
                            <span className="text-2xl font-black text-cafe-dark mt-2">{formatarMoeda(metricas.faturamentoTotal)}</span>
                            <span className="text-[10px] text-green-600 font-bold mt-1">● Total bruto recebido</span>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between border-l-4 border-l-green-500">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Lucro Estimado</span>
                            <span className="text-2xl font-black text-green-700 mt-2">{formatarMoeda(metricas.lucroTotal)}</span>
                            <span className="text-[10px] text-gray-500 font-bold mt-1">Faturamento (-) custo</span>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ticket Médio</span>
                            <span className="text-2xl font-black text-blue-600 mt-2">{formatarMoeda(metricas.ticketMedio)}</span>
                            <span className="text-[10px] text-gray-500 font-bold mt-1">Média gasta por pedido</span>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Volume de Vendas</span>
                            <span className="text-2xl font-black text-purple-600 mt-2">{metricas.totalVendasCount}</span>
                            <span className="text-[10px] text-gray-500 font-bold mt-1">Pedidos finalizados no período</span>
                        </div>
                    </div>

                    {/* GRÁFICO DE LINHAS COM FUNDO PRETO ATUALIZADO */}
                    <div className="bg-gray-950 p-6 rounded-xl shadow-sm border border-gray-800 mt-6 relative z-0">
                        <h3 className="font-bold text-gray-400 mb-2 text-sm uppercase tracking-wide">Evolução do Faturamento</h3>

                        {pts.length === 0 ? (
                            <p className="text-center text-gray-500 py-10 italic">Sem vendas registradas neste período.</p>
                        ) : (
                            <div className="w-full relative pb-4 pt-4">
                                <div className="w-full overflow-x-auto custom-scrollbar relative">
                                    <div className="relative" style={{ height: `${svgHeight}px`, minWidth: `${svgWidth}px` }}>

                                        {tooltip.visivel && tooltip.p && (
                                            <div
                                                className="absolute z-50 bg-gray-900 text-white p-3 rounded-lg shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full transition-opacity duration-75 min-w-[140px]"
                                                style={{
                                                    left: `${(tooltip.p.x / svgWidth) * 100}%`,
                                                    top: `calc(${(tooltip.p.y / svgHeight) * 100}% - 15px)`
                                                }}
                                            >
                                                <div className="font-black text-xs text-center border-b border-gray-700 pb-1 mb-2">{tooltip.p.dataCurta}</div>

                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center text-xs text-gray-300">
                                                        <span>Bruto:</span>
                                                        <span className="font-bold text-gray-100 ml-2">{formatarMoeda(tooltip.p.valor)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-gray-300">
                                                        <span>Custo:</span>
                                                        <span className="font-bold text-red-400 ml-2">{formatarMoeda(tooltip.p.custo)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-gray-300">
                                                        <span>Lucro:</span>
                                                        <span className="font-bold text-green-400 ml-2">{formatarMoeda(tooltip.p.lucro)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-center text-xs text-gray-300 mt-2 pt-2 border-t border-gray-700">
                                                    <span>Qtd Vendas:</span>
                                                    <span className="font-bold text-blue-300 ml-2">{tooltip.p.qtd}</span>
                                                </div>

                                                <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full border-[6px] border-transparent border-t-gray-900"></div>
                                            </div>
                                        )}

                                        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full absolute inset-0 overflow-visible">
                                            <defs>
                                                <linearGradient id="gradientLinha" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                                                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>

                                            {/* Ajustado as linhas de grade para um cinza escuro sutil sobre o fundo preto */}
                                            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                                const yPos = padYTop + (usableHeight * ratio);
                                                return <line key={idx} x1={padX} y1={yPos} x2={svgWidth - padX} y2={yPos} stroke="#1f2937" strokeWidth="1" strokeDasharray="4 4" />
                                            })}

                                            {pts.length > 1 && <path d={pathArea} fill="url(#gradientLinha)" />}
                                            {pts.length > 1 && <path d={pathLinha} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
                                            {pts.length === 1 && <circle cx={pts[0].x} cy={pts[0].y} r="5" fill="#0ea5e9" />}

                                            {pts.map((p, i) => (
                                                <g
                                                    key={i}
                                                    onMouseEnter={() => setTooltip({ visivel: true, p })}
                                                    onMouseLeave={() => setTooltip({ visivel: false, p: null })}
                                                    className="cursor-crosshair outline-none"
                                                >
                                                    {tooltip.visivel && tooltip.p?.dataCurta === p.dataCurta && (
                                                        <line x1={p.x} y1={padYTop} x2={p.x} y2={padYBot} stroke="#4b5563" strokeWidth="1" strokeDasharray="2 2" />
                                                    )}

                                                    <text x={p.x} y={padYBot + 25} textAnchor="middle" fill="#9ca3af" fontSize="10" fontWeight="bold">{p.dataCurta}</text>

                                                    <circle cx={p.x} cy={p.y} r="30" fill="transparent" />

                                                    <circle
                                                        cx={p.x}
                                                        cy={p.y}
                                                        r={tooltip.visivel && tooltip.p?.dataCurta === p.dataCurta ? "6" : "4"}
                                                        className="fill-white stroke-[#0ea5e9] transition-all"
                                                        strokeWidth="2"
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

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-bold text-gray-700 mb-4 border-b pb-2 text-sm uppercase tracking-wide">Recebimentos</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center"><span className="text-sm text-gray-600 font-semibold">📱 PIX</span><span className="font-bold text-gray-800">{formatarMoeda(metricas.financeiro.totalPix)}</span></div>
                                <div className="flex justify-between items-center"><span className="text-sm text-gray-600 font-semibold">💵 Dinheiro</span><span className="font-bold text-gray-800">{formatarMoeda(metricas.financeiro.totalDinheiro)}</span></div>
                                <div className="flex justify-between items-center"><span className="text-sm text-gray-600 font-semibold">💳 Cartão de Crédito</span><span className="font-bold text-gray-800">{formatarMoeda(metricas.financeiro.totalCredito)}</span></div>
                                <div className="flex justify-between items-center"><span className="text-sm text-gray-600 font-semibold">💳 Cartão de Débito</span><span className="font-bold text-gray-800">{formatarMoeda(metricas.financeiro.totalDebito)}</span></div>

                                <div className="pt-3 mt-3 border-t border-gray-100 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-700 font-bold">💰 Total Recebido</span>
                                        <span className="font-black text-green-600">{formatarMoeda(metricas.faturamentoTotal)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-700 font-bold">📉 Total Gasto (Custo)</span>
                                        <span className="font-black text-red-500">{formatarMoeda(metricas.custoTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
                            <h3 className="font-bold text-gray-700 mb-4 border-b pb-2 text-sm uppercase tracking-wide">Top 5 Produtos Mais Vendidos</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="text-gray-400 font-semibold border-b">
                                            <th className="pb-2">PRODUTO</th>
                                            <th className="pb-2 text-center">QTD</th>
                                            <th className="pb-2 text-right">CUSTO</th>
                                            <th className="pb-2 text-right">VALOR BRUTO</th>
                                            <th className="pb-2 text-right">LUCRO</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metricas.produtosMaisVendidos.map((prod, idx) => (
                                            <tr key={idx} className="border-b last:border-0 hover:bg-gray-50 transition">
                                                <td className="py-3 font-semibold text-gray-800">{idx + 1}. {prod.nome}</td>
                                                <td className="py-3 text-center font-bold text-gray-600">{prod.quantidade} un</td>
                                                <td className="py-3 text-right text-red-500 font-medium">{formatarMoeda(prod.custo)}</td>
                                                <td className="py-3 text-right font-bold text-gray-700">{formatarMoeda(prod.faturamento)}</td>
                                                <td className="py-3 text-right font-black text-green-600">{formatarMoeda(prod.lucro)}</td>
                                            </tr>
                                        ))}
                                        {metricas.produtosMaisVendidos.length === 0 && (
                                            <tr><td colSpan={5} className="text-center py-6 text-gray-400 italic">Nenhuma venda registada.</td></tr>
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