import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function AlertasGlobaisProvider() {
    const [alertas, setAlertas] = useState<string[]>([]);
    const [oculto, setOculto] = useState(false);

    useEffect(() => {
        const verificarVencimentosGerais = async () => {
            // 1. Verifica se o usuário está autenticado antes de buscar
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);

            const { data: contas } = await supabase
                .from('contas_pagar')
                .select('descricao, valor, data_vencimento, status')
                .eq('status', 'Pendente');

            if (contas) {
                const mensagens: string[] = [];

                contas.forEach(c => {
                    const vencimento = new Date(c.data_vencimento + 'T00:00:00');
                    vencimento.setHours(0, 0, 0, 0);

                    const diffTime = vencimento.getTime() - hoje.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays >= 0 && diffDays <= 3) {
                        if (diffDays === 0) mensagens.push(`⚠️ Vence HOJE: "${c.descricao}" (${formatarMoeda(c.valor)})`);
                        else if (diffDays === 1) mensagens.push(`⏰ Vence AMANHÃ: "${c.descricao}" (${formatarMoeda(c.valor)})`);
                        else mensagens.push(`📅 Vence em ${diffDays} dias: "${c.descricao}" (${formatarMoeda(c.valor)})`);
                    } else if (diffDays < 0) {
                        mensagens.push(`🚨 ATRAZADO faz ${Math.abs(diffDays)} dias: "${c.descricao}" (${formatarMoeda(c.valor)})`);
                    }
                });

                setAlertas(mensagens);
            }
        };

        verificarVencimentosGerais();
    }, []);

    const formatarMoeda = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    if (alertas.length === 0 || oculto) return null;

    return (
        <div className="fixed top-6 right-6 z-[999] w-80 max-h-[400px] overflow-y-auto bg-gray-900/95 backdrop-blur text-white p-4 rounded-xl shadow-2xl border border-gray-800 flex flex-col gap-2 animate-fade-in">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2 mb-1">
                <span className="text-xs font-black tracking-wider uppercase text-yellow-400">⚠️ Alertas Financeiros ({alertas.length})</span>
                <button onClick={() => setOculto(true)} className="text-gray-400 hover:text-white text-xs font-bold bg-gray-800 px-1.5 py-0.5 rounded">Ocultar</button>
            </div>
            <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {alertas.map((alert, i) => (
                    <div key={i} className="text-xs font-semibold bg-gray-800/50 p-2.5 rounded-lg border border-gray-700/50 leading-relaxed">
                        {alert}
                    </div>
                ))}
            </div>
        </div>
    );
}