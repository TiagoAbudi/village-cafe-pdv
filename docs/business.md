# Village Café — Visão de negócio

## Propósito

O Village Café é um sistema operacional para uma cafeteria. Ele centraliza o atendimento de balcão e por comandas, o controle de estoque, a formação de custos, a compra de insumos, o caixa e o acompanhamento financeiro. O objetivo é reduzir controles paralelos e dar à operação uma visão consistente de venda, custo e disponibilidade.

## Público e contexto de uso

O produto é voltado à equipe interna de uma cafeteria ou pequeno estabelecimento de alimentação: atendentes, responsáveis pelo caixa e gestores. O acesso é restrito a usuários autenticados. A interface é responsiva e foi desenhada para uso tanto em desktop quanto em dispositivos móveis no balcão.

O escopo atual aparenta atender uma operação única. Não há, no código, suporte explícito a múltiplas empresas, lojas, perfis de acesso ou cadastros de clientes.

## Capacidades atuais

| Área | O que a operação consegue fazer |
| --- | --- |
| PDV Caixa | Abrir caixa, montar uma venda, aplicar desconto, receber por dinheiro, PIX, crédito, débito ou combinação deles e finalizar a venda. |
| Comandas | Criar comandas, incluir/remover itens, alterar quantidades e fechar a comanda como venda. |
| Produtos | Cadastrar produtos de revenda, ajustar estoque, editar preço/custo/margem e desativar itens. |
| Estoque e compras | Cadastrar fornecedores e ingredientes, registrar compras/entradas, ajustes de quebra e desperdício, e manter histórico de movimentações. |
| Fichas e precificação | Cadastrar insumos, receitas-base e fichas técnicas; calcular custos e indicar preço sugerido, CMV e margem. |
| Financeiro | Registrar e pagar contas, lançar suprimentos/sangrias, acompanhar saldo bancário e consultar/ imprimir turnos de caixa. |
| Indicadores | Exibir dashboard do caixa, relatórios de vendas por período e dashboard de faturamento, custo, lucro e produtos vendidos. |
| Alertas | Avisar contas a pagar atrasadas, vencendo hoje, amanhã ou nos próximos três dias. |

## Regras de negócio observadas

- Uma venda exige um caixa aberto.
- As formas de pagamento são rateadas entre dinheiro, PIX, cartão de crédito e cartão de débito. O sistema também persiste uma descrição do método usado.
- Valores digitais de venda (PIX e cartões) aumentam o saldo de `conta_bancaria`; pagamentos e estornos correspondentes o reduzem ou revertem.
- Vendas de produtos de revenda reduzem o estoque do próprio produto. Vendas de produtos com ficha técnica consomem ingredientes ou receitas-base proporcionalmente à quantidade vendida.
- Compras aumentam estoque, recalculam custo unitário de insumos e propagam esse custo para receitas e fichas que os utilizam.
- Produtos de venda são desativados logicamente (`ativo = false`). Insumos sem movimentações ou vínculos de receita podem ser removidos; vínculos existentes bloqueiam a exclusão para preservar o histórico e o CMV.
- Uma compra pode gerar uma conta a pagar; contas também podem ser criadas manualmente, inclusive de forma recorrente.
- O cancelamento de venda busca devolver estoque e estornar valores digitais. O fechamento do caixa guarda o valor físico contado para comparação com o valor esperado.

## Fluxos centrais

### Venda no balcão

1. O operador abre o caixa com um fundo de troco.
2. Pesquisa e adiciona produtos ao carrinho; pode identificar o pedido e conceder desconto.
3. Informa um pagamento único ou dividido.
4. O sistema grava a venda e seus itens, baixa o estoque, atualiza o saldo digital quando aplicável e limpa o carrinho.

### Produção e custo

1. A gestão cadastra ingredientes e seus custos unitários.
2. Combina ingredientes em receitas-base quando necessário.
3. Cria fichas técnicas para os produtos vendidos, com rendimento em porções.
4. O sistema calcula custos, CMV, margem e preço sugerido a partir dos parâmetros de precificação.

### Compra e pagamento

1. A equipe registra fornecedor, itens e quantidades recebidas.
2. O estoque e o custo são atualizados; a movimentação fica registrada.
3. Em pagamento imediato, o caixa e/ou saldo digital são movimentados; em pagamento a prazo, é criada uma conta a pagar.
4. O financeiro baixa a conta, usando uma ou mais formas de pagamento.

## Fora do escopo atual ou ainda não evidenciado

- Emissão fiscal, integração com meios de pagamento e impressora térmica.
- Gestão de clientes, fidelidade, delivery e canais online.
- Permissões por papel de usuário.
- Múltiplas lojas/empresas e transferências entre unidades.
- Garantia transacional no servidor para operações que atualizam múltiplas tabelas.

## Premissas a confirmar

- A operação é de uma única loja/unidade.
- A equipe autenticada tem acesso funcional equivalente aos módulos disponíveis.
- O saldo bancário é controlado em uma única conta identificada por `id = 1`.
