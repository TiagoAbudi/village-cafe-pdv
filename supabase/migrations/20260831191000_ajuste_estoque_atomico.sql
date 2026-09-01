-- Ajuste manual de estoque com saldo e auditoria gravados na mesma transação.
-- Aplique somente após revisão, depois de 20260831190000_compra_lote_atomica.sql.

create or replace function public.registrar_ajuste_estoque(
  p_produto_id uuid,
  p_quantidade numeric,
  p_tipo_movimento text,
  p_motivo text,
  p_atendente text
) returns void
language plpgsql
as $$
declare
  v_produto record;
  v_delta numeric;
begin
  if p_quantidade <= 0 or nullif(trim(p_tipo_movimento), '') is null then
    raise exception 'Dados do ajuste inválidos';
  end if;
  v_delta := case when p_tipo_movimento like '%Saída%' or p_tipo_movimento like '%Negativa%' then -p_quantidade else p_quantidade end;

  select * into v_produto from public.produtos where id = p_produto_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  if coalesce(v_produto.quantidade_estoque, 0) + v_delta < 0 then
    raise exception 'Estoque insuficiente para este ajuste';
  end if;

  update public.produtos
    set quantidade_estoque = coalesce(quantidade_estoque, 0) + v_delta
    where id = p_produto_id;
  insert into public.movimentacoes_estoque (produto_id, quantidade, tipo_movimento, motivo, atendente)
    values (p_produto_id, v_delta, p_tipo_movimento, coalesce(nullif(trim(p_motivo), ''), 'Ajuste manual'), p_atendente);
end;
$$;
