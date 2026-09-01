-- Integridade mínima para vincular vendas, custos e caixa.
-- Aplique esta migração no projeto Supabase antes de publicar a versão que usa RPCs.

begin;

alter table public.vendas
  add column if not exists caixa_id uuid references public.controle_caixa(id),
  add column if not exists pagamentos jsonb not null default '[]'::jsonb;

alter table public.itens_venda
  add column if not exists custo_unitario numeric(14, 4);

alter table public.contas_pagar
  add column if not exists valor_original numeric(14, 2),
  add column if not exists pagamentos jsonb not null default '[]'::jsonb;

alter table public.movimentacoes_estoque
  add column if not exists venda_id uuid references public.vendas(id);

create index if not exists vendas_caixa_id_idx on public.vendas(caixa_id);
create index if not exists vendas_data_venda_idx on public.vendas(data_venda desc);
create index if not exists itens_venda_venda_id_idx on public.itens_venda(venda_id);
create index if not exists movimentacoes_estoque_venda_id_idx on public.movimentacoes_estoque(venda_id);
create index if not exists contas_pagar_status_vencimento_idx on public.contas_pagar(status, data_vencimento);

-- Impede dois caixas abertos ao mesmo tempo. A condição preserva o histórico de caixas fechados.
create unique index if not exists controle_caixa_unico_aberto_idx
  on public.controle_caixa(status)
  where status = 'aberto';

commit;
