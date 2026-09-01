# Village Café

Sistema web de operação para cafeteria, reunindo PDV, comandas, caixa, compras, estoque, contas a pagar, fichas técnicas e engenharia de preços em uma única aplicação.

O objetivo é manter venda, consumo de insumos e custo de produção conectados, permitindo que a operação acompanhe o CMV e identifique produtos cujo preço precisa ser revisado.

## Visão geral

| Área | Capacidades atuais |
| --- | --- |
| **PDV e comandas** | Venda de balcão e por comanda, descontos, pagamentos únicos ou mistos e troco exclusivamente em dinheiro. |
| **Caixa e vendas** | Abertura e fechamento de caixa, dashboard do turno, edição/cancelamento auditável e relatório de vendas. |
| **Estoque e compras** | Fornecedores, entradas unitárias ou em lote, estoque de insumos/revenda, ajustes e movimentações auditáveis. |
| **Fichas e CMV** | Insumos, receitas-base, fichas técnicas, custo por porção, CMV, lucro estimado e preço sugerido. |
| **Financeiro** | Contas a pagar, baixas por uma ou mais formas de pagamento, banco, sangria e suprimento. |
| **Indicadores** | Faturamento, custos, lucro, produtos vendidos e alertas de vencimento. |

## Fluxo de CMV e engenharia de preços

O fluxo atual separa o cadastro técnico da movimentação de compra, preservando o comportamento existente nas duas telas:

1. Em **Fichas**, cadastre o insumo com nome, unidade, preço, quantidade da embalagem e fator de correção. A tela calcula o custo unitário inicial e cria o insumo com estoque zero.
2. Em **Estoque**, registre fornecedor, quantidade de embalagens, valor efetivamente pago e condição de pagamento. A operação soma o saldo físico, atualiza o custo unitário e recalcula o CMV das receitas relacionadas.
3. Em **Bases/Recheios**, componha preparos intermediários — como cremes, molhos e recheios — informando rendimento e os insumos utilizados.
4. Em **Fichas Técnicas**, combine insumos diretos e receitas-base para chegar ao custo total e ao custo por porção de cada produto vendido.
5. Em **Painel/Diagnóstico**, configure custos fixos, impostos/taxas e margem alvo; o sistema compara o preço atual com CMV, lucro estimado e preço sugerido.

> A tela de Estoque também oferece um cadastro rápido de ingrediente. Para o cadastro técnico completo, a rotina recomendada é usar **Fichas** e usar **Estoque** para registrar cada compra real.

### Fórmulas implementadas

```text
Quantidade da compra = número de embalagens × quantidade por embalagem

Custo unitário = (valor total pago ÷ quantidade da compra) × fator de correção

Custo da receita-base = Σ(quantidade usada × custo unitário do insumo)
Custo por unidade da base = custo total da base ÷ rendimento da base

Custo da ficha = Σ(insumo direto × custo unitário)
                + Σ(receita-base usada × custo por unidade da base)
Custo por porção = custo total da ficha ÷ rendimento em porções

CMV (%) = (custo por porção ÷ preço de venda atual) × 100

Preço sugerido = custo por porção ÷
  [1 − ((custos fixos + impostos/taxas + margem alvo) ÷ 100)]

Lucro estimado = preço atual − custo por porção −
  (preço atual × (custos fixos + impostos/taxas) ÷ 100)
```

Quando o preço atual está abaixo do preço sugerido, o painel indica **Aumentar preço**. Nos demais casos, ele sinaliza **CMV alto** quando o CMV é superior a 35%. O custo utilizado nas receitas é o custo unitário atualmente gravado para cada insumo; compras registradas atualizam esse valor e acionam o recálculo em cascata.

## Arquitetura

```text
Usuário autenticado
        │
        ▼
React + Vite (SPA)
        │
        ▼
@supabase/supabase-js
        ├── Supabase Auth
        └── Supabase Postgres + RLS + RPCs
             ├── vendas, caixa e financeiro
             ├── produtos, insumos e estoque
             └── fichas técnicas e receitas-base
```

- A aplicação é uma SPA React; a navegação entre módulos é mantida em estado local e os módulos são carregados sob demanda.
- Não há backend Node/Express neste repositório. O navegador acessa o Supabase por meio do cliente oficial.
- As operações mais sensíveis usam RPCs PostgreSQL atômicas, incluindo venda, cancelamento, edição de venda, baixa de conta, compra de insumo, compra em lote e ajuste de estoque.
- As migrations em `supabase/migrations/` complementam um esquema Supabase já existente e versionam a evolução operacional recente.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Interface | React 19, TypeScript e Tailwind CSS |
| Build | Vite 8 |
| Dados e autenticação | Supabase Auth, Postgres, Row Level Security e RPCs PL/pgSQL |
| Testes | Vitest, Testing Library e JSDOM |
| Qualidade | ESLint, TypeScript e GitHub Actions |

