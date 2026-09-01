-- Conclui uma venda, baixa o estoque e atualiza o saldo digital em uma única transação.
-- Aplique esta migração depois de 20260831160000_auditoria_vendas.sql.

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
  if p_total <= 0 or p_desconto < 0 then
    raise exception 'Total e desconto inválidos';
  end if;

  if not exists (select 1 from public.controle_caixa where id = p_caixa_id and status = 'aberto') then
    raise exception 'O caixa informado não está aberto';
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda deve possuir itens';
  end if;

  if jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento';
  end if;

  for v_pagamento in select value from jsonb_array_elements(p_pagamentos)
  loop
    if coalesce((v_pagamento ->> 'valor')::numeric, 0) <= 0 then
      raise exception 'Pagamento inválido';
    end if;
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

  if round(v_total_pago, 2) <> round(p_total, 2) then
    raise exception 'Os pagamentos devem totalizar o valor da venda';
  end if;

  select string_agg(distinct value ->> 'metodo', ' + ' order by value ->> 'metodo')
    into v_metodos
    from jsonb_array_elements(p_pagamentos);

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
    if v_quantidade <= 0 or v_preco_unitario < 0 then
      raise exception 'Item de venda inválido';
    end if;

    insert into public.itens_venda (venda_id, produto_id, quantidade, preco_unitario, custo_unitario)
      values (v_venda_id, v_produto_id, v_quantidade, v_preco_unitario, v_custo_unitario);

    select id, rendimento_porcoes into v_ficha
      from public.fichas_tecnicas where produto_venda_id = v_produto_id;

    if not found then
      update public.produtos
        set quantidade_estoque = quantidade_estoque - v_quantidade
        where id = v_produto_id and quantidade_estoque >= v_quantidade;
      if not found then raise exception 'Estoque insuficiente para o produto %', v_produto_id; end if;
      insert into public.movimentacoes_estoque (produto_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
        values (v_produto_id, v_venda_id, -v_quantidade, 'Saída - Venda', 'Venda ' || p_identificacao_pedido, p_atendente);
      continue;
    end if;
    if coalesce(v_ficha.rendimento_porcoes, 0) <= 0 then
      raise exception 'Ficha técnica sem rendimento válido';
    end if;

    for v_item_ficha in
      select produto_ingrediente_id, receita_base_id, quantidade_utilizada
      from public.ficha_ingredientes where ficha_id = v_ficha.id
    loop
      v_consumo := v_quantidade / nullif(v_ficha.rendimento_porcoes, 0) * v_item_ficha.quantidade_utilizada;
      if v_item_ficha.produto_ingrediente_id is not null then
        update public.produtos
          set quantidade_estoque = quantidade_estoque - v_consumo
          where id = v_item_ficha.produto_ingrediente_id and quantidade_estoque >= v_consumo;
        if not found then raise exception 'Estoque insuficiente para ingrediente'; end if;
        insert into public.movimentacoes_estoque (produto_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
          values (v_item_ficha.produto_ingrediente_id, v_venda_id, -v_consumo, 'Saída - Produção', 'Venda ' || p_identificacao_pedido, p_atendente);
      elsif v_item_ficha.receita_base_id is not null then
        select rendimento_peso into v_base from public.receitas_base where id = v_item_ficha.receita_base_id;
        if not found then raise exception 'Receita-base não encontrada'; end if;
        if coalesce(v_base.rendimento_peso, 0) <= 0 then raise exception 'Receita-base sem rendimento válido'; end if;
        for v_item_base in select produto_id, qtd_usada from public.receitas_base_itens where receita_base_id = v_item_ficha.receita_base_id
        loop
          v_consumo_base := v_consumo / nullif(v_base.rendimento_peso, 0) * v_item_base.qtd_usada;
          update public.produtos
            set quantidade_estoque = quantidade_estoque - v_consumo_base
            where id = v_item_base.produto_id and quantidade_estoque >= v_consumo_base;
          if not found then raise exception 'Estoque insuficiente para ingrediente de receita-base'; end if;
          insert into public.movimentacoes_estoque (produto_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
            values (v_item_base.produto_id, v_venda_id, -v_consumo_base, 'Saída - Produção', 'Venda ' || p_identificacao_pedido, p_atendente);
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
    where venda_id = p_venda_id
    group by produto_id
    having sum(quantidade) < 0
  loop
    update public.produtos
      set quantidade_estoque = quantidade_estoque + abs(v_movimento.quantidade)
      where id = v_movimento.produto_id;
    if not found then raise exception 'Produto da venda não encontrado'; end if;
    insert into public.movimentacoes_estoque (produto_id, venda_id, quantidade, tipo_movimento, motivo, atendente)
      values (v_movimento.produto_id, p_venda_id, abs(v_movimento.quantidade), 'Entrada - Estorno Venda', p_motivo, v_venda.atendente);
  end loop;

  v_banco := coalesce(v_venda.valor_pix, 0) + coalesce(v_venda.valor_cartao_credito, 0) + coalesce(v_venda.valor_cartao_debito, 0);
  if v_banco > 0 then
    update public.conta_bancaria set saldo = saldo - v_banco where id = 1;
    if not found then raise exception 'Conta bancária padrão não encontrada'; end if;
  end if;

  update public.vendas
    set status = 'Cancelada', cancelada_em = now(), motivo_cancelamento = p_motivo
    where id = p_venda_id;
end;
$$;
