import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ajustarEstoqueDaVenda } from '../lib/operacoesEstoque';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

type Resultado = { data: unknown; error: null };

function consulta(resultado: Resultado) {
  const query: Record<string, ReturnType<typeof vi.fn>> & { then?: PromiseLike<Resultado>['then'] } = {};
  for (const metodo of ['select', 'eq', 'maybeSingle', 'single', 'update', 'insert']) {
    query[metodo] = vi.fn(() => query);
  }
  query.then = (resolver, rejeitar) => Promise.resolve(resultado).then(resolver, rejeitar);
  return query;
}

describe('ajustarEstoqueDaVenda', () => {
  const consultas: Array<{ tabela: string; query: ReturnType<typeof consulta> }> = [];

  beforeEach(() => {
    consultas.length = 0;
    vi.clearAllMocks();
  });

  it('rejeita quantidade de venda inválida antes de acessar o banco', async () => {
    await expect(ajustarEstoqueDaVenda({
      produtoId: 'produto-1', quantidade: 0, direcao: 'consumir', atendente: 'Tiago', motivo: 'Venda',
    })).rejects.toThrow('A quantidade da venda deve ser maior que zero.');

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('baixa um produto de revenda e registra a movimentação da venda', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
      const query = consulta(tabela === 'fichas_tecnicas'
        ? { data: null, error: null }
        : tabela === 'produtos'
          ? { data: { quantidade_estoque: 10 }, error: null }
          : { data: [], error: null });
      consultas.push({ tabela, query });
      return query;
    });

    await ajustarEstoqueDaVenda({
      produtoId: 'produto-1', vendaId: 'venda-1', quantidade: 3, direcao: 'consumir', atendente: 'Tiago', motivo: 'Venda balcão',
    });

    const produto = consultas.filter(({ tabela }) => tabela === 'produtos').at(-1)!.query;
    const movimentacao = consultas.filter(({ tabela }) => tabela === 'movimentacoes_estoque').at(-1)!.query;
    expect(produto.update).toHaveBeenCalledWith({ quantidade_estoque: 7 });
    expect(movimentacao.insert).toHaveBeenCalledWith([expect.objectContaining({
      produto_id: 'produto-1', venda_id: 'venda-1', quantidade: -3, tipo_movimento: 'Saída - Venda',
    })]);
  });

  it('baixa insumo proporcional de uma ficha técnica', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
      const resultado = tabela === 'fichas_tecnicas'
        ? { data: { id: 'ficha-1', rendimento_porcoes: 4 }, error: null }
        : tabela === 'ficha_ingredientes'
          ? { data: [{ insumo_id: 'insumo-1', produto_ingrediente_id: null, receita_base_id: null, quantidade_utilizada: 0.25 }], error: null }
          : tabela === 'insumos'
            ? { data: { quantidade_estoque: 2 }, error: null }
            : { data: [], error: null };
      const query = consulta(resultado);
      consultas.push({ tabela, query });
      return query;
    });

    await ajustarEstoqueDaVenda({
      produtoId: 'produto-receita', quantidade: 8, direcao: 'consumir', atendente: 'Tiago', motivo: 'Venda',
    });

    const insumo = consultas.filter(({ tabela }) => tabela === 'insumos').at(-1)!.query;
    const movimentacao = consultas.filter(({ tabela }) => tabela === 'movimentacoes_estoque').at(-1)!.query;
    expect(insumo.update).toHaveBeenCalledWith({ quantidade_estoque: 1.5 });
    expect(movimentacao.insert).toHaveBeenCalledWith([expect.objectContaining({
      insumo_id: 'insumo-1', quantidade: -0.5, tipo_movimento: 'Saída - Produção',
    })]);
  });

  it('reverte o estoque em vez de consumir quando uma venda é cancelada', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
      const query = consulta(tabela === 'fichas_tecnicas'
        ? { data: null, error: null }
        : tabela === 'produtos'
          ? { data: { quantidade_estoque: 4 }, error: null }
          : { data: [], error: null });
      consultas.push({ tabela, query });
      return query;
    });

    await ajustarEstoqueDaVenda({
      produtoId: 'produto-1', quantidade: 2, direcao: 'reverter', atendente: 'Tiago', motivo: 'Cancelamento',
    });

    const produto = consultas.filter(({ tabela }) => tabela === 'produtos').at(-1)!.query;
    const movimentacao = consultas.filter(({ tabela }) => tabela === 'movimentacoes_estoque').at(-1)!.query;
    expect(produto.update).toHaveBeenCalledWith({ quantidade_estoque: 6 });
    expect(movimentacao.insert).toHaveBeenCalledWith([expect.objectContaining({
      quantidade: 2, tipo_movimento: 'Entrada - Estorno Venda',
    })]);
  });
});
