-- Preserva o histórico de vendas e seus movimentos de estoque após um cancelamento.
-- Aplique esta migração depois de 20260831153000_integridade_operacional.sql.

begin;

alter table public.vendas
  add column if not exists status text not null default 'Concluída',
  add column if not exists cancelada_em timestamptz,
  add column if not exists motivo_cancelamento text;

create index if not exists vendas_caixa_status_idx on public.vendas(caixa_id, status);

commit;
