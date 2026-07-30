import { useState } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.svg';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErro('Credenciais inválidas. Verifique seu e-mail e senha.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cafe-bg p-4 relative overflow-hidden">

      {/* Decoração de fundo sutil (Opcional) */}
      <div className="absolute top-0 left-0 w-full h-64 bg-cafe-primary/10 rounded-b-[100px] md:rounded-b-[300px] -z-10"></div>

      <div className="max-w-md w-full bg-white rounded-[2rem] shadow-2xl p-6 md:p-10 border border-gray-100 relative z-10 animate-fade-in">

        {/* Faixa de destaque no topo do card */}
        <div className="absolute top-0 left-0 w-full h-2 bg-cafe-primary"></div>

        <div className="text-center mb-8">
          <img src={logo} alt="Logo Village Cafe" className="w-20 h-20 mx-auto mb-4 drop-shadow-md" />
          <h2 className="text-2xl md:text-3xl font-black text-cafe-dark uppercase tracking-widest">Village Cafe</h2>
          <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Acesso Restrito ao Sistema</p>
        </div>

        {erro && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl text-sm font-bold text-center border border-red-100 flex items-center justify-center gap-2 animate-fade-in">
            <span className="text-lg">⚠️</span>
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">E-mail de Acesso</label>
            <input
              type="email"
              required
              placeholder="seu@email.com"
              className="w-full p-4 md:p-3.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-cafe-primary focus:border-transparent bg-gray-50 text-base md:text-sm font-medium transition-all text-gray-800"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Senha de Segurança</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              className="w-full p-4 md:p-3.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-cafe-primary focus:border-transparent bg-gray-50 text-base md:text-sm font-medium transition-all text-gray-800"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cafe-primary text-white font-black text-sm uppercase tracking-widest py-4 md:py-3.5 rounded-xl hover:bg-cafe-dark transition-all shadow-lg hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed active:scale-95 mt-4"
          >
            {loading ? 'A Autenticar...' : 'Entrar no Sistema'}
          </button>
        </form>

      </div>
    </div>
  );
}