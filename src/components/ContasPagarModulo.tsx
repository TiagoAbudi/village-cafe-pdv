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
    const formatarData = (dataIso: string) => {
        // Adiciona o timezone zero para evitar que a data recue 1 dia devido ao fuso horário
        return new Date(dataIso + 'T00:00:00Z').toLocaleDateString('pt-BR');
    };

    const lancarContaManual = async () => {
        if (!descricao || !valor || !dataVencimento) return mostrarMensagem('Preencha descrição, valor e vencimento.', 'aviso');

        try {
            const { error } = await supabase.from('contas_pagar').insert([{
                descricao,
                fornecedor_id: fornecedorId || null,
                valor: Number(valor),
                data_vencimento: dataVencimento,
                status: 'Pendente'
            }]);
            if (error) throw error;

            mostrarMensagem('Conta lançada com sucesso!', 'sucesso');
            setDescricao(''); setValor(''); setDataVencimento(''); setFornecedorId('');
            carregarDados();
        } catch (error) { mostrarMensagem('Erro ao lançar conta.', 'erro'); }
    };

    const confirmarPagamento = async () => {
        if (!contaParaPagar) return;
        try {
            const dataHoje = new Date().toISOString().split('T')[0]; // Pega YYYY-MM-DD
            const { error } = await supabase.from('contas_pagar')
                .update({ status: 'Pago', data_pagamento: dataHoje })
                .eq('id', contaParaPagar.id);

            if (error) throw error;
            mostrarMensagem('Conta marcada como PAGA!', 'sucesso');
            carregarDados();
        } catch (error) { mostrarMensagem('Erro ao pagar conta.', 'erro'); }
        finally { setContaParaPagar(null); }
    };

    const confirmarExclusao = async () => {
        if (!contaParaApagar) return;
        try {
            const { error } = await supabase.from('contas_pagar').delete().eq('id', contaParaApagar.id);
            if (error) throw error;
            mostrarMensagem('Conta excluída do sistema.', 'sucesso');
            carregarDados();
        } catch (error) { mostrarMensagem('Erro ao excluir conta.', 'erro'); }
        finally { setContaParaApagar(null); }
    };

    const contasPendentes = contas.filter(c => c.status === 'Pendente');
    const contasPagas = contas.filter(c => c.status === 'Pago');
    const totalPendente = contasPendentes.reduce((acc, c) => acc + c.valor, 0);

    if (carregando) return <div className="text-center py-10 font-bold text-cafe-primary animate-pulse">A carregar informações do financeiro...</div>;

    return (
        <div className="max-w-6xl mx-auto p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-8 relative">
            {feedback.tipo && (
                <div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg transition-all ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    <span className="font-semibold">{feedback.msg}</span>
                </div>
            )}

            {/* Modal de Pagamento */}
            {contaParaPagar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-xl font-bold text-cafe-dark mb-2">Dar Baixa na Conta</h3><p className="text-gray-600 mb-6 text-sm">Confirma o pagamento de <strong>{formatarMoeda(contaParaPagar.valor)}</strong> referente a <strong>{contaParaPagar.descricao}</strong>?</p><div className="flex gap-3"><button onClick={() => setContaParaPagar(null)} className="flex-1 bg-gray-100 py-2 rounded font-semibold transition">Voltar</button><button onClick={confirmarPagamento} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded font-semibold transition shadow">Sim, Pago</button></div></div></div>
            )}

            {/* Modal de Exclusão */}
            {contaParaApagar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-xl font-bold text-cafe-dark mb-2">Excluir Conta</h3><p className="text-gray-600 mb-6 text-sm">Tem certeza que deseja apagar o registro desta conta?</p><div className="flex gap-3"><button onClick={() => setContaParaApagar(null)} className="flex-1 bg-gray-100 py-2 rounded font-semibold transition">Cancelar</button><button onClick={confirmarExclusao} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded font-semibold transition shadow">Sim, Excluir</button></div></div></div>
            )}

            <h2 className="text-2xl font-bold text-cafe-primary mb-6 border-b border-cafe-secondary/30 pb-2">Contas a Pagar (Financeiro)</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Formulário de Lançamento Manual */}
                <div className="lg:col-span-1 space-y-4 bg-cafe-bg p-4 rounded-lg border border-gray-200 h-fit">
                    <h3 className="font-semibold text-cafe-dark mb-3">Lançamento Manual</h3>
                    <div><label className="block text-sm font-semibold mb-1">Descrição (Ex: Conta de Luz)</label><input type="text" className="w-full p-2 border rounded outline-none" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
                    <div>
                        <label className="block text-sm font-semibold mb-1">Fornecedor (Opcional)</label>
                        <select className="w-full p-2 border rounded bg-white outline-none" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                            <option value="">Sem fornecedor específico</option>
                            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1"><label className="block text-sm font-semibold mb-1">Valor (R$)</label><input type="number" className="w-full p-2 border rounded outline-none" value={valor} onChange={(e) => setValor(Number(e.target.value))} /></div>
                        <div className="flex-1"><label className="block text-sm font-semibold mb-1">Vencimento</label><input type="date" className="w-full p-2 border rounded outline-none" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} /></div>
                    </div>
                    <button onClick={lancarContaManual} className="w-full bg-cafe-primary text-white font-bold py-2 rounded shadow mt-2 hover:bg-cafe-dark transition">Lançar Conta</button>
                </div>

                {/* Listagem de Contas */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Card Resumo */}
                    <div className="bg-red-50 border border-red-200 p-4 rounded-lg shadow-sm flex justify-between items-center">
                        <div>
                            <h4 className="text-red-800 font-bold text-lg">Total Pendente</h4>
                            <p className="text-sm text-red-600">Soma de todas as contas não pagas</p>
                        </div>
                        <span className="text-3xl font-black text-red-600">{formatarMoeda(totalPendente)}</span>
                    </div>

                    <div>
                        <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-4">Contas Pendentes (Em Aberto)</h3>
                        <div className="bg-white rounded-lg border overflow-hidden shadow-sm overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-max text-sm">
                                <thead className="bg-cafe-bg border-b">
                                    <tr><th className="p-3 font-semibold text-cafe-primary">Vencimento</th><th className="p-3 font-semibold text-cafe-primary">Descrição</th><th className="p-3 font-semibold text-cafe-primary text-right">Valor</th><th className="p-3 font-semibold text-center text-cafe-primary">Ações</th></tr>
                                </thead>
                                <tbody>
                                    {contasPendentes.map(conta => (
                                        <tr key={conta.id} className="border-b hover:bg-gray-50 transition-colors">
                                            <td className="p-3 font-bold text-red-600">{formatarData(conta.data_vencimento)}</td>
                                            <td className="p-3">
                                                <span className="font-semibold text-cafe-dark block">{conta.descricao}</span>
                                                {conta.fornecedores?.nome && <span className="text-xs text-gray-500">{conta.fornecedores.nome}</span>}
                                            </td>
                                            <td className="p-3 font-bold text-cafe-dark text-right">{formatarMoeda(conta.valor)}</td>
                                            <td className="p-3 text-center space-x-2">
                                                <button onClick={() => setContaParaPagar(conta)} className="text-green-600 bg-green-50 px-2 py-1 rounded hover:bg-green-100 font-bold text-xs">Dar Baixa</button>
                                                <button onClick={() => setContaParaApagar(conta)} className="text-red-500 font-bold px-2 text-lg">x</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {contasPendentes.length === 0 && (<tr><td colSpan={4} className="p-6 text-center text-gray-500 italic">Nenhuma conta pendente no momento. Que alívio!</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold text-cafe-dark text-lg border-b pb-2 mb-4">Contas Pagas (Histórico)</h3>
                        <div className="bg-white rounded-lg border overflow-hidden shadow-sm overflow-x-auto max-h-64">
                            <table className="w-full text-left border-collapse min-w-max text-sm">
                                <thead className="bg-gray-100 border-b">
                                    <tr><th className="p-3 font-semibold text-gray-600">Pago em</th><th className="p-3 font-semibold text-gray-600">Descrição</th><th className="p-3 font-semibold text-gray-600 text-right">Valor</th></tr>
                                </thead>
                                <tbody>
                                    {contasPagas.map(conta => (
                                        <tr key={conta.id} className="border-b hover:bg-gray-50 opacity-80">
                                            <td className="p-3 text-green-700 font-semibold">{conta.data_pagamento ? formatarData(conta.data_pagamento) : '-'}</td>
                                            <td className="p-3 text-gray-700">{conta.descricao} {conta.fornecedores?.nome && <span className="text-xs ml-1">({conta.fornecedores.nome})</span>}</td>
                                            <td className="p-3 font-semibold text-gray-600 text-right">{formatarMoeda(conta.valor)}</td>
                                        </tr>
                                    ))}
                                    {contasPagas.length === 0 && (<tr><td colSpan={3} className="p-4 text-center text-gray-400 italic">Nenhum histórico de pagamentos.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}