-- Reinicia apenas o cadastro de fichas técnicas para uma nova implantação de CMV.
-- ATENÇÃO: remove todos os itens de ficha e todas as fichas técnicas existentes.
-- Não remove produtos, insumos, receitas-base, vendas, caixa, contas ou movimentações.
-- Aplique somente após confirmar que os registros atuais não precisam ser preservados.

begin;

delete from public.ficha_ingredientes;
delete from public.fichas_tecnicas;

commit;