## Estrutura do repositório

```text
.
├── public/                 # Manifesto, ícones e recursos públicos
├── src/
│   ├── assets/             # Logo e imagens da aplicação
│   ├── components/         # Módulos operacionais e interface
│   ├── __tests__/          # Testes de componentes e regras de domínio
│   ├── lib/                # Supabase, dinheiro, estoque, datas e tipos do banco
│   ├── App.tsx             # Sessão, layout e navegação principal
│   └── main.tsx            # Entrada da aplicação
├── docs/                   # Documentação de negócio, stack e arquitetura
├── supabase/migrations/    # Migrations e RPCs do banco
├── .github/workflows/ci.yml
└── package.json
```

## Pré-requisitos

- Node.js 20 ou superior
- npm
- Projeto Supabase configurado, com autenticação por e-mail/senha habilitada

## Configuração local

1. Instale as dependências:

   ```bash
   npm ci
   ```

2. Crie `.env.local` a partir de `.env.example`:

   ```env
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-publica-do-supabase
   ```

3. Inicie a aplicação:

   ```bash
   npm run dev
   ```

As variáveis `VITE_*` são incluídas no bundle do navegador. Nunca coloque `service_role`, chaves secretas ou senhas de banco em arquivos `VITE_*`.

### Homologação

Para conectar a uma base de homologação, crie `.env.homologacao.local` com as mesmas variáveis públicas e execute:

```bash
npm run dev:homolog
```

O arquivo de homologação é ignorado pelo Git. Aplique e valide migrations em homologação antes de qualquer execução no banco de produção.

## Scripts

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o Vite no modo padrão. |
| `npm run dev:homolog` | Inicia o Vite com o modo `homologacao`. |
| `npm run build` | Executa a checagem TypeScript e gera o bundle de produção. |
| `npm run lint` | Executa o ESLint. |
| `npm test -- --run` | Executa os testes uma vez, adequado para CI. |
| `npm run test:ui` | Abre a interface do Vitest. |
| `npm run test:coverage` | Executa a suíte com cobertura. |
| `npm run preview` | Serve localmente o build gerado. |

## Banco de dados e migrations

As migrations são sequenciais e devem ser revisadas antes de serem aplicadas. Elas assumem que as tabelas-base do Supabase já existem; este diretório não é um bootstrap completo de um banco vazio.

Antes de aplicar uma migration:

1. Faça backup e teste em homologação.
2. Confirme a ordem cronológica dos arquivos em `supabase/migrations/`.
3. Avalie o impacto operacional das RPCs e índices adicionados.
4. Trate migrations de limpeza de dados com atenção especial. A migration `20260831195000_limpar_fichas_tecnicas.sql`, por exemplo, remove fichas técnicas e seus itens; ela não deve ser executada sem autorização e backup.

## Testes e CI

A suíte cobre autenticação, comportamento essencial do PDV e regras puras de pagamento, estoque e datas. A pipeline em `.github/workflows/ci.yml` executa, a cada push ou pull request para `main` e `master`:

```bash
npm ci
npm run lint
npm test -- --run
npm run build
```

## Segurança e limitações atuais

- As tabelas operacionais são protegidas por RLS para bloquear acesso anônimo sem sessão.
- No modelo atual, usuários autenticados têm o mesmo nível de acesso operacional; ainda não há perfis ou permissões por função.
- Há uma conta bancária operacional padrão, identificada pelo registro `id = 1`.
- A consistência financeira/estoque das operações novas depende das RPCs versionadas nas migrations. Evite criar fluxos paralelos que atualizem várias tabelas diretamente pelo frontend.
- Para um CMV confiável, mantenha unidades consistentes entre compra e ficha: o sistema não converte automaticamente gramas em quilogramas, ou mililitros em litros.

## Documentação complementar

- [Visão de negócio](docs/business.md)
- [Stack técnica](docs/stack.md)
- [Arquitetura](docs/architecture.md)

## Contribuição

1. Crie uma branch a partir de `main` ou `master`.
2. Faça alterações pequenas e coesas.
3. Execute lint, testes e build antes de abrir um pull request.
4. Inclua migrations revisadas quando a alteração envolver o banco.
5. Não versione arquivos `.env`, chaves, senhas, dumps de banco ou dados de clientes.

## Responsável

Desenvolvido e mantido por [Tiago Abudi](https://github.com/TiagoAbudi).
