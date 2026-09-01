-- Edição de vendas e baixa de contas a pagar como operações indivisíveis.
-- Aplique esta migração depois de 20260831163000_registrar_venda_atomica.sql.

create or replace function public.editar_venda(
  p_venda_id uuid,
  p_identificacao_pedido text,
  p_total numeric,
  p_desconto numeric,
  p_pagamentos jsonb,
  p_atendente text,
  p_itens jsonb
) returns uuid
language plpgsql
as $$
declare
  v_caixa_id uuid;
begin
  select caixa_id into v_caixa_id from public.vendas where id = p_venda_id and status = 'Concluída' for update;
  if not found then raise exception 'Venda concluída não encontrada'; end if;
  perform public.cancelar_venda(p_venda_id, 'Venda substituída por edição');
  return public.registrar_venda(v_caixa_id, p_identificacao_pedido, p_total, p_desconto, p_pagamentos, p_atendente, p_itens);
end;
$$;

create or replace function public.baixar_conta_pagar(
  p_conta_id uuid,
  p_valor numeric,
  p_pagamentos jsonb,
  p_caixa_id uuid default null
) returns void
language plpgsql
as $$
declare
  v_conta record;
  v_pagamento jsonb;
  v_total_pago numeric := 0;
  v_dinheiro numeric := 0;
  v_banco numeric := 0;
  v_metodos text;
begin
  if p_valor <= 0 then raise exception 'O valor de pagamento deve ser maior que zero'; end if;
  if jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento';
  end if;
  select * into v_conta from public.contas_pagar where id = p_conta_id for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  if v_conta.status <> 'Pendente' then raise exception 'A conta já foi baixada'; end if;

  for v_pagamento in select value from jsonb_array_elements(p_pagamentos)
  loop
    if coalesce((v_pagamento ->> 'valor')::numeric, 0) <= 0 then raise exception 'Pagamento inválido'; end if;
    case v_pagamento ->> 'metodo'
      when 'Dinheiro' then v_dinheiro := v_dinheiro + (v_pagamento ->> 'valor')::numeric;
      when 'PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência' then v_banco := v_banco + (v_pagamento ->> 'valor')::numeric;
      else raise exception 'Método de pagamento inválido';
    end case;
    v_total_pago := v_total_pago + (v_pagamento ->> 'valor')::numeric;
  end loop;
  if round(v_total_pago, 2) <> round(p_valor, 2) then raise exception 'Os pagamentos devem totalizar o valor da baixa'; end if;

  if v_dinheiro > 0 then
    if p_caixa_id is null or not exists (select 1 from public.controle_caixa where id = p_caixa_id and status = 'aberto') then
      raise exception 'É necessário um caixa aberto para pagamento em dinheiro';
    end if;
    insert into public.movimentacoes_caixa (caixa_id, tipo, valor, descricao)
      values (p_caixa_id, 'despesa', v_dinheiro, 'Pago: ' || v_conta.descricao);
  end if;
  if v_banco > 0 then
    update public.conta_bancaria set saldo = saldo - v_banco where id = 1;
    if not found then raise exception 'Conta bancária padrão não encontrada'; end if;
  end if;

  select string_agg(distinct value ->> 'metodo', ' + ' order by value ->> 'metodo')
    into v_metodos from jsonb_array_elements(p_pagamentos);
  update public.contas_pagar
    set status = 'Pago', data_pagamento = (now() at time zone 'America/Sao_Paulo')::date, metodo_pagamento = v_metodos,
      valor = p_valor, valor_original = coalesce(valor_original, v_conta.valor), pagamentos = p_pagamentos
    where id = p_conta_id;
end;
$$;
