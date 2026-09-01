# Village Café — Stack técnica

## Aplicação

| Camada | Tecnologia | Uso no projeto |
| --- | --- | --- |
| Interface | React 19 | Componentes funcionais, estado local e carregamento sob demanda dos módulos. |
| Linguagem | TypeScript | Código da aplicação, configuração e testes. |
| Build e desenvolvimento | Vite 8 | Servidor de desenvolvimento, bundle de produção e integração React. |
| Estilo | Tailwind CSS 3 + PostCSS/Autoprefixer | Estilos utilitários e tema visual da cafeteria. |
| Persistência e autenticação | Supabase JS 2 | Autenticação por e-mail/senha e acesso direto às tabelas Postgres. |
| Testes | Vitest 4, Testing Library e JSDOM | Testes unitários/de componentes em `src/__tests__`. |
| Qualidade estática | ESLint 10 + TypeScript strict | Lint e checagem de tipos. |

Não há backend próprio, API REST, ORM ou serviço Node no repositório atual. O navegador usa o cliente Supabase diretamente.

## Estrutura de diretórios

```text
.
├── public/                 # manifesto PWA, ícones e arquivos estáticos
├── src/
│   ├── assets/             # logotipo e imagens
│   ├── components/         # módulos funcionais e componentes de interface
│   ├── __tests__/          # testes e configuração de ambiente
│   ├── lib/                # Supabase e regras testáveis de dinheiro, estoque e datas
│   ├── App.tsx             # autenticação e navegação entre módulos
│   ├── index.css           # Tailwind e estilos globais
│   └── main.tsx            # ponto de entrada React
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.js
├── supabase/migrations/    # evolução versionada do banco e RPCs transacionais
└── package.json
```

## Configuração local

O cliente depende das variáveis abaixo, fornecidas à aplicação pelo Vite:

```env
VITE_SUPABASE_URL=<url-do-projeto-supabase>
VITE_SUPABASE_ANON_KEY=<chave-anon-do-supabase>
```

O local apropriado é `.env.local` na raiz deste repositório. Esse arquivo não deve ser versionado. A chave `anon` pode ser exposta a clientes apenas se as políticas de Row Level Security (RLS) do Supabase protegerem corretamente os dados.

## Comandos

```bash
npm install
npm run dev
npm run dev:homolog
npm run build
npm run lint
npm test -- --run
```

Também existem `npm run preview`, `npm run test:ui` e `npm run test:coverage`.

`npm run dev` usa as variáveis de produção presentes apenas no arquivo local `.env`; `npm run dev:homolog` usa `.env.homologacao.local`, também ignorado pelo Git, para conectar ao Supabase de homologação. O ambiente de homologação criado para este projeto tem ref `qgixtofcrdwbcotqpvgs`.

## Estado da validação em 31/08/2026

- `npm run lint`, `npm test -- --run` e `npm run build` passam localmente.
- A suíte cobre autenticação/PDV existentes e regras de pagamento, estoque e datas em `src/__tests__`.
- `@testing-library/dom` está declarado como dependência de desenvolvimento para permitir o ambiente de testes.
- O Git local foi reconstruído e configurado com `origin`; `.env` foi removido do rastreamento e `.env.example` documenta somente as chaves necessárias.
