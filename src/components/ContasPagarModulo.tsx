import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

type Conta = {
    id: string;
    descricao: string;
    fornecedor_id: string | null;
    valor: number;
    data_vencimento: string;
    data_pagamento: string | null;
    status: string;
    metodo_pagamento?: string;
    fornecedores: { nome: string } | null;
};

type Fornecedor = { id: string; nome: string };

export default function ContasPagarModulo() {
    const [contas, setContas] = useState<Conta[]>([]);
    const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
    const [carregando, setCarregando] = useState(true);

    // Estados do Caixa e Movimentações do Turno Atual
    const [caixaAtivo, setCaixaAtivo] = useState<any | null>(null);
    // const [dinheiroEmCaixa, setDinheiroEmCaixa] = useState<number>(0);
    const [vendasHoje, setVendasHoje] = useState<any[]>([]);
    const [movimentacoesCaixa, setMovimentacoesCaixa] = useState<any[]>([]);

    // Estado da Conta Bancária (Digital)
    const [saldoDigital, setSaldoDigital] = useState<number>(0);
    const [modalAjusteBanco, setModalAjusteBanco] = useState(false);
    const [novoSaldoBanco, setNovoSaldoBanco] = useState<number | ''>('');

    const [metodoPagamentoBaixa, setMetodoPagamentoBaixa] = useState('PIX');
    const [modalMovimento, setModalMovimento] = useState<'suprimento' | 'sangria' | null>(null);
    const [valorMovimento, setValorMovimento] = useState<number | ''>('');
    const [motivoMovimento, setMotivoMovimento] = useState('');

    // ESTADOS DO HISTÓRICO E RELATÓRIO DE CAIXAS
    const [modalHistoricoOpen, setModalHistoricoOpen] = useState(false);
    const [listaCaixas, setListaCaixas] = useState<any[]>([]);
    const [caixaSelecionado, setCaixaSelecionado] = useState<any | null>(null);
    const [detalhesRelatorio, setDetalhesRelatorio] = useState<any | null>(null);
    const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);

    // Estados do Formulário Manual de Contas
    const [descricao, setDescricao] = useState('');
    const [fornecedorId, setFornecedorId] = useState('');
    const [valor, setValor] = useState<number | ''>('');
    const [dataVencimento, setDataVencimento] = useState('');

    // Estados para Recorrência
    const [isRecorrente, setIsRecorrente] = useState(false);
    const [diaVencimentoRecorrente, setDiaVencimentoRecorrente] = useState<number | ''>('');
    const [numMeses, setNumMeses] = useState<number | ''>(2);

    const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });
    const [contaParaApagar, setContaParaApagar] = useState<Conta | null>(null);
    const [contaParaPagar, setContaParaPagar] = useState<Conta | null>(null);

    const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
        setFeedback({ msg, tipo });
        setTimeout(() => setFeedback({ msg: '', tipo: null }), 4000);
    };

    const carregarDados = async () => {
        setCarregando(true);

        const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome');
        if (fornData) setFornecedores(fornData);

        const { data: contasData } = await supabase
            .from('contas_pagar')
            .select('*, fornecedores(nome)')
            .order('data_vencimento', { ascending: true });

        if (contasData) setContas(contasData as unknown as Conta[]);

        const { data: bancoData } = await supabase.from('conta_bancaria').select('saldo').eq('id', 1).single();
        if (bancoData) setSaldoDigital(Number(bancoData.saldo));

        const { data: caixaData } = await supabase
            .from('controle_caixa')
            .select('*')
            .eq('status', 'aberto')
            .order('data_abertura', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (caixaData) {
            setCaixaAtivo(caixaData);

            const { data: vendasData } = await supabase
                .from('vendas')
                .select('total, valor_dinheiro, valor_pix, valor_cartao_credito, valor_cartao_debito, metodo_pagamento')
                .gte('data_venda', caixaData.data_abertura);
            setVendasHoje(vendasData || []);

            const { data: movsData } = await supabase
                .from('movimentacoes_caixa')
                .select('*')
                .eq('caixa_id', caixaData.id);
            setMovimentacoesCaixa(movsData || []);

        } else {
            setCaixaAtivo(null);
            setVendasHoje([]);
            setMovimentacoesCaixa([]);
        }

        setCarregando(false);
    };

    useEffect(() => { carregarDados(); }, []);

    const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
    const formatarData = (dataIso: string) => {
        // Se dataIso já for 'YYYY-MM-DD', não crie um objeto Date, apenas manipule a string
        if (!dataIso) return '-';
        const [ano, mes, dia] = dataIso.split('-');
        return `${dia}/${mes}/${ano}`;
    };
    const formatarDataHora = (dataIso: string) => new Date(dataIso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    // LÓGICA INFALÍVEL DE SOMA DE VENDAS
    const totaisVendas = useMemo(() => {
        let pix = 0, din = 0, cred = 0, deb = 0, total = 0;

        vendasHoje.forEach(v => {
            const vTotal = Number(v.total) || 0;
            total += vTotal;

            const vPix = Number(v.valor_pix) || 0;
            const vDin = Number(v.valor_dinheiro) || 0;
            const vCred = Number(v.valor_cartao_credito) || 0;
            const vDeb = Number(v.valor_cartao_debito) || 0;

            const somaDividida = vPix + vDin + vCred + vDeb;

            if (somaDividida > 0) {
                pix += vPix;
                din += vDin;
                cred += vCred;
                deb += vDeb;
            } else {
                const metodo = String(v.metodo_pagamento || '').trim().toLowerCase();

                if (metodo.includes('pix')) {
                    pix += vTotal;
                } else if (metodo.includes('dinheiro')) {
                    din += vTotal;
                } else if (metodo.includes('crédito') || metodo.includes('credito')) {
                    cred += vTotal;
                } else if (metodo.includes('débito') || metodo.includes('debito')) {
                    deb += vTotal;
                } else {
                    din += vTotal;
                }
            }
        });
        return { pix, din, cred, deb, total };
    }, [vendasHoje]);

    // CÁLCULO DINÂMICO E EXATO DO CAIXA FÍSICO
    const dinheiroEmCaixa = useMemo(() => {
        if (!caixaAtivo) return 0;
        const suprimentos = movimentacoesCaixa.filter(m => m.tipo === 'suprimento').reduce((acc, m) => acc + Number(m.valor), 0);
        const sangriasEDespesas = movimentacoesCaixa.filter(m => m.tipo === 'sangria' || m.tipo === 'despesa').reduce((acc, m) => acc + Number(m.valor), 0);
        return caixaAtivo.fundo_inicial + totaisVendas.din + suprimentos - sangriasEDespesas;
    }, [caixaAtivo, totaisVendas.din, movimentacoesCaixa]);

    const accountsData = useMemo(() => {
        const contasPendentes = contas.filter(c => c.status === 'Pendente');

        const contasPagas = contas
            .filter(c => c.status === 'Pago')
            .sort((a, b) => {
                // Compara as strings de data diretamente (YYYY-MM-DD)
                return b.data_pagamento!.localeCompare(a.data_pagamento!);
            });

        const totalPendente = contasPendentes.reduce((acc, c) => acc + c.valor, 0);

        // Data de hoje no formato YYYY-MM-DD (sem considerar fuso horário)
        const hojeStr = new Date().toISOString().split('T')[0];

        // Agora a comparação é de string com string, sem erro de fuso horário
        const contasPagasHoje = contasPagas.filter(c => c.data_pagamento === hojeStr);
        const totalPagasHoje = contasPagasHoje.reduce((acc, c) => acc + c.valor, 0);

        let balancoGeralTurno = 0;
        if (caixaAtivo) {
            balancoGeralTurno = totaisVendas.total - totalPagasHoje;
        }

        return { contasPendentes, contasPagas, totalPendente, totalPagasHoje, balancoGeralTurno };
    }, [contas, totaisVendas.total, caixaAtivo]);

    const abrirHistoricoCaixas = async () => {
        setModalHistoricoOpen(true);
        setCaixaSelecionado(null);
        setDetalhesRelatorio(null);
        const { data } = await supabase.from('controle_caixa').select('*').order('data_abertura', { ascending: false });
        if (data) setListaCaixas(data);
    };

    const carregarRelatorioTurno = async (caixa: any) => {
        setCarregandoRelatorio(true);
        setCaixaSelecionado(caixa);
        try {
            const dataFimFiltro = caixa.data_fechamento || new Date().toISOString();

            const { data: vendas } = await supabase.from('vendas').select('*').gte('data_venda', caixa.data_abertura).lte('data_venda', dataFimFiltro);
            const { data: movs } = await supabase.from('movimentacoes_caixa').select('*').eq('caixa_id', caixa.id);

            const vHoje = vendas || [];
            const mHoje = movs || [];

            const vTotal = vHoje.reduce((acc, v) => acc + Number(v.total), 0);

            let vDinheiro = 0, vPix = 0, vCredito = 0, vDebito = 0;
            vHoje.forEach(v => {
                const t = Number(v.total) || 0;
                const p = Number(v.valor_pix) || 0;
                const d = Number(v.valor_dinheiro) || 0;
                const c = Number(v.valor_cartao_credito) || 0;
                const de = Number(v.valor_cartao_debito) || 0;
                if (p + d + c + de > 0) {
                    vPix += p; vDinheiro += d; vCredito += c; vDebito += de;
                } else {
                    const m = String(v.metodo_pagamento || '').trim().toLowerCase();
                    if (m.includes('pix')) vPix += t;
                    else if (m.includes('dinheiro')) vDinheiro += t;
                    else if (m.includes('crédito') || m.includes('credito')) vCredito += t;
                    else if (m.includes('débito') || m.includes('debito')) vDebito += t;
                    else vDinheiro += t;
                }
            });

            const suprimentos = mHoje.filter(m => m.tipo === 'suprimento').reduce((acc, m) => acc + Number(m.valor), 0);
            const sangriasEDespesas = mHoje.filter(m => m.tipo === 'sangria' || m.tipo === 'despesa').reduce((acc, m) => acc + Number(m.valor), 0);

            const dinheiroEsperado = caixa.fundo_inicial + vDinheiro + suprimentos - sangriasEDespesas;
            const valorFechamentoReal = caixa.valor_informado_fechamento || 0;
            const diferenca = caixa.status === 'fechado' ? (valorFechamentoReal - dinheiroEsperado) : 0;

            setDetalhesRelatorio({
                qtdVendas: vHoje.length,
                faturamentoTotal: vTotal,
                totalDinheiro: vDinheiro,
                totalPix: vPix,
                totalCredito: vCredito,
                totalDebito: vDebito,
                suprimentos,
                sangrias: sangriasEDespesas,
                dinheiroEsperado,
                valorFechamentoReal,
                diferenca
            });
        } catch (err) {
            console.error(err);
        } finally {
            setCarregandoRelatorio(false);
        }
    };

    const handleImprimirRelatorioTurno = () => {
        if (!caixaSelecionado || !detalhesRelatorio) return;

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
              <title>Fechamento de Caixa</title>
              <style>
                body { font-family: 'Courier New', monospace; padding: 10px; width: 260px; font-size: 12px; margin: 0 auto; color: #000; }
                .text-center { text-align: center; }
                .font-bold { font-weight: bold; }
                .line { border-bottom: 1px dashed #000; margin: 8px 0; }
                .row { display: flex; justify-content: space-between; margin: 3px 0; }
                .title { font-size: 14px; margin-bottom: 2px; }
              </style>
            </head>
            <body>
              <div class="text-center font-bold title">AUDITORIA DE TURNO</div>
              <div class="text-center font-bold">==========================</div>
              <div class="row"><span>Status:</span> <span class="font-bold">${caixaSelecionado.status.toUpperCase()}</span></div>
              <div class="row"><span>Abertura:</span> <span>${formatarDataHora(caixaSelecionado.data_abertura)}</span></div>
              ${caixaSelecionado.data_fechamento ? `<div class="row"><span>Fechamento:</span> <span>${formatarDataHora(caixaSelecionado.data_fechamento)}</span></div>` : ''}
              <div class="line"></div>

              <div class="font-bold text-center" style="margin-bottom:4px;">GAVETA DE DINHEIRO</div>
              <div class="row"><span>(+) Fundo Inicial:</span> <span>${formatarMoeda(caixaSelecionado.fundo_inicial)}</span></div>
              <div class="row"><span>(+) Vendas Dinheiro:</span> <span>${formatarMoeda(detalhesRelatorio.totalDinheiro)}</span></div>
              <div class="row"><span>(+) Suprimentos:</span> <span>${formatarMoeda(detalhesRelatorio.suprimentos)}</span></div>
              <div class="row"><span>(-) Sangrias/Contas:</span> <span>-${formatarMoeda(detalhesRelatorio.sangrias)}</span></div>
              <div class="row font-bold"><span>(=) Caixa Esperado:</span> <span>${formatarMoeda(detalhesRelatorio.dinheiroEsperado)}</span></div>
              
              ${caixaSelecionado.status === 'fechado' ? `
                <div class="line"></div>
                <div class="font-bold text-center" style="margin-bottom:4px;">CONFERÊNCIA DE FECHAMENTO</div>
                <div class="row"><span>📢 Fechou com:</span> <span>${formatarMoeda(detalhesRelatorio.valorFechamentoReal)}</span></div>
                <div class="row font-bold"><span>⚠️ Diferença:</span> <span>${detalhesRelatorio.diferenca === 0 ? 'R$ 0,00 (OK)' : formatarMoeda(detalhesRelatorio.diferenca)}</span></div>
              ` : ''}
              <div class="line"></div>

              <div class="font-bold text-center" style="margin-bottom:4px;">FATURAMENTO DIGITAL</div>
              <div class="row"><span>📱 Total PIX:</span> <span>${formatarMoeda(detalhesRelatorio.totalPix)}</span></div>
              <div class="row"><span>💳 Cartão Crédito:</span> <span>${formatarMoeda(detalhesRelatorio.totalCredito)}</span></div>
              <div class="row"><span>💳 Cartão Débito:</span> <span>${formatarMoeda(detalhesRelatorio.totalDebito)}</span></div>
              <div class="line"></div>

              <div class="row"><span>Qtd Vendas:</span> <span>${detalhesRelatorio.qtdVendas}</span></div>
              <div class="row font-bold" style="font-size:13px; margin-top:4px;"><span>FATURAMENTO BRUTO:</span> <span>${formatarMoeda(detalhesRelatorio.faturamentoTotal)}</span></div>
              <div class="text-center" style="margin-top:35px;">------------------------</div>
              <div class="text-center">Assinatura do Conferente</div>
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

    const lancarMovimentoCaixa = async () => {
        if (!caixaAtivo) return mostrarMensagem('Nenhum caixa aberto para realizar movimentações.', 'erro');
        if (!valorMovimento || !motivoMovimento.trim()) return mostrarMensagem('Preencha o valor e o motivo.', 'aviso');

        try {
            const { error } = await supabase.from('movimentacoes_caixa').insert([{
                caixa_id: caixaAtivo.id,
                tipo: modalMovimento,
                valor: Number(valorMovimento),
                descricao: motivoMovimento.trim()
            }]);

            if (error) throw error;

            mostrarMensagem(`${modalMovimento === 'suprimento' ? 'Suprimento' : 'Sangria'} lançado com sucesso!`, 'sucesso');
            setModalMovimento(null);
            setValorMovimento('');
            setMotivoMovimento('');
            carregarDados();
        } catch (e) {
            mostrarMensagem('Erro ao registrar movimentação no caixa.', 'erro');
        }
    };

    const salvarAjusteBanco = async () => {
        if (novoSaldoBanco === '') return;
        try {
            await supabase.from('conta_bancaria').update({ saldo: Number(novoSaldoBanco) }).eq('id', 1);
            setSaldoDigital(Number(novoSaldoBanco));
            setModalAjusteBanco(false);
            setNovoSaldoBanco('');
            mostrarMensagem('Saldo bancário ajustado com sucesso!', 'sucesso');
        } catch (error) {
            mostrarMensagem('Erro ao ajustar saldo do banco.', 'erro');
        }
    };

    const lancarContaManual = async () => {
        if (!descricao || !valor) return mostrarMensagem('Preencha a descrição e o valor.', 'aviso');
        if (!isRecorrente && !dataVencimento) return mostrarMensagem('Selecione a data de vencimento.', 'aviso');
        if (isRecorrente && !diaVencimentoRecorrente) return mostrarMensagem('Informe o dia de vencimento mensal.', 'aviso');

        try {
            const payloads = [];
            const loops = isRecorrente ? (Number(numMeses) || 1) : 1;
            const hoje = new Date();

            if (!isRecorrente) {
                payloads.push({
                    descricao,
                    fornecedor_id: fornecedorId || null,
                    valor: Number(valor),
                    data_vencimento: dataVencimento,
                    status: 'Pendente'
                });
            } else {
                const diaEscolhido = Number(diaVencimentoRecorrente);
                const diaAtual = hoje.getDate();
                const offsetMesInicial = diaAtual > diaEscolhido ? 1 : 0;

                for (let i = 0; i < loops; i++) {
                    const alvoDate = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMesInicial + i, diaEscolhido);
                    const anoStr = alvoDate.getFullYear();
                    const mesStr = String(alvoDate.getMonth() + 1).padStart(2, '0');
                    const diaStr = String(alvoDate.getDate()).padStart(2, '0');

                    payloads.push({
                        descricao: `${descricao} (${i + 1}/${loops})`,
                        fornecedor_id: fornecedorId || null,
                        valor: Number(valor),
                        data_vencimento: `${anoStr}-${mesStr}-${diaStr}`,
                        status: 'Pendente'
                    });
                }
            }

            const { error } = await supabase.from('contas_pagar').insert(payloads);
            if (error) throw error;

            mostrarMensagem(isRecorrente ? `${loops} mensalidades geradas!` : 'Conta lançada!', 'sucesso');
            setDescricao(''); setValor(''); setDataVencimento(''); setFornecedorId('');
            setDiaVencimentoRecorrente(''); setIsRecorrente(false);
            carregarDados();
        } catch (error) { mostrarMensagem('Erro ao processar lançamento.', 'erro'); }
    };

    const confirmarPagamento = async () => {
        if (!contaParaPagar) return;

        if (metodoPagamentoBaixa === 'Dinheiro' && !caixaAtivo) {
            return mostrarMensagem('Não é possível pagar em dinheiro com o caixa fechado.', 'erro');
        }

        try {
            const dataHoje = new Date().toISOString().split('T')[0];

            if (metodoPagamentoBaixa === 'Dinheiro' && caixaAtivo) {
                await supabase.from('movimentacoes_caixa').insert([{
                    caixa_id: caixaAtivo.id,
                    tipo: 'despesa',
                    valor: contaParaPagar.valor,
                    descricao: `Pago: ${contaParaPagar.descricao}`
                }]);
            }

            if (metodoPagamentoBaixa === 'PIX' || metodoPagamentoBaixa === 'Cartão de Débito' || metodoPagamentoBaixa === 'Transferência') {
                const saldoAtualizado = saldoDigital - contaParaPagar.valor;
                await supabase.from('conta_bancaria').update({ saldo: saldoAtualizado }).eq('id', 1);
            }

            await supabase.from('contas_pagar').update({
                status: 'Pago',
                data_pagamento: dataHoje,
                metodo_pagamento: metodoPagamentoBaixa
            }).eq('id', contaParaPagar.id);

            mostrarMensagem('Conta marcada como PAGA!', 'sucesso');
            carregarDados();
        } catch (error) { mostrarMensagem('Erro ao pagar conta.', 'erro'); }
        finally { setContaParaPagar(null); setMetodoPagamentoBaixa('PIX'); }
    };

    const confirmarExclusao = async () => {
        if (!contaParaApagar) return;
        try {
            if (contaParaApagar.status === 'Pago') {
                if (contaParaApagar.metodo_pagamento === 'Dinheiro' && caixaAtivo) {
                    await supabase.from('movimentacoes_caixa').insert([{
                        caixa_id: caixaAtivo.id,
                        tipo: 'suprimento',
                        valor: contaParaApagar.valor,
                        descricao: `Estorno de Despesa: ${contaParaApagar.descricao}`
                    }]);
                }
                if (contaParaApagar.metodo_pagamento === 'PIX' || contaParaApagar.metodo_pagamento === 'Cartão de Débito' || contaParaApagar.metodo_pagamento === 'Transferência') {
                    const { data: banco } = await supabase.from('conta_bancaria').select('saldo').eq('id', 1).single();
                    if (banco) {
                        await supabase.from('conta_bancaria').update({ saldo: Number(banco.saldo) + contaParaApagar.valor }).eq('id', 1);
                    }
                }
            }

            await supabase.from('contas_pagar').delete().eq('id', contaParaApagar.id);
            mostrarMensagem('Conta removida e saldo atualizado!', 'sucesso');
            carregarDados();
        } catch (error) { mostrarMensagem('Erro ao excluir conta.', 'erro'); }
        finally { setContaParaApagar(null); }
    };

    if (carregando) return <div className="text-center py-10 font-bold text-cafe-primary animate-pulse">A carregar o financeiro...</div>;

    return (
        <div className="max-w-6xl mx-auto p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-8 relative">
            {feedback.tipo && (
                <div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg transition-all ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    <span className="font-semibold">{feedback.msg}</span>
                </div>
            )}

            {/* MODAL: AJUSTE DE BANCO DIGITAL */}
            {modalAjusteBanco && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                        <h3 className="text-xl font-bold text-blue-900 mb-2">🏦 Ajustar Saldo do Banco</h3>
                        <p className="text-gray-600 mb-4 text-sm">Informe o valor exato que consta na conta bancária/PIX da empresa no momento.</p>
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Novo Saldo Digital (R$)</label>
                            <input
                                type="number"
                                className="w-full p-3 border border-gray-300 rounded bg-white outline-none font-bold text-center text-lg text-blue-800 focus:border-blue-500"
                                value={novoSaldoBanco}
                                onChange={(e) => setNovoSaldoBanco(e.target.value === '' ? '' : Number(e.target.value))}
                            />
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setModalAjusteBanco(false)} className="flex-1 bg-gray-100 py-2 rounded font-semibold text-sm">Cancelar</button>
                            <button onClick={salvarAjusteBanco} className="flex-1 bg-blue-600 text-white py-2 rounded font-semibold text-sm hover:bg-blue-700">Salvar Ajuste</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: HISTÓRICO DE TURNOS - APERTURA, FECHAMENTO E CONFERÊNCIA */}
            {modalHistoricoOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-700">

                        <div className="p-5 bg-gray-50 dark:bg-gray-900 border-b flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-gray-800 dark:text-white">Auditoria e Histórico de Turnos</h3>
                                <p className="text-xs text-gray-400">Inspecione relatórios de abertura, fechamento e quebras de caixa</p>
                            </div>
                            <button onClick={() => setModalHistoricoOpen(false)} className="text-gray-400 hover:text-red-500 font-bold text-xl">×</button>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            {/* Lateral Esquerda: Turnos */}
                            <div className="w-1/3 border-r overflow-y-auto bg-gray-50/50">
                                {listaCaixas.map((c) => (
                                    <div
                                        key={c.id}
                                        onClick={() => carregarRelatorioTurno(c)}
                                        className={`p-4 border-b cursor-pointer transition flex flex-col gap-1 hover:bg-gray-100 dark:hover:bg-gray-700/50 ${caixaSelecionado?.id === c.id ? 'bg-blue-50/60 dark:bg-gray-700 border-l-4 border-l-cafe-primary' : ''}`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-gray-500">Caixa: #{c.id.substring(0, 5)}</span>
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.status === 'aberto' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                                                {c.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Abertura: {formatarDataHora(c.data_abertura)}</span>
                                        <span className="text-xs font-semibold text-gray-400">Fundo Inicial: {formatarMoeda(c.fundo_inicial)}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Lateral Direita: Painel Demonstrativo Clean */}
                            <div className="w-2/3 p-6 overflow-y-auto bg-white dark:bg-gray-800 flex flex-col">
                                {caixaSelecionado ? (
                                    carregandoRelatorio ? (
                                        <div className="text-center py-20 font-bold text-cafe-primary animate-pulse">A calcular fechamento...</div>
                                    ) : detalhesRelatorio && (
                                        <div className="space-y-5">
                                            <div className="flex justify-between items-center border-b pb-3">
                                                <div>
                                                    <h4 className="text-base font-black text-gray-800 dark:text-white">Extrato Consolidado do Turno</h4>
                                                    <p className="text-xs text-gray-400">Período de movimentações e conciliação</p>
                                                </div>
                                                <button onClick={handleImprimirRelatorioTurno} className="bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-xl shadow hover:bg-gray-800 transition flex items-center gap-1.5">
                                                    🖨️ Imprimir Cupom
                                                </button>
                                            </div>

                                            <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-100 dark:border-gray-600 flex justify-between">
                                                <span>Abertura: <strong>{formatarDataHora(caixaSelecionado.data_abertura)}</strong></span>
                                                {caixaSelecionado.data_fechamento && <span>Fechamento: <strong>{formatarDataHora(caixaSelecionado.data_fechamento)}</strong></span>}
                                            </div>

                                            {/* Bloco Dinheiro Fisico */}
                                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 space-y-2.5 text-sm">
                                                <h5 className="text-xs font-black text-gray-400 uppercase tracking-wider">Gaveta de Dinheiro Físico</h5>
                                                <div className="flex justify-between"><span>(+) Fundo Inicial de Abertura:</span><span className="font-medium">{formatarMoeda(caixaSelecionado.fundo_inicial)}</span></div>
                                                <div className="flex justify-between"><span>(+) Entradas (Vendas em Dinheiro):</span><span className="font-medium text-green-600">{formatarMoeda(detalhesRelatorio.totalDinheiro)}</span></div>
                                                <div className="flex justify-between"><span>(+) Suprimentos (Aportes):</span><span className="font-medium text-green-600">{formatarMoeda(detalhesRelatorio.suprimentos)}</span></div>
                                                <div className="flex justify-between"><span>(-) Sangrias / Despesas do Caixa:</span><span className="font-medium text-red-500">-{formatarMoeda(detalhesRelatorio.sangrias)}</span></div>
                                                <div className="flex justify-between font-bold pt-2 border-t mt-2 text-gray-800 dark:text-white"><span>= Saldo Esperado em Sistema:</span><span>{formatarMoeda(detalhesRelatorio.dinheiroEsperado)}</span></div>
                                            </div>

                                            {/* NOVO BLOCO: DETALHE DE FECHAMENTO E CONFERÊNCIA */}
                                            {caixaSelecionado.status === 'fechado' && (
                                                <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 space-y-2.5 text-sm shadow-sm">
                                                    <h5 className="text-xs font-black text-gray-400 uppercase tracking-wider">Conferência de Encerramento</h5>
                                                    <div className="flex justify-between"><span>📢 Valor Real Informado no Fechamento:</span><span className="font-bold text-gray-800 dark:text-white">{formatarMoeda(detalhesRelatorio.valorFechamentoReal)}</span></div>
                                                    <div className="flex justify-between items-center pt-2 border-t">
                                                        <span>⚠️ Resultado / Diferença:</span>
                                                        {detalhesRelatorio.diferenca === 0 ? (
                                                            <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-lg text-xs font-bold">Caixa Correto (R$ 0,00)</span>
                                                        ) : detalhesRelatorio.diferenca < 0 ? (
                                                            <span className="bg-red-100 text-red-800 px-3 py-1 rounded-lg text-xs font-bold">Falta Dinheiro ({formatarMoeda(detalhesRelatorio.diferenca)})</span>
                                                        ) : (
                                                            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-lg text-xs font-bold">Sobra no Caixa (+{formatarMoeda(detalhesRelatorio.diferenca)})</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Bloco Faturamento Digital */}
                                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 space-y-2 text-sm">
                                                <h5 className="text-xs font-black text-gray-400 uppercase tracking-wider">Faturamento Digital (Outros Meios)</h5>
                                                <div className="flex justify-between"><span>📱 Recebimentos via PIX:</span><span className="font-bold text-gray-700 dark:text-gray-300">{formatarMoeda(detalhesRelatorio.totalPix)}</span></div>
                                                <div className="flex justify-between"><span>💳 Cartão de Crédito:</span><span className="font-bold text-gray-700 dark:text-gray-300">{formatarMoeda(detalhesRelatorio.totalCredito)}</span></div>
                                                <div className="flex justify-between"><span>💳 Cartão de Débito:</span><span className="font-bold text-gray-700 dark:text-gray-300">{formatarMoeda(detalhesRelatorio.totalDebito)}</span></div>
                                            </div>

                                            {/* Indicadores Totais */}
                                            <div className="p-4 rounded-xl bg-gray-900 text-white space-y-2 text-sm shadow">
                                                <div className="flex justify-between text-gray-300"><span>Volume de Atendimentos:</span><span className="font-bold">{detalhesRelatorio.qtdVendas} vendas</span></div>
                                                <div className="flex justify-between font-black text-base pt-2 border-t border-gray-800 text-green-400"><span>Faturamento Bruto Total do Turno:</span><span>{formatarMoeda(detalhesRelatorio.faturamentoTotal)}</span></div>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="text-center py-24 text-gray-400 italic text-sm">
                                        ◀️ Selecione um caixa da lista lateral para auditar as informações de abertura, fechamento e diferenças.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modais de Movimentação Manual de Caixa */}
            {modalMovimento && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                        <h3 className="text-xl font-bold text-cafe-dark mb-4 flex items-center gap-2">
                            {modalMovimento === 'suprimento' ? '➕ Lançar Suprimento' : '➖ Lançar Sangria'}
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Valor (R$)</label>
                                <input type="number" className="w-full p-2 border rounded font-bold outline-none" value={valorMovimento} onChange={(e) => setValorMovimento(Number(e.target.value))} placeholder="0,00" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Motivo / Descrição</label>
                                <input type="text" className="w-full p-2 border rounded text-sm outline-none" value={motivoMovimento} onChange={(e) => setMotivoMovimento(e.target.value)} placeholder="Ex: Troco inicial extra..." />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => { setModalMovimento(null); setValorMovimento(''); setMotivoMovimento(''); }} className="flex-1 bg-gray-100 py-2 rounded font-semibold text-sm">Cancelar</button>
                            <button onClick={lancarMovimentoCaixa} className={`flex-1 text-white py-2 rounded font-semibold text-sm ${modalMovimento === 'suprimento' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Pagamento */}
            {contaParaPagar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                        <h3 className="text-xl font-bold text-cafe-dark mb-2">Dar Baixa na Conta</h3>
                        <p className="text-gray-600 mb-4 text-sm">Confirma o pagamento de <strong>{formatarMoeda(contaParaPagar.valor)}</strong> para <strong>{contaParaPagar.descricao}</strong>?</p>

                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Forma de Pagamento</label>
                            <select className="w-full p-2 border rounded bg-white font-semibold text-sm" value={metodoPagamentoBaixa} onChange={(e) => setMetodoPagamentoBaixa(e.target.value)}>
                                <option value="PIX">📱 PIX (Desconta do Banco)</option>
                                <option value="Dinheiro">💵 Dinheiro (Desconta da Gaveta)</option>
                                <option value="Cartão de Débito">💳 Cartão de Débito (Desconta do Banco)</option>
                                <option value="Cartão de Crédito">💳 Cartão de Crédito</option>
                                <option value="Transferência">🏦 Transferência (Desconta do Banco)</option>
                            </select>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setContaParaPagar(null)} className="flex-1 bg-gray-100 py-2 rounded font-semibold text-sm">Voltar</button>
                            <button onClick={confirmarPagamento} className="flex-1 bg-green-600 text-white py-2 rounded font-semibold text-sm hover:bg-green-700">Sim, Pago</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Exclusão */}
            {contaParaApagar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-xl font-bold text-cafe-dark mb-2">Excluir/Estornar Conta</h3><p className="text-gray-600 mb-6 text-sm">Tem certeza que deseja apagar esta conta? (O valor será estornado na gaveta ou banco se já foi paga).</p><div className="flex gap-3"><button onClick={() => setContaParaApagar(null)} className="flex-1 bg-gray-100 py-2 rounded font-semibold">Cancelar</button><button onClick={confirmarExclusao} className="flex-1 bg-red-600 text-white py-2 rounded font-semibold">Sim, Excluir</button></div></div></div>
            )}

            {/* CORPO PRINCIPAL DO HEAD */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-cafe-secondary/30 pb-4 gap-4">
                <h2 className="text-2xl font-bold text-cafe-primary">Contas a Pagar (Financeiro)</h2>
                <div className="flex gap-2">
                    <button onClick={abrirHistoricoCaixas} className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded font-bold text-xs shadow-sm hover:bg-gray-50 transition flex items-center gap-1">📋 Histórico de Caixas</button>
                    <button onClick={() => setModalMovimento('suprimento')} className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded font-bold text-xs shadow-sm hover:bg-gray-50 transition flex items-center gap-1">➕ Suprimento</button>
                    <button onClick={() => setModalMovimento('sangria')} className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded font-bold text-xs shadow-sm hover:bg-gray-50 transition flex items-center gap-1">➖ Sangria</button>
                    <button onClick={() => { setNovoSaldoBanco(saldoDigital); setModalAjusteBanco(true); }} className="bg-blue-600 text-white px-3 py-1.5 rounded font-bold text-xs shadow-sm hover:bg-blue-700 transition flex items-center gap-1">🏦 Ajustar Banco</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-red-50 border border-red-200 p-4 rounded-lg shadow-sm flex flex-col justify-center">
                    <h4 className="text-red-800 font-bold text-sm">Total Pendente</h4>
                    <p className="text-[10px] text-red-600 mb-1">Contas não pagas (Todas as datas)</p>
                    <span className="text-xl font-black text-red-600">{formatarMoeda(accountsData.totalPendente)}</span>
                </div>

                <div className={`p-4 rounded-lg shadow-sm flex flex-col justify-center border ${caixaAtivo ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <h4 className={`font-bold text-sm ${caixaAtivo ? 'text-green-800' : 'text-gray-600'}`}>Dinheiro na Gaveta</h4>
                    <p className={`text-[10px] mb-1 ${caixaAtivo ? 'text-green-600' : 'text-gray-400'}`}>Apenas físico no caixa atual</p>
                    <span className={`text-xl font-black ${caixaAtivo ? 'text-green-600' : 'text-gray-400'}`}>
                        {caixaAtivo ? formatarMoeda(dinheiroEmCaixa) : '---'}
                    </span>
                </div>

                {/* CARD BANCÁRIO */}
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg shadow-sm flex flex-col justify-center relative group">
                    <div className="flex justify-between">
                        <div>
                            <h4 className="text-blue-900 font-bold text-sm">Saldo Digital (Banco)</h4>
                            <p className="text-[10px] text-blue-600 mb-1">Conta da Empresa (PIX/Débito)</p>
                        </div>
                    </div>
                    <span className="text-xl font-black text-blue-700">{formatarMoeda(saldoDigital)}</span>
                </div>

                <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col justify-center">
                    <h4 className="text-gray-800 font-bold text-sm">Balanço Líquido do Turno</h4>
                    <p className="text-[10px] text-gray-500 mb-1">Vendas (todas) - Despesas pagas hoje</p>
                    <span className="text-xl font-black text-gray-700">
                        {caixaAtivo ? formatarMoeda(accountsData.balancoGeralTurno) : '---'}
                    </span>
                </div>
            </div>

            {/* UNIFIED GRID STRUCTURE */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* COLUNA ESQUERDA: Formulários e Resumos */}
                <div className="lg:col-span-1 flex flex-col gap-6">

                    {/* FORMULÁRIO MANUAL */}
                    <div className="bg-cafe-bg p-4 rounded-lg border border-gray-200 shadow-sm">
                        <h3 className="font-semibold text-cafe-dark mb-3 border-b pb-1">Lançamento de Despesa</h3>
                        <div className="mb-3"><label className="block text-sm font-semibold mb-1">Descrição</label><input type="text" className="w-full p-2 border rounded outline-none text-sm" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
                        <div className="mb-3">
                            <label className="block text-sm font-semibold mb-1">Fornecedor (Opcional)</label>
                            <select className="w-full p-2 border rounded bg-white outline-none text-sm" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                                <option value="">Sem fornecedor específico</option>
                                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                            </select>
                        </div>

                        <div className="flex gap-2 mb-3">
                            <div className="flex-1"><label className="block text-sm font-semibold mb-1">Valor (R$)</label><input type="number" className="w-full p-2 border rounded outline-none text-sm" value={valor} onChange={(e) => setValor(Number(e.target.value))} /></div>

                            {!isRecorrente ? (
                                <div className="flex-1 animate-fade-in"><label className="block text-sm font-semibold mb-1">Vencimento</label><input type="date" className="w-full p-2 border rounded outline-none text-xs h-[38px]" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} /></div>
                            ) : (
                                <div className="flex-1 animate-fade-in"><label className="block text-sm font-semibold mb-1">Dia Venc.</label><input type="number" min="1" max="31" placeholder="Ex: 10" className="w-full p-2 border rounded outline-none font-bold text-center text-sm" value={diaVencimentoRecorrente} onChange={(e) => setDiaVencimentoRecorrente(Number(e.target.value))} /></div>
                            )}
                        </div>

                        <div className="bg-white p-3 rounded-lg border space-y-3 shadow-inner">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" className="w-4 h-4 text-cafe-primary rounded border-gray-300" checked={isRecorrente} onChange={(e) => { setIsRecorrente(e.target.checked); setDataVencimento(''); }} />
                                <span className="text-sm font-bold text-gray-700">Lançar conta fixa recorrente</span>
                            </label>
                            {isRecorrente && (
                                <div className="flex items-center gap-2 animate-fade-in">
                                    <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Repetir pelos próximos:</span>
                                    <input type="number" min="2" max="24" className="w-16 p-1 border rounded text-center font-bold outline-none text-sm" value={numMeses} onChange={(e) => setNumMeses(Number(e.target.value))} />
                                    <span className="text-xs font-bold text-gray-600">meses</span>
                                </div>
                            )}
                        </div>

                        <button onClick={lancarContaManual} className="w-full bg-cafe-primary text-white font-bold py-2.5 rounded shadow mt-3 hover:bg-cafe-dark transition text-sm">Lançar Conta</button>
                    </div>

                    {/* RECEBIMENTOS DO TURNO */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="font-bold text-gray-700 mb-4 border-b pb-2 text-sm uppercase tracking-wide">Recebimentos (Turno)</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center"><span className="text-sm text-gray-600 font-semibold">📱 PIX</span><span className="font-bold text-gray-800">{formatarMoeda(totaisVendas.pix)}</span></div>
                            <div className="flex justify-between items-center"><span className="text-sm text-gray-600 font-semibold">💵 Dinheiro</span><span className="font-bold text-gray-800">{formatarMoeda(totaisVendas.din)}</span></div>
                            <div className="flex justify-between items-center"><span className="text-sm text-gray-600 font-semibold">💳 Cartão de Crédito</span><span className="font-bold text-gray-800">{formatarMoeda(totaisVendas.cred)}</span></div>
                            <div className="flex justify-between items-center"><span className="text-sm text-gray-600 font-semibold">💳 Cartão de Débito</span><span className="font-bold text-gray-800">{formatarMoeda(totaisVendas.deb)}</span></div>

                            <div className="pt-3 mt-3 border-t border-gray-100 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-700 font-bold">💰 Total Recebido</span>
                                    <span className="font-black text-green-600">{formatarMoeda(totaisVendas.total)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-700 font-bold">📉 Total Gasto (Despesas)</span>
                                    <span className="font-black text-red-500">{formatarMoeda(accountsData.totalPagasHoje)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* COLUNA DIREITA: Tabelas */}
                <div className="lg:col-span-2 flex flex-col gap-6">

                    {/* Contas Pendentes */}
                    <div className="flex flex-col">
                        <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-4">Contas Pendentes</h3>
                        <div className="bg-white rounded-lg border shadow-sm overflow-auto h-[250px]">
                            <table className="w-full text-left border-collapse min-w-max text-sm relative">
                                <thead className="bg-cafe-bg border-b sticky top-0 z-10">
                                    <tr><th className="p-3 font-semibold text-cafe-primary">Vencimento</th><th className="p-3 font-semibold text-cafe-primary">Descrição</th><th className="p-3 font-semibold text-cafe-primary text-right">Valor</th><th className="p-3 font-semibold text-center text-cafe-primary">Ações</th></tr>
                                </thead>
                                <tbody>
                                    {accountsData.contasPendentes.map(conta => (
                                        <tr key={conta.id} className="border-b hover:bg-gray-50">
                                            <td className="p-3 font-bold text-red-600">{formatarData(conta.data_vencimento)}</td>
                                            <td className="p-3"><span className="font-semibold text-cafe-dark block">{conta.descricao}</span>{conta.fornecedores?.nome && <span className="text-xs text-gray-500">{conta.fornecedores.nome}</span>}</td>
                                            <td className="p-3 font-bold text-cafe-dark text-right">{formatarMoeda(conta.valor)}</td>
                                            <td className="p-3 text-center space-x-2">
                                                <button onClick={() => setContaParaPagar(conta)} className="text-green-600 bg-green-50 px-2 py-1 rounded hover:bg-green-100 font-bold text-xs border border-green-200 shadow-sm">Dar Baixa</button>
                                                <button onClick={() => setContaParaApagar(conta)} className="text-red-400 font-black hover:text-red-600 text-base px-1">×</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {accountsData.contasPendentes.length === 0 && (<tr><td colSpan={4} className="p-6 text-center text-gray-500 italic">Nenhuma conta pendente.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Histórico de Pagamentos */}
                    <div className="flex flex-col">
                        <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-4">Histórico de Pagamentos</h3>
                        <div className="bg-white rounded-lg border shadow-sm overflow-auto h-[250px]">
                            <table className="w-full text-left border-collapse min-w-max text-sm relative">
                                <thead className="bg-gray-100 border-b sticky top-0 z-10">
                                    <tr><th className="p-3 font-semibold text-gray-600">Data e Forma</th><th className="p-3 font-semibold text-gray-600">Descrição</th><th className="p-3 font-semibold text-gray-600 text-right">Valor</th><th className="p-3 font-semibold text-center text-gray-600">Estornar</th></tr>
                                </thead>
                                <tbody>
                                    {accountsData.contasPagas.map(conta => (
                                        <tr key={conta.id} className="border-b hover:bg-gray-50 opacity-90">
                                            <td className="p-3 text-gray-700">
                                                <div className="font-semibold text-green-700">{conta.data_pagamento ? formatarData(conta.data_pagamento) : '-'}</div>
                                                {conta.metodo_pagamento && <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded mt-1 inline-block">{conta.metodo_pagamento.toUpperCase()}</span>}
                                            </td>
                                            <td className="p-3 text-gray-700">{conta.descricao} {conta.fornecedores?.nome && <span className="text-xs text-gray-400 block">Fornecedor: {conta.fornecedores.nome}</span>}</td>
                                            <td className="p-3 font-semibold text-gray-600 text-right">{formatarMoeda(conta.valor)}</td>
                                            <td className="p-3 text-center"><button onClick={() => setContaParaApagar(conta)} className="text-gray-400 hover:text-red-500 font-black text-base px-2 transition">×</button></td>
                                        </tr>
                                    ))}
                                    {accountsData.contasPagas.length === 0 && (<tr><td colSpan={4} className="p-4 text-center text-gray-400 italic">Nenhum pagamento efetuado.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}