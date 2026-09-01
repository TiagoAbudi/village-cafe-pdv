-- Cancela contas sem apagar histórico. O cancelamento estorna somente o financeiro;
-- uma compra recebida não pode remover estoque automaticamente, pois ele pode já ter sido consumido.
-- Aplique esta migration somente após revisão, depois de 20260831173000_rls_operacional.sql.

alter table public.contas_pagar
  add column if not exists cancelada_em timestamptz,
  add column if not exists motivo_cancelamento text;

create index if not exists contas_pagar_status_idx on public.contas_pagar(status);

create or replace function public.cancelar_conta_pagar(
  p_conta_id uuid,
  p_caixa_id uuid default null,
  p_motivo text default 'Cancelamento realizado pelo financeiro'
) returns void
language plpgsql
as $$
declare
  v_conta record;
  v_pagamento jsonb;
  v_pagamentos jsonb;
  v_dinheiro numeric := 0;
  v_banco numeric := 0;
begin
  select * into v_conta from public.contas_pagar where id = p_conta_id for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  if v_conta.status = 'Cancelada' then raise exception 'Esta conta já foi cancelada'; end if;

  if v_conta.status = 'Pago' then
    v_pagamentos := coalesce(v_conta.pagamentos, '[]'::jsonb);
    if jsonb_typeof(v_pagamentos) <> 'array' or jsonb_array_length(v_pagamentos) = 0 then
      if coalesce(v_conta.metodo_pagamento, '') like '%+%' then
        raise exception 'Conta antiga com pagamento misto sem detalhamento; faça o estorno manualmente';
      end if;
      v_pagamentos := jsonb_build_array(jsonb_build_object(
        'metodo', coalesce(nullif(v_conta.metodo_pagamento, ''), 'PIX'),
        'valor', v_conta.valor
      ));
    end if;

    for v_pagamento in select value from jsonb_array_elements(v_pagamentos)
    loop
      if coalesce((v_pagamento ->> 'valor')::numeric, 0) <= 0 then raise exception 'Detalhamento de pagamento inválido'; end if;
      if v_pagamento ->> 'metodo' = 'Dinheiro' then
        v_dinheiro := v_dinheiro + (v_pagamento ->> 'valor')::numeric;
      elsif v_pagamento ->> 'metodo' in ('PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência') then
        v_banco := v_banco + (v_pagamento ->> 'valor')::numeric;
      else
        raise exception 'Método de pagamento inválido';
      end if;
    end loop;

    if v_dinheiro > 0 then
      if p_caixa_id is null or not exists (select 1 from public.controle_caixa where id = p_caixa_id and status = 'aberto') then
        raise exception 'É necessário um caixa aberto para estornar pagamento em dinheiro';
      end if;
      insert into public.movimentacoes_caixa (caixa_id, tipo, valor, descricao)
        values (p_caixa_id, 'suprimento', v_dinheiro, 'Estorno de despesa: ' || v_conta.descricao);
    end if;

    if v_banco > 0 then
      update public.conta_bancaria set saldo = saldo + v_banco where id = 1;
      if not found then raise exception 'Conta bancária padrão não encontrada'; end if;
    end if;
  end if;

  update public.contas_pagar
    set status = 'Cancelada', cancelada_em = now(), motivo_cancelamento = p_motivo
    where id = p_conta_id;
end;
$$;
