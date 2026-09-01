import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertasGlobaisProvider from '../components/AlertasGlobaisProvider';
import CadastroRevenda from '../components/CadastroRevenda';
import ContasPagarModulo from '../components/ContasPagarModulo';
import DashboardModulo from '../components/DashboardModulo';
import DashboardRendimentos from '../components/DashboardRendimentos';
import EntradasCompras from '../components/EntradasCompras';
import GestaoComandas from '../components/GestaoComandas';
import PrecificacaoModulo from '../components/PrecificacaoModulo';
import RelatorioVendasModulo from '../components/RelatorioVendasModulo';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

type Resultado = { data: unknown; error: null; count?: number };

function criarConsulta(resultado: Resultado) {
  const query: Record<string, ReturnType<typeof vi.fn>> & { then?: PromiseLike<Resultado>['then'] } = {};
  for (const metodo of ['select', 'eq', 'neq', 'is', 'gte', 'lte', 'not', 'or', 'order', 'limit', 'range', 'maybeSingle', 'single', 'insert', 'update', 'delete']) {
    query[metodo] = vi.fn(() => query);
  }
  query.then = (resolver, rejeitar) => Promise.resolve(resultado).then(resolver, rejeitar);
  return query;
}

function configurarSupabaseVazio() {
  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => criarConsulta({
    data: tabela === 'controle_caixa' || tabela === 'conta_bancaria' ? null : [],
    error: null,
    count: 0,
  }));
  (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null } });
}

describe('módulos operacionais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configurarSupabaseVazio();
  });

  it('apresenta o fluxo de abertura quando não existe caixa aberto', async () => {
    render(<DashboardModulo />);
    await waitFor(() => expect(screen.getByText('Caixa Fechado')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /abrir caixa/i })).toBeInTheDocument();
  });

  it('bloqueia a gestão de comandas sem caixa aberto', async () => {
    render(<GestaoComandas atendente="Teste" />);
    await waitFor(() => expect(screen.getByText('Caixa Fechado')).toBeInTheDocument());
    expect(screen.getByText(/Abra o caixa no Dashboard para gerir comandas/i)).toBeInTheDocument();
  });

  it('carrega a área de compras sem dados e preserva os formulários operacionais', async () => {
    render(<EntradasCompras atendente="Teste" />);
    await waitFor(() => expect(screen.getByText(/Gestão de Compras/i)).toBeInTheDocument());
    expect(screen.getByText(/Registar Entrada/i)).toBeInTheDocument();
    expect(screen.getByText(/Inventário de Base/i)).toBeInTheDocument();
  });

  it('carrega a engenharia de cardápio e seus quatro estágios', async () => {
    render(<PrecificacaoModulo />);
    await waitFor(() => expect(screen.getByText('Engenharia de Cardápio')).toBeInTheDocument());
    expect(screen.getByText(/1\. Insumos e Custos/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Bases\/Recheios/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Fichas Técnicas/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Painel\/Diagnóstico/i)).toBeInTheDocument();
  });

  it('calcula o custo unitário inicial ao cadastrar um insumo técnico', async () => {
    const consultas: Array<{ tabela: string; query: ReturnType<typeof criarConsulta> }> = [];
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
      const query = criarConsulta({ data: tabela === 'controle_caixa' ? null : [], error: null, count: 0 });
      consultas.push({ tabela, query });
      return query;
    });
    const user = userEvent.setup();
    render(<PrecificacaoModulo />);

    await waitFor(() => expect(screen.getByText('Engenharia de Cardápio')).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText('Ex: Leite Integral'), 'Leite integral');
    await user.type(screen.getByPlaceholderText('0.00'), '24');
    await user.type(screen.getByPlaceholderText('Ex: 1 (se 1Kg)'), '2');
    await user.clear(screen.getByPlaceholderText('1.0'));
    await user.type(screen.getByPlaceholderText('1.0'), '1.1');
    await user.click(screen.getByRole('button', { name: /salvar insumo/i }));

    await waitFor(() => {
      const insumo = consultas.filter(({ tabela }) => tabela === 'insumos').find(({ query }) => query.insert.mock.calls.length > 0)?.query;
      expect(insumo?.insert).toHaveBeenCalledWith([expect.objectContaining({
        nome: 'Leite integral', qtd_embalagem: 2, preco_total_pago: 24, fator_correcao: 1.1,
        custo_unitario: 13.200000000000001, quantidade_estoque: 0,
      })]);
    });
  });

  it('carrega o cadastro de produtos de revenda', async () => {
    render(<CadastroRevenda atendente="Teste" />);
    await waitFor(() => expect(screen.getByText(/Gestão de Estoque \(Produtos Prontos\)/i)).toBeInTheDocument());
    expect(screen.getByText('Novo Produto')).toBeInTheDocument();
    expect(screen.getByText(/Catálogo e Estoque/i)).toBeInTheDocument();
  });

  it('carrega contas a pagar sem lançamentos', async () => {
    render(<ContasPagarModulo />);
    await waitFor(() => expect(screen.getByText('Gestão Financeira')).toBeInTheDocument());
    expect(screen.getByText(/Lançamento de Despesa/i)).toBeInTheDocument();
    expect(screen.getByText(/Contas Pendentes/i)).toBeInTheDocument();
  });

  it('calcula e apresenta o painel de rendimentos vazio', async () => {
    render(<DashboardRendimentos />);
    await waitFor(() => expect(screen.getByText('Painel de Rendimentos')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Faturamento Bruto')).toBeInTheDocument());
    expect(screen.getAllByText(/R\$\s*0,00/).length).toBeGreaterThan(0);
  });

  it('apresenta relatório de vendas vazio sem falhar', async () => {
    render(<RelatorioVendasModulo />);
    await waitFor(() => expect(screen.getByText('Auditoria de Vendas')).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText(/Nenhuma venda encontrada neste período/i).length).toBeGreaterThan(0));
  });

  it('exibe alertas de vencimento autenticados e permite ocultá-los', async () => {
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: { user: { id: 'usuario-1' } } } });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => criarConsulta({
      data: tabela === 'contas_pagar'
        ? [{ descricao: 'Conta de teste', valor: 42.5, data_vencimento: new Date().toISOString().slice(0, 10), status: 'Pendente' }]
        : [],
      error: null,
    }));

    const user = userEvent.setup();
    render(<AlertasGlobaisProvider />);
    await waitFor(() => expect(screen.getByText(/Vence HOJE: Conta de teste/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /ocultar/i }));
    expect(screen.queryByText(/Vence HOJE: Conta de teste/i)).not.toBeInTheDocument();
  });
});
