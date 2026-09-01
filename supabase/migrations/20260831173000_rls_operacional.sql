-- Protege os dados operacionais contra acesso pela chave anônima sem sessão.
-- O sistema atual não possui perfis: todo usuário autenticado mantém acesso operacional.

do $$
declare
  v_tabela text;
  v_policy record;
begin
  foreach v_tabela in array array[
    'produtos', 'fornecedores', 'fichas_tecnicas', 'ficha_ingredientes',
    'receitas_base', 'receitas_base_itens', 'vendas', 'itens_venda',
    'controle_caixa', 'movimentacoes_caixa', 'movimentacoes_estoque',
    'conta_bancaria', 'contas_pagar', 'comandas', 'itens_comanda',
    'parametros_precificacao', 'insumos', 'fichas_produtos', 'fichas_produtos_itens'
  ]
  loop
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_tabela and c.relkind = 'r'
    ) then
      execute format('alter table public.%I enable row level security', v_tabela);

      -- Remove políticas antigas para não manter, por acidente, uma regra permissiva para anon/public.
      for v_policy in
        select policyname from pg_policies where schemaname = 'public' and tablename = v_tabela
      loop
        execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_tabela);
      end loop;

      execute format(
        'create policy village_cafe_authenticated_all on public.%I for all to authenticated using (true) with check (true)',
        v_tabela
      );
    end if;
  end loop;
end;
$$;
