-- Compra em lote atômica para produtos de revenda e ingredientes.
-- Aplique somente após revisão, depois de 20260831183000_compra_ingrediente_atomica.sql.

create or replace function public.registrar_compra_lote(
  p_lote_id text,
  p_fornecedor_id uuid,
  p_itens jsonb,
  p_total numeric,
  p_pagamentos_imediatos jsonb,
  p_valor_prazo numeric,
  p_data_vencimento date,
  p_caixa_id uuid,
  p_atendente text
) returns void
language plpgsql
as $$
declare
  v_item jsonb;
  v_pagamento jsonb;
  v_produto record;
  v_total_itens numeric := 0;
  v_total_imediato numeric := 0;
  v_dinheiro numeric := 0;
  v_banco numeric := 0;
  v_metodos text;
  v_quantidade numeric;
  v_preco_custo numeric;
  v_preco_venda numeric;
  v_valor_linha numeric;
  v_tipo_item text;
  v_data_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if nullif(trim(p_lote_id), '') is null then raise exception 'Identificador de lote inválido'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'O lote deve possuir itens'; end if;
  if p_total <= 0 or p_valor_prazo < 0 then raise exception 'Valores do lote inválidos'; end if;
  if p_fornecedor_id is not null and not exists (select 1 from public.fornecedores where id = p_fornecedor_id) then
    raise exception 'Fornecedor não encontrado';
  end if;
  if p_valor_prazo > 0 and p_data_vencimento is null then raise exception 'Informe a data de vencimento'; end if;
  if exists (select 1 from public.movimentacoes_estoque where motivo = 'Abastecimento via Lote [LOTE-' || p_lote_id || ']') then
    raise exception 'Este lote já foi registrado';
  end if;

  for v_pagamento in select value from jsonb_array_elements(coalesce(p_pagamentos_imediatos, '[]'::jsonb))
  loop
    if coalesce((v_pagamento ->> 'valor')::numeric, 0) <= 0 then raise exception 'Pagamento imediato inválido'; end if;
    case v_pagamento ->> 'metodo'
      when 'Dinheiro' then v_dinheiro := v_dinheiro + (v_pagamento ->> 'valor')::numeric;
      when 'PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência' then v_banco := v_banco + (v_pagamento ->> 'valor')::numeric;
      else raise exception 'Método de pagamento inválido';
    end case;
    v_total_imediato := v_total_imediato + (v_pagamento ->> 'valor')::numeric;
  end loop;
  if round(v_total_imediato + p_valor_prazo, 2) <> round(p_total, 2) then
    raise exception 'Os pagamentos devem totalizar o valor do lote';
  end if;
  if v_dinheiro > 0 and (p_caixa_id is null or not exists (select 1 from public.controle_caixa where id = p_caixa_id and status = 'aberto')) then
    raise exception 'É necessário um caixa aberto para pagamento em dinheiro';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    v_tipo_item := v_item ->> 'tipo_item';
    v_quantidade := (v_item ->> 'quantidade_estoque')::numeric;
    v_preco_custo := (v_item ->> 'preco_custo')::numeric;
    v_preco_venda := coalesce((v_item ->> 'preco_venda')::numeric, 0);
    v_valor_linha := (v_item ->> 'valor_linha')::numeric;
    if v_tipo_item not in ('produto', 'insumo') or v_quantidade <= 0 or v_preco_custo < 0 or v_valor_linha <= 0 then
      raise exception 'Item de lote inválido';
    end if;
    v_total_itens := v_total_itens + v_valor_linha;

    select * into v_produto from public.produtos where id = (v_item ->> 'produto_id')::uuid for update;
    if not found then raise exception 'Produto do lote não encontrado'; end if;
    if v_tipo_item = 'produto' and v_produto.tipo <> 'venda' then raise exception 'Produto de revenda inválido'; end if;
    if v_tipo_item = 'insumo' and v_produto.tipo <> 'ingrediente' then raise exception 'Ingrediente inválido'; end if;

    if v_tipo_item = 'produto' then
      update public.produtos
        set quantidade_estoque = coalesce(quantidade_estoque, 0) + v_quantidade,
          preco_custo = v_preco_custo, preco_venda = v_preco_venda
        where id = v_produto.id;
    else
      update public.produtos
        set quantidade_estoque = coalesce(quantidade_estoque, 0) + v_quantidade,
          preco_custo = v_preco_custo, preco_total_pago = v_valor_linha
        where id = v_produto.id;
      perform public.recalcular_custos_a_partir_do_ingrediente(v_produto.id, v_preco_custo);
    end if;
    insert into public.movimentacoes_estoque (produto_id, quantidade, tipo_movimento, motivo, atendente)
      values (v_produto.id, v_quantidade, 'Entrada - Compra Lote', 'Abastecimento via Lote [LOTE-' || p_lote_id || ']', p_atendente);
  end loop;
  if round(v_total_itens, 2) <> round(p_total, 2) then raise exception 'Os itens não totalizam o valor do lote'; end if;

  if v_total_imediato > 0 then
    select string_agg(distinct value ->> 'metodo', ' + ' order by value ->> 'metodo')
      into v_metodos from jsonb_array_elements(p_pagamentos_imediatos);
    insert into public.contas_pagar (
      descricao, fornecedor_id, valor, valor_original, data_vencimento, data_pagamento,
      status, metodo_pagamento, pagamentos
    ) values (
      'Compra Lote [LOTE-' || p_lote_id || '] (Pag. Imediato)', p_fornecedor_id,
      v_total_imediato, v_total_imediato, v_data_hoje, v_data_hoje,
      'Pago', v_metodos, p_pagamentos_imediatos
    );
    if v_dinheiro > 0 then
      insert into public.movimentacoes_caixa (caixa_id, tipo, valor, descricao)
        values (p_caixa_id, 'despesa', v_dinheiro, 'Pago: Compra Estoque (Lote)');
    end if;
    if v_banco > 0 then
      update public.conta_bancaria set saldo = saldo - v_banco where id = 1;
      if not found then raise exception 'Conta bancária padrão não encontrada'; end if;
    end if;
  end if;

  if p_valor_prazo > 0 then
    insert into public.contas_pagar (descricao, fornecedor_id, valor, valor_original, data_vencimento, status)
      values ('Compra Lote [LOTE-' || p_lote_id || '] (A Prazo)', p_fornecedor_id, p_valor_prazo, p_valor_prazo, p_data_vencimento, 'Pendente');
  end if;
end;
$$;
