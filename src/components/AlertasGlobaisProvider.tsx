import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type TipoAlerta = 'atrasado' | 'hoje' | 'alerta';
type AlertaItem = { tipo: TipoAlerta; texto: string; valor: string };

export default function AlertasGlobaisProvider() {
    const [alertas, setAlertas] = useState<AlertaItem[]>([]);
    const [oculto, setOculto] = useState(false);

    useEffect(() => {
        const verificarVencimentosGerais = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);

            const { data: contas } = await supabase
                .from('contas_pagar')
                .select('descricao, valor, data_vencimento, status')
                .eq('status', 'Pendente');

            if (contas) {
                const mensagens: AlertaItem[] = [];

                contas.forEach(c => {
                    const vencimento = new Date(c.data_vencimento + 'T00:00:00');
                    vencimento.setHours(0, 0, 0, 0);

                    const diffTime = vencimento.getTime() - hoje.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const valorFormatado = formatarMoeda(c.valor);

                    if (diffDays === 0) {
                        mensagens.push({ tipo: 'hoje', texto: `Vence HOJE: ${c.descricao}`, valor: valorFormatado });
                    } else if (diffDays === 1) {
                        mensagens.push({ tipo: 'alerta', texto: `Vence AMANHÃ: ${c.descricao}`, valor: valorFormatado });
                    } else if (diffDays > 1 && diffDays <= 3) {
                        mensagens.push({ tipo: 'alerta', texto: `Vence em ${diffDays} dias: ${c.descricao}`, valor: valorFormatado });
                    } else if (diffDays < 0) {
                        mensagens.push({ tipo: 'atrasado', texto: `ATRASADO (${Math.abs(diffDays)}d): ${c.descricao}`, valor: valorFormatado });
                    }
                });

                // Ordenar: Atrasados primeiro (1), depois Hoje (2), depois Alertas normais (3)
                mensagens.sort((a, b) => {
                    const prioridade = { atrasado: 1, hoje: 2, alerta: 3 };
                    return prioridade[a.tipo] - prioridade[b.tipo];
                });

                setAlertas(mensagens);
            }
        };

        verificarVencimentosGerais();
    }, []);

    const formatarMoeda = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    if (alertas.length === 0 || oculto) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:top-24 md:bottom-auto md:right-6 z-[999] md:w-[340px] max-h-[60vh] md:max-h-[500px] flex flex-col bg-gray-900/95 backdrop-blur-md text-white p-4 md:p-5 rounded-2xl shadow-2xl border border-gray-700/50 animate-fade-in">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-3 mb-3 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🔔</span>
                    <span className="text-xs font-black tracking-widest uppercase text-gray-100">
                        Lembretes ({alertas.length})
                    </span>
                </div>
                <button
                    onClick={() => setOculto(true)}
                    className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-inner"
                >
                    Ocultar
                </button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {alertas.map((alert, i) => (
                    <div
                        key={i}
                        className={`flex flex-col gap-1 p-3.5 rounded-xl border bg-gray-800/40 backdrop-blur-sm shadow-sm
                            ${alert.tipo === 'atrasado' ? 'border-l-4 border-l-red-500 border-gray-700/50' :
                                alert.tipo === 'hoje' ? 'border-l-4 border-l-orange-500 border-gray-700/50' :
                                    'border-l-4 border-l-yellow-400 border-gray-700/50'}`}
                    >
                        <span className="text-xs font-bold text-gray-300 leading-snug">
                            {alert.tipo === 'atrasado' && '🚨 '}
                            {alert.tipo === 'hoje' && '⚠️ '}
                            {alert.tipo === 'alerta' && '📅 '}
                            {alert.texto}
                        </span>
                        <span className={`text-base font-black tracking-tight ${alert.tipo === 'atrasado' ? 'text-red-400' :
                                alert.tipo === 'hoje' ? 'text-orange-400' :
                                    'text-yellow-400'
                            }`}>
                            {alert.valor}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}