-- Consolida o uso de public.insumos no CMV, nas compras e nas baixas de estoque.
-- Esta migração é compatível com vendas e fichas legadas que ainda usam produto_ingrediente_id.
-- Aplique depois de 20260831192000_base_consolidacao_insumos.sql.

create or replace function public.recalcular_custos_cmv()
returns void
language plpgsql
as $$
begin
  -- Custo de cada item da receita-base a partir do último custo unitário do insumo.
  update public.receitas_base_itens rbi
    set custo_calculado = rbi.qtd_usada * coalesce(i.custo_unitario, 0)
    from public.insumos i
    where i.id = rbi.insumo_id;

  -- Custo total e custo por unidade de cada preparo intermediário.
  update public.receitas_base rb
    set custo_total = coalesce(custos.total, 0),
        custo_por_unidade = case
          when coalesce(rb.rendimento_peso, 0) > 0 then coalesce(custos.total, 0) / rb.rendimento_peso
          else 0
        end
    from (
      select receita_base_id, sum(coalesce(custo_calculado, 0)) as total
      from public.receitas_base_itens
      group by receita_base_id
    ) custos
    where rb.id = custos.receita_base_id;

  -- Atualiza os custos de matérias-primas e receitas-base usados nas fichas finais.
  update public.ficha_ingredientes fi
    set custo_calculado = case
      when fi.insumo_id is not null then fi.quantidade_utilizada * coalesce((select i.custo_unitario from public.insumos i where i.id = fi.insumo_id), 0)
      when fi.receita_base_id is not null then fi.quantidade_utilizada * coalesce((select rb.custo_por_unidade from public.receitas_base rb where rb.id = fi.receita_base_id), 0)
      else fi.custo_calculado
    end
    where fi.insumo_id is not null or fi.receita_base_id is not null;

  -- CMV da receita final e custo unitário do item de venda.
  update public.fichas_tecnicas ft
    set custo_total = coalesce(custos.total, 0)
    from (
      select ficha_id, sum(coalesce(custo_calculado, 0)) as total
      from public.ficha_ingredientes
      group by ficha_id
    ) custos
    where ft.id = custos.ficha_id;

  update public.produtos p
    set preco_custo = case
      when coalesce(ft.rendimento_porcoes, 0) > 0 then coalesce(ft.custo_total, 0) / ft.rendimento_porcoes
      else 0
    end
    from public.fichas_tecnicas ft
    where ft.produto_venda_id = p.id;
end;
$$;

create or replace function public.registrar_compra_insumo(
  p_insumo_id uuid,
  p_fornecedor_id uuid,
  p_quantidade_estoque numeric,
  p_valor_total numeric,
  p_custo_unitario numeric,
  p_gerar_conta_pagar boolean,
  p_data_vencimento date,
  p_metodo_pagamento text,
  p_caixa_id uuid,
  p_atendente text
) returns void
language plpgsql
as $$
declare
  v_insumo record;
  v_fornecedor_nome text;
  v_data_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_quantidade_estoque <= 0 or p_valor_total <= 0 or p_custo_unitario < 0 then
    raise exception 'Dados da compra inválidos';
  end if;
  if p_gerar_conta_pagar and p_data_vencimento is null then
    raise exception 'Informe a data de vencimento';
  end if;
  if not p_gerar_conta_pagar and p_metodo_pagamento not in ('PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência') then
    raise exception 'Método de pagamento inválido';
  end if;

  select * into v_insumo from public.insumos where id = p_insumo_id for update;
  if not found then raise exception 'Insumo não encontrado'; end if;
  select nome into v_fornecedor_nome from public.fornecedores where id = p_fornecedor_id;
  if not found then raise exception 'Fornecedor não encontrado'; end if;

  update public.insumos
    set quantidade_estoque = coalesce(quantidade_estoque, 0) + p_quantidade_estoque,
        custo_unitario = p_custo_unitario,
        preco_total_pago = p_valor_total
    where id = p_insumo_id;
  insert into public.movimentacoes_estoque (insumo_id, quantidade, tipo_movimento, motivo, atendente)
    values (p_insumo_id, p_quantidade_estoque, 'Entrada - Compra', 'Nota Fornecedor: ' || v_fornecedor_nome, p_atendente);

  perform public.recalcular_custos_cmv();

  if p_gerar_conta_pagar then
    insert into public.contas_pagar (descricao, fornecedor_id, valor, valor_original, data_vencimento, status)
      values ('Compra Insumo: ' || v_insumo.nome, p_fornecedor_id, p_valor_total, p_valor_total, p_data_vencimento, 'Pendente');
  else
    if p_metodo_pagamento = 'Dinheiro' then
      if p_caixa_id is null or not exists (select 1 from public.controle_caixa where id = p_caixa_id and status = 'aberto') then
        raise exception 'É necessário um caixa aberto para pagamento em dinheiro';
      end if;
      insert into public.movimentacoes_caixa (caixa_id, tipo, valor, descricao)
        values (p_caixa_id, 'despesa', p_valor_total, 'Compra à vista: ' || v_insumo.nome);
    else
      update public.conta_bancaria set saldo = saldo - p_valor_total where id = 1;
      if not found then raise exception 'Conta bancária padrão não encontrada'; end if;
    end if;
    insert into public.contas_pagar (
      descricao, fornecedor_id, valor, valor_original, data_vencimento, data_pagamento,
      status, metodo_pagamento, pagamentos
    ) values (
      'Compra à vista: ' || v_insumo.nome, p_fornecedor_id, p_valor_total, p_valor_total,
      v_data_hoje, v_data_hoje, 'Pago', p_metodo_pagamento,
      jsonb_build_array(jsonb_build_object('metodo', p_metodo_pagamento, 'valor', p_valor_total))
    );
  end if;
