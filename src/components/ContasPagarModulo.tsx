import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type Conta = {
    id: string;
    descricao: string;
    fornecedor_id: string | null;
    valor: number;
    data_vencimento: string;
    data_pagamento: string | null;
    status: string;
    fornecedores: { nome: string } | null;
};

type Fornecedor = { id: string; nome: string };

export default function ContasPagarModulo() {
    const [contas, setContas] = useState<Conta[]>([]);
    const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
    const [carregando, setCarregando] = useState(true);

    // Estados do Formulário Manual
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
        setCarregando(false);
    };

    useEffect(() => { carregarDados(); }, []);

    const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
    const formatarData = (dataIso: string) => new Date(dataIso + 'T00:00:00Z').toLocaleDateString('pt-BR');

    const lancarContaManual = async () => {
        if (!descricao || !valor) return mostrarMensagem('Preencha a descrição e o valor.', 'aviso');
        if (!isRecorrente && !dataVencimento) return mostrarMensagem('Selecione a data de vencimento.', 'aviso');
        if (isRecorrente && !diaVencimentoRecorrente) return mostrarMensagem('Informe o dia de vencimento mensal.', 'aviso');

        try {
            const payloads = [];
            const loops = isRecorrente ? (Number(numMeses) || 1) : 1;
            const hoje = new Date();

            if (!isRecorrente) {
                // Fluxo Único Comum
                payloads.push({
                    descricao,
                    fornecedor_id: fornecedorId || null,
                    valor: Number(valor),
                    data_vencimento: dataVencimento,
                    status: 'Pendente'
                });
            } else {
                // Fluxo Recorrente com Cálculo de Mês Inteligente
                const diaEscolhido = Number(diaVencimentoRecorrente);
                const diaAtual = hoje.getDate();

                // Se já passou do dia no mês atual, começa no próximo mês (+1), senão começa no atual (+0)
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
        try {
            const dataHoje = new Date().toISOString().split('T')[0];
            await supabase.from('contas_pagar').update({ status: 'Pago', data_pagamento: dataHoje }).eq('id', contaParaPagar.id);
            mostrarMensagem('Conta marcada como PAGA!', 'sucesso');
            carregarDados();
        } catch (error) { mostrarMensagem('Erro ao pagar conta.', 'erro'); }
        finally { setContaParaPagar(null); }
    };

    const confirmarExclusao = async () => {
        if (!contaParaApagar) return;
        try {
            await supabase.from('contas_pagar').delete().eq('id', contaParaApagar.id);
            mostrarMensagem('Conta removida.', 'sucesso');
            carregarDados();
        } catch (error) { mostrarMensagem('Erro ao excluir conta.', 'erro'); }
        finally { setContaParaApagar(null); }
    };

    const contasPendentes = contas.filter(c => c.status === 'Pendente');
    const contasPagas = contas.filter(c => c.status === 'Pago');
    const totalPendente = contasPendentes.reduce((acc, c) => acc + c.valor, 0);

    if (carregando) return <div className="text-center py-10 font-bold text-cafe-primary animate-pulse">A carregar o financeiro...</div>;

    return (
        <div className="max-w-6xl mx-auto p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-8 relative">
            {feedback.tipo && (
                <div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg transition-all ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    <span className="font-semibold">{feedback.msg}</span>
                </div>
            )}

            {/* Modais de Confirmação */}
            {contaParaPagar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-xl font-bold text-cafe-dark mb-2">Dar Baixa na Conta</h3><p className="text-gray-600 mb-6 text-sm">Confirma o pagamento de <strong>{formatarMoeda(contaParaPagar.valor)}</strong> para <strong>{contaParaPagar.descricao}</strong>?</p><div className="flex gap-3"><button onClick={() => setContaParaPagar(null)} className="flex-1 bg-gray-100 py-2 rounded font-semibold">Voltar</button><button onClick={confirmarPagamento} className="flex-1 bg-green-600 text-white py-2 rounded font-semibold">Sim, Pago</button></div></div></div>
            )}
            {contaParaApagar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-xl font-bold text-cafe-dark mb-2">Excluir Conta</h3><p className="text-gray-600 mb-6 text-sm">Tem certeza que deseja apagar o registro desta conta?</p><div className="flex gap-3"><button onClick={() => setContaParaApagar(null)} className="flex-1 bg-gray-100 py-2 rounded font-semibold">Cancelar</button><button onClick={confirmarExclusao} className="flex-1 bg-red-600 text-white py-2 rounded font-semibold">Sim, Excluir</button></div></div></div>
            )}

            <h2 className="text-2xl font-bold text-cafe-primary mb-6 border-b border-cafe-secondary/30 pb-2">Contas a Pagar (Financeiro)</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* FORMULÁRIO INTELIGENTE */}
                <div className="lg:col-span-1 space-y-4 bg-cafe-bg p-4 rounded-lg border border-gray-200 h-fit shadow-sm">
                    <h3 className="font-semibold text-cafe-dark mb-3 border-b pb-1">Lançamento de Despesa</h3>
                    <div><label className="block text-sm font-semibold mb-1">Descrição</label><input type="text" className="w-full p-2 border rounded outline-none" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
                    <div>
                        <label className="block text-sm font-semibold mb-1">Fornecedor (Opcional)</label>
                        <select className="w-full p-2 border rounded bg-white outline-none" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                            <option value="">Sem fornecedor específico</option>
                            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <div className="flex-1"><label className="block text-sm font-semibold mb-1">Valor (R$)</label><input type="number" className="w-full p-2 border rounded outline-none" value={valor} onChange={(e) => setValor(Number(e.target.value))} /></div>

                        {/* CONDICIONAL: Troca Data Completa pelo Dia Numérico */}
                        {!isRecorrente ? (
                            <div className="flex-1 animate-fade-in"><label className="block text-sm font-semibold mb-1">Vencimento</label><input type="date" className="w-full p-2 border rounded outline-none text-xs h-[38px]" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} /></div>
                        ) : (
                            <div className="flex-1 animate-fade-in"><label className="block text-sm font-semibold mb-1">Dia Venc.</label><input type="number" min="1" max="31" placeholder="Ex: 10" className="w-full p-2 border rounded outline-none font-bold text-center" value={diaVencimentoRecorrente} onChange={(e) => setDiaVencimentoRecorrente(Number(e.target.value))} /></div>
                        )}
                    </div>

                    <div className="bg-white p-3 rounded-lg border space-y-3 mt-2 shadow-inner">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" className="w-4 h-4 text-cafe-primary rounded border-gray-300" checked={isRecorrente} onChange={(e) => { setIsRecorrente(e.target.checked); setDataVencimento(''); }} />
                            <span className="text-sm font-bold text-gray-700">Lançar conta fixa recorrente</span>
                        </label>
                        {isRecorrente && (
                            <div className="flex items-center gap-2 animate-fade-in">
                                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Repetir pelos próximos:</span>
                                <input type="number" min="2" max="24" className="w-16 p-1 border rounded text-center font-bold outline-none" value={numMeses} onChange={(e) => setNumMeses(Number(e.target.value))} />
                                <span className="text-xs font-bold text-gray-600">meses</span>
                            </div>
                        )}
                    </div>

                    <button onClick={lancarContaManual} className="w-full bg-cafe-primary text-white font-bold py-2.5 rounded shadow mt-2 hover:bg-cafe-dark transition">Lançar Conta</button>
                </div>

                {/* TABELAS */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-red-50 border border-red-200 p-4 rounded-lg shadow-sm flex justify-between items-center">
                        <div><h4 className="text-red-800 font-bold text-lg">Total Pendente</h4><p className="text-sm text-red-600">Contas não pagas</p></div>
                        <span className="text-3xl font-black text-red-600">{formatarMoeda(totalPendente)}</span>
                    </div>

                    <div>
                        <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-4">Contas Pendentes</h3>
                        <div className="bg-white rounded-lg border overflow-hidden shadow-sm overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-max text-sm">
                                <thead className="bg-cafe-bg border-b">
                                    <tr><th className="p-3 font-semibold text-cafe-primary">Vencimento</th><th className="p-3 font-semibold text-cafe-primary">Descrição</th><th className="p-3 font-semibold text-cafe-primary text-right">Valor</th><th className="p-3 font-semibold text-center text-cafe-primary">Ações</th></tr>
                                </thead>
                                <tbody>
                                    {contasPendentes.map(conta => (
                                        <tr key={conta.id} className="border-b hover:bg-gray-50">
                                            <td className="p-3 font-bold text-red-600">{formatarData(conta.data_vencimento)}</td>
                                            <td className="p-3"><span className="font-semibold text-cafe-dark block">{conta.descricao}</span>{conta.fornecedores?.nome && <span className="text-xs text-gray-500">{conta.fornecedores.nome}</span>}</td>
                                            <td className="p-3 font-bold text-cafe-dark text-right">{formatarMoeda(conta.valor)}</td>
                                            <td className="p-3 text-center space-x-2">
                                                <button onClick={() => setContaParaPagar(conta)} className="text-green-600 bg-green-50 px-2 py-1 rounded hover:bg-green-100 font-bold text-xs">Dar Baixa</button>
                                                <button onClick={() => setContaParaApagar(conta)} className="text-red-400 font-black hover:text-red-600 text-base px-1">×</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {contasPendentes.length === 0 && (<tr><td colSpan={4} className="p-6 text-center text-gray-500 italic">Nenhuma conta pendente.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-4">Histórico de Pagamentos</h3>
                        <div className="bg-white rounded-lg border overflow-hidden shadow-sm overflow-x-auto max-h-64">
                            <table className="w-full text-left border-collapse min-w-max text-sm">
                                <thead className="bg-gray-100 border-b">
                                    <tr><th className="p-3 font-semibold text-gray-600">Pago em</th><th className="p-3 font-semibold text-gray-600">Descrição</th><th className="p-3 font-semibold text-gray-600 text-right">Valor</th><th className="p-3 font-semibold text-center text-gray-600">Estornar</th></tr>
                                </thead>
                                <tbody>
                                    {contasPagas.map(conta => (
                                        <tr key={conta.id} className="border-b hover:bg-gray-50 opacity-80">
                                            <td className="p-3 text-green-700 font-semibold">{conta.data_pagamento ? formatarData(conta.data_pagamento) : '-'}</td>
                                            <td className="p-3 text-gray-700">{conta.descricao} {conta.fornecedores?.nome && <span className="text-xs text-gray-400">({conta.fornecedores.nome})</span>}</td>
                                            <td className="p-3 font-semibold text-gray-600 text-right">{formatarMoeda(conta.valor)}</td>
                                            <td className="p-3 text-center"><button onClick={() => setContaParaApagar(conta)} className="text-gray-400 hover:text-red-500 font-black text-base px-2">×</button></td>
                                        </tr>
                                    ))}
                                    {contasPagas.length === 0 && (<tr><td colSpan={4} className="p-4 text-center text-gray-400 italic">Nenhum pagamento efetuado.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}