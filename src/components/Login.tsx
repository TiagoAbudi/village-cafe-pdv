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
      setErro('Credenciais inválidas. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cafe-bg p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 border border-cafe-secondary/20">
        <div className="text-center mb-8">
          <img src={logo} alt="Logo Village Cafe" className="w-16 h-16 rounded-full bg-cafe-secondary flex items-center justify-center font-bold text-cafe-dark text-3xl mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-cafe-primary uppercase tracking-wider">Village Cafe & Bar</h2>
          <p className="text-sm text-gray-500 mt-2">Acesso Restrito</p>
        </div>

        {erro && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm text-center border border-red-200">{erro}</div>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-cafe-dark mb-1">E-mail</label>
            <input 
              type="email" required
              className="w-full p-3 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-cafe-secondary"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-cafe-dark mb-1">Senha</label>
            <input 
              type="password" required
              className="w-full p-3 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-cafe-secondary"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button 
            type="submit" disabled={loading}
            className="w-full bg-cafe-primary text-white font-bold py-3 rounded hover:bg-cafe-dark transition shadow-md disabled:opacity-70 mt-4"
          >
            {loading ? 'A Entrar...' : 'ENTRAR'}
          </button>
        </form>
      </div>
    </div>
  );
}