end;
$$;

create or replace function public.registrar_ajuste_insumo(
  p_insumo_id uuid,
  p_quantidade numeric,
  p_tipo_movimento text,
  p_motivo text,
  p_atendente text
) returns void
language plpgsql
as $$
declare
  v_insumo record;
  v_delta numeric;
begin
  if p_quantidade <= 0 or nullif(trim(p_tipo_movimento), '') is null then
    raise exception 'Dados do ajuste inválidos';
  end if;
  v_delta := case when p_tipo_movimento like '%Saída%' or p_tipo_movimento like '%Negativa%' then -p_quantidade else p_quantidade end;

  select * into v_insumo from public.insumos where id = p_insumo_id for update;
  if not found then raise exception 'Insumo não encontrado'; end if;
  if coalesce(v_insumo.quantidade_estoque, 0) + v_delta < 0 then
    raise exception 'Estoque insuficiente para este ajuste';
  end if;

  update public.insumos
    set quantidade_estoque = coalesce(quantidade_estoque, 0) + v_delta
    where id = p_insumo_id;
  insert into public.movimentacoes_estoque (insumo_id, quantidade, tipo_movimento, motivo, atendente)
    values (p_insumo_id, v_delta, p_tipo_movimento, coalesce(nullif(trim(p_motivo), ''), 'Ajuste manual'), p_atendente);
end;
$$;

