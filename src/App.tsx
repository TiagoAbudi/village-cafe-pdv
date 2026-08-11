import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

import logo from './assets/logo.svg';
import AlertasGlobaisProvider from './components/AlertasGlobaisProvider';
import Login from './components/Login';

const PrecificacaoModulo = lazy(() => import('./components/PrecificacaoModulo'));
const EntradasCompras = lazy(() => import('./components/EntradasCompras'));
const CadastroRevenda = lazy(() => import('./components/CadastroRevenda'));
const PDVModulo = lazy(() => import('./components/PDVModulo'));
const DashboardModulo = lazy(() => import('./components/DashboardModulo'));
const ContasPagarModulo = lazy(() => import('./components/ContasPagarModulo'));
const GestaoComandas = lazy(() => import('./components/GestaoComandas'));
const DashboardRendimentos = lazy(() => import('./components/DashboardRendimentos'));
const RelatorioVendasModulo = lazy(() => import('./components/RelatorioVendasModulo'));

type Aba = 'dashboard' | 'pdv' | 'precificacao' | 'revenda' | 'entradas' | 'financeiro' | 'comandas' | 'rendimentos' | 'relatorio-vendas';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<Aba>('pdv');
  const [carregandoAuth, setCarregandoAuth] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCarregandoAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (carregandoAuth) {
    return (
      <div className="min-h-screen bg-cafe-bg flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-cafe-secondary border-t-cafe-primary rounded-full animate-spin mb-4"></div>
        <div className="font-black text-cafe-primary uppercase tracking-widest animate-pulse">Carregando Sistema...</div>
      </div>
    );
  }

  if (!session) return <Login />;

  const atendenteNome = session.user.user_metadata?.nome || session.user.email || 'Desconhecido';

  return (
    <div className="min-h-screen bg-cafe-bg text-cafe-dark font-sans flex flex-col">
      <AlertasGlobaisProvider />

      {/* HEADER REDESENHADO PARA MOBILE E DESKTOP */}
      <header className="bg-cafe-primary text-white shadow-md z-50 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 py-3">

          {/* Linha 1: Logo e Controle de Usuário */}
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Logo Village Cafe" className="h-8 md:h-10 w-auto drop-shadow-sm" />
              <h1 className="text-lg md:text-xl font-black tracking-widest uppercase hidden sm:block">Village Cafe</h1>
            </div>

            <div className="flex items-center gap-3 md:gap-4 bg-cafe-dark/30 py-1.5 px-3 md:px-4 rounded-xl border border-cafe-dark/50">
              <span className="text-[10px] md:text-xs font-bold text-cafe-secondary uppercase tracking-wider hidden sm:block">
                Conectado: <strong className="text-white ml-1">{atendenteNome}</strong>
              </span>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider sm:hidden">
                {atendenteNome.split(' ')[0]}
              </span>
              <div className="w-[1px] h-4 bg-cafe-secondary/30"></div>
              <button onClick={handleLogout} className="text-[10px] md:text-xs text-red-400 hover:text-red-300 font-black uppercase tracking-wider transition-colors">
                Sair
              </button>
            </div>
          </div>

          {/* Linha 2: Navegação com Scroll Horizontal Fio (Esconde a barra de rolagem nativa) */}
          <nav className="flex items-center gap-2 overflow-x-auto w-full pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              onClick={() => setAbaAtiva('pdv')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'pdv' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              PDV Caixa
            </button>
            <button
              onClick={() => setAbaAtiva('comandas')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'comandas' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Comandas
            </button>
            <button
              onClick={() => setAbaAtiva('dashboard')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'dashboard' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setAbaAtiva('precificacao')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'precificacao' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Fichas
            </button>
            <button
              onClick={() => setAbaAtiva('revenda')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'revenda' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Revenda
            </button>
            <button
              onClick={() => setAbaAtiva('entradas')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'entradas' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Estoque
            </button>
            <button
              onClick={() => setAbaAtiva('financeiro')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'financeiro' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Financeiro
            </button>
            <button
              onClick={() => setAbaAtiva('rendimentos')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'rendimentos' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Rendimentos
            </button>
            <button
              onClick={() => setAbaAtiva('relatorio-vendas')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'relatorio-vendas' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Vendas
            </button>
          </nav>
        </div>
      </header>

      {/* ÁREA PRINCIPAL DO SISTEMA */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2 md:px-4 py-4 md:py-6 overflow-x-hidden">
        <Suspense fallback={<div className="p-6 text-center">Carregando módulo...</div>}>
          {abaAtiva === 'pdv' && <PDVModulo atendente={atendenteNome} />}
          {abaAtiva === 'dashboard' && <DashboardModulo />}
          {abaAtiva === 'precificacao' && <PrecificacaoModulo />}
          {abaAtiva === 'revenda' && <CadastroRevenda atendente={atendenteNome} />}
          {abaAtiva === 'entradas' && <EntradasCompras atendente={atendenteNome} />}
          {abaAtiva === 'financeiro' && <ContasPagarModulo />}
          {abaAtiva === 'comandas' && <GestaoComandas atendente={atendenteNome} />}
          {abaAtiva === 'rendimentos' && <DashboardRendimentos />}
          {abaAtiva === 'relatorio-vendas' && <RelatorioVendasModulo />}
        </Suspense>
      </main>
    </div>
  );
}

export default App;