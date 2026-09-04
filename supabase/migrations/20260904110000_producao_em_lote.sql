-- Diferencia produtos comprados para revenda de produtos preparados pela operação.
-- Produtos com ficha técnica existentes continuam no modo sob demanda para preservar
-- o comportamento publicado até aqui.

alter table public.produtos
  add column if not exists modo_estoque text;

update public.produtos p
  set modo_estoque = case
    when exists (select 1 from public.fichas_tecnicas ft where ft.produto_venda_id = p.id)
      then 'producao_sob_demanda'
    else 'revenda'
  end
  where modo_estoque is null;

alter table public.produtos
  alter column modo_estoque set default 'revenda',
  alter column modo_estoque set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'produtos_modo_estoque_check'
  ) then
    alter table public.produtos
      add constraint produtos_modo_estoque_check
      check (modo_estoque in ('revenda', 'producao_sob_demanda', 'producao_lote'));
  end if;
end;
$$;

comment on column public.produtos.modo_estoque is
  'revenda: compra e vende o produto pronto; producao_sob_demanda: baixa ingredientes na venda; producao_lote: baixa ingredientes ao produzir e produto pronto ao vender.';

-- Produz o item acabado em uma única transação: todos os insumos são consumidos
-- antes de a quantidade produzida ser adicionada ao estoque do produto final.
create or replace function public.registrar_producao(
  p_produto_id uuid,
  p_quantidade numeric,
  p_atendente text,
  p_motivo text default null
) returns void
language plpgsql
as $$
declare
  v_produto record;
  v_ficha record;
  v_item_ficha record;
  v_item_base record;
  v_base record;
  v_consumo numeric;
  v_consumo_base numeric;
  v_motivo text;
begin
  if p_quantidade <= 0 then
    raise exception 'A quantidade produzida deve ser maior que zero';
  end if;

  select * into v_produto
    from public.produtos
    where id = p_produto_id and tipo = 'venda' and ativo = true
    for update;
  if not found then
    raise exception 'Produto de venda não encontrado ou inativo';
  end if;
  if v_produto.modo_estoque <> 'producao_lote' then
    raise exception 'Este produto não está configurado para produção em lote';
  end if;

  select * into v_ficha
    from public.fichas_tecnicas
    where produto_venda_id = p_produto_id;
  if not found or coalesce(v_ficha.rendimento_porcoes, 0) <= 0 then
    raise exception 'Produto sem ficha técnica ou rendimento válido';
  end if;
  if not exists (select 1 from public.ficha_ingredientes where ficha_id = v_ficha.id) then
    raise exception 'A ficha técnica precisa ter ao menos um item para produzir';
  end if;

  v_motivo := coalesce(nullif(trim(p_motivo), ''), 'Produção de ' || p_quantidade || ' ' || coalesce(v_produto.unidade_medida, 'un'));

  for v_item_ficha in
    select produto_ingrediente_id, insumo_id, receita_base_id, quantidade_utilizada
    from public.ficha_ingredientes
    where ficha_id = v_ficha.id
  loop
    v_consumo := p_quantidade / v_ficha.rendimento_porcoes * v_item_ficha.quantidade_utilizada;

    if v_item_ficha.insumo_id is not null then
      update public.insumos
        set quantidade_estoque = quantidade_estoque - v_consumo
        where id = v_item_ficha.insumo_id and quantidade_estoque >= v_consumo;
      if not found then raise exception 'Estoque insuficiente para insumo'; end if;
      insert into public.movimentacoes_estoque (insumo_id, quantidade, tipo_movimento, motivo, atendente)
        values (v_item_ficha.insumo_id, -v_consumo, 'Saída - Produção', v_motivo, p_atendente);
    elsif v_item_ficha.produto_ingrediente_id is not null then
      update public.produtos
        set quantidade_estoque = quantidade_estoque - v_consumo
        where id = v_item_ficha.produto_ingrediente_id and quantidade_estoque >= v_consumo;
      if not found then raise exception 'Estoque insuficiente para ingrediente legado'; end if;
      insert into public.movimentacoes_estoque (produto_id, quantidade, tipo_movimento, motivo, atendente)
        values (v_item_ficha.produto_ingrediente_id, -v_consumo, 'Saída - Produção', v_motivo, p_atendente);
    elsif v_item_ficha.receita_base_id is not null then
      select * into v_base from public.receitas_base where id = v_item_ficha.receita_base_id;
      if not found or coalesce(v_base.rendimento_peso, 0) <= 0 then
        raise exception 'Receita-base sem rendimento válido';
      end if;
      for v_item_base in
        select insumo_id, qtd_usada from public.receitas_base_itens where receita_base_id = v_item_ficha.receita_base_id
      loop
        if v_item_base.insumo_id is null then raise exception 'Receita-base possui item sem insumo'; end if;
        v_consumo_base := v_consumo / v_base.rendimento_peso * v_item_base.qtd_usada;
        update public.insumos
          set quantidade_estoque = quantidade_estoque - v_consumo_base
          where id = v_item_base.insumo_id and quantidade_estoque >= v_consumo_base;
        if not found then raise exception 'Estoque insuficiente para insumo da receita-base'; end if;
        insert into public.movimentacoes_estoque (insumo_id, quantidade, tipo_movimento, motivo, atendente)
          values (v_item_base.insumo_id, -v_consumo_base, 'Saída - Produção', v_motivo, p_atendente);
      end loop;
    end if;
  end loop;

  update public.produtos
    set quantidade_estoque = coalesce(quantidade_estoque, 0) + p_quantidade
    where id = p_produto_id;
  insert into public.movimentacoes_estoque (produto_id, quantidade, tipo_movimento, motivo, atendente)
    values (p_produto_id, p_quantidade, 'Entrada - Produção', v_motivo, p_atendente);
end;
$$;

-- Para produção em lote, a venda movimenta somente o produto acabado. Para os
-- demais produtos com ficha, mantém a baixa proporcional de ingredientes.
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
  v_modo_estoque text;
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

    select modo_estoque into v_modo_estoque from public.produtos where id = v_produto_id;
    if not found then raise exception 'Produto da venda não encontrado'; end if;
    select id, rendimento_porcoes into v_ficha from public.fichas_tecnicas where produto_venda_id = v_produto_id;

    if not found or v_modo_estoque = 'producao_lote' then
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
