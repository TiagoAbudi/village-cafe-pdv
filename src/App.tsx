import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

import logo from './assets/logo.svg';

import PrecificacaoModulo from './components/PrecificacaoModulo';
import EntradasCompras from './components/EntradasCompras';
import CadastroRevenda from './components/CadastroRevenda';
import PDVModulo from './components/PDVModulo';
import Login from './components/Login';
import DashboardModulo from './components/DashboardModulo';
import ContasPagarModulo from './components/ContasPagarModulo';
import GestaoComandas from './components/GestaoComandas';
import DashboardRendimentos from './components/DashboardRendimentos';
import AlertasGlobaisProvider from './components/AlertasGlobaisProvider';
import RelatorioVendasModulo from './components/RelatorioVendasModulo';

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

  if (carregandoAuth) return <div className="min-h-screen bg-cafe-bg flex items-center justify-center font-bold text-cafe-primary">Carregando Sistema...</div>;

  if (!session) return <Login />;

  // NOVO: Captura o nome definido no metadata ou usa o e-mail do funcionário logado
  const atendenteNome = session.user.user_metadata?.nome || session.user.email || 'Desconhecido';

  return (
    <div className="min-h-screen bg-cafe-bg text-cafe-dark font-sans flex flex-col">
      <AlertasGlobaisProvider />
      <header className="bg-cafe-primary text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">

          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo Village Cafe" className="h-10 w-auto drop-shadow-sm" />
            <h1 className="text-xl font-bold tracking-wider uppercase hidden sm:block">Village Cafe</h1>
          </div>

          <nav className="flex items-center gap-1 bg-cafe-dark/40 p-1 rounded-lg w-full sm:w-auto overflow-x-auto text-sm">
            <button onClick={() => setAbaAtiva('pdv')} className={`px-3 py-2 font-semibold rounded-md transition-all whitespace-nowrap ${abaAtiva === 'pdv' ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-gray-300 hover:text-white'}`}>PDV Caixa</button>
            <button onClick={() => setAbaAtiva('comandas')} className={`px-3 py-2 font-semibold rounded-md transition-all whitespace-nowrap ${abaAtiva === 'comandas' ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-gray-300 hover:text-white'}`}>Comandas</button>
            <button onClick={() => setAbaAtiva('dashboard')} className={`px-3 py-2 font-semibold rounded-md transition-all whitespace-nowrap ${abaAtiva === 'dashboard' ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-gray-300 hover:text-white'}`}>Dashboard</button>
            <button onClick={() => setAbaAtiva('precificacao')} className={`px-3 py-2 font-semibold rounded-md transition-all whitespace-nowrap ${abaAtiva === 'precificacao' ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-gray-300 hover:text-white'}`}>Fichas</button>
            <button onClick={() => setAbaAtiva('revenda')} className={`px-3 py-2 font-semibold rounded-md transition-all whitespace-nowrap ${abaAtiva === 'revenda' ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-gray-300 hover:text-white'}`}>Revenda</button>
            <button onClick={() => setAbaAtiva('entradas')} className={`px-3 py-2 font-semibold rounded-md transition-all whitespace-nowrap ${abaAtiva === 'entradas' ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-gray-300 hover:text-white'}`}>Estoque</button>
            <button onClick={() => setAbaAtiva('financeiro')} className={`px-3 py-2 font-semibold rounded-md transition-all whitespace-nowrap ${abaAtiva === 'financeiro' ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-gray-300 hover:text-white'}`}>Financeiro</button>
            <button onClick={() => setAbaAtiva('rendimentos')} className={`px-3 py-2 font-semibold rounded-md transition-all whitespace-nowrap ${abaAtiva === 'rendimentos' ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-gray-300 hover:text-white'}`}>Rendimentos</button>
            <button onClick={() => setAbaAtiva('relatorio-vendas')} className={`px-3 py-2 font-semibold rounded-md transition-all whitespace-nowrap ${abaAtiva === 'relatorio-vendas' ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-gray-300 hover:text-white'}`}>Relatório de Vendas</button>
          </nav>

          {/* ATUALIZADO: Mostra um alô para o atendente logado ao lado do botão Sair */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300 hidden md:inline">Olá, <strong className="text-white">{atendenteNome}</strong></span>
            <button onClick={handleLogout} className="text-xs bg-red-600 hover:bg-red-700 px-3 py-2 rounded font-bold shadow transition-colors whitespace-nowrap">Sair</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {/* ATUALIZADO: Passando o atendente ativo para dentro do módulo do PDV */}
        {abaAtiva === 'pdv' && <PDVModulo atendente={atendenteNome} />}
        {abaAtiva === 'dashboard' && <DashboardModulo />}
        {abaAtiva === 'precificacao' && <PrecificacaoModulo />}
        {abaAtiva === 'revenda' && <CadastroRevenda atendente={atendenteNome} />}
        {abaAtiva === 'entradas' && <EntradasCompras atendente={atendenteNome} />}
        {abaAtiva === 'financeiro' && <ContasPagarModulo />}
        {abaAtiva === 'comandas' && <GestaoComandas atendente={atendenteNome} />}
        {abaAtiva === 'rendimentos' && <DashboardRendimentos />}
        {abaAtiva === 'relatorio-vendas' && <RelatorioVendasModulo />}
      </main>
    </div>
  );
}

export default App;