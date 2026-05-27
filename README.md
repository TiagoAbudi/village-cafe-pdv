# ☕ Village Cafe - Sistema de PDV e Mini-ERP

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

Um sistema completo de Ponto de Venda (PDV) e gestão integrada projetado para operações de cafeteria e estabelecimentos gastronômicos. Desenvolvido para transcender o caixa tradicional, unindo controle de estoque com auditoria, ficha técnica de produtos e gestão financeira avançada.

## 🚀 Funcionalidades Principais

* **Caixa e PDV Avançado:** * Abertura e fechamento de turno com fundo de troco.
  * Múltiplos métodos de pagamento (PIX, Dinheiro, Crédito, Débito).
  * **Edição e Cancelamento de Vendas:** Lógica inteligente que recalcula o caixa e devolve os itens ao estoque automaticamente.
* **Gestão de Revenda e Estoque (Audit Trail):**
  * Histórico de movimentações (Trilha de Auditoria) imutável para segurança do inventário.
  * Separação estrita entre insumos de cozinha (estoque base) e produtos de prateleira (revenda).
* **Fichas Técnicas:**
  * Produtos compostos geram baixa automática dos ingredientes base na proporção exata no momento da venda.
* **Módulo Financeiro (Contas a Pagar):**
  * Ao registrar a entrada de notas de fornecedores, o sistema pode automaticamente lançar provisões no módulo de Contas a Pagar, gerando um dashboard de vencimentos e controle de dívidas.

## 🛠️ Tecnologias Utilizadas

* **Front-end:** React.js com Vite
* **Linguagem:** TypeScript
* **Estilização:** Tailwind CSS (com suporte a Dark Mode)
* **Back-end & Banco de Dados:** Supabase (PostgreSQL)
* **Autenticação e Segurança:** Supabase Auth com Row Level Security (RLS) rigorosamente configurado.
* **Deploy:** Vercel

## ⚙️ Como executar localmente

1. Clone o repositório:
```bash
git clone [https://github.com/SEU_USUARIO/village-cafe-pdv.git](https://github.com/SEU_USUARIO/village-cafe-pdv.git)