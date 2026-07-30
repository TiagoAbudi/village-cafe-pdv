import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

type Produto = { id: string; nome: string; preco_venda: number; tipo: string; is_receita?: boolean; quantidade_estoque: number };
type ItemComanda = { id: string; produto_id: string; quantidade: number; preco_unitario: number; produtos: { nome: string } };
type Comanda = { id: string; identificacao: string; nome_cliente: string; status: string; atendente: string; created_at: string; itens_comanda: ItemComanda[] };
type PagamentoMisto = { metodo: string; valor: number | '' };

interface GestaoComandasProps {
    atendente: string;
}

export default function GestaoComandas({ atendente }: GestaoComandasProps) {
    const [caixaAberto, setCaixaAberto] = useState<boolean | null>(null);
    const [comandas, setComandas] = useState<Comanda[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });

    // Estados Nova Comanda
    const [modalNova, setModalNova] = useState(false);
    const [novaIdentificacao, setNovaIdentificacao] = useState('');
    const [novoCliente, setNovoCliente] = useState('');

    // Estados Gestão da Comanda (Adicionar Itens)
    const [comandaAberta, setComandaAberta] = useState<Comanda | null>(null);
    const [quantidadeAdd] = useState<number | ''>(1);

    // Estados Checkout (Pagamento)
    const [modalCheckout, setModalCheckout] = useState(false);
    const [modoPagamento, setModoPagamento] = useState<'unico' | 'misto'>('unico');
    const [metodoUnico, setMetodoUnico] = useState('PIX');
    const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState<number | ''>('');
    const [desconto, setDesconto] = useState<number | ''>(''); // NOVO: Desconto da Comanda

    const [pagamentosMistos, setPagamentosMistos] = useState<PagamentoMisto[]>([
        { metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }
    ]);
    const [confirmacao, setConfirmacao] = useState<{ visivel: boolean; titulo: string; msg: string; onConfirm: () => void } | null>(null);

    const [buscaProduto, setBuscaProduto] = useState('');

    const produtosFiltrados = useMemo(() => {
        return produtos.filter(produto =>
            produto.nome
                .toLowerCase()
                .includes(buscaProduto.toLowerCase())
        );
    }, [produtos, buscaProduto]);

    const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
        setFeedback({ msg, tipo });
        setTimeout(() => setFeedback({ msg: '', tipo: null }), 4000);
    };

    const carregarDados = async (silencioso = false) => {
        if (!silencioso) setCarregando(true);

        const { data: caixaData } = await supabase.from('controle_caixa').select('id').eq('status', 'aberto').limit(1).maybeSingle();
        if (!caixaData) {
            setCaixaAberto(false);
            if (!silencioso) setCarregando(false);
            return;
        }
        setCaixaAberto(true);

        const { data: comandasData } = await supabase
            .from('comandas')
            .select('*, itens_comanda(*, produtos(nome))')
            .eq('status', 'aberta')
            .order('created_at', { ascending: true });

        if (comandasData) setComandas(comandasData as unknown as Comanda[]);

        const { data: prodData } = await supabase.from('produtos').select('*').eq('tipo', 'venda').eq('ativo', true).order('nome');
        const { data: fichas } = await supabase.from('fichas_tecnicas').select('produto_venda_id');
        const fichasIds = new Set(fichas?.map(f => f.produto_venda_id) || []);

        if (prodData) {
            setProdutos(prodData.map(p => ({ ...p, is_receita: fichasIds.has(p.id) })));
        }

        if (!silencioso) setCarregando(false);
    };

    useEffect(() => { carregarDados(); }, []);

    // ---------- FUNÇÕES DE COMANDA ----------

    const criarComanda = async () => {
        if (!novaIdentificacao) return mostrarMensagem('Informe a identificação (ex: Mesa 1).', 'aviso');
        try {
            const { error } = await supabase.from('comandas').insert([{
                identificacao: novaIdentificacao, nome_cliente: novoCliente || 'Não informado', atendente
            }]);
            if (error) throw error;
            mostrarMensagem('Comanda aberta com sucesso!', 'sucesso');
            setModalNova(false); setNovaIdentificacao(''); setNovoCliente('');
            carregarDados(true);
        } catch (error) { mostrarMensagem('Erro ao abrir comanda.', 'erro'); }
    };

    const adicionarItem = async (produto: Produto) => {
        if (!comandaAberta) return;
        const qtdAdicionar = Number(quantidadeAdd) || 1;

        const itemExistente = comandaAberta.itens_comanda.find(item => item.produto_id === produto.id);
        const qtdJaNaComanda = itemExistente ? itemExistente.quantidade : 0;
        const novaQtdTotal = qtdJaNaComanda + qtdAdicionar;

        if (!produto.is_receita && produto.quantidade_estoque < novaQtdTotal) {
            return mostrarMensagem(`Estoque insuficiente. (${produto.quantidade_estoque} un)`, 'aviso');
        }

        try {
            if (itemExistente) {
                await supabase.from('itens_comanda').update({ quantidade: novaQtdTotal }).eq('id', itemExistente.id);
            } else {
                await supabase.from('itens_comanda').insert([{
                    comanda_id: comandaAberta.id, produto_id: produto.id,
                    quantidade: qtdAdicionar, preco_unitario: produto.preco_venda
                }]);
            }

            const { data: comandaAtualizada } = await supabase.from('comandas').select('*, itens_comanda(*, produtos(nome))').eq('id', comandaAberta.id).single();
            if (comandaAtualizada) setComandaAberta(comandaAtualizada as unknown as Comanda);
            carregarDados(true);
        } catch (error) { mostrarMensagem('Erro ao adicionar item.', 'erro'); }
    };

    const removerItem = async (itemId: string) => {
        try {
            await supabase.from('itens_comanda').delete().eq('id', itemId);
            const { data: comandaAtualizada } = await supabase.from('comandas').select('*, itens_comanda(*, produtos(nome))').eq('id', comandaAberta?.id).single();
            if (comandaAtualizada) setComandaAberta(comandaAtualizada as unknown as Comanda);
            carregarDados(true);
        } catch (error) { mostrarMensagem('Erro ao remover item.', 'erro'); }
    };

    const alterarQuantidadeItem = async (itemId: string, quantidadeAtual: number, delta: number) => {
        try {
            const novaQuantidade = quantidadeAtual + delta;

            if (novaQuantidade <= 0) {
                await supabase.from('itens_comanda').delete().eq('id', itemId);
            } else {
                await supabase.from('itens_comanda').update({ quantidade: novaQuantidade }).eq('id', itemId);
            }

            const { data: comandaAtualizada } = await supabase.from('comandas').select('*, itens_comanda(*, produtos(nome))').eq('id', comandaAberta?.id).single();
            if (comandaAtualizada) setComandaAberta(comandaAtualizada as unknown as Comanda);
            carregarDados(true);

        } catch (error) {
            mostrarMensagem('Erro ao alterar quantidade.', 'erro');
        }
    };

    // ---------- FUNÇÕES DE CHECKOUT ----------

    // ATUALIZADO: Cálculos agora consideram o desconto
    const subtotalComandaAberta = useMemo(() => {
        return comandaAberta?.itens_comanda.reduce((acc, item) => acc + (item.preco_unitario * item.quantidade), 0) || 0;
    }, [comandaAberta]);

    const valorDesconto = Number(desconto) || 0;
    const totalComDesconto = Math.max(0, subtotalComandaAberta - valorDesconto); // Total final a pagar

    const totalPagoMisto = pagamentosMistos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    const faltaPagarMisto = modoPagamento === 'misto' && totalPagoMisto < totalComDesconto ? totalComDesconto - totalPagoMisto : 0;
    const trocoMisto = modoPagamento === 'misto' && totalPagoMisto > totalComDesconto ? totalPagoMisto - totalComDesconto : 0;
    const trocoUnico = modoPagamento === 'unico' && metodoUnico === 'Dinheiro' && Number(valorRecebidoDinheiro) > totalComDesconto ? Number(valorRecebidoDinheiro) - totalComDesconto : 0;

    const confirmarExclusao = () => {
        setConfirmacao({
            visivel: true,
            titulo: 'Excluir Comanda?',
            msg: 'Esta ação não pode ser desfeita. Tem certeza que deseja apagar esta mesa?',
            onConfirm: async () => {
                try {
                    const { error } = await supabase.from('comandas').delete().eq('id', comandaAberta?.id);
                    if (error) throw error;
                    mostrarMensagem('Comanda excluída!', 'sucesso');
                    setComandaAberta(null);
                    setConfirmacao(null);
                    carregarDados(true);
                } catch (error) { mostrarMensagem('Erro ao excluir.', 'erro'); }
            }
        });
    };

    const abrirCheckout = () => {
        if (!comandaAberta || comandaAberta.itens_comanda.length === 0) return mostrarMensagem('A comanda está vazia.', 'aviso');
        setModoPagamento('unico');
        setMetodoUnico('PIX');
        setValorRecebidoDinheiro('');
        setDesconto(''); // Reseta desconto ao abrir checkout
        setPagamentosMistos([{ metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }]);
        setModalCheckout(true);
    };

    const finalizarVenda = async () => {
        if (!comandaAberta) return;
        if (modoPagamento === 'misto' && totalPagoMisto < totalComDesconto) return mostrarMensagem(`Falta receber ${formatarMoeda(faltaPagarMisto)}!`, 'erro');

        let vPix = 0, vDin = 0, vCred = 0, vDeb = 0;
        let metodosStr = '';

        if (modoPagamento === 'unico') {
            vPix = metodoUnico === 'PIX' ? totalComDesconto : 0;
            vCred = metodoUnico === 'Cartão de Crédito' ? totalComDesconto : 0;
            vDeb = metodoUnico === 'Cartão de Débito' ? totalComDesconto : 0;
            vDin = metodoUnico === 'Dinheiro' ? totalComDesconto : 0;
            metodosStr = metodoUnico;
        } else {
            let trocoRestante = trocoMisto;
            pagamentosMistos.forEach(p => {
                let val = Number(p.valor) || 0;
                if (p.metodo === 'PIX') vPix += val;
                if (p.metodo === 'Cartão de Crédito') vCred += val;
                if (p.metodo === 'Cartão de Débito') vDeb += val;
                if (p.metodo === 'Dinheiro') {
                    if (trocoRestante > 0) {
                        if (val >= trocoRestante) { val -= trocoRestante; trocoRestante = 0; }
                        else { trocoRestante -= val; val = 0; }
                    }
                    vDin += val;
                }
            });
            metodosStr = Array.from(new Set(pagamentosMistos.map(p => p.metodo))).join(' + ');
        }

        try {
            // ATUALIZADO: Gravando a venda com o total final (com desconto) e a coluna de desconto
            const { data: vendaCriada, error: erroVenda } = await supabase.from('vendas').insert([{
                identificacao_pedido: `Comanda: ${comandaAberta.identificacao}`,
                total: totalComDesconto,
                desconto: valorDesconto, // Gravando desconto
                metodo_pagamento: metodosStr,
                valor_pix: vPix,
                valor_dinheiro: vDin,
                valor_cartao_credito: vCred,
                valor_cartao_debito: vDeb,
                atendente
            }]).select().single();

            if (erroVenda) throw erroVenda;

            for (const item of comandaAberta.itens_comanda) {
                await supabase.from('itens_venda').insert([{ venda_id: vendaCriada.id, produto_id: item.produto_id, quantidade: item.quantidade, preco_unitario: item.preco_unitario }]);
                const isReceita = produtos.find(p => p.id === item.produto_id)?.is_receita;

                if (isReceita) {
                    const { data: ficha } = await supabase.from('fichas_tecnicas').select('id').eq('produto_venda_id', item.produto_id).single();
                    if (ficha) {
                        const { data: ingredientes } = await supabase.from('ficha_ingredientes').select('*').eq('ficha_tecnica_id', ficha.id);
                        if (ingredientes) {
                            for (const ing of ingredientes) {
                                const qtdDescontar = Number(ing.quantidade_necessaria) * Number(item.quantidade);
                                const { data: prodBase } = await supabase.from('produtos').select('quantidade_estoque').eq('id', ing.ingrediente_id).single();
                                if (prodBase) {
                                    await supabase.from('produtos').update({ quantidade_estoque: Number(prodBase.quantidade_estoque) - qtdDescontar }).eq('id', ing.ingrediente_id);
                                    await supabase.from('movimentacoes_estoque').insert([{ produto_id: ing.ingrediente_id, quantidade: -qtdDescontar, tipo_movimento: 'Saída - Produção', motivo: `Comanda ${comandaAberta.identificacao}`, atendente }]);
                                }
                            }
                        }
                    }
                } else {
                    const { data: prodBase } = await supabase.from('produtos').select('quantidade_estoque').eq('id', item.produto_id).single();
                    if (prodBase) {
                        await supabase.from('produtos').update({ quantidade_estoque: Number(prodBase.quantidade_estoque) - Number(item.quantidade) }).eq('id', item.produto_id);
                        await supabase.from('movimentacoes_estoque').insert([{ produto_id: item.produto_id, quantidade: -Number(item.quantidade), tipo_movimento: 'Saída - Venda', motivo: `Comanda ${comandaAberta.identificacao}`, atendente }]);
                    }
                }
            }

            await supabase.from('comandas').update({ status: 'fechada' }).eq('id', comandaAberta.id);

            mostrarMensagem('Venda finalizada e estoque atualizado!', 'sucesso');
            setModalCheckout(false); setComandaAberta(null);
            carregarDados(true);

        } catch (error) { mostrarMensagem('Erro ao finalizar venda.', 'erro'); console.error(error); }
    };

    const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

    if (carregando) return <div className="text-center py-10 font-bold text-cafe-primary animate-pulse">A carregar comandas...</div>;
    if (caixaAberto === false) return (<div className="max-w-md mx-auto bg-white rounded-lg shadow-lg border border-red-200 text-center my-20 p-8"><div className="text-6xl mb-6">🔒</div><h2 className="text-2xl font-bold text-red-600">Caixa Fechado</h2><p className="text-gray-500 mt-2">Abra o caixa no Dashboard para gerir comandas.</p></div>);

    return (
        <div className="max-w-6xl mx-auto p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-8 relative">
            {feedback.tipo && (<div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}><span className="font-semibold">{feedback.msg}</span></div>)}

            {/* Modal Nova Comanda */}
            {modalNova && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                        <h3 className="text-xl font-bold text-cafe-dark mb-4 border-b pb-2">Abrir Nova Comanda</h3>
                        <div className="space-y-4 mb-6">
                            <div><label className="block text-sm font-semibold mb-1">Identificação (Mesa/Cartão)</label><input type="text" placeholder="Ex: Mesa 04" className="w-full p-2 border rounded outline-none" value={novaIdentificacao} onChange={e => setNovaIdentificacao(e.target.value)} autoFocus /></div>
                            <div><label className="block text-sm font-semibold mb-1">Nome do Cliente (Opcional)</label><input type="text" placeholder="Ex: João Silva" className="w-full p-2 border rounded outline-none" value={novoCliente} onChange={e => setNovoCliente(e.target.value)} /></div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setModalNova(false)} className="flex-1 bg-gray-100 py-2 rounded font-semibold transition hover:bg-gray-200">Cancelar</button>
                            <button onClick={criarComanda} className="flex-1 bg-cafe-primary text-white py-2 rounded font-semibold transition shadow hover:bg-cafe-dark">Abrir Comanda</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Gestão da Comanda (Adicionar Itens) */}
            {comandaAberta && !modalCheckout && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-4 md:p-6 w-full max-w-4xl h-[95vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4 border-b pb-3">
                            <div>
                                <h3 className="text-2xl font-black text-cafe-primary">{comandaAberta.identificacao}</h3>
                                <span className="text-sm text-gray-500 font-semibold">Cliente: {comandaAberta.nome_cliente}</span>
                            </div>
                            <button onClick={() => setComandaAberta(null)} className="text-gray-400 hover:text-red-500 font-bold text-xl">X</button>
                        </div>

                        <div className="mb-6">
                            <input
                                type="text"
                                placeholder="🔍 Buscar produto..."
                                value={buscaProduto}
                                onChange={(e) => setBuscaProduto(e.target.value)}
                                className="w-full p-3 border rounded-lg mb-3 outline-none focus:ring-2 focus:ring-cafe-primary"
                            />
                            <div className="space-y-2 max-h-[320px] overflow-y-auto">
                                {produtosFiltrados.map(produto => {
                                    const semEstoque = !produto.is_receita && produto.quantidade_estoque <= 0;
                                    const estoqueBaixo = !produto.is_receita && produto.quantidade_estoque > 0 && produto.quantidade_estoque <= 5;
                                    return (
                                        <div key={produto.id} className="bg-white border rounded-lg p-3 flex items-center justify-between hover:shadow-sm transition">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold truncate text-sm">{produto.nome}</h4>
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    <span className="font-bold text-cafe-primary text-sm">{formatarMoeda(produto.preco_venda)}</span>
                                                    {!produto.is_receita && (
                                                        <>
                                                            {semEstoque && <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-bold">🔴 Sem estoque</span>}
                                                            {estoqueBaixo && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-bold">🟡 {produto.quantidade_estoque} un</span>}
                                                            {!semEstoque && !estoqueBaixo && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">🟢 {produto.quantidade_estoque} un</span>}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <button onClick={() => adicionarItem(produto)} disabled={semEstoque} className={`ml-3 w-10 h-10 rounded-full font-bold text-xl flex items-center justify-center transition ${semEstoque ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-cafe-primary text-white hover:opacity-90 active:scale-95'}`}>+</button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto mb-4 border rounded p-2 bg-gray-50 min-h-[200px]">
                            {comandaAberta.itens_comanda.length === 0 ? (
                                <p className="text-center text-gray-400 italic mt-10">Nenhum item lançado ainda.</p>
                            ) : (
                                <ul className="space-y-3">
                                    {comandaAberta.itens_comanda.map(item => (
                                        <li key={item.id} className="bg-white border rounded-lg p-3 shadow-sm flex justify-between items-center">
                                            <div className="flex-1">
                                                <div className="font-semibold">{item.produtos?.nome}</div>
                                                <div className="text-xs text-gray-500">{formatarMoeda(item.preco_unitario)} cada</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => alterarQuantidadeItem(item.id, item.quantidade, -1)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 font-bold">-</button>
                                                <span className="font-bold w-6 text-center">{item.quantidade}</span>
                                                <button onClick={() => alterarQuantidadeItem(item.id, item.quantidade, 1)} className="w-8 h-8 rounded-full bg-cafe-primary text-white hover:opacity-90 font-bold">+</button>
                                                <div className="w-24 text-right font-black">{formatarMoeda(item.quantidade * item.preco_unitario)}</div>
                                                <button onClick={() => removerItem(item.id)} className="text-red-500 hover:text-red-700 font-bold">🗑️</button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="border-t pt-4 flex justify-between items-center bg-white">
                            <button onClick={confirmarExclusao} className="text-red-500 font-bold hover:bg-red-50 px-3 py-2 rounded transition">Excluir Comanda</button>
                            <div className="text-right">
                                <span className="block text-sm text-gray-500 font-semibold">Total Parcial</span>
                                <span className="text-3xl font-black text-cafe-primary">{formatarMoeda(subtotalComandaAberta)}</span>
                            </div>
                            <button onClick={abrirCheckout} className="bg-blue-600 text-white text-lg font-bold px-6 py-3 rounded shadow hover:bg-blue-700 active:scale-95 transition">Encerrar e Pagar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Checkout (Pagamento Avançado) */}
            {modalCheckout && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md border-t-8 border-blue-600">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-xl font-bold text-cafe-dark">Pagar: {comandaAberta?.identificacao}</h3>
                            <button onClick={() => setModalCheckout(false)} className="text-gray-400 hover:text-red-500 font-bold">Voltar</button>
                        </div>

                        {/* ATUALIZADO: Mostrando subtotal, campo de desconto e total final */}
                        <div className="mb-4">
                            <div className="flex justify-between items-center text-sm font-semibold text-gray-600 mb-2">
                                <span>Subtotal da Comanda:</span>
                                <span>{formatarMoeda(subtotalComandaAberta)}</span>
                            </div>

                            <div className="flex justify-between items-center bg-red-50 p-2 rounded border border-red-100 mb-3">
                                <span className="text-sm font-bold text-red-700">Desconto:</span>
                                <input
                                    type="number"
                                    placeholder="R$ 0,00"
                                    className="w-24 p-1.5 border border-red-200 rounded text-right font-bold text-red-700 outline-none focus:ring-1 focus:ring-red-400 bg-white"
                                    value={desconto}
                                    onChange={(e) => setDesconto(Number(e.target.value) >= 0 ? Number(e.target.value) : '')}
                                />
                            </div>
                        </div>

                        <div className="bg-blue-50 text-blue-900 p-4 rounded-lg text-center mb-6 border border-blue-200">
                            <span className="text-sm font-semibold uppercase tracking-wider block mb-1">Total a Pagar</span>
                            <span className="text-4xl font-black">{formatarMoeda(totalComDesconto)}</span>
                        </div>

                        <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                            <button onClick={() => setModoPagamento('unico')} className={`flex-1 text-sm py-2 font-bold rounded transition ${modoPagamento === 'unico' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Pagamento Único</button>
                            <button onClick={() => setModoPagamento('misto')} className={`flex-1 text-sm py-2 font-bold rounded transition ${modoPagamento === 'misto' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Combinar Formas</button>
                        </div>

                        {modoPagamento === 'unico' && (
                            <div className="space-y-3 mb-6">
                                <select className="w-full p-3 border border-gray-300 rounded font-bold outline-none focus:ring-2 focus:ring-blue-500" value={metodoUnico} onChange={(e) => setMetodoUnico(e.target.value)}>
                                    <option value="PIX">PIX</option><option value="Cartão de Crédito">Cartão de Crédito</option><option value="Cartão de Débito">Cartão de Débito</option><option value="Dinheiro">Dinheiro</option>
                                </select>
                                {metodoUnico === 'Dinheiro' && (
                                    <div className="flex gap-2 items-center bg-gray-50 p-3 rounded border">
                                        <span className="text-sm font-bold text-gray-700">Valor Recebido:</span>
                                        <input type="number" placeholder="Para calcular troco" className="flex-1 p-2 border rounded font-bold" value={valorRecebidoDinheiro} onChange={(e) => setValorRecebidoDinheiro(Number(e.target.value))} />
                                    </div>
                                )}
                                {trocoUnico > 0 && <div className="text-center font-black text-blue-600 text-xl py-2">Troco: {formatarMoeda(trocoUnico)}</div>}
                            </div>
                        )}

                        {modoPagamento === 'misto' && (
                            <div className="space-y-3 mb-6 border p-3 rounded-lg bg-gray-50">
                                {pagamentosMistos.map((pm, index) => (
                                    <div key={index} className="flex gap-2">
                                        <select className="flex-1 p-2 border rounded font-semibold text-sm" value={pm.metodo} onChange={(e) => { const n = [...pagamentosMistos]; n[index].metodo = e.target.value; setPagamentosMistos(n); }}>
                                            <option value="PIX">PIX</option><option value="Dinheiro">Dinheiro</option><option value="Cartão de Crédito">Crédito</option><option value="Cartão de Débito">Débito</option>
                                        </select>
                                        <input type="number" placeholder="R$ Valor" className="flex-1 p-2 border rounded font-bold text-sm" value={pm.valor} onChange={(e) => { const n = [...pagamentosMistos]; n[index].valor = Number(e.target.value); setPagamentosMistos(n); }} />
                                        {index > 0 && <button onClick={() => setPagamentosMistos(pagamentosMistos.filter((_, i) => i !== index))} className="text-red-500 font-black px-2 hover:bg-red-100 rounded">X</button>}
                                    </div>
                                ))}
                                <button onClick={() => setPagamentosMistos([...pagamentosMistos, { metodo: 'Cartão de Crédito', valor: '' }])} className="w-full text-sm font-bold text-blue-600 hover:text-blue-800 py-1">+ Adicionar Forma de Pagamento</button>

                                <div className="flex justify-between font-black mt-3 pt-3 border-t">
                                    <span className={faltaPagarMisto > 0 ? 'text-red-500' : 'text-gray-500'}>Falta: {formatarMoeda(faltaPagarMisto)}</span>
                                    <span className={trocoMisto > 0 ? 'text-blue-600' : 'text-gray-500'}>Troco: {formatarMoeda(trocoMisto)}</span>
                                </div>
                            </div>
                        )}

                        <button onClick={finalizarVenda} className="w-full bg-green-600 text-white font-black text-xl py-4 rounded shadow-lg hover:bg-green-700 active:scale-95 transition">CONFIRMAR E FECHAR MESA</button>
                    </div>
                </div>
            )}

            {/* TELA PRINCIPAL (GRID DAS COMANDAS) */}
            <div className="flex justify-between items-center mb-6 border-b border-cafe-secondary/30 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-cafe-primary">Mesas e Comandas Ativas</h2>
                    <p className="text-sm text-gray-500 font-semibold mt-1">Gira os pedidos em aberto antes do pagamento</p>
                </div>
                <button onClick={() => setModalNova(true)} className="bg-cafe-secondary text-cafe-dark px-6 py-3 rounded font-black shadow hover:bg-opacity-90 active:scale-95 transition">+ ABRIR COMANDA</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 min-h-[400px]">
                {comandas.map(comanda => {
                    const totalItens = comanda.itens_comanda.reduce((acc, i) => acc + i.quantidade, 0);
                    const totalValor = comanda.itens_comanda.reduce((acc, i) => acc + (i.quantidade * i.preco_unitario), 0);
                    return (
                        <div key={comanda.id} onClick={() => setComandaAberta(comanda)} className="bg-white border-2 border-cafe-secondary/30 hover:border-cafe-primary rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition group relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                            <div className="absolute top-0 left-0 w-full h-1 bg-yellow-400"></div>
                            <div>
                                <h3 className="text-xl font-black text-cafe-dark group-hover:text-cafe-primary transition">{comanda.identificacao}</h3>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">{comanda.nome_cliente}</p>
                            </div>
                            <div className="mt-4 flex justify-between items-end">
                                <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">{totalItens} itens</span>
                                <span className="text-lg font-black text-green-700">{formatarMoeda(totalValor)}</span>
                            </div>
                        </div>
                    )
                })}
                {comandas.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                        <span className="text-4xl mb-3 opacity-50">🍽️</span>
                        <p className="text-gray-500 font-bold text-lg">Nenhuma comanda aberta</p>
                        <p className="text-sm text-gray-400">O salão está vazio no momento.</p>
                    </div>
                )}
            </div>
            {confirmacao?.visivel && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4 animate-fade-in">
                    <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm text-center">
                        <div className="text-red-500 text-4xl mb-3">⚠️</div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">{confirmacao.titulo}</h3>
                        <p className="text-gray-600 mb-6 text-sm">{confirmacao.msg}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmacao(null)} className="flex-1 bg-gray-100 py-2 rounded font-bold hover:bg-gray-200">Cancelar</button>
                            <button onClick={confirmacao.onConfirm} className="flex-1 bg-red-600 text-white py-2 rounded font-bold hover:bg-red-700">Sim, Excluir</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}