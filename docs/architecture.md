# Village Café — Arquitetura

## Visão geral

O Village Café é uma SPA (single-page application) React. Após a autenticação, `App.tsx` mantém a aba ativa em estado local e carrega cada módulo com `React.lazy`. Cada módulo realiza diretamente as leituras e escritas no Supabase por meio do cliente central em `src/lib/supabase.ts`.

```text
Usuário
   │
   ▼
React + Vite (browser)
   ├── App: sessão, cabeçalho e abas
   ├── Módulos de operação
   └── Cliente @supabase/supabase-js
              │
              ├── Supabase Auth
              └── Supabase Postgres
                    ├── vendas e itens
                    ├── produtos, receitas e estoque
                    ├── caixa, contas e banco
                    └── comandas e fornecedores
```

## Entrada, autenticação e navegação

- `src/main.tsx` inicializa o React em `StrictMode`.
- `src/App.tsx` consulta `supabase.auth.getSession()` na montagem e se inscreve em `onAuthStateChange`.
- Sem sessão, renderiza `Login`, que autentica por `signInWithPassword`.
- Com sessão, renderiza o layout principal e disponibiliza logout por `signOut`.
- A navegação não usa React Router nem URLs por módulo: é feita por um tipo `Aba` e `useState` em `App.tsx`.
- Os módulos são carregados sob demanda com `lazy` e `Suspense`; o PDV é a aba inicial.

## Módulos

| Módulo | Responsabilidade principal | Tabelas principais |
| --- | --- | --- |
| `PDVModulo` | Venda de balcão, carrinho e pagamento | `produtos`, `vendas`, `itens_venda`, fichas/receitas, `controle_caixa`, `conta_bancaria` |
| `GestaoComandas` | Comandas abertas, itens e checkout | `comandas`, `itens_comanda`, `vendas`, `itens_venda`, estoque e receitas |
| `DashboardModulo` | Abertura/fechamento de caixa, resumo, edição e cancelamento de vendas | `controle_caixa`, `vendas`, `itens_venda`, `movimentacoes_caixa`, `conta_bancaria` |
| `PrecificacaoModulo` | Insumos, receitas-base, fichas técnicas, CMV e parâmetros de preço | `insumos`, `receitas_base`, `receitas_base_itens`, `fichas_tecnicas`, `ficha_ingredientes`, `produtos`, `parametros_precificacao` |
| `CadastroRevenda` | Produtos de revenda e entrada em lote mista | `produtos`, `insumos`, `fornecedores`, estoque, caixa e contas |
| `EntradasCompras` | Compra unitária, inventário e ajuste de insumos | `insumos`, `fornecedores`, `movimentacoes_estoque`, caixa e contas |
| `ContasPagarModulo` | Contas a pagar, baixas, banco, sangria/suprimento e histórico de caixa | `contas_pagar`, `fornecedores`, `conta_bancaria`, `controle_caixa`, `movimentacoes_caixa` |
| `DashboardRendimentos` | Faturamento, custo, lucro e produtos vendidos por período | `vendas`, `itens_venda`, `produtos` |
| `RelatorioVendasModulo` | Consulta paginada e detalhamento de vendas por período | `vendas`, `itens_venda`, `produtos` |
| `AlertasGlobaisProvider` | Lembretes de vencimentos de contas | `contas_pagar` |

## Modelo de dados

As migrações locais complementam o esquema existente com vínculos de auditoria para caixa, vendas, pagamentos, custos e estoque.

```text
fornecedores ──< contas_pagar

controle_caixa ──< movimentacoes_caixa
       │
       └────────────< vendas ──< itens_venda >── produtos
                       │                 │
                       └────────< movimentacoes_estoque

comandas ──< itens_comanda >── produtos

produtos ──< movimentacoes_estoque
insumos ──< movimentacoes_estoque
produtos ──< fichas_tecnicas (produto_venda_id)
fichas_tecnicas ──< ficha_ingredientes >── insumos
ficha_ingredientes >── receitas_base ──< receitas_base_itens >── insumos

conta_bancaria (registro único usado pelo frontend: id = 1)
```

O modelo de ficha em uso é `fichas_tecnicas`/`ficha_ingredientes` e `receitas_base`/`receitas_base_itens`; contudo, o banco ainda separa insumos comprados em `insumos` e produtos vendáveis em `produtos`. As estruturas antigas `fichas_produtos`/`fichas_produtos_itens` não devem receber novos dados.

Para a consolidação de CMV, a migration `20260831192000_base_consolidacao_insumos.sql` introduziu, sem migração destrutiva, `insumo_id` na ficha final e nas movimentações. As migrations `20260831193000_operacoes_cmv_insumos.sql` e `20260831194000_compra_lote_com_insumos.sql` completam o fluxo novo: compra e ajuste de matéria-prima, recálculo em cascata de CMV, baixa/estorno de venda e compra em lote mista. As RPCs legadas permanecem para a versão publicada durante a transição.

## Fluxos de escrita e consistência

As vendas de balcão e comandas usam a RPC `registrar_venda`, que insere venda e itens, baixa estoque de revenda ou de insumos das fichas, registra movimentos e atualiza o saldo digital em uma transação Postgres. `cancelar_venda` faz o estorno, mantém o registro da venda e evita duplicidade. A edição cancela a venda original e cria uma substituta auditável por `editar_venda`; a baixa de contas usa `baixar_conta_pagar` para registrar caixa, banco e conta de forma indivisível.

O cancelamento de contas é tratado por RPC auditável na migration `20260831180000_cancelamento_conta_auditoria.sql`; ele estorna somente o financeiro e nunca remove estoque de uma compra automaticamente. Para o modelo consolidado, `registrar_compra_insumo`, `registrar_ajuste_insumo` e `registrar_compra_lote_insumos` garantem que estoque, custo, contas, caixa e banco sejam atualizados na mesma transação.

## Segurança e fronteiras

- O cliente recebe URL e chave anônima do Supabase por variáveis `VITE_*`.
- A aplicação faz autenticação, porém não contém uma autorização própria por papel/perfil.
- A migration `20260831173000_rls_operacional.sql` habilita RLS nas tabelas operacionais e bloqueia requisições sem sessão. Todos os usuários autenticados possuem a mesma permissão enquanto não houver papéis de acesso definidos.
- Não há tipagem gerada do banco. Os componentes usam tipos locais e alguns valores `any`, o que reduz a proteção contra mudanças no esquema.

## Convenções e limitações técnicas observadas

- Cada módulo concentra interface, estado, regra de negócio e acesso a dados em um arquivo grande; não há separação atual entre componentes visuais, serviços e regras de domínio.
- O estado é local a cada módulo. Não há biblioteca global de estado, cache de consultas ou sincronização em tempo real.
- Datas são filtradas com strings UTC e algumas telas formatam em `pt-BR`; testes de fuso horário são importantes para relatórios por dia.
- `App.css` é remanescente do template e não parece participar da interface atual; os estilos funcionais estão em Tailwind e `index.css`.

## Pontos de evolução prioritários

1. Obter e versionar o esquema/migrações do Supabase, incluindo RLS.
2. Gerar tipos TypeScript a partir do banco e reduzir `any`.
3. Levar compras em lote para RPCs transacionais.
4. Criar tipos do banco gerados pelo Supabase e reduzir `any`.
5. Definir formalmente papéis, permissões, unidade operacional e a política para cancelamentos/estornos.
