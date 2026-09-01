-- Fase 1 da consolidação de CMV: vínculos aditivos para insumos nas fichas e no estoque.
-- Não move nem apaga dados existentes; o modelo atual continua compatível durante a transição.
-- Aplique somente após revisão, depois de 20260831191000_ajuste_estoque_atomico.sql.

begin;

alter table public.ficha_ingredientes
  add column if not exists insumo_id uuid references public.insumos(id);

alter table public.movimentacoes_estoque
  add column if not exists insumo_id uuid references public.insumos(id);

create index if not exists ficha_ingredientes_insumo_id_idx
  on public.ficha_ingredientes(insumo_id);

create index if not exists movimentacoes_estoque_insumo_id_idx
  on public.movimentacoes_estoque(insumo_id);

comment on column public.ficha_ingredientes.insumo_id is
  'Insumo comprado usado diretamente na ficha final. Durante a transição, produto_ingrediente_id permanece compatível.';

comment on column public.movimentacoes_estoque.insumo_id is
  'Insumo movimentado. produto_id continua sendo usado para produtos de revenda e compatibilidade histórica.';

commit;
