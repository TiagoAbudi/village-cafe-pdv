-- Registra a compra unitária de ingrediente de forma indivisível: estoque, custos,
-- movimentação, conta a pagar e caixa/banco. Não altera dados existentes ao ser aplicada.
-- Aplique somente após revisão, depois de 20260831180000_cancelamento_conta_auditoria.sql.

create or replace function public.recalcular_custos_a_partir_do_ingrediente(
  p_produto_id uuid,
  p_custo_unitario numeric
) returns void
language plpgsql
as $$
declare
  v_base record;
  v_custo_total numeric;
  v_custo_por_unidade numeric;
  v_ficha record;
  v_custo_ficha numeric;
begin
  update public.receitas_base_itens
    set custo_calculado = qtd_usada * p_custo_unitario
    where produto_id = p_produto_id;

  for v_base in
    select distinct rb.id, rb.rendimento_peso
    from public.receitas_base rb
    join public.receitas_base_itens rbi on rbi.receita_base_id = rb.id
    where rbi.produto_id = p_produto_id
  loop
    select coalesce(sum(custo_calculado), 0) into v_custo_total
      from public.receitas_base_itens where receita_base_id = v_base.id;
    if coalesce(v_base.rendimento_peso, 0) <= 0 then
      raise exception 'Receita-base sem rendimento válido';
    end if;
    v_custo_por_unidade := v_custo_total / v_base.rendimento_peso;
    update public.receitas_base
      set custo_total = v_custo_total, custo_por_unidade = v_custo_por_unidade
      where id = v_base.id;
    update public.ficha_ingredientes
      set custo_calculado = quantidade_utilizada * v_custo_por_unidade
      where receita_base_id = v_base.id;
  end loop;

  update public.ficha_ingredientes
    set custo_calculado = quantidade_utilizada * p_custo_unitario
    where produto_ingrediente_id = p_produto_id;

  for v_ficha in select id, rendimento_porcoes, produto_venda_id from public.fichas_tecnicas
  loop
    if coalesce(v_ficha.rendimento_porcoes, 0) <= 0 then
      raise exception 'Ficha técnica sem rendimento válido';
    end if;
    select coalesce(sum(custo_calculado), 0) into v_custo_ficha
      from public.ficha_ingredientes where ficha_id = v_ficha.id;
    update public.fichas_tecnicas set custo_total = v_custo_ficha where id = v_ficha.id;
    update public.produtos
      set preco_custo = v_custo_ficha / v_ficha.rendimento_porcoes
      where id = v_ficha.produto_venda_id;
  end loop;
end;
$$;

create or replace function public.registrar_compra_ingrediente(
  p_produto_id uuid,
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
  v_produto record;
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

  select * into v_produto from public.produtos where id = p_produto_id and tipo = 'ingrediente' for update;
  if not found then raise exception 'Ingrediente não encontrado'; end if;
  select nome into v_fornecedor_nome from public.fornecedores where id = p_fornecedor_id;
  if not found then raise exception 'Fornecedor não encontrado'; end if;

  update public.produtos
    set quantidade_estoque = coalesce(quantidade_estoque, 0) + p_quantidade_estoque,
      preco_custo = p_custo_unitario,
      preco_total_pago = p_valor_total
    where id = p_produto_id;
  insert into public.movimentacoes_estoque (produto_id, quantidade, tipo_movimento, motivo, atendente)
    values (p_produto_id, p_quantidade_estoque, 'Entrada - Compra', 'Nota Fornecedor: ' || v_fornecedor_nome, p_atendente);

  perform public.recalcular_custos_a_partir_do_ingrediente(p_produto_id, p_custo_unitario);

  if p_gerar_conta_pagar then
    insert into public.contas_pagar (descricao, fornecedor_id, valor, valor_original, data_vencimento, status)
      values ('Compra Ingrediente: ' || v_produto.nome, p_fornecedor_id, p_valor_total, p_valor_total, p_data_vencimento, 'Pendente');
  else
    if p_metodo_pagamento = 'Dinheiro' then
      if p_caixa_id is null or not exists (select 1 from public.controle_caixa where id = p_caixa_id and status = 'aberto') then
        raise exception 'É necessário um caixa aberto para pagamento em dinheiro';
      end if;
      insert into public.movimentacoes_caixa (caixa_id, tipo, valor, descricao)
        values (p_caixa_id, 'despesa', p_valor_total, 'Compra à vista: ' || v_produto.nome);
    else
      update public.conta_bancaria set saldo = saldo - p_valor_total where id = 1;
      if not found then raise exception 'Conta bancária padrão não encontrada'; end if;
    end if;
    insert into public.contas_pagar (
      descricao, fornecedor_id, valor, valor_original, data_vencimento, data_pagamento,
      status, metodo_pagamento, pagamentos
    ) values (
      'Compra à vista: ' || v_produto.nome, p_fornecedor_id, p_valor_total, p_valor_total,
      v_data_hoje, v_data_hoje, 'Pago', p_metodo_pagamento,
      jsonb_build_array(jsonb_build_object('metodo', p_metodo_pagamento, 'valor', p_valor_total))
    );
  end if;
end;
$$;