create or replace function public.registrar_venda(
  p_caixa_id uuid,
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
  v_venda_id uuid;
  v_item jsonb;
  v_pagamento jsonb;
  v_produto_id uuid;
  v_quantidade numeric;
  v_preco_unitario numeric;
  v_custo_unitario numeric;
  v_total_pago numeric := 0;
  v_pix numeric := 0;
  v_dinheiro numeric := 0;
  v_credito numeric := 0;
  v_debito numeric := 0;
  v_transferencia numeric := 0;
  v_banco numeric := 0;
  v_metodos text := '';
  v_ficha record;
  v_item_ficha record;
  v_item_base record;
  v_base record;
  v_consumo numeric;
  v_consumo_base numeric;
begin
  if p_total <= 0 or p_desconto < 0 then raise exception 'Total e desconto inválidos'; end if;
  if not exists (select 1 from public.controle_caixa where id = p_caixa_id and status = 'aberto') then raise exception 'O caixa informado não está aberto'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'A venda deve possuir itens'; end if;
  if jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then raise exception 'Informe ao menos uma forma de pagamento'; end if;

  for v_pagamento in select value from jsonb_array_elements(p_pagamentos)
  loop
    if coalesce((v_pagamento ->> 'valor')::numeric, 0) <= 0 then raise exception 'Pagamento inválido'; end if;
    v_total_pago := v_total_pago + (v_pagamento ->> 'valor')::numeric;
    case v_pagamento ->> 'metodo'
      when 'PIX' then v_pix := v_pix + (v_pagamento ->> 'valor')::numeric;
      when 'Dinheiro' then v_dinheiro := v_dinheiro + (v_pagamento ->> 'valor')::numeric;
      when 'Cartão de Crédito' then v_credito := v_credito + (v_pagamento ->> 'valor')::numeric;
      when 'Cartão de Débito' then v_debito := v_debito + (v_pagamento ->> 'valor')::numeric;
      when 'Transferência' then v_transferencia := v_transferencia + (v_pagamento ->> 'valor')::numeric;
      else raise exception 'Método de pagamento inválido';
    end case;
  end loop;
  if round(v_total_pago, 2) <> round(p_total, 2) then raise exception 'Os pagamentos devem totalizar o valor da venda'; end if;
  select string_agg(distinct value ->> 'metodo', ' + ' order by value ->> 'metodo') into v_metodos from jsonb_array_elements(p_pagamentos);

  insert into public.vendas (
    caixa_id, identificacao_pedido, total, desconto, metodo_pagamento, pagamentos,
    valor_pix, valor_dinheiro, valor_cartao_credito, valor_cartao_debito, atendente, status
  ) values (
    p_caixa_id, p_identificacao_pedido, p_total, p_desconto, v_metodos, p_pagamentos,
    v_pix + v_transferencia, v_dinheiro, v_credito, v_debito, p_atendente, 'Concluída'
  ) returning id into v_venda_id;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item ->> 'produto_id')::uuid;
    v_quantidade := (v_item ->> 'quantidade')::numeric;
    v_preco_unitario := (v_item ->> 'preco_unitario')::numeric;
    v_custo_unitario := coalesce((v_item ->> 'custo_unitario')::numeric, 0);
    if v_quantidade <= 0 or v_preco_unitario < 0 then raise exception 'Item de venda inválido'; end if;
    insert into public.itens_venda (venda_id, produto_id, quantidade, preco_unitario, custo_unitario)
      values (v_venda_id, v_produto_id, v_quantidade, v_preco_unitario, v_custo_unitario);

    select id, rendimento_porcoes into v_ficha from public.fichas_tecnicas where produto_venda_id = v_produto_id;
    if not found then
      update public.produtos set quantidade_estoque = quantidade_estoque - v_quantidade where id = v_produto_id and quantidade_estoque >= v_quantidade;
      if not found then raise exception 'Estoque insuficiente para o produto %', v_produto_id; end if;
      insert into public.movimentacoes_estoque (produto_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
        values (v_produto_id, v_venda_id, -v_quantidade, 'Saída - Venda', 'Venda ' || p_identificacao_pedido, p_atendente);
      continue;
    end if;
    if coalesce(v_ficha.rendimento_porcoes, 0) <= 0 then raise exception 'Ficha técnica sem rendimento válido'; end if;

    for v_item_ficha in select produto_ingrediente_id, insumo_id, receita_base_id, quantidade_utilizada from public.ficha_ingredientes where ficha_id = v_ficha.id
    loop
      v_consumo := v_quantidade / nullif(v_ficha.rendimento_porcoes, 0) * v_item_ficha.quantidade_utilizada;
      if v_item_ficha.insumo_id is not null then
        update public.insumos set quantidade_estoque = quantidade_estoque - v_consumo where id = v_item_ficha.insumo_id and quantidade_estoque >= v_consumo;
        if not found then raise exception 'Estoque insuficiente para insumo'; end if;
        insert into public.movimentacoes_estoque (insumo_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
          values (v_item_ficha.insumo_id, v_venda_id, -v_consumo, 'Saída - Produção', 'Venda ' || p_identificacao_pedido, p_atendente);
      elsif v_item_ficha.produto_ingrediente_id is not null then
        update public.produtos set quantidade_estoque = quantidade_estoque - v_consumo where id = v_item_ficha.produto_ingrediente_id and quantidade_estoque >= v_consumo;
        if not found then raise exception 'Estoque insuficiente para ingrediente'; end if;
        insert into public.movimentacoes_estoque (produto_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
          values (v_item_ficha.produto_ingrediente_id, v_venda_id, -v_consumo, 'Saída - Produção', 'Venda ' || p_identificacao_pedido, p_atendente);
      elsif v_item_ficha.receita_base_id is not null then
        select rendimento_peso into v_base from public.receitas_base where id = v_item_ficha.receita_base_id;
        if not found then raise exception 'Receita-base não encontrada'; end if;
        if coalesce(v_base.rendimento_peso, 0) <= 0 then raise exception 'Receita-base sem rendimento válido'; end if;
        for v_item_base in select insumo_id, qtd_usada from public.receitas_base_itens where receita_base_id = v_item_ficha.receita_base_id
        loop
          if v_item_base.insumo_id is null then raise exception 'Receita-base possui item sem insumo'; end if;
          v_consumo_base := v_consumo / nullif(v_base.rendimento_peso, 0) * v_item_base.qtd_usada;
          update public.insumos set quantidade_estoque = quantidade_estoque - v_consumo_base where id = v_item_base.insumo_id and quantidade_estoque >= v_consumo_base;
          if not found then raise exception 'Estoque insuficiente para insumo da receita-base'; end if;
          insert into public.movimentacoes_estoque (insumo_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
            values (v_item_base.insumo_id, v_venda_id, -v_consumo_base, 'Saída - Produção', 'Venda ' || p_identificacao_pedido, p_atendente);
        end loop;
      end if;
    end loop;
  end loop;

  v_banco := v_pix + v_credito + v_debito + v_transferencia;
  if v_banco > 0 then
    update public.conta_bancaria set saldo = saldo + v_banco where id = 1;
    if not found then raise exception 'Conta bancária padrão não encontrada'; end if;
  end if;
  return v_venda_id;
end;
$$;

create or replace function public.cancelar_venda(p_venda_id uuid, p_motivo text default 'Cancelamento realizado pelo caixa')
returns void
language plpgsql
as $$
declare
  v_venda record;
  v_movimento record;
  v_banco numeric;
begin
  select * into v_venda from public.vendas where id = p_venda_id for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v_venda.status = 'Cancelada' then raise exception 'Esta venda já foi cancelada'; end if;

  for v_movimento in
    select produto_id, sum(quantidade) as quantidade from public.movimentacoes_estoque
    where venda_id = p_venda_id and produto_id is not null
    group by produto_id having sum(quantidade) < 0
  loop
    update public.produtos set quantidade_estoque = quantidade_estoque + abs(v_movimento.quantidade) where id = v_movimento.produto_id;
    if not found then raise exception 'Produto da venda não encontrado'; end if;
    insert into public.movimentacoes_estoque (produto_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
      values (v_movimento.produto_id, p_venda_id, abs(v_movimento.quantidade), 'Entrada - Estorno Venda', p_motivo, v_venda.atendente);
  end loop;

  for v_movimento in
    select insumo_id, sum(quantidade) as quantidade from public.movimentacoes_estoque
    where venda_id = p_venda_id and insumo_id is not null
    group by insumo_id having sum(quantidade) < 0
  loop
    update public.insumos set quantidade_estoque = quantidade_estoque + abs(v_movimento.quantidade) where id = v_movimento.insumo_id;
    if not found then raise exception 'Insumo da venda não encontrado'; end if;
    insert into public.movimentacoes_estoque (insumo_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
      values (v_movimento.insumo_id, p_venda_id, abs(v_movimento.quantidade), 'Entrada - Estorno Venda', p_motivo, v_venda.atendente);
  end loop;

  v_banco := coalesce(v_venda.valor_pix, 0) + coalesce(v_venda.valor_cartao_credito, 0) + coalesce(v_venda.valor_cartao_debito, 0);
  if v_banco > 0 then
    update public.conta_bancaria set saldo = saldo - v_banco where id = 1;
    if not found then raise exception 'Conta bancária padrão não encontrada'; end if;
  end if;
  update public.vendas set status = 'Cancelada', cancelada_em = now(), motivo_cancelamento = p_motivo where id = p_venda_id;
end;
$$;
