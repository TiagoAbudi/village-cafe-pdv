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
type PagamentoMisto = { metodo: string; valor: number | '' };

export default function ContasPagarModulo() {
    const [contas, setContas] = useState<Conta[]>([]);
    const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
    const [carregando, setCarregando] = useState(true);

    // Estados do Caixa e Movimentações do Turno Atual
    const [caixaAtivo, setCaixaAtivo] = useState<any | null>(null);
    const [vendasHoje, setVendasHoje] = useState<any[]>([]);
    const [movimentacoesCaixa, setMovimentacoesCaixa] = useState<any[]>([]);

    // Estado da Conta Bancária (Digital)
    const [saldoDigital, setSaldoDigital] = useState<number>(0);
    const [modalAjusteBanco, setModalAjusteBanco] = useState(false);
    const [novoSaldoBanco, setNovoSaldoBanco] = useState<number | ''>('');

    // Estados para o Pagamento da Conta (Único ou Misto)
    const [modoPagamentoBaixa, setModoPagamentoBaixa] = useState<'unico' | 'misto'>('unico');
    const [metodoPagamentoBaixa, setMetodoPagamentoBaixa] = useState('PIX');
    const [valorBaixa, setValorBaixa] = useState<number | ''>(''); // NOVO ESTADO: Valor editável na hora da baixa
    const [pagamentosMistosBaixa, setPagamentosMistosBaixa] = useState<PagamentoMisto[]>([
        { metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }
    ]);

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

    // ESTADOS PARA EDIÇÃO DE CONTA
    const [contaParaEditar, setContaParaEditar] = useState<Conta | null>(null);
    const [editDescricao, setEditDescricao] = useState('');
    const [editFornecedorId, setEditFornecedorId] = useState('');
    const [editValor, setEditValor] = useState<number | ''>('');
    const [editDataVencimento, setEditDataVencimento] = useState('');

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
                .select('total, valor_dinheiro, valor_pix, valor_cartao_credito, valor_cartao_debito, metodo_pagamento, data_venda, id')
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

    useEffect(() => { (async () => { await carregarDados(); })(); }, []);

    const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
    const formatarData = (dataIso: string) => {
        if (!dataIso) return '-';
        const [ano, mes, dia] = dataIso.split('-');
        return `${dia}/${mes}/${ano}`;
    };
    const formatarDataHora = (dataIso: string) => new Date(dataIso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

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
                pix += vPix; din += vDin; cred += vCred; deb += vDeb;
            } else {
                const metodo = String(v.metodo_pagamento || '').trim().toLowerCase();
                if (metodo.includes('pix')) pix += vTotal;
                else if (metodo.includes('dinheiro')) din += vTotal;
                else if (metodo.includes('crédito') || metodo.includes('credito')) cred += vTotal;
                else if (metodo.includes('débito') || metodo.includes('debito')) deb += vTotal;
                else din += vTotal;
            }
        });
        return { pix, din, cred, deb, total };
    }, [vendasHoje]);

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
            .sort((a, b) => b.data_pagamento!.localeCompare(a.data_pagamento!));

        const totalPendente = contasPendentes.reduce((acc, c) => acc + c.valor, 0);

        const hojeStr = new Date().toISOString().split('T')[0];
        const contasPagasHoje = contasPagas.filter(c => c.data_pagamento === hojeStr);
        const totalPagasHoje = contasPagasHoje.reduce((acc, c) => acc + c.valor, 0);

        let balancoGeralTurno = 0;
        if (caixaAtivo) balancoGeralTurno = totaisVendas.total - totalPagasHoje;

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

            const { data: vendas } = await supabase.from('vendas').select('*').gte('data_venda', caixa.data_abertura).lte('data_venda', dataFimFiltro).order('data_venda', { ascending: true });
            const { data: movs } = await supabase.from('movimentacoes_caixa').select('*').eq('caixa_id', caixa.id).order('data_movimento', { ascending: true });

            const vHoje = vendas || [];
            const mHoje = movs || [];

            const listaSuprimentos = mHoje.filter(m => m.tipo === 'suprimento');
            const listaSangrias = mHoje.filter(m => m.tipo === 'sangria' || m.tipo === 'despesa');

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

            const suprimentos = listaSuprimentos.reduce((acc, m) => acc + Number(m.valor), 0);
            const sangriasEDespesas = listaSangrias.reduce((acc, m) => acc + Number(m.valor), 0);

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
                diferenca,
                listaVendas: vHoje,
                listaSuprimentos,
                listaSangrias
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

        let detalhesHtml = '';
        if (detalhesRelatorio.listaSuprimentos.length > 0) {
            detalhesHtml += `<div class="line"></div><div class="font-bold text-center" style="margin:4px 0;">+ SUPRIMENTOS DETALHADOS</div>`;
            detalhesRelatorio.listaSuprimentos.forEach((item: any) => {
                detalhesHtml += `<div class="row" style="font-size:10px;"><span>${item.descricao}</span><span>${formatarMoeda(item.valor)}</span></div>`;
            });
        }
        if (detalhesRelatorio.listaSangrias.length > 0) {
            detalhesHtml += `<div class="line"></div><div class="font-bold text-center" style="margin:4px 0;">- SANGRIAS/DESPESAS DET.</div>`;
            detalhesRelatorio.listaSangrias.forEach((item: any) => {
                detalhesHtml += `<div class="row" style="font-size:10px;"><span>${item.descricao}</span><span>${formatarMoeda(item.valor)}</span></div>`;
            });
        }
        if (detalhesRelatorio.listaVendas.length > 0) {
            detalhesHtml += `<div class="line"></div><div class="font-bold text-center" style="margin:4px 0;">🧾 VENDAS (ENTRADAS)</div>`;
            detalhesRelatorio.listaVendas.forEach((item: any) => {
                detalhesHtml += `<div class="row" style="font-size:10px;"><span>Venda #${item.id.split('-')[0]} (${item.metodo_pagamento || 'Misto'})</span><span>${formatarMoeda(item.total)}</span></div>`;
            });
        }

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
              
              ${detalhesHtml}

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
            console.error(e);
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
            console.error(error);
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
        } catch (error) { console.error(error); mostrarMensagem('Erro ao processar lançamento.', 'erro'); }
    };

    // FUNÇÕES DE EDIÇÃO DE CONTA
    const abrirModalEdicao = (conta: Conta) => {
        setContaParaEditar(conta);
        setEditDescricao(conta.descricao);
        setEditFornecedorId(conta.fornecedor_id || '');
        setEditValor(conta.valor);
        setEditDataVencimento(conta.data_vencimento);
    };

    const salvarEdicaoConta = async () => {
        if (!contaParaEditar) return;
        if (!editDescricao || !editValor || !editDataVencimento) {
            return mostrarMensagem('Preencha descrição, valor e vencimento.', 'aviso');
        }

        try {
            const { error } = await supabase.from('contas_pagar').update({
                descricao: editDescricao,
                fornecedor_id: editFornecedorId || null,
                valor: Number(editValor),
                data_vencimento: editDataVencimento
            }).eq('id', contaParaEditar.id);

            if (error) throw error;

            mostrarMensagem('Conta atualizada com sucesso!', 'sucesso');
            carregarDados();
        } catch (error) {
            console.error(error);
            mostrarMensagem('Erro ao atualizar a conta.', 'erro');
        } finally {
            setContaParaEditar(null);
        }
    };

    // FUNÇÃO QUE PREPARA E ABRE O MODAL DE PAGAMENTO
    const abrirModalPagamento = (conta: Conta) => {
        setContaParaPagar(conta);
        setValorBaixa(conta.valor); // Inicia o input com o valor original
        setModoPagamentoBaixa('unico');
        setMetodoPagamentoBaixa('PIX');
        setPagamentosMistosBaixa([
            { metodo: 'PIX', valor: '' },
            { metodo: 'Dinheiro', valor: '' }
        ]);
    };

    // FUNÇÃO QUE PROCESSA A BAIXA (MÚLTIPLA OU ÚNICA)
    const confirmarPagamento = async () => {
        if (!contaParaPagar) return;

        const valorFinal = Number(valorBaixa);
        if (valorFinal <= 0) return mostrarMensagem('O valor de pagamento deve ser maior que zero.', 'aviso');

        let stringMetodos = '';
        let totalDinheiro = 0;
        let totalBanco = 0;

        if (modoPagamentoBaixa === 'unico') {
            stringMetodos = metodoPagamentoBaixa;
            if (metodoPagamentoBaixa === 'Dinheiro') {
                totalDinheiro = valorFinal;
            } else {
                totalBanco = valorFinal;
            }
        } else {
            const totalPagoMisto = pagamentosMistosBaixa.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);

            // Para Contas a Pagar, a soma dos parciais tem que bater cravado com o valorFinal editável.
            if (totalPagoMisto !== valorFinal) {
                return mostrarMensagem(`A soma das formas de pagamento deve ser exatamente ${formatarMoeda(valorFinal)}.`, 'aviso');
            }

            const metodosUsados = pagamentosMistosBaixa.filter(p => Number(p.valor) > 0);
            stringMetodos = Array.from(new Set(metodosUsados.map(p => p.metodo))).join(' + ');

            metodosUsados.forEach(p => {
                const val = Number(p.valor);
                if (p.metodo === 'Dinheiro') totalDinheiro += val;
                else totalBanco += val;
            });
        }

        if (totalDinheiro > 0 && !caixaAtivo) {
            return mostrarMensagem('Não é possível pagar em dinheiro (físico) com o caixa fechado.', 'erro');
        }

        try {
            const dataHoje = new Date().toISOString().split('T')[0];

            if (totalDinheiro > 0 && caixaAtivo) {
                await supabase.from('movimentacoes_caixa').insert([{
                    caixa_id: caixaAtivo.id,
                    tipo: 'despesa',
                    valor: totalDinheiro,
                    descricao: `Pago (${modoPagamentoBaixa === 'misto' ? 'Parcial' : 'Integral'}): ${contaParaPagar.descricao}`
                }]);
            }

            if (totalBanco > 0) {
                const saldoAtualizado = saldoDigital - totalBanco;
                await supabase.from('conta_bancaria').update({ saldo: saldoAtualizado }).eq('id', 1);
            }

            // Atualizamos o valor da conta no BD para refletir o que realmente foi pago (caso de juros/desconto)
            await supabase.from('contas_pagar').update({
                status: 'Pago',
                data_pagamento: dataHoje,
                metodo_pagamento: stringMetodos,
                valor: valorFinal
            }).eq('id', contaParaPagar.id);

            mostrarMensagem('Conta marcada como PAGA com sucesso!', 'sucesso');
            carregarDados();
        } catch (error) {
            console.error(error);
            mostrarMensagem('Erro ao registrar baixa da conta.', 'erro');
        } finally {
            setContaParaPagar(null);
            setMetodoPagamentoBaixa('PIX');
        }
    };

    // --- NOVA FUNÇÃO DE ESTORNO DE CONTA (INCLUI REVERSÃO DE LOTE E BANCO) ---
    const confirmarExclusao = async () => {
        if (!contaParaApagar) return;
        try {
            // 1. REVERTER DINHEIRO SE A CONTA JÁ ESTAVA PAGA
            if (contaParaApagar.status === 'Pago') {
                const metodos = contaParaApagar.metodo_pagamento || '';

                if (metodos.includes('+')) {
                    // Para estorno misto, devolve tudo pro Banco e avisa
                    const { data: banco } = await supabase.from('conta_bancaria').select('saldo').eq('id', 1).single();
                    if (banco) {
                        await supabase.from('conta_bancaria').update({ saldo: Number(banco.saldo) + contaParaApagar.valor }).eq('id', 1);
                    }
                    setTimeout(() => mostrarMensagem('Aviso: Conta mista estornada! O valor total foi devolvido ao Saldo Digital.', 'aviso'), 1000);
                } else if (metodos === 'Dinheiro') {
                    if (caixaAtivo) {
                        await supabase.from('movimentacoes_caixa').insert([{
                            caixa_id: caixaAtivo.id,
                            tipo: 'suprimento',
                            valor: contaParaApagar.valor,
                            descricao: `Estorno de Despesa: ${contaParaApagar.descricao}`
                        }]);
                    } else {
                        mostrarMensagem('Caixa fechado! O estorno em dinheiro não afetou a gaveta atual.', 'aviso');
                    }
                } else {
                    // Abrange qualquer meio digital: PIX, Cartão de Crédito, Débito e Transferência
                    const { data: banco } = await supabase.from('conta_bancaria').select('saldo').eq('id', 1).single();
                    if (banco) {
                        await supabase.from('conta_bancaria').update({ saldo: Number(banco.saldo) + contaParaApagar.valor }).eq('id', 1);
                    }
                }
            }

            // 2. REVERTER ESTOQUE SE FOI COMPRA DE LOTE
            const loteMatch = contaParaApagar.descricao.match(/\[LOTE-(.*?)\]/);
            if (loteMatch) {
                const loteId = loteMatch[1];
                // Verifica se já estornou (pois pode haver 2 contas de pagamentos diferentes para o mesmo lote)
                const { data: jaEstornado } = await supabase.from('movimentacoes_estoque').select('id').eq('motivo', `Estorno Lote [LOTE-${loteId}]`).limit(1);

                if (!jaEstornado || jaEstornado.length === 0) {
                    // Busca quais foram os produtos inseridos nesse lote original
                    const { data: movs } = await supabase.from('movimentacoes_estoque').select('produto_id, quantidade').eq('motivo', `Abastecimento via Lote [LOTE-${loteId}]`);

                    if (movs && movs.length > 0) {
                        for (const m of movs) {
                            const { data: p } = await supabase.from('produtos').select('quantidade_estoque').eq('id', m.produto_id).single();
                            if (p) {
                                // Subtrai o que foi comprado do estoque
                                await supabase.from('produtos').update({ quantidade_estoque: p.quantidade_estoque - m.quantidade }).eq('id', m.produto_id);

                                // Registra a movimentação de saída do estorno
                                await supabase.from('movimentacoes_estoque').insert([{
                                    produto_id: m.produto_id,
                                    quantidade: -m.quantidade,
                                    tipo_movimento: 'Saída - Estorno Compra',
                                    motivo: `Estorno Lote [LOTE-${loteId}]`,
                                    atendente: 'Sistema'
                                }]);
                            }
                        }
                    }
                }
            }

            // 3. APAGAR A CONTA FINALMENTE
            await supabase.from('contas_pagar').delete().eq('id', contaParaApagar.id);
            mostrarMensagem('Conta removida e estornada com sucesso!', 'sucesso');
            carregarDados();
        } catch (error) {
            console.error(error);
            mostrarMensagem('Erro ao excluir conta.', 'erro');
        } finally {
            setContaParaApagar(null);
        }
    };

    if (carregando) return <div className="text-center py-10 font-bold text-cafe-primary animate-pulse">A carregar o financeiro...</div>;

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-4 md:my-8 relative">
            {/* FEEDBACK TOAST */}
            {feedback.tipo && (
                <div className={`fixed top-4 right-4 z-[200] px-4 py-3 rounded-lg shadow-lg transition-all ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    <span className="font-semibold text-sm">{feedback.msg}</span>
                </div>
            )}

            {/* MODAL: AJUSTE DE BANCO DIGITAL */}
            {modalAjusteBanco && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border">
                        <h3 className="text-xl font-black text-blue-900 mb-2">🏦 Ajustar Saldo Digital</h3>
                        <p className="text-gray-600 mb-6 text-sm">Informe o valor exato que consta na conta bancária/PIX da empresa no momento.</p>
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Novo Saldo Digital (R$)</label>
                            <input
                                type="number"
                                className="w-full p-4 border-2 border-gray-200 rounded-xl bg-white outline-none font-black text-center text-2xl text-blue-800 focus:border-blue-500 text-base"
                                value={novoSaldoBanco}
                                onChange={(e) => setNovoSaldoBanco(e.target.value === '' ? '' : Number(e.target.value))}
                                autoFocus
                            />
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setModalAjusteBanco(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-3 md:py-2 rounded-xl font-bold text-sm transition">Cancelar</button>
                            <button onClick={salvarAjusteBanco} className="flex-1 bg-blue-600 text-white py-3 md:py-2 rounded-xl font-bold text-sm hover:bg-blue-700 shadow-md transition active:scale-95">Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: EDIÇÃO DE CONTA */}
            {contaParaEditar && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border">
                        <h3 className="text-xl font-black text-blue-900 mb-4 border-b pb-2">✏️ Editar Conta</h3>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição</label>
                                <input type="text" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-sm bg-gray-50" value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fornecedor</label>
                                <select className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-400 text-sm" value={editFornecedorId} onChange={(e) => setEditFornecedorId(e.target.value)}>
                                    <option value="">Sem fornecedor...</option>
                                    {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                                </select>
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Valor (R$)</label>
                                    <input type="number" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-sm font-bold bg-gray-50" value={editValor} onChange={(e) => setEditValor(e.target.value === '' ? '' : Number(e.target.value))} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vencimento</label>
                                    <input type="date" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 text-sm bg-gray-50" value={editDataVencimento} onChange={(e) => setEditDataVencimento(e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setContaParaEditar(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-3 rounded-xl font-bold transition text-sm">Cancelar</button>
                            <button onClick={salvarEdicaoConta} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-md transition active:scale-95 text-sm">Salvar Alterações</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: HISTÓRICO DE TURNOS */}
            {modalHistoricoOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-2 md:p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[95vh] md:h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-700">

                        <div className="p-4 md:p-5 bg-gray-50 dark:bg-gray-900 border-b flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-gray-800 dark:text-white leading-tight">Auditoria e Histórico de Turnos</h3>
                                <p className="text-xs text-gray-500 hidden md:block">Inspecione relatórios de abertura, fechamento e detalhamento de entradas e saídas</p>
                            </div>
                            <button onClick={() => setModalHistoricoOpen(false)} className="text-gray-400 hover:text-red-500 font-black text-2xl px-2">✕</button>
                        </div>

                        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                            {/* Lateral Esquerda: Turnos (Em cima no Mobile) */}
                            <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r overflow-y-auto bg-gray-50/50 custom-scrollbar h-[35vh] lg:h-auto shrink-0">
                                {listaCaixas.map((c) => (
                                    <div
                                        key={c.id}
                                        onClick={() => carregarRelatorioTurno(c)}
                                        className={`p-3 md:p-4 border-b cursor-pointer transition flex flex-col gap-1 hover:bg-gray-100 dark:hover:bg-gray-700/50 ${caixaSelecionado?.id === c.id ? 'bg-blue-50/60 dark:bg-gray-700 border-l-4 border-l-cafe-primary' : ''}`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-gray-500">Caixa: #{c.id.substring(0, 5)}</span>
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${c.status === 'aberto' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                                                {c.status}
                                            </span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{formatarDataHora(c.data_abertura)}</span>
                                        <span className="text-xs font-semibold text-gray-500">Fundo Inicial: {formatarMoeda(c.fundo_inicial)}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Lateral Direita: Painel Demonstrativo e Detalhamento */}
                            <div className="w-full lg:w-2/3 p-4 md:p-6 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-800 flex-1">
                                {caixaSelecionado ? (
                                    carregandoRelatorio ? (
                                        <div className="text-center py-20 font-bold text-cafe-primary animate-pulse">A extrair relatório completo...</div>
                                    ) : detalhesRelatorio && (
                                        <div className="space-y-6">
                                            {/* Cabeçalho do Relatório */}
                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4">
                                                <div>
                                                    <h4 className="text-base font-black text-gray-800 dark:text-white uppercase tracking-wider">Extrato Consolidado</h4>
                                                    <p className="text-xs text-gray-500">Resumo financeiro e conciliação da gaveta</p>
                                                </div>
                                                <button onClick={handleImprimirRelatorioTurno} className="w-full sm:w-auto bg-gray-900 text-white text-xs font-bold px-4 py-3 md:py-2 rounded-xl shadow-md hover:bg-gray-800 transition active:scale-95 flex items-center justify-center gap-2">
                                                    🖨️ Imprimir Fechamento
                                                </button>
                                            </div>

                                            {/* Bloco Dinheiro Fisico */}
                                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 space-y-2.5 text-sm">
                                                <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Gaveta de Dinheiro Físico</h5>
                                                <div className="flex justify-between"><span>(+) Fundo Abertura:</span><span className="font-bold text-gray-700 dark:text-gray-200">{formatarMoeda(caixaSelecionado.fundo_inicial)}</span></div>
                                                <div className="flex justify-between"><span>(+) Vendas (Dinheiro):</span><span className="font-bold text-green-600">{formatarMoeda(detalhesRelatorio.totalDinheiro)}</span></div>
                                                <div className="flex justify-between"><span>(+) Suprimentos:</span><span className="font-bold text-green-600">{formatarMoeda(detalhesRelatorio.suprimentos)}</span></div>
                                                <div className="flex justify-between"><span>(-) Sangrias/Despesas:</span><span className="font-bold text-red-500">-{formatarMoeda(detalhesRelatorio.sangrias)}</span></div>
                                                <div className="flex justify-between font-black pt-3 border-t border-gray-200 dark:border-gray-600 mt-2 text-gray-800 dark:text-white text-base"><span>= Saldo Esperado:</span><span className="text-cafe-primary dark:text-cafe-secondary">{formatarMoeda(detalhesRelatorio.dinheiroEsperado)}</span></div>
                                            </div>

                                            {/* DETALHE DE FECHAMENTO E CONFERÊNCIA */}
                                            {caixaSelecionado.status === 'fechado' && (
                                                <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 space-y-3 text-sm shadow-sm">
                                                    <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">Conferência de Encerramento</h5>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-600 dark:text-gray-300 font-semibold">Valor Real (Informado):</span>
                                                        <span className="font-black text-lg text-gray-800 dark:text-white">{formatarMoeda(detalhesRelatorio.valorFechamentoReal)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-700">
                                                        <span className="text-gray-600 dark:text-gray-300 font-bold">Resultado / Diferença:</span>
                                                        {detalhesRelatorio.diferenca === 0 ? (
                                                            <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-lg text-xs font-black uppercase">Caixa Correto (R$ 0,00)</span>
                                                        ) : detalhesRelatorio.diferenca < 0 ? (
                                                            <span className="bg-red-100 text-red-800 px-3 py-1 rounded-lg text-xs font-black uppercase">Falta ({formatarMoeda(detalhesRelatorio.diferenca)})</span>
                                                        ) : (
                                                            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-lg text-xs font-black uppercase">Sobra (+{formatarMoeda(detalhesRelatorio.diferenca)})</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Indicadores Totais e Digitais */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 space-y-2 text-sm">
                                                    <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Faturamento Digital</h5>
                                                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-300">📱 PIX:</span><span className="font-bold dark:text-white">{formatarMoeda(detalhesRelatorio.totalPix)}</span></div>
                                                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-300">💳 Crédito:</span><span className="font-bold dark:text-white">{formatarMoeda(detalhesRelatorio.totalCredito)}</span></div>
                                                    <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-300">💳 Débito:</span><span className="font-bold dark:text-white">{formatarMoeda(detalhesRelatorio.totalDebito)}</span></div>
                                                </div>
                                                <div className="p-4 rounded-xl bg-gray-900 text-white space-y-2 text-sm shadow-md flex flex-col justify-center">
                                                    <div className="flex justify-between text-gray-300"><span>Volume Vendas:</span><span className="font-bold">{detalhesRelatorio.qtdVendas} unid.</span></div>
                                                    <div className="flex justify-between font-black text-lg pt-3 border-t border-gray-800 text-green-400"><span>Bruto Total:</span><span>{formatarMoeda(detalhesRelatorio.faturamentoTotal)}</span></div>
                                                </div>
                                            </div>

                                            {/* LISTAGENS DETALHADAS */}
                                            <div className="mt-8 pt-6 border-t-2 border-dashed border-gray-200 dark:border-gray-700">
                                                <h4 className="font-black text-gray-800 dark:text-white text-base mb-4 uppercase tracking-wider">Detalhamento de Registros</h4>

                                                {/* Vendas */}
                                                <div className="mb-6">
                                                    <h5 className="font-bold text-xs text-blue-700 bg-blue-50 py-2 px-3 rounded-t-xl border border-blue-100 border-b-0 uppercase tracking-wider">
                                                        🧾 Entradas (Vendas)
                                                    </h5>
                                                    <div className="border border-blue-100 rounded-b-xl overflow-hidden bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                                                        {detalhesRelatorio.listaVendas.length > 0 ? (
                                                            detalhesRelatorio.listaVendas.map((v: any) => (
                                                                <div key={v.id} className="flex justify-between items-center p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-gray-800 dark:text-gray-200">#{v.id.split('-')[0]} <span className="text-gray-400 text-xs font-normal">({formatarDataHora(v.data_venda).split(' ')[1]})</span></span>
                                                                        <span className="text-[10px] font-bold text-gray-500 uppercase mt-0.5">{v.metodo_pagamento || 'MISTO'}</span>
                                                                    </div>
                                                                    <span className="font-black text-gray-800 dark:text-gray-100">{formatarMoeda(v.total)}</span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <p className="p-4 text-xs text-gray-400 italic text-center">Nenhuma venda registrada no turno.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Suprimentos */}
                                                <div className="mb-6">
                                                    <h5 className="font-bold text-xs text-green-700 bg-green-50 py-2 px-3 rounded-t-xl border border-green-100 border-b-0 uppercase tracking-wider">
                                                        ➕ Suprimentos (Aportes)
                                                    </h5>
                                                    <div className="border border-green-100 rounded-b-xl overflow-hidden bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                                                        {detalhesRelatorio.listaSuprimentos.length > 0 ? (
                                                            detalhesRelatorio.listaSuprimentos.map((s: any) => (
                                                                <div key={s.id} className="flex justify-between items-center p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                                    <div className="flex flex-col pr-4">
                                                                        <span className="font-semibold text-gray-700 dark:text-gray-300">{s.descricao}</span>
                                                                        <span className="text-[10px] text-gray-400 font-mono mt-0.5">{s.data_movimento ? formatarDataHora(s.data_movimento).split(' ')[1] : '-'}</span>
                                                                    </div>
                                                                    <span className="font-black text-green-600">+{formatarMoeda(s.valor)}</span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <p className="p-4 text-xs text-gray-400 italic text-center">Nenhum suprimento registrado.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Sangrias */}
                                                <div className="mb-6">
                                                    <h5 className="font-bold text-xs text-red-700 bg-red-50 py-2 px-3 rounded-t-xl border border-red-100 border-b-0 uppercase tracking-wider">
                                                        ➖ Sangrias e Despesas
                                                    </h5>
                                                    <div className="border border-red-100 rounded-b-xl overflow-hidden bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                                                        {detalhesRelatorio.listaSangrias.length > 0 ? (
                                                            detalhesRelatorio.listaSangrias.map((s: any) => (
                                                                <div key={s.id} className="flex justify-between items-center p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                                    <div className="flex flex-col pr-4">
                                                                        <span className="font-semibold text-gray-700 dark:text-gray-300">{s.descricao}</span>
                                                                        <span className="text-[10px] text-gray-400 font-mono mt-0.5">{s.data_movimento ? formatarDataHora(s.data_movimento).split(' ')[1] : '-'}</span>
                                                                    </div>
                                                                    <span className="font-black text-red-600">-{formatarMoeda(s.valor)}</span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <p className="p-4 text-xs text-gray-400 italic text-center">Nenhuma sangria ou despesa registrada.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="text-center py-24 text-gray-400 italic text-sm px-4">
                                        <span className="text-4xl mb-4 block grayscale opacity-50">📑</span>
                                        Selecione um caixa da lista para auditar as informações completas.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modais de Movimentação Manual de Caixa */}
            {modalMovimento && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border">
                        <h3 className="text-xl font-black text-cafe-dark mb-4 flex items-center gap-2">
                            {modalMovimento === 'suprimento' ? '➕ Lançar Suprimento' : '➖ Lançar Sangria'}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Valor (R$)</label>
                                <input type="number" className="w-full p-4 border border-gray-300 rounded-xl font-black text-xl text-center outline-none focus:border-cafe-primary text-base" value={valorMovimento} onChange={(e) => setValorMovimento(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0,00" autoFocus />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Motivo / Descrição</label>
                                <input type="text" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-xl outline-none focus:border-cafe-primary text-base md:text-sm" value={motivoMovimento} onChange={(e) => setMotivoMovimento(e.target.value)} placeholder="Ex: Troco inicial extra..." />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => { setModalMovimento(null); setValorMovimento(''); setMotivoMovimento(''); }} className="flex-1 bg-gray-100 hover:bg-gray-200 py-3 rounded-xl font-bold transition">Cancelar</button>
                            <button onClick={lancarMovimentoCaixa} className={`flex-1 text-white py-3 rounded-xl font-bold shadow-md transition active:scale-95 ${modalMovimento === 'suprimento' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Pagamento */}
            {contaParaPagar && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border text-center max-h-[90vh] overflow-y-auto">
                        <div className="text-green-500 text-4xl mb-2">💸</div>
                        <h3 className="text-xl font-black text-cafe-dark mb-2">Dar Baixa na Conta</h3>
                        <p className="text-gray-600 mb-4 text-sm">Conta: <span className="font-bold text-gray-800">{contaParaPagar.descricao}</span></p>

                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Valor Final a Pagar (R$)</label>
                            <input
                                type="number"
                                className="w-full p-3 border border-gray-300 rounded-xl bg-white font-black text-xl text-cafe-dark outline-none focus:ring-2 focus:ring-green-400 text-center"
                                value={valorBaixa}
                                onChange={(e) => setValorBaixa(e.target.value === '' ? '' : Number(e.target.value))}
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Altere se houver juros ou descontos.</p>
                        </div>

                        <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                            <button onClick={() => setModoPagamentoBaixa('unico')} className={`flex-1 text-sm py-2 font-bold rounded transition ${modoPagamentoBaixa === 'unico' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Forma Única</button>
                            <button onClick={() => setModoPagamentoBaixa('misto')} className={`flex-1 text-sm py-2 font-bold rounded transition ${modoPagamentoBaixa === 'misto' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Pag. Misto</button>
                        </div>

                        {modoPagamentoBaixa === 'unico' && (
                            <div className="mb-6 text-left">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Forma de Pagamento</label>
                                <select className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 font-bold text-base md:text-sm outline-none focus:ring-2 focus:ring-green-400" value={metodoPagamentoBaixa} onChange={(e) => setMetodoPagamentoBaixa(e.target.value)}>
                                    <option value="PIX">📱 PIX (Debita Banco)</option>
                                    <option value="Dinheiro">💵 Dinheiro (Da Gaveta)</option>
                                    <option value="Cartão de Débito">💳 Débito (Banco)</option>
                                    <option value="Transferência">🏦 Transferência (Banco)</option>
                                </select>
                            </div>
                        )}

                        {modoPagamentoBaixa === 'misto' && (
                            <div className="space-y-3 mb-6 border p-3 rounded-lg bg-gray-50 text-left">
                                {pagamentosMistosBaixa.map((pm, index) => (
                                    <div key={index} className="flex gap-2 items-center">
                                        <select className="flex-1 p-2 border rounded text-sm font-semibold bg-white outline-none" value={pm.metodo} onChange={(e) => { const n = [...pagamentosMistosBaixa]; n[index].metodo = e.target.value; setPagamentosMistosBaixa(n); }}>
                                            <option value="PIX">PIX</option>
                                            <option value="Dinheiro">Dinheiro</option>
                                            <option value="Cartão de Débito">Débito</option>
                                            <option value="Transferência">Transferência</option>
                                        </select>
                                        <input type="number" placeholder="Valor" className="w-24 p-2 border rounded text-sm font-bold text-base outline-none" value={pm.valor} onChange={(e) => { const n = [...pagamentosMistosBaixa]; n[index].valor = Number(e.target.value); setPagamentosMistosBaixa(n); }} />
                                        {index > 0 && <button onClick={() => setPagamentosMistosBaixa(pagamentosMistosBaixa.filter((_, i) => i !== index))} className="w-8 h-8 flex items-center justify-center text-red-500 font-bold bg-white border rounded shadow-sm hover:bg-red-50">✕</button>}
                                    </div>
                                ))}
                                <button onClick={() => setPagamentosMistosBaixa([...pagamentosMistosBaixa, { metodo: 'Transferência', valor: '' }])} className="w-full text-xs font-bold text-cafe-primary hover:underline bg-white py-2 border border-dashed rounded">+ Adicionar Forma</button>

                                <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200">
                                    {(() => {
                                        const totalPagoMistoBaixa = pagamentosMistosBaixa.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
                                        const faltaMisto = Number(valorBaixa) - totalPagoMistoBaixa;
                                        return (
                                            <>
                                                <span className={faltaMisto > 0 ? 'text-red-500' : 'text-gray-500'}>Falta: {formatarMoeda(faltaMisto > 0 ? faltaMisto : 0)}</span>
                                                <span className={faltaMisto < 0 ? 'text-blue-600' : 'text-gray-500'}>Sobra: {formatarMoeda(faltaMisto < 0 ? Math.abs(faltaMisto) : 0)}</span>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setContaParaPagar(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-3 rounded-xl font-bold transition">Voltar</button>
                            <button onClick={confirmarPagamento} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-black shadow-lg transition active:scale-95">Sim, Pagar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Exclusão/Estorno */}
            {contaParaApagar && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border text-center">
                        <div className="text-red-500 text-5xl mb-3">⚠️</div>
                        <h3 className="text-xl font-black text-cafe-dark mb-2">Excluir/Estornar Conta</h3>
                        <p className="text-gray-600 mb-6 text-sm px-2">Tem certeza que deseja apagar esta conta? (O valor será estornado na gaveta ou banco se já foi paga).</p>
                        <div className="flex gap-3">
                            <button onClick={() => setContaParaApagar(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 py-3 rounded-xl font-bold transition">Cancelar</button>
                            <button onClick={confirmarExclusao} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold shadow-md transition active:scale-95">Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {/* CABEÇALHO (HEADER) DA PÁGINA */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 border-b border-cafe-secondary/30 pb-4 gap-4">
                <div>
                    <h2 className="text-2xl font-black text-cafe-primary uppercase tracking-wider">Gestão Financeira</h2>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Contas a Pagar & Fluxo de Caixa</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                    <button onClick={abrirHistoricoCaixas} className="flex-1 lg:flex-none justify-center bg-white text-gray-700 border border-gray-300 px-4 py-3 md:py-2 rounded-xl font-bold text-sm shadow-sm hover:bg-gray-50 transition flex items-center gap-2 active:scale-95">📋 Histórico</button>
                    <button onClick={() => setModalMovimento('suprimento')} className="flex-1 lg:flex-none justify-center bg-white text-gray-700 border border-gray-300 px-4 py-3 md:py-2 rounded-xl font-bold text-sm shadow-sm hover:bg-gray-50 transition flex items-center gap-2 active:scale-95">➕ Supri.</button>
                    <button onClick={() => setModalMovimento('sangria')} className="flex-1 lg:flex-none justify-center bg-white text-gray-700 border border-gray-300 px-4 py-3 md:py-2 rounded-xl font-bold text-sm shadow-sm hover:bg-gray-50 transition flex items-center gap-2 active:scale-95">➖ Sangria</button>
                    <button onClick={() => { setNovoSaldoBanco(saldoDigital); setModalAjusteBanco(true); }} className="w-full lg:w-auto justify-center bg-blue-600 text-white px-4 py-3 md:py-2 rounded-xl font-bold text-sm shadow-md hover:bg-blue-700 transition flex items-center gap-2 active:scale-95">🏦 Ajustar Banco</button>
                </div>
            </div>

            {/* CARDS DE INDICADORES (KPIs) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
                <div className="bg-red-50 border border-red-200 p-4 rounded-2xl shadow-sm flex flex-col justify-center text-center sm:text-left">
                    <h4 className="text-red-800 font-black text-xs uppercase tracking-wider">Total Pendente</h4>
                    <span className="text-2xl md:text-3xl font-black text-red-600 mt-1">{formatarMoeda(accountsData.totalPendente)}</span>
                </div>

                <div className={`p-4 rounded-2xl shadow-sm flex flex-col justify-center border text-center sm:text-left ${caixaAtivo ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <h4 className={`font-black text-xs uppercase tracking-wider ${caixaAtivo ? 'text-green-800' : 'text-gray-500'}`}>Em Gaveta (Físico)</h4>
                    <span className={`text-2xl md:text-3xl font-black mt-1 ${caixaAtivo ? 'text-green-600' : 'text-gray-400'}`}>
                        {caixaAtivo ? formatarMoeda(dinheiroEmCaixa) : '---'}
                    </span>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl shadow-sm flex flex-col justify-center text-center sm:text-left">
                    <h4 className="text-blue-900 font-black text-xs uppercase tracking-wider">Saldo Digital</h4>
                    <span className="text-2xl md:text-3xl font-black text-blue-700 mt-1">{formatarMoeda(saldoDigital)}</span>
                </div>

                <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl shadow-sm flex flex-col justify-center text-center sm:text-left">
                    <h4 className="text-gray-800 font-black text-xs uppercase tracking-wider">Líquido do Turno</h4>
                    <span className="text-2xl md:text-3xl font-black text-gray-700 mt-1">
                        {caixaAtivo ? formatarMoeda(accountsData.balancoGeralTurno) : '---'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* COLUNA ESQUERDA: Formulários e Resumos */}
                <div className="lg:col-span-1 flex flex-col gap-6">

                    {/* FORMULÁRIO MANUAL */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                        <h3 className="font-black text-cafe-dark text-sm uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Lançamento de Despesa</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição</label>
                                <input type="text" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-gray-50" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Conta de Luz" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fornecedor (Opcional)</label>
                                <select className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                                    <option value="">Sem fornecedor...</option>
                                    {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                                </select>
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Valor (R$)</label>
                                    <input type="number" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm font-bold bg-gray-50" value={valor} onChange={(e) => setValor(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" />
                                </div>

                                {!isRecorrente ? (
                                    <div className="flex-1 animate-fade-in">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vencimento</label>
                                        <input type="date" className="w-full p-3 md:p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-secondary text-base md:text-sm bg-gray-50" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} />
                                    </div>
                                ) : (
                                    <div className="flex-1 animate-fade-in">
                                        <label className="block text-xs font-bold text-cafe-primary uppercase mb-1">Dia Venc.</label>
                                        <input type="number" min="1" max="31" placeholder="Ex: 10" className="w-full p-3 md:p-2.5 border border-cafe-secondary rounded-lg outline-none focus:ring-2 focus:ring-cafe-primary font-bold text-center text-base md:text-sm bg-cafe-bg/20" value={diaVencimentoRecorrente} onChange={(e) => setDiaVencimentoRecorrente(e.target.value === '' ? '' : Number(e.target.value))} />
                                    </div>
                                )}
                            </div>

                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-inner">
                                <label className="flex items-center gap-3 cursor-pointer select-none">
                                    <input type="checkbox" className="w-5 h-5 text-cafe-primary rounded border-gray-300" checked={isRecorrente} onChange={(e) => { setIsRecorrente(e.target.checked); setDataVencimento(''); }} />
                                    <span className="text-sm font-bold text-gray-700">Lançamento Recorrente</span>
                                </label>
                                {isRecorrente && (
                                    <div className="flex items-center gap-3 animate-fade-in mt-3 pt-3 border-t border-gray-200">
                                        <span className="text-xs font-bold text-gray-500 uppercase">Repetir por:</span>
                                        <input type="number" min="2" max="24" className="w-20 p-2.5 md:p-2 border border-cafe-secondary rounded-lg text-center font-black outline-none focus:ring-2 focus:ring-cafe-primary text-base md:text-sm" value={numMeses} onChange={(e) => setNumMeses(e.target.value === '' ? '' : Number(e.target.value))} />
                                        <span className="text-xs font-bold text-gray-600 uppercase">meses</span>
                                    </div>
                                )}
                            </div>

                            <button onClick={lancarContaManual} className="w-full bg-cafe-primary text-white font-black uppercase tracking-wider py-4 md:py-3.5 rounded-xl shadow-md mt-2 hover:bg-cafe-dark transition active:scale-95 text-sm">
                                Lançar Conta
                            </button>
                        </div>
                    </div>

                    {/* RECEBIMENTOS DO TURNO */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                        <h3 className="font-black text-gray-800 mb-4 border-b border-gray-100 pb-2 text-sm uppercase tracking-wider">Resumo de Entradas (Turno)</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg"><span className="text-sm text-gray-600 font-bold">📱 PIX</span><span className="font-black text-gray-800">{formatarMoeda(totaisVendas.pix)}</span></div>
                            <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg"><span className="text-sm text-gray-600 font-bold">💵 Dinheiro</span><span className="font-black text-green-700">{formatarMoeda(totaisVendas.din)}</span></div>
                            <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg"><span className="text-sm text-gray-600 font-bold">💳 C. Crédito</span><span className="font-black text-gray-800">{formatarMoeda(totaisVendas.cred)}</span></div>
                            <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg"><span className="text-sm text-gray-600 font-bold">💳 C. Débito</span><span className="font-black text-gray-800">{formatarMoeda(totaisVendas.deb)}</span></div>

                            <div className="pt-3 mt-3 border-t-2 border-dashed border-gray-200 space-y-2">
                                <div className="flex justify-between items-center bg-green-50 p-3 rounded-xl border border-green-100">
                                    <span className="text-xs text-green-800 font-black uppercase tracking-wider">Bruto Total</span>
                                    <span className="font-black text-lg text-green-600">{formatarMoeda(totaisVendas.total)}</span>
                                </div>
                                <div className="flex justify-between items-center bg-red-50 p-3 rounded-xl border border-red-100">
                                    <span className="text-xs text-red-800 font-black uppercase tracking-wider">Despesas Paga</span>
                                    <span className="font-black text-lg text-red-500">-{formatarMoeda(accountsData.totalPagasHoje)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* COLUNA DIREITA: Tabelas */}
                <div className="lg:col-span-2 flex flex-col gap-6">

                    {/* Contas Pendentes */}
                    <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden h-fit">
                        <div className="p-4 border-b border-gray-100 bg-red-50/30">
                            <h3 className="font-black text-red-700 text-sm uppercase tracking-wider">Contas Pendentes</h3>
                        </div>

                        {/* VIEW MOBILE: Cards Pendentes */}
                        <div className="md:hidden space-y-3 p-3 max-h-[50vh] overflow-y-auto bg-gray-50/50">
                            {accountsData.contasPendentes.map(conta => (
                                <div key={conta.id} className="bg-white p-4 rounded-xl border border-red-100 shadow-sm flex flex-col gap-3 relative">
                                    <button onClick={() => setContaParaApagar(conta)} className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 bg-gray-50 rounded-lg font-black transition">✕</button>
                                    <div className="pr-8">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-50 px-2 py-0.5 rounded-md inline-block mb-1.5">{formatarData(conta.data_vencimento)}</span>
                                        <h4 className="font-bold text-gray-800 text-base leading-tight">{conta.descricao}</h4>
                                        {conta.fornecedores?.nome && <span className="text-xs font-semibold text-gray-500 mt-1 block">{conta.fornecedores.nome}</span>}
                                    </div>
                                    <div className="flex justify-between items-end pt-2 border-t border-gray-100 mt-1">
                                        <span className="font-black text-xl text-cafe-dark">{formatarMoeda(conta.valor)}</span>
                                        <div className="flex gap-2">
                                            <button onClick={() => abrirModalEdicao(conta)} className="bg-blue-50 text-blue-700 font-bold px-3 py-2.5 rounded-lg border border-blue-200 shadow-sm active:scale-95 transition text-sm">Editar</button>
                                            <button onClick={() => abrirModalPagamento(conta)} className="bg-green-50 text-green-700 font-bold px-4 py-2.5 rounded-lg border border-green-200 shadow-sm active:scale-95 transition text-sm">Dar Baixa</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {accountsData.contasPendentes.length === 0 && <p className="text-center text-gray-400 italic text-sm py-8">Nenhuma conta pendente.</p>}
                        </div>

                        {/* VIEW DESKTOP: Tabela Pendentes */}
                        <div className="hidden md:block overflow-auto max-h-[350px] custom-scrollbar">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead className="bg-gray-50 border-b sticky top-0 z-10 text-xs text-gray-500 uppercase tracking-wider">
                                    <tr><th className="p-4 font-bold">Vencimento</th><th className="p-4 font-bold">Descrição</th><th className="p-4 font-bold text-right">Valor</th><th className="p-4 font-bold text-center">Ações</th></tr>
                                </thead>
                                <tbody>
                                    {accountsData.contasPendentes.map(conta => (
                                        <tr key={conta.id} className="border-b hover:bg-gray-50 transition">
                                            <td className="p-4 font-black text-red-500">{formatarData(conta.data_vencimento)}</td>
                                            <td className="p-4"><span className="font-bold text-gray-800 block">{conta.descricao}</span>{conta.fornecedores?.nome && <span className="text-xs text-gray-500 font-semibold">{conta.fornecedores.nome}</span>}</td>
                                            <td className="p-4 font-black text-gray-800 text-right text-base">{formatarMoeda(conta.valor)}</td>
                                            <td className="p-4 text-center space-x-2">
                                                <button onClick={() => abrirModalEdicao(conta)} className="text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-bold text-xs border border-blue-200 transition shadow-sm">Editar</button>
                                                <button onClick={() => abrirModalPagamento(conta)} className="text-green-700 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 font-bold text-xs border border-green-200 transition shadow-sm">Dar Baixa</button>
                                                <button onClick={() => setContaParaApagar(conta)} className="text-gray-400 font-black hover:text-red-500 text-base px-2 py-1 bg-gray-50 rounded-lg transition">✕</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {accountsData.contasPendentes.length === 0 && (<tr><td colSpan={4} className="p-8 text-center text-gray-400 italic">Nenhuma conta pendente.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Histórico de Pagamentos */}
                    <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden h-fit">
                        <div className="p-4 border-b border-gray-100 bg-green-50/30">
                            <h3 className="font-black text-green-700 text-sm uppercase tracking-wider">Histórico de Pagamentos</h3>
                        </div>

                        {/* VIEW MOBILE: Cards Pagos */}
                        <div className="md:hidden space-y-3 p-3 max-h-[40vh] overflow-y-auto bg-gray-50/50">
                            {accountsData.contasPagas.map(conta => (
                                <div key={conta.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2 opacity-90">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="text-green-600 font-black text-xs block mb-1">{formatarData(conta.data_pagamento || '')}</span>
                                            <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">{conta.metodo_pagamento || 'N/A'}</span>
                                        </div>
                                        <span className="font-black text-gray-700 text-lg">{formatarMoeda(conta.valor)}</span>
                                    </div>
                                    <div className="mt-1">
                                        <h4 className="font-bold text-gray-800 text-sm">{conta.descricao}</h4>
                                        {conta.fornecedores?.nome && <span className="text-xs font-semibold text-gray-500 block">{conta.fornecedores.nome}</span>}
                                    </div>
                                    <div className="pt-2 border-t border-gray-100 mt-1 flex justify-end">
                                        <button onClick={() => setContaParaApagar(conta)} className="text-red-500 font-bold text-xs bg-red-50 px-3 py-2 rounded-lg border border-red-100 active:scale-95 transition uppercase tracking-wider">Estornar</button>
                                    </div>
                                </div>
                            ))}
                            {accountsData.contasPagas.length === 0 && <p className="text-center text-gray-400 italic text-sm py-8">Nenhum pagamento efetuado.</p>}
                        </div>

                        {/* VIEW DESKTOP: Tabela Pagos */}
                        <div className="hidden md:block overflow-auto max-h-[300px] custom-scrollbar">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead className="bg-gray-50 border-b sticky top-0 z-10 text-xs text-gray-500 uppercase tracking-wider">
                                    <tr><th className="p-4 font-bold">Data/Forma</th><th className="p-4 font-bold">Descrição</th><th className="p-4 font-bold text-right">Valor</th><th className="p-4 font-bold text-center">Ação</th></tr>
                                </thead>
                                <tbody>
                                    {accountsData.contasPagas.map(conta => (
                                        <tr key={conta.id} className="border-b hover:bg-gray-50 transition opacity-90">
                                            <td className="p-4 text-gray-700">
                                                <div className="font-black text-green-600">{conta.data_pagamento ? formatarData(conta.data_pagamento) : '-'}</div>
                                                {conta.metodo_pagamento && <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-md mt-1 inline-block uppercase tracking-wider">{conta.metodo_pagamento}</span>}
                                            </td>
                                            <td className="p-4 text-gray-800 font-bold">{conta.descricao} {conta.fornecedores?.nome && <span className="text-xs text-gray-500 font-semibold block">Fornec: {conta.fornecedores.nome}</span>}</td>
                                            <td className="p-4 font-black text-gray-700 text-right text-base">{formatarMoeda(conta.valor)}</td>
                                            <td className="p-4 text-center">
                                                <button onClick={() => setContaParaApagar(conta)} className="text-red-500 hover:text-red-700 font-bold text-xs uppercase tracking-wider bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition">Estornar</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {accountsData.contasPagas.length === 0 && (<tr><td colSpan={4} className="p-8 text-center text-gray-400 italic">Nenhum pagamento efetuado.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}