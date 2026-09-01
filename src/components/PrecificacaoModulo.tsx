import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

type Insumo = { id: string; nome: string; unidade_medida: string; preco_total_pago: number; qtd_embalagem: number; fator_correcao: number; preco_custo: number; quantidade_estoque: number; estoque_minimo: number; };
type ReceitaBase = { id: string; nome: string; rendimento_peso: number; unidade_medida: string; custo_total: number; custo_por_unidade: number; };
type ReceitaItem = { id: string; receita_base_id: string; insumo_id: string; qtd_usada: number; custo_calculado: number; insumos: { nome: string; unidade_medida: string } };
type FichaProduto = { id: string; produto_venda_id: string; rendimento_porcoes: number; custo_total: number; preco_sugerido: number; margem_lucro_desejada: number; produtos: { nome: string; preco_venda: number } };
type FichaItem = { id: string; ficha_id: string; insumo_id?: string; receita_base_id?: string; quantidade_utilizada: number; custo_calculado: number; insumos?: { nome: string; unidade_medida: string }; receitas_base?: { nome: string; unidade_medida: string } };
type Parametros = { imposto_taxa_cartao_pct: number; custos_fixos_pct: number; margem_lucro_alvo_pct: number; };
type ProdutoPDV = { id: string; nome: string; preco_venda: number; };

export default function PrecificacaoModulo() {
    const [abaAtiva, setAbaAtiva] = useState<'insumos' | 'bases' | 'fichas' | 'diagnostico'>('insumos');
    const [carregando, setCarregando] = useState(true);
    const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });

    const [insumos, setInsumos] = useState<Insumo[]>([]);
    const [bases, setBases] = useState<ReceitaBase[]>([]);
    const [fichas, setFichas] = useState<FichaProduto[]>([]);
    const [produtosPDV, setProdutosPDV] = useState<ProdutoPDV[]>([]);
    const [parametros, setParametros] = useState<Parametros>({ imposto_taxa_cartao_pct: 8, custos_fixos_pct: 20, margem_lucro_alvo_pct: 40 });

    const [novoInsumo, setNovoInsumo] = useState({ nome: '', unidade: 'kg', preco: '', qtd: '', fc: '1' });

    const [novaBase, setNovaBase] = useState({ nome: '', rendimento: '', unidade: 'Kg' });
    const [baseSelecionada, setBaseSelecionada] = useState<ReceitaBase | null>(null);
    const [itensBase, setItensBase] = useState<ReceitaItem[]>([]);
    const [novoItemBase, setNovoItemBase] = useState({ insumo_id: '', qtd: '' });

    const [novaFicha, setNovaFicha] = useState({ produto_id: '', rendimento: '1' });
    const [fichaSelecionada, setFichaSelecionada] = useState<FichaProduto | null>(null);
    const [itensFicha, setItensFicha] = useState<FichaItem[]>([]);
    const [novoItemFicha, setNovoItemFicha] = useState({ tipo: 'insumo', item_id: '', qtd: '' });

    // ESTADOS PARA AS BUSCAS (FILTROS)
    const [buscaInsumo, setBuscaInsumo] = useState('');
    const [buscaBase, setBuscaBase] = useState('');
    const [buscaFicha, setBuscaFicha] = useState('');
    const [buscaDiagnostico, setBuscaDiagnostico] = useState('');

    const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
        setFeedback({ msg, tipo });
        setTimeout(() => setFeedback({ msg: '', tipo: null }), 3000);
    };

    const carregarDados = async () => {
        setCarregando(true);
        try {
            const { data: dProdutos } = await supabase.from('produtos').select('*').order('nome');
            const { data: dInsumos } = await supabase.from('insumos').select('*').order('nome');
            const { data: dBases } = await supabase.from('receitas_base').select('*').order('nome');
            const { data: dFichas } = await supabase.from('fichas_tecnicas').select('*, produtos!inner(nome, preco_venda)');
            const { data: dParam } = await supabase.from('parametros_precificacao').select('*').maybeSingle();

            if (dProdutos) {
                setProdutosPDV(dProdutos.filter(p => p.tipo === 'venda' && p.ativo) as unknown as ProdutoPDV[]);
            }
            if (dInsumos) {
                setInsumos(dInsumos.map(insumo => ({
                    ...insumo,
                    preco_custo: Number(insumo.custo_unitario) || 0,
                    estoque_minimo: 0,
                })) as Insumo[]);
            }
            if (dBases) setBases(dBases);
            if (dFichas) setFichas(dFichas as unknown as FichaProduto[]);
            if (dParam) setParametros(dParam);
        } catch (error) {
            console.error(error);
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => { carregarDados(); }, []);

    const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

    const salvarInsumo = async () => {
        if (!novoInsumo.nome || !novoInsumo.preco || !novoInsumo.qtd) return mostrarMensagem('Preencha os campos obrigatórios', 'aviso');

        const preco = Number(novoInsumo.preco);
        const qtd = Number(novoInsumo.qtd);
        const fc = Number(novoInsumo.fc) || 1;
        if (preco <= 0 || qtd <= 0 || fc <= 0) return mostrarMensagem('Preço, quantidade e fator precisam ser maiores que zero.', 'aviso');
        const custoUnitario = (preco / qtd) * fc;

        const { error } = await supabase.from('insumos').insert([{
            nome: novoInsumo.nome,
            unidade_medida: novoInsumo.unidade,
            preco_total_pago: preco,
            qtd_embalagem: qtd,
            fator_correcao: fc,
            custo_unitario: custoUnitario,
            quantidade_estoque: 0
        }]);

        if (error) return mostrarMensagem('Não foi possível salvar o insumo. Verifique se ele já existe.', 'erro');
        mostrarMensagem('Ingrediente cadastrado!', 'sucesso');
        setNovoInsumo({ nome: '', unidade: 'kg', preco: '', qtd: '', fc: '1' });
        carregarDados();
    };

    const deletarInsumo = async (id: string) => {
        const { error } = await supabase.from('insumos').delete().eq('id', id);
        if (error?.code === '23503') return mostrarMensagem('Este insumo já está em uma receita e não pode ser removido.', 'aviso');
        if (error) return mostrarMensagem('Erro ao remover insumo.', 'erro');
        carregarDados();
    };

    const salvarBase = async () => {
        if (!novaBase.nome || !novaBase.rendimento) return mostrarMensagem('Preencha nome e rendimento', 'aviso');
        if (Number(novaBase.rendimento) <= 0) return mostrarMensagem('O rendimento precisa ser maior que zero.', 'aviso');
        const { error } = await supabase.from('receitas_base').insert([{
            nome: novaBase.nome, rendimento_peso: Number(novaBase.rendimento), unidade_medida: novaBase.unidade
        }]);
        if (error) return mostrarMensagem('Erro ao salvar base', 'erro');
        mostrarMensagem('Receita base criada!', 'sucesso');
        setNovaBase({ nome: '', rendimento: '', unidade: 'Kg' });
        carregarDados();
    };

    const abrirBase = async (base: ReceitaBase) => {
        const { data: baseAtualizada, error } = await supabase.from('receitas_base').select('*').eq('id', base.id).single();
        if (error || !baseAtualizada) return mostrarMensagem('Não foi possível abrir a receita-base.', 'erro');
        setBaseSelecionada(baseAtualizada as ReceitaBase);
        const { data } = await supabase.from('receitas_base_itens').select('*, insumos(nome, unidade_medida)').eq('receita_base_id', base.id);
        if (data) setItensBase(data as unknown as ReceitaItem[]);
    };

    const recalcularCustosCMV = async () => {
        const { error } = await supabase.rpc('recalcular_custos_cmv');
        if (error) throw error;
        await carregarDados();
    };

    const adicionarItemBase = async () => {
        if (!baseSelecionada || !novoItemBase.insumo_id || !novoItemBase.qtd) return;
        const insumo = insumos.find(i => i.id === novoItemBase.insumo_id);
        if (!insumo) return;
        const qtd = Number(novoItemBase.qtd);
        if (qtd <= 0) return mostrarMensagem('A quantidade precisa ser maior que zero.', 'aviso');
        const custoCalc = qtd * insumo.preco_custo;

        const { error } = await supabase.from('receitas_base_itens').insert([{
            receita_base_id: baseSelecionada.id, insumo_id: insumo.id, qtd_usada: qtd, custo_calculado: custoCalc
        }]);
        if (error) return mostrarMensagem('Não foi possível adicionar o insumo à receita-base.', 'erro');

        try {
            await recalcularCustosCMV();
            await abrirBase(baseSelecionada);
            setNovoItemBase({ insumo_id: '', qtd: '' });
        } catch (erro) {
            console.error(erro);
            mostrarMensagem('Item salvo, mas não foi possível recalcular o CMV.', 'erro');
        }
    };

    const removerItemBase = async (id: string) => {
        const { error } = await supabase.from('receitas_base_itens').delete().eq('id', id);
        if (error) return mostrarMensagem('Não foi possível remover o item da receita-base.', 'erro');
        if (baseSelecionada) {
            try {
                await recalcularCustosCMV();
                await abrirBase(baseSelecionada);
            } catch (erro) {
                console.error(erro);
                mostrarMensagem('Item removido, mas não foi possível recalcular o CMV.', 'erro');
            }
        }
    };

    const salvarFicha = async () => {
        if (!novaFicha.produto_id || !novaFicha.rendimento) return mostrarMensagem('Preencha os campos', 'aviso');
        if (Number(novaFicha.rendimento) <= 0) return mostrarMensagem('O rendimento precisa ser maior que zero.', 'aviso');
        const { error } = await supabase.from('fichas_tecnicas').insert([{
            produto_venda_id: novaFicha.produto_id, rendimento_porcoes: Number(novaFicha.rendimento)
        }]);
        if (error) return mostrarMensagem('Erro ao salvar ficha (produto já possui ficha?)', 'erro');
        mostrarMensagem('Ficha Técnica criada!', 'sucesso');
        setNovaFicha({ produto_id: '', rendimento: '1' });
        carregarDados();
    };

    const abrirFicha = async (ficha: FichaProduto) => {
        const { data: fichaAtualizada, error } = await supabase.from('fichas_tecnicas').select('*, produtos!inner(nome, preco_venda)').eq('id', ficha.id).single();
        if (error || !fichaAtualizada) return mostrarMensagem('Não foi possível abrir a ficha técnica.', 'erro');
        setFichaSelecionada(fichaAtualizada as unknown as FichaProduto);
        const { data } = await supabase.from('ficha_ingredientes').select('*, insumos(nome, unidade_medida), receitas_base(nome, unidade_medida)').eq('ficha_id', ficha.id);
        if (data) setItensFicha(data as unknown as FichaItem[]);
    };

    const adicionarItemFicha = async () => {
        if (!fichaSelecionada || !novoItemFicha.item_id || !novoItemFicha.qtd) return;
        const qtd = Number(novoItemFicha.qtd);
        if (qtd <= 0) return mostrarMensagem('A quantidade precisa ser maior que zero.', 'aviso');
        let custoCalc: number;
        const payload: any = { ficha_id: fichaSelecionada.id, quantidade_utilizada: qtd };

        if (novoItemFicha.tipo === 'insumo') {
            const insumo = insumos.find(i => i.id === novoItemFicha.item_id);
            if (!insumo) return;
            custoCalc = qtd * insumo.preco_custo;
            payload.insumo_id = insumo.id;
        } else {
            const base = bases.find(b => b.id === novoItemFicha.item_id);
            if (!base) return;
            custoCalc = qtd * base.custo_por_unidade;
            payload.receita_base_id = base.id;
        }
        payload.custo_calculado = custoCalc;

        const { error } = await supabase.from('ficha_ingredientes').insert([payload]);
        if (error) return mostrarMensagem('Não foi possível adicionar o item à ficha técnica.', 'erro');
        try {
            await recalcularCustosCMV();
            await abrirFicha(fichaSelecionada);
            setNovoItemFicha({ tipo: 'insumo', item_id: '', qtd: '' });
        } catch (erro) {
            console.error(erro);
            mostrarMensagem('Item salvo, mas não foi possível recalcular o CMV.', 'erro');
        }
    };

    const removerItemFicha = async (id: string) => {
        const { error } = await supabase.from('ficha_ingredientes').delete().eq('id', id);
        if (error) return mostrarMensagem('Não foi possível remover o item da ficha técnica.', 'erro');
        if (fichaSelecionada) {
            try {
                await recalcularCustosCMV();
                await abrirFicha(fichaSelecionada);
            } catch (erro) {
                console.error(erro);
                mostrarMensagem('Item removido, mas não foi possível recalcular o CMV.', 'erro');
            }
        }
    };

    const salvarParametros = async () => {
        const { error } = await supabase.from('parametros_precificacao').update(parametros).eq('id', 1);
        if (error) mostrarMensagem('Erro ao salvar parâmetros', 'erro');
        else mostrarMensagem('Parâmetros globais atualizados!', 'sucesso');
    };

    const atualizarCMV = async () => {
        try {
            await recalcularCustosCMV();
            mostrarMensagem('CMV e custos atualizados.', 'sucesso');
        } catch (erro) {
            console.error(erro);
            mostrarMensagem('Não foi possível atualizar o CMV.', 'erro');
        }
    };

    // PROCESSAMENTO DOS DADOS FILTRADOS
    const insumosFiltrados = useMemo(() => {
        return insumos.filter(i => i.nome.toLowerCase().includes(buscaInsumo.toLowerCase()));
    }, [insumos, buscaInsumo]);

    const basesFiltradas = useMemo(() => {
        return bases.filter(b => b.nome.toLowerCase().includes(buscaBase.toLowerCase()));
    }, [bases, buscaBase]);

    const fichasFiltradas = useMemo(() => {
        return fichas.filter(f => f.produtos.nome.toLowerCase().includes(buscaFicha.toLowerCase()));
    }, [fichas, buscaFicha]);

    const matrizDiagnostico = useMemo(() => {
        return fichas.map(ficha => {
            const produtoNome = ficha.produtos?.nome || 'Desconhecido';
            const precoVenda = ficha.produtos?.preco_venda || 0;
            const custo = ficha.custo_total / ficha.rendimento_porcoes || 0;

            const cmv = precoVenda > 0 ? (custo / precoVenda) * 100 : 0;
            const margemRetida = (parametros.custos_fixos_pct + parametros.imposto_taxa_cartao_pct + parametros.margem_lucro_alvo_pct) / 100;
            const divisor = 1 - margemRetida;
            const precoSugerido = divisor > 0 ? custo / divisor : 0;
            const lucroEfetivo = precoVenda - custo - (precoVenda * ((parametros.custos_fixos_pct + parametros.imposto_taxa_cartao_pct) / 100));

            let status = 'Preço Adequado';
            let corStatus = 'bg-green-100 text-green-800';

            if (precoVenda < precoSugerido) { status = 'Aumentar Preço'; corStatus = 'bg-red-100 text-red-800'; }
            else if (cmv > 35) { status = 'Alerta de CMV Alto'; corStatus = 'bg-yellow-100 text-yellow-800'; }

            return { id: ficha.id, produtoNome, custo, precoVenda, precoSugerido, lucroEfetivo, cmv, status, corStatus };
        });
    }, [fichas, parametros]);

    const diagnosticoFiltrado = useMemo(() => {
        return matrizDiagnostico.filter(m => m.produtoNome.toLowerCase().includes(buscaDiagnostico.toLowerCase()));
    }, [matrizDiagnostico, buscaDiagnostico]);

    const produtosSemFicha = produtosPDV.filter(pdv => !fichas.some(f => f.produto_venda_id === pdv.id));

    if (carregando) return <div className="text-center py-20 font-black text-cafe-primary animate-pulse">Carregando Engenharia de Cardápio...</div>;

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-4 md:my-8 relative min-h-[80vh]">
            {feedback.tipo && (
                <div className={`fixed top-4 right-4 z-[200] px-4 py-3 rounded-lg shadow-lg transition-all font-bold text-sm ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {feedback.msg}
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-gray-200 pb-4 gap-4">
                <div>
                    <h2 className="text-2xl font-black text-cafe-primary uppercase tracking-wider">Engenharia de Cardápio</h2>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Controle de Custos e Fichas Técnicas</p>
                </div>
            </div>

            <div className="flex overflow-x-auto bg-gray-100 p-1.5 rounded-xl border border-gray-200 mb-6 gap-1 custom-scrollbar">
                <button onClick={() => setAbaAtiva('insumos')} className={`flex-1 min-w-[120px] py-3 text-xs md:text-sm font-black rounded-lg transition-all uppercase tracking-wider ${abaAtiva === 'insumos' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-800'}`}>1. Insumos e Custos</button>
                <button onClick={() => setAbaAtiva('bases')} className={`flex-1 min-w-[120px] py-3 text-xs md:text-sm font-black rounded-lg transition-all uppercase tracking-wider ${abaAtiva === 'bases' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-800'}`}>2. Bases/Recheios</button>
                <button onClick={() => setAbaAtiva('fichas')} className={`flex-1 min-w-[120px] py-3 text-xs md:text-sm font-black rounded-lg transition-all uppercase tracking-wider ${abaAtiva === 'fichas' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-800'}`}>3. Fichas Técnicas</button>
                <button onClick={() => setAbaAtiva('diagnostico')} className={`flex-1 min-w-[120px] py-3 text-xs md:text-sm font-black rounded-lg transition-all uppercase tracking-wider ${abaAtiva === 'diagnostico' ? 'bg-gray-900 shadow text-white' : 'text-gray-500 hover:text-gray-800'}`}>4. Painel/Diagnóstico</button>
            </div>

            {abaAtiva === 'insumos' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                    <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm h-fit">
                        <h3 className="font-black text-gray-800 mb-4 text-sm uppercase tracking-wider border-b pb-2">Cadastrar Novo Insumo</h3>
                        <p className="text-xs text-gray-500 mb-4 leading-relaxed">Cadastre cada ingrediente, embalagem e tempero na mesma unidade que será usada na receita. O recebimento físico e financeiro é registrado em <strong>Estoque</strong>.</p>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Nome do Ingrediente/Embalagem</label>
                                <input type="text" className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-cafe-primary text-sm font-bold text-gray-700" value={novoInsumo.nome} onChange={e => setNovoInsumo({ ...novoInsumo, nome: e.target.value })} placeholder="Ex: Leite Integral" />
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Unidade</label>
                                    <select className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-cafe-primary text-sm font-bold text-gray-700" value={novoInsumo.unidade} onChange={e => setNovoInsumo({ ...novoInsumo, unidade: e.target.value })}>
                                        <option value="kg">Kg</option><option value="g">Gramas (g)</option><option value="l">Litro (l)</option><option value="ml">Mililitros (ml)</option><option value="un">Unidade (un)</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Fator (FC)</label>
                                    <input type="number" step="0.1" className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-cafe-primary text-sm font-bold text-gray-700" value={novoInsumo.fc} onChange={e => setNovoInsumo({ ...novoInsumo, fc: e.target.value })} placeholder="1.0" />
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Preço Pago (R$)</label>
                                    <input type="number" className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-cafe-primary text-sm font-black text-cafe-dark" value={novoInsumo.preco} onChange={e => setNovoInsumo({ ...novoInsumo, preco: e.target.value })} placeholder="0.00" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Qtd na Emb.</label>
                                    <input type="number" className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-cafe-primary text-sm font-black text-cafe-dark" value={novoInsumo.qtd} onChange={e => setNovoInsumo({ ...novoInsumo, qtd: e.target.value })} placeholder="Ex: 1 (se 1Kg)" />
                                </div>
                            </div>
                            <button onClick={salvarInsumo} className="w-full bg-cafe-primary text-white font-black uppercase tracking-wider py-3 rounded-xl shadow-md hover:bg-cafe-dark active:scale-95 transition text-xs mt-2">Salvar Insumo</button>
                        </div>
                    </div>

                    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
                        <div className="p-4 bg-gray-50 border-b border-gray-100 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider">Banco de Insumos</h3>
                            <input
                                type="text"
                                placeholder="🔍 Buscar insumo..."
                                className="w-full sm:w-48 p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-primary text-sm bg-white"
                                value={buscaInsumo}
                                onChange={(e) => setBuscaInsumo(e.target.value)}
                            />
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-gray-50 sticky top-0 text-[10px] text-gray-500 uppercase tracking-widest shadow-sm">
                                    <tr><th className="p-3">Insumo</th><th className="p-3 text-center">Unid.</th><th className="p-3 text-right">Custo / Unid</th><th className="p-3 text-center">Ação</th></tr>
                                </thead>
                                <tbody>
                                    {insumosFiltrados.map(i => (
                                        <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                                            <td className="p-3 font-bold text-gray-800">{i.nome}</td>
                                            <td className="p-3 text-center font-semibold text-gray-600 bg-gray-50/50">{i.unidade_medida}</td>
                                            <td className="p-3 text-right font-black text-red-600">{formatarMoeda(i.preco_custo)} <span className="text-[10px] text-gray-400 font-normal">/{i.unidade_medida}</span></td>
                                            <td className="p-3 text-center"><button onClick={() => deletarInsumo(i.id)} className="text-gray-400 hover:text-red-500 font-black px-2 transition">✕</button></td>
                                        </tr>
                                    ))}
                                    {insumosFiltrados.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-400 italic">Nenhum insumo encontrado.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {abaAtiva === 'bases' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                    <div className="flex flex-col gap-6">
                        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm h-fit">
                            <h3 className="font-black text-gray-800 mb-4 text-sm uppercase tracking-wider border-b pb-2">Nova Base/Creme</h3>
                            <div className="space-y-4">
                                <div><label className="text-[10px] font-bold text-gray-500 uppercase">Nome da Base</label><input type="text" className="w-full p-2.5 border rounded-lg bg-white text-sm font-bold outline-none" value={novaBase.nome} onChange={e => setNovaBase({ ...novaBase, nome: e.target.value })} placeholder="Ex: Recheio de Frango" /></div>
                                <div className="flex gap-3">
                                    <div className="flex-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Rende (Peso)</label><input type="number" className="w-full p-2.5 border rounded-lg bg-white text-sm font-black outline-none" value={novaBase.rendimento} onChange={e => setNovaBase({ ...novaBase, rendimento: e.target.value })} placeholder="Ex: 2" /></div>
                                    <div className="flex-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Medida Final</label><select className="w-full p-2.5 border rounded-lg bg-white text-sm font-bold outline-none" value={novaBase.unidade} onChange={e => setNovaBase({ ...novaBase, unidade: e.target.value })}><option value="Kg">Kg</option><option value="g">g</option><option value="L">L</option><option value="ml">ml</option></select></div>
                                </div>
                                <button onClick={salvarBase} className="w-full bg-cafe-primary text-white font-black uppercase tracking-wider py-3 rounded-xl shadow-md text-xs mt-2 transition active:scale-95">Criar Receita Base</button>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex-1 flex flex-col">
                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex flex-col gap-2 shrink-0">
                                <h3 className="font-black text-gray-800 text-[10px] uppercase tracking-widest text-center">Bases Criadas</h3>
                                <input
                                    type="text"
                                    placeholder="🔍 Buscar base..."
                                    className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-primary text-xs bg-white"
                                    value={buscaBase}
                                    onChange={(e) => setBuscaBase(e.target.value)}
                                />
                            </div>
                            <div className="overflow-auto flex-1 max-h-[250px] custom-scrollbar">
                                {basesFiltradas.map(b => (
                                    <div key={b.id} onClick={() => abrirBase(b)} className={`p-3 border-b border-gray-50 cursor-pointer transition flex justify-between items-center ${baseSelecionada?.id === b.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'}`}>
                                        <span className="font-bold text-sm text-gray-800">{b.nome}</span>
                                        <span className="text-xs font-black text-cafe-primary">{formatarMoeda(b.custo_por_unidade)}<span className="text-[9px] text-gray-400">/{b.unidade_medida}</span></span>
                                    </div>
                                ))}
                                {basesFiltradas.length === 0 && <p className="text-center text-gray-400 text-xs italic py-4">Nenhuma base encontrada.</p>}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-[600px]">
                        {baseSelecionada ? (
                            <>
                                <div className="p-4 bg-gray-900 text-white rounded-t-xl shrink-0 flex justify-between items-center">
                                    <div>
                                        <h3 className="font-black text-lg">{baseSelecionada.nome}</h3>
                                        <span className="text-xs text-gray-400 font-medium">Rendimento: {baseSelecionada.rendimento_peso} {baseSelecionada.unidade_medida}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[10px] uppercase tracking-widest text-gray-400">Custo Total da Panela</span>
                                        <span className="font-black text-2xl text-green-400">{formatarMoeda(baseSelecionada.custo_total)}</span>
                                    </div>
                                </div>

                                <div className="p-4 bg-gray-50 border-b border-gray-200 flex gap-3 shrink-0">
                                    <select className="flex-1 p-2.5 border rounded-lg bg-white text-sm font-semibold outline-none" value={novoItemBase.insumo_id} onChange={e => setNovoItemBase({ ...novoItemBase, insumo_id: e.target.value })}>
                                        <option value="">Selecione o Insumo...</option>
                                        {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({formatarMoeda(i.preco_custo)}/{i.unidade_medida})</option>)}
                                    </select>
                                    <input type="number" className="w-24 p-2.5 border rounded-lg bg-white text-sm font-black outline-none text-center" placeholder="Qtd" value={novoItemBase.qtd} onChange={e => setNovoItemBase({ ...novoItemBase, qtd: e.target.value })} />
                                    <button onClick={adicionarItemBase} className="bg-blue-600 text-white font-black px-4 rounded-lg hover:bg-blue-700 transition">+</button>
                                </div>

                                <div className="flex-1 overflow-auto bg-white custom-scrollbar p-2">
                                    {itensBase.map(i => (
                                        <div key={i.id} className="flex justify-between items-center p-3 border-b border-gray-100 hover:bg-gray-50 transition">
                                            <div>
                                                <span className="font-bold text-sm text-gray-800 block">{i.insumos?.nome}</span>
                                                <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{i.qtd_usada} {i.insumos?.unidade_medida}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="font-black text-red-500 text-sm">{formatarMoeda(i.custo_calculado)}</span>
                                                <button onClick={() => removerItemBase(i.id)} className="text-gray-300 hover:text-red-500 transition">✕</button>
                                            </div>
                                        </div>
                                    ))}
                                    {itensBase.length === 0 && <div className="text-center py-10 text-gray-400 italic text-sm">Adicione ingredientes para calcular a base.</div>}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 italic p-6">
                                <span className="text-5xl mb-4 grayscale opacity-50">🥣</span>
                                <p className="font-bold">Selecione uma receita base ao lado</p>
                                <p className="text-xs mt-1">Para adicionar ingredientes e calcular os custos.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {abaAtiva === 'fichas' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                    <div className="flex flex-col gap-6">
                        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm h-fit">
                            <h3 className="font-black text-gray-800 mb-4 text-sm uppercase tracking-wider border-b pb-2">Nova Ficha Técnica</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Produto do Cardápio (PDV)</label>
                                    <select className="w-full p-2.5 border rounded-lg bg-white text-sm font-bold outline-none" value={novaFicha.produto_id} onChange={e => setNovaFicha({ ...novaFicha, produto_id: e.target.value })}>
                                        <option value="">Selecione...</option>
                                        {produtosSemFicha.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Rendimento da Receita (Ex: 10 Fatias)</label>
                                    <input type="number" className="w-full p-2.5 border rounded-lg bg-white text-sm font-black outline-none" value={novaFicha.rendimento} onChange={e => setNovaFicha({ ...novaFicha, rendimento: e.target.value })} placeholder="1" />
                                </div>
                                <button onClick={salvarFicha} className="w-full bg-cafe-primary text-white font-black uppercase tracking-wider py-3 rounded-xl shadow-md text-xs mt-2 transition active:scale-95">Abrir Ficha</button>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex-1 flex flex-col">
                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex flex-col gap-2 shrink-0">
                                <h3 className="font-black text-gray-800 text-[10px] uppercase tracking-widest text-center">Fichas Cadastradas</h3>
                                <input
                                    type="text"
                                    placeholder="🔍 Buscar ficha..."
                                    className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-primary text-xs bg-white"
                                    value={buscaFicha}
                                    onChange={(e) => setBuscaFicha(e.target.value)}
                                />
                            </div>
                            <div className="overflow-auto flex-1 max-h-[250px] custom-scrollbar">
                                {fichasFiltradas.map(f => (
                                    <div key={f.id} onClick={() => abrirFicha(f)} className={`p-3 border-b border-gray-50 cursor-pointer transition flex justify-between items-center ${fichaSelecionada?.id === f.id ? 'bg-amber-50 border-l-4 border-l-amber-500' : 'hover:bg-gray-50'}`}>
                                        <span className="font-bold text-sm text-gray-800">{f.produtos.nome}</span>
                                        <span className="text-[10px] font-black bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Rend: {f.rendimento_porcoes}</span>
                                    </div>
                                ))}
                                {fichasFiltradas.length === 0 && <p className="text-center text-gray-400 text-xs italic py-4">Nenhuma ficha encontrada.</p>}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-[600px]">
                        {fichaSelecionada ? (
                            <>
                                <div className="p-4 bg-gray-900 text-white rounded-t-xl shrink-0 flex justify-between items-center">
                                    <div>
                                        <h3 className="font-black text-lg text-amber-400">{fichaSelecionada.produtos.nome}</h3>
                                        <span className="text-xs text-gray-400 font-medium block mt-0.5">Preço Atual: {formatarMoeda(fichaSelecionada.produtos.preco_venda)} | Rendimento: {fichaSelecionada.rendimento_porcoes} porções</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[10px] uppercase tracking-widest text-gray-400">Custo Total Receita</span>
                                        <span className="font-black text-2xl text-white">{formatarMoeda(fichaSelecionada.custo_total)}</span>
                                        <span className="block text-xs font-bold text-red-400 bg-red-900/30 px-2 py-1 rounded-md mt-1 border border-red-500/20">Custo por Porção: {formatarMoeda(fichaSelecionada.custo_total / fichaSelecionada.rendimento_porcoes)}</span>
                                    </div>
                                </div>

                                <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row gap-3 shrink-0">
                                    <select className="sm:w-32 p-2.5 border rounded-lg bg-white text-xs font-bold outline-none uppercase tracking-wider" value={novoItemFicha.tipo} onChange={e => setNovoItemFicha({ ...novoItemFicha, tipo: e.target.value, item_id: '' })}>
                                        <option value="insumo">Insumo Bruto</option>
                                        <option value="base">Receita Base</option>
                                    </select>

                                    <select className="flex-1 p-2.5 border rounded-lg bg-white text-sm font-semibold outline-none" value={novoItemFicha.item_id} onChange={e => setNovoItemFicha({ ...novoItemFicha, item_id: e.target.value })}>
                                        <option value="">Selecione o Item...</option>
                                        {novoItemFicha.tipo === 'insumo'
                                            ? insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({formatarMoeda(i.preco_custo)}/{i.unidade_medida})</option>)
                                            : bases.map(b => <option key={b.id} value={b.id}>{b.nome} ({formatarMoeda(b.custo_por_unidade)}/{b.unidade_medida})</option>)
                                        }
                                    </select>

                                    <div className="flex gap-2 w-full sm:w-auto">
                                        <input type="number" className="flex-1 sm:w-24 p-2.5 border rounded-lg bg-white text-sm font-black outline-none text-center" placeholder="Qtd" value={novoItemFicha.qtd} onChange={e => setNovoItemFicha({ ...novoItemFicha, qtd: e.target.value })} />
                                        <button onClick={adicionarItemFicha} className="bg-amber-500 text-white font-black px-4 rounded-lg hover:bg-amber-600 transition">+</button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-auto bg-white custom-scrollbar p-2">
                                    {itensFicha.map(i => {
                                        const nome = i.insumos ? i.insumos.nome : i.receitas_base?.nome;
                                        const und = i.insumos ? i.insumos.unidade_medida : i.receitas_base?.unidade_medida;
                                        const isBase = !!i.receita_base_id;
                                        return (
                                            <div key={i.id} className="flex justify-between items-center p-3 border-b border-gray-100 hover:bg-gray-50 transition">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {isBase && <span className="bg-blue-100 text-blue-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Base</span>}
                                                        <span className="font-bold text-sm text-gray-800">{nome}</span>
                                                    </div>
                                                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{i.quantidade_utilizada} {und}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="font-black text-red-500 text-sm">{formatarMoeda(i.custo_calculado)}</span>
                                                    <button onClick={() => removerItemFicha(i.id)} className="text-gray-300 hover:text-red-500 transition">✕</button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {itensFicha.length === 0 && <div className="text-center py-10 text-gray-400 italic text-sm">Monte o prato adicionando ingredientes e bases.</div>}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 italic p-6">
                                <span className="text-5xl mb-4 grayscale opacity-50">🍰</span>
                                <p className="font-bold">Selecione uma Ficha Técnica ao lado</p>
                                <p className="text-xs mt-1">Para organizar a montagem do prato final.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {abaAtiva === 'diagnostico' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-gray-900 p-5 md:p-6 rounded-2xl shadow-lg border border-gray-800 text-white flex flex-col md:flex-row gap-6 items-center justify-between">
                        <div className="w-full md:w-1/3">
                            <h3 className="font-black text-lg text-cafe-secondary">Engenharia de Preços</h3>
                            <p className="text-xs text-gray-400 mt-1">Ajuste os parâmetros abaixo para recalcular o Preço Sugerido de todo o cardápio.</p>
                        </div>
                        <div className="flex flex-wrap md:flex-nowrap gap-4 w-full md:w-2/3">
                            <div className="flex-1 bg-gray-800 p-3 rounded-xl border border-gray-700">
                                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Custos Fixos (%)</label>
                                <input type="number" className="w-full bg-transparent text-xl font-black outline-none text-white focus:text-blue-400 transition-colors" value={parametros.custos_fixos_pct} onChange={e => setParametros({ ...parametros, custos_fixos_pct: Number(e.target.value) })} />
                            </div>
                            <div className="flex-1 bg-gray-800 p-3 rounded-xl border border-gray-700">
                                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Impostos/Taxas (%)</label>
                                <input type="number" className="w-full bg-transparent text-xl font-black outline-none text-white focus:text-red-400 transition-colors" value={parametros.imposto_taxa_cartao_pct} onChange={e => setParametros({ ...parametros, imposto_taxa_cartao_pct: Number(e.target.value) })} />
                            </div>
                            <div className="flex-1 bg-gray-800 p-3 rounded-xl border border-gray-700">
                                <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Margem Alvo (%)</label>
                                <input type="number" className="w-full bg-transparent text-xl font-black outline-none text-white focus:text-green-400 transition-colors" value={parametros.margem_lucro_alvo_pct} onChange={e => setParametros({ ...parametros, margem_lucro_alvo_pct: Number(e.target.value) })} />
                            </div>
                            <button onClick={salvarParametros} className="bg-cafe-secondary text-cafe-dark font-black px-6 rounded-xl hover:bg-white transition shadow-[0_0_15px_rgba(251,191,36,0.3)]">Salvar</button>
                            <button onClick={atualizarCMV} className="bg-white/10 border border-gray-600 text-white font-black px-5 rounded-xl hover:bg-white/20 transition">Atualizar CMV</button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider">Matriz de Diagnóstico (CMV e Lucro)</h3>
                            <input
                                type="text"
                                placeholder="🔍 Buscar diagnóstico..."
                                className="w-full sm:w-64 p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-cafe-primary text-sm bg-white"
                                value={buscaDiagnostico}
                                onChange={(e) => setBuscaDiagnostico(e.target.value)}
                            />
                        </div>
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left text-sm border-collapse min-w-[800px]">
                                <thead className="bg-gray-50 sticky top-0 text-[10px] text-gray-500 uppercase tracking-widest border-b border-gray-200">
                                    <tr>
                                        <th className="p-4">Produto</th>
                                        <th className="p-4 text-right">Custo Porção (R$)</th>
                                        <th className="p-4 text-right text-gray-800">Preço Atual (R$)</th>
                                        <th className="p-4 text-center font-bold text-cafe-primary">Preço Sugerido (R$)</th>
                                        <th className="p-4 text-center">CMV Atual (%)</th>
                                        <th className="p-4 text-right">Lucro Real (R$)</th>
                                        <th className="p-4 text-center">Diagnóstico</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diagnosticoFiltrado.map(m => (
                                        <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                            <td className="p-4 font-bold text-gray-800">{m.produtoNome}</td>
                                            <td className="p-4 text-right font-semibold text-red-500">{formatarMoeda(m.custo)}</td>
                                            <td className="p-4 text-right font-black text-gray-800">{formatarMoeda(m.precoVenda)}</td>
                                            <td className="p-4 text-center font-black text-cafe-primary bg-cafe-bg/30">{formatarMoeda(m.precoSugerido)}</td>
                                            <td className="p-4 text-center">
                                                <span className={`font-black ${m.cmv > 35 ? 'text-red-500' : 'text-green-600'}`}>{m.cmv.toFixed(1)}%</span>
                                            </td>
                                            <td className="p-4 text-right font-black text-green-600">{formatarMoeda(m.lucroEfetivo)}</td>
                                            <td className="p-4 text-center">
                                                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${m.corStatus}`}>
                                                    {m.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {diagnosticoFiltrado.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400 italic">Nenhum diagnóstico encontrado com esse termo.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            )}

        </div>
    );
}
