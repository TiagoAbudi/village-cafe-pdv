import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type ProdutoDB = {
    id: string;
    nome: string;
    preco_custo: number;
    unidade_medida: string;
};

type IngredienteReceita = ProdutoDB & {
    quantidade_utilizada: number;
};

type FichaCadastrada = {
    id: string;
    produto_venda_id: string;
    rendimento_porcoes: number;
    margem_lucro_desejada: number;
    custo_total: number;
    preco_sugerido: number;
    nome_produto?: string;
};

export default function PrecificacaoModulo() {
    // Estados do Formulário Principal
    const [nomeProduto, setNomeProduto] = useState('');
    const [rendimento, setRendimento] = useState<number>(1);
    const [margemLucro, setMargemLucro] = useState<number>(100);

    // Dados do Banco
    const [ingredientesDisponiveis, setIngredientesDisponiveis] = useState<ProdutoDB[]>([]);
    const [ingredientesSelecionados, setIngredientesSelecionados] = useState<IngredienteReceita[]>([]);
    const [fichasCadastradas, setFichasCadastradas] = useState<FichaCadastrada[]>([]);

    // Estados de Inserção de Ingrediente
    const [ingredienteAtualId, setIngredienteAtualId] = useState('');
    const [quantidadeAtual, setQuantidadeAtual] = useState<number | ''>('');
    const [unidadeAtualEntrada, setUnidadeAtualEntrada] = useState('g'); // NOVO: Estado para a unidade selecionada no input

    // Estados de Edição e Exclusão
    const [fichaEmEdicaoId, setFichaEmEdicaoId] = useState<string | null>(null);
    const [produtoEmEdicaoId, setProdutoEmEdicaoId] = useState<string | null>(null);
    const [fichaParaApagar, setFichaParaApagar] = useState<FichaCadastrada | null>(null);

    // Feedback Visual
    const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });

    const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
        setFeedback({ msg, tipo });
        setTimeout(() => setFeedback({ msg: '', tipo: null }), 4000);
    };

    // 1. Carregar Dados Iniciais
    const carregarDados = async () => {
        const { data: ingData } = await supabase.from('produtos').select('*').eq('tipo', 'ingrediente').order('nome');
        if (ingData) {
            setIngredientesDisponiveis(ingData);
            if (ingData.length > 0 && !ingredienteAtualId) setIngredienteAtualId(ingData[0].id);
        }

        const { data: fichasData } = await supabase.from('fichas_tecnicas').select('*');
        const { data: produtosVendaData } = await supabase.from('produtos').select('id, nome').eq('tipo', 'venda');

        if (fichasData && produtosVendaData) {
            const fichasCompletas = fichasData.map(ficha => {
                const produtoRelacionado = produtosVendaData.find(p => p.id === ficha.produto_venda_id);
                return { ...ficha, nome_produto: produtoRelacionado?.nome || 'Produto Desconhecido' };
            });
            fichasCompletas.sort((a, b) => (a.nome_produto || '').localeCompare(b.nome_produto || ''));
            setFichasCadastradas(fichasCompletas);
        }
    };

    useEffect(() => {
        carregarDados();
    }, []);

    // NOVO: Atualiza automaticamente a unidade de medida de entrada sugerida ao mudar o ingrediente no select
    useEffect(() => {
        const produtoBase = ingredientesDisponiveis.find(p => p.id === ingredienteAtualId);
        if (produtoBase) {
            const uniBase = produtoBase.unidade_medida.toLowerCase();
            if (uniBase === 'kg') setUnidadeAtualEntrada('g'); // Se cadastrado em kg, sugere g
            else if (uniBase === 'l') setUnidadeAtualEntrada('ml'); // Se cadastrado em l, sugere ml
            else setUnidadeAtualEntrada(produtoBase.unidade_medida); // Caso contrário (un, etc), mantém a mesma
        }
    }, [ingredienteAtualId, ingredientesDisponiveis]);

    const formatarMoeda = (valor: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
    };

    // NOVO: Função auxiliar para converter o valor digitado para a unidade base cadastrada no banco
    const converterParaUnidadeBase = (qtd: number, de: string, para: string): number => {
        const unidadeDe = de.toLowerCase();
        const unidadePara = para.toLowerCase();

        if (unidadeDe === unidadePara) return qtd;

        // Conversões de Peso
        if (unidadeDe === 'g' && unidadePara === 'kg') return qtd / 1000;
        if (unidadeDe === 'kg' && unidadePara === 'g') return qtd * 1000;

        // Conversões de Volume
        if (unidadeDe === 'ml' && unidadePara === 'l') return qtd / 1000;
        if (unidadeDe === 'l' && unidadePara === 'ml') return qtd * 1000;

        return qtd; // Caso seja 'un' ou unidades incompatíveis
    };

    // Lógica do Formulário de Ingredientes
    const adicionarIngrediente = () => {
        if (!ingredienteAtualId || !quantidadeAtual) return;

        const produtoBase = ingredientesDisponiveis.find(p => p.id === ingredienteAtualId);
        if (!produtoBase) return;

        // Realiza a conversão antes de salvar no estado da listagem
        const quantidadeConvertida = converterParaUnidadeBase(
            Number(quantidadeAtual),
            unidadeAtualEntrada,
            produtoBase.unidade_medida
        );

        const jaExiste = ingredientesSelecionados.find(i => i.id === ingredienteAtualId);
        if (jaExiste) {
            setIngredientesSelecionados(ingredientesSelecionados.map(i =>
                i.id === ingredienteAtualId ? { ...i, quantidade_utilizada: i.quantidade_utilizada + quantidadeConvertida } : i
            ));
        } else {
            setIngredientesSelecionados([...ingredientesSelecionados, { ...produtoBase, quantidade_utilizada: quantidadeConvertida }]);
        }
        setQuantidadeAtual('');
    };

    const removerIngrediente = (id: string) => {
        setIngredientesSelecionados(ingredientesSelecionados.filter(ing => ing.id !== id));
    };

    // Cálculos Dinâmicos
    const custoTotalReceita = useMemo(() => {
        return ingredientesSelecionados.reduce((acc, ing) => acc + (ing.quantidade_utilizada * ing.preco_custo), 0);
    }, [ingredientesSelecionados]);

    const custoPorPorcao = rendimento > 0 ? custoTotalReceita / rendimento : 0;
    const precoSugerido = custoPorPorcao + (custoPorPorcao * (margemLucro / 100));

    // Salvar ou Atualizar Ficha
    const guardarFichaTecnica = async () => {
        if (!nomeProduto || ingredientesSelecionados.length === 0) {
            mostrarMensagem("Preencha o nome do produto e adicione pelo menos um ingrediente.", "aviso");
            return;
        }

        try {
            if (fichaEmEdicaoId && produtoEmEdicaoId) {
                // MODO EDIÇÃO
                await supabase.from('produtos').update({
                    nome: nomeProduto, preco_custo: custoPorPorcao, preco_venda: precoSugerido
                }).eq('id', produtoEmEdicaoId);

                await supabase.from('fichas_tecnicas').update({
                    rendimento_porcoes: rendimento, margem_lucro_desejada: margemLucro,
                    custo_total: custoTotalReceita, preco_sugerido: precoSugerido
                }).eq('id', fichaEmEdicaoId);

                await supabase.from('ficha_ingredientes').delete().eq('ficha_id', fichaEmEdicaoId);
                const relacaoIngredientes = ingredientesSelecionados.map(ing => ({
                    ficha_id: fichaEmEdicaoId, produto_ingrediente_id: ing.id, quantidade_utilizada: ing.quantidade_utilizada
                }));
                await supabase.from('ficha_ingredientes').insert(relacaoIngredientes);

                mostrarMensagem("Ficha updated com sucesso!", "sucesso");
            } else {
                // MODO CRIAÇÃO
                const { data: produtoCriado, error: erroProduto } = await supabase.from('produtos').insert([{
                    nome: nomeProduto, tipo: 'venda', preco_custo: custoPorPorcao, preco_venda: precoSugerido
                }]).select().single();
                if (erroProduto) throw erroProduto;

                const { data: fichaCriada, error: erroFicha } = await supabase.from('fichas_tecnicas').insert([{
                    produto_venda_id: produtoCriado.id, rendimento_porcoes: rendimento,
                    margem_lucro_desejada: margemLucro, custo_total: custoTotalReceita, preco_sugerido: precoSugerido
                }]).select().single();
                if (erroFicha) throw erroFicha;

                const relacaoIngredientes = ingredientesSelecionados.map(ing => ({
                    ficha_id: fichaCriada.id, produto_ingrediente_id: ing.id, quantidade_utilizada: ing.quantidade_utilizada
                }));
                const { error: erroItens } = await supabase.from('ficha_ingredientes').insert(relacaoIngredientes);
                if (erroItens) throw erroItens;

                mostrarMensagem("Ficha técnica cadastrada com sucesso!", "sucesso");
            }

            cancelarEdicao();
            carregarDados();

        } catch (error) {
            console.error("Erro ao salvar:", error);
            mostrarMensagem("Ocorreu um erro ao processar a ficha técnica.", "erro");
        }
    };

    // Carregar Ficha para o Formulário
    const carregarFichaParaEdicao = async (ficha: FichaCadastrada) => {
        setNomeProduto(ficha.nome_produto || '');
        setRendimento(ficha.rendimento_porcoes);
        setMargemLucro(ficha.margem_lucro_desejada);
        setFichaEmEdicaoId(ficha.id);
        setProdutoEmEdicaoId(ficha.produto_venda_id);

        const { data: itensFicha } = await supabase.from('ficha_ingredientes').select('*').eq('ficha_id', ficha.id);
        if (itensFicha && ingredientesDisponiveis.length > 0) {
            const ingMapeados = itensFicha.map(item => {
                const base = ingredientesDisponiveis.find(i => i.id === item.produto_ingrediente_id);
                return base ? { ...base, quantidade_utilizada: item.quantidade_utilizada } : null;
            }).filter(Boolean) as IngredienteReceita[];
            setIngredientesSelecionados(ingMapeados);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelarEdicao = () => {
        setFichaEmEdicaoId(null);
        setProdutoEmEdicaoId(null);
        setNomeProduto('');
        setIngredientesSelecionados([]);
        setRendimento(1);
        setMargemLucro(100);
    };

    const confirmarExclusaoDaFicha = async () => {
        if (!fichaParaApagar) return;
        try {
            await supabase.from('ficha_ingredientes').delete().eq('ficha_id', fichaParaApagar.id);
            await supabase.from('fichas_tecnicas').delete().eq('id', fichaParaApagar.id);
            await supabase.from('produtos').delete().eq('id', fichaParaApagar.produto_venda_id);

            mostrarMensagem('Ficha e produto excluídos do sistema!', 'sucesso');
            carregarDados();
        } catch (error) {
            console.error(error);
            mostrarMensagem('Erro ao excluir ficha técnica.', 'erro');
        } finally {
            setFichaParaApagar(null);
            if (fichaEmEdicaoId === fichaParaApagar.id) cancelarEdicao();
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-8 relative">

            {/* Feedback Visual */}
            {feedback.tipo && (
                <div className={`absolute top-4 right-4 z-50 px-4 py-3 rounded shadow-lg transition-all duration-300 ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800 border-l-4 border-green-500' :
                        feedback.tipo === 'erro' ? 'bg-red-100 text-red-800 border-l-4 border-red-500' :
                            'bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500'
                    }`}>
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">{feedback.tipo === 'sucesso' ? '✓' : feedback.tipo === 'erro' ? '✕' : '⚠'}</span>
                        <p className="text-sm">{feedback.msg}</p>
                    </div>
                </div>
            )}

            {/* Modal de Exclusão */}
            {fichaParaApagar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
                        <h3 className="text-xl font-bold text-cafe-dark mb-2">Excluir Ficha Técnica</h3>
                        <p className="text-gray-600 mb-6 text-sm">
                            Tem certeza que deseja excluir <strong>{fichaParaApagar.nome_produto}</strong>? Isso irá remover o produto do PDV e apagar a sua receita.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setFichaParaApagar(null)} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-cafe-dark rounded font-semibold transition">Cancelar</button>
                            <button onClick={confirmarExclusaoDaFicha} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-semibold transition shadow">Sim, Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            <h2 className="text-2xl font-bold text-cafe-primary mb-6 border-b border-cafe-secondary/30 pb-2 flex items-center justify-between">
                <span>{fichaEmEdicaoId ? '✏️ Modo de Edição de Ficha' : 'Módulo de Precificação e Fichas'}</span>
                {fichaEmEdicaoId && (
                    <button onClick={cancelarEdicao} className="text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 px-3 py-1 rounded font-semibold">
                        Cancelar Edição
                    </button>
                )}
            </h2>

            {/* ÁREA SUPERIOR: FORMULÁRIO */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-cafe-dark mb-1">Produto Final (Venda)</label>
                        <input
                            type="text" placeholder="Ex: Cappuccino Especial"
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-cafe-secondary outline-none"
                            value={nomeProduto} onChange={(e) => setNomeProduto(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-semibold text-cafe-dark mb-1">Rendimento (Porções)</label>
                            <input
                                type="number" min="1"
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-cafe-secondary outline-none"
                                value={rendimento} onChange={(e) => setRendimento(Number(e.target.value))}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-semibold text-cafe-dark mb-1">Margem de Lucro (%)</label>
                            <input
                                type="number" min="0"
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-cafe-secondary outline-none"
                                value={margemLucro} onChange={(e) => setMargemLucro(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200">
                        <h3 className="font-semibold text-cafe-primary mb-3">Adicionar Inrediente</h3>
                        <div className="flex gap-2 mb-2">
                            <select
                                className="flex-1 p-2 border border-gray-300 rounded text-sm bg-white"
                                value={ingredienteAtualId} onChange={(e) => setIngredienteAtualId(e.target.value)}
                            >
                                {ingredientesDisponiveis.map(ing => (
                                    <option key={ing.id} value={ing.id}>
                                        {ing.nome} ({formatarMoeda(ing.preco_custo)} / {ing.unidade_medida})
                                    </option>
                                ))}
                            </select>

                            <input
                                type="number" placeholder="Qtd"
                                className="w-24 p-2 border border-gray-300 rounded text-sm"
                                value={quantidadeAtual} onChange={(e) => setQuantidadeAtual(e.target.value === '' ? '' : Number(e.target.value))}
                            />

                            {/* NOVO: Dropdown de Unidades de Medida de Entrada */}
                            <select
                                className="w-20 p-2 border border-gray-300 rounded text-sm bg-white font-semibold"
                                value={unidadeAtualEntrada} onChange={(e) => setUnidadeAtualEntrada(e.target.value)}
                            >
                                <option value="g">g</option>
                                <option value="kg">kg</option>
                                <option value="ml">ml</option>
                                <option value="l">l</option>
                                <option value="un">un</option>
                            </select>
                        </div>
                        <button
                            onClick={adicionarIngrediente}
                            className="w-full bg-cafe-secondary text-cafe-dark font-bold py-2 rounded hover:bg-opacity-90 transition"
                        >
                            + Inserir na Receita
                        </button>
                    </div>
                </div>

                <div className="bg-cafe-bg p-4 rounded-lg flex flex-col justify-between border border-gray-200">
                    <div>
                        <h3 className="font-semibold text-cafe-primary mb-3">Composição da Receita</h3>
                        {ingredientesSelecionados.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">Nenhum ingrediente adicionado.</p>
                        ) : (
                            <ul className="space-y-2 mb-4 overflow-y-auto max-h-48">
                                {ingredientesSelecionados.map(ing => (
                                    <li key={ing.id} className="flex justify-between items-center text-sm bg-white p-2 rounded shadow-sm border border-gray-100">
                                        <span>{ing.nome} ({ing.quantidade_utilizada}{ing.unidade_medida})</span>
                                        <div className="flex items-center gap-3">
                                            <span className="font-medium">{formatarMoeda(ing.quantidade_utilizada * ing.preco_custo)}</span>
                                            <button onClick={() => removerIngrediente(ing.id)} className="text-red-500 hover:text-red-700 font-bold">X</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-cafe-secondary/30 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Custo Total da Receita:</span>
                            <span className="font-bold">{formatarMoeda(custoTotalReceita)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Custo por Porção:</span>
                            <span className="font-bold text-red-600">{formatarMoeda(custoPorPorcao)}</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-cafe-secondary/30">
                            <span className="text-cafe-primary">Preço de Venda Sugerido:</span>
                            <span className="text-green-600">{formatarMoeda(precoSugerido)}</span>
                        </div>

                        <button
                            onClick={guardarFichaTecnica}
                            className={`w-full mt-4 font-bold py-3 rounded transition shadow-lg text-white ${fichaEmEdicaoId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-cafe-primary hover:bg-cafe-dark'
                                }`}
                        >
                            {fichaEmEdicaoId ? '🔄 Atualizar Ficha Técnica' : 'Confirmar e Salvar Nova Ficha'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ÁREA INFERIOR: LISTAGEM DAS FICHAS CADASTRADAS */}
            <div>
                <h3 className="font-semibold text-cafe-dark text-lg border-b border-gray-200 pb-2 mb-4">Fichas Técnicas Cadastradas</h3>
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-max">
                        <thead>
                            <tr className="bg-cafe-bg border-b border-gray-200 text-sm">
                                <th className="p-3 font-semibold text-cafe-primary">Produto (Receita)</th>
                                <th className="p-3 font-semibold text-cafe-primary text-center">Rendimento</th>
                                <th className="p-3 font-semibold text-cafe-primary">Custo p/ Porção</th>
                                <th className="p-3 font-semibold text-cafe-primary">Margem</th>
                                <th className="p-3 font-semibold text-cafe-primary text-green-600">Preço Sugerido</th>
                                <th className="p-3 font-semibold text-center text-cafe-primary">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fichasCadastradas.map(ficha => (
                                <tr key={ficha.id} className="border-b border-gray-100 hover:bg-gray-50 text-sm transition-colors">
                                    <td className="p-3 font-medium text-cafe-dark">{ficha.nome_produto}</td>
                                    <td className="p-3 text-center text-gray-600">{ficha.rendimento_porcoes} un</td>
                                    <td className="p-3 text-gray-500">{formatarMoeda(ficha.custo_total / ficha.rendimento_porcoes)}</td>
                                    <td className="p-3 text-gray-500">{ficha.margem_lucro_desejada}%</td>
                                    <td className="p-3 font-bold text-green-600">{formatarMoeda(ficha.preco_sugerido)}</td>
                                    <td className="p-3 text-center space-x-3">
                                        <button
                                            onClick={() => carregarFichaParaEdicao(ficha)}
                                            className="text-blue-600 hover:text-blue-800 font-semibold"
                                            title="Editar Ficha"
                                        >
                                            Editar
                                        </button>
                                        <button
                                            onClick={() => setFichaParaApagar(ficha)}
                                            className="text-red-500 hover:text-red-700 font-semibold"
                                            title="Excluir Ficha"
                                        >
                                            Excluir
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {fichasCadastradas.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-6 text-center text-gray-500 italic">Nenhuma ficha técnica cadastrada ainda.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}