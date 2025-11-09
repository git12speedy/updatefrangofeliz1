Sistema de Gestão de Assados

Sistema completo de gestão para restaurantes e lojas de assados, com PDV, painel de pedidos, gestão de estoque, fidelidade, módulo financeiro e muito mais.

🚀 Funcionalidades Principais

•
🛒 PDV (Ponto de Venda) - Sistema completo de vendas com suporte a produtos compostos.

•
📊 Dashboard - Visão geral do negócio.

•
📦 Gestão de Produtos - Produtos com variações e itens compostos.

•
📋 Gestão de Pedidos - Controle completo de pedidos.

•
🖥️ Monitor de Pedidos - Visualização em tempo real com notificações sonoras e visuais.

•
💰 Módulo "Minhas Finanças" - Gestão financeira completa (receitas, despesas, contas, cartões, sonhos).

•
👥 Gestão de Clientes - Cadastro e histórico.

•
🎁 Programa de Fidelidade - Pontos e recompensas.

•
📱 Loja Online - Para clientes fazerem pedidos.

•
🤖 Totem de Pedidos - Auto-atendimento.

•
📈 Relatórios - Análises e estatísticas de vendas e finanças.

•
🏪 Multi-lojas - Suporte para múltiplas lojas.




📦 Instalação do Sistema

Para instalar o sistema pela primeira vez, siga os guias detalhados.

1.
INSTRUCOES_INSTALACAO.md - Guia completo para a instalação inicial do sistema.

2.
INSTRUCOES_MODULO_FINANCEIRO.md - Guia específico para ativar o Módulo Financeiro.

Acesse a página /setup no seu navegador para iniciar a instalação interativa após configurar os pré-requisitos do Supabase.




✨ Destaques e Correções Recentes

📦 Funcionalidade: Itens Compostos

Nosso sistema agora suporta itens compostos, permitindo que o estoque de um produto seja derivado de outro (matéria-prima).

Como funciona:

1.
Prioridade de Consumo: O sistema sempre consome primeiro o estoque do produto final.

2.
Geração Automática: Se o produto final não tiver estoque, o sistema consome a matéria-prima e gera automaticamente o estoque do produto final, de acordo com o rendimento configurado.

3.
Validação Inteligente: A venda só é permitida se houver estoque do produto final ou da matéria-prima.

Cenários de Venda:

•
Cenário 1 (Com Estoque): Vende "Meio Frango" (estoque > 0).

•
Ação: Consome 1 do estoque de "Meio Frango". Matéria-prima ("Frango Inteiro") não é tocada.



•
Cenário 2 (Sem Estoque, Com Matéria-Prima): Vende "Meio Frango" (estoque = 0).

•
Ação: Consome 1 "Frango Inteiro", gera 2 "Meios Frangos" (rendimento 1->2), vende 1 e deixa 1 no estoque.



•
Cenário 3 (Sem Estoque, Sem Matéria-Prima): Tenta vender "Meio Frango".

•
Ação: Venda é bloqueada com a mensagem "Matéria-prima insuficiente".



Para mais detalhes, consulte a documentação completa: FUNCIONALIDADE_ITENS_COMPOSTOS.md.

🖥️ Melhorias no Monitor de Pedidos e Painel de Pedidos

O monitor de pedidos foi aprimorado para fornecer feedback instantâneo e claro.

•
🔊 Notificação Sonora: Um som de alerta toca sempre que um novo pedido chega (via Loja Online, Totem ou WhatsApp). O som pode ser ativado/desativado pelo usuário.

•
🔥 Badge de Foguinho: Um emoji de foguinho (🔥) com animação aparece nos cards de novos pedidos para destacá-los visualmente, desaparecendo após 10 segundos.

•
🎬 Slideshow em Tela Cheia: Quando o monitor fica ocioso (sem novos pedidos por um tempo), ele exibe um slideshow de banners em tela cheia, voltando automaticamente para a tela de pedidos quando uma nova venda chega.

Para mais detalhes, consulte: FUNCIONALIDADES_MONITOR.md.

💰 Módulo "Minhas Finanças"

Implementamos um módulo financeiro completo para gestão de receitas, despesas, contas bancárias, cartões de crédito e metas.

Principais Funcionalidades:

•
Dashboard Financeiro: Gráficos e resumos visuais do seu fluxo de caixa.

•
Lançamentos: CRUD completo para receitas, despesas e transferências.

•
Contas e Cartões: Cadastre e acompanhe saldos, que são atualizados automaticamente.

•
Contas a Receber: Gerencie vendas a prazo e marque-as como recebidas.

•
Quadro dos Sonhos: Defina metas financeiras e acompanhe seu progresso.

•
Relatórios: Exporte seus dados financeiros em formato CSV.

Para a documentação completa, consulte: MODULO_FINANCEIRO_DOCUMENTACAO.md.

🔧 Correções de Bugs Críticos

•
Erro de UUID Inválido: Corrigido erro invalid input syntax for type uuid: "" que ocorria ao criar lançamentos financeiros. A solução foi converter strings vazias ("") para null antes de enviar os dados para o banco de dados, garantindo a compatibilidade com o PostgreSQL.

•
Erro de Item de Select Vazio: Corrigido erro do Radix UI que não permite <SelectItem> com value="". Removemos essas opções e ajustamos a lógica para usar undefined e placeholders descritivos, melhorando a UX e eliminando crashes.

•
Idempotência da Migration: A migration do banco de dados foi refeita para ser idempotente, usando IF NOT EXISTS para índices e DROP IF EXISTS para triggers e policies. Isso permite que a migration seja executada várias vezes sem causar erros.

•
Ambiguidade em Joins (PostgREST): Corrigido erro PGRST201 que ocorria em queries com múltiplos relacionamentos para a mesma tabela. A solução foi especificar a coluna da chave estrangeira explicitamente na query (ex: bank_accounts!bank_account_id(*)).

•
Consumo Duplicado de Estoque: Resolvido um bug crítico onde o sistema consumia matéria-prima mesmo quando o produto composto tinha estoque, e corrigida a lógica de geração de estoque para que o rendimento seja aplicado corretamente.

•
Ações Rápidas do Dashboard: Botões "Nova Receita" e "Nova Despesa" no dashboard financeiro agora funcionam corretamente, redirecionando o usuário para a aba de lançamentos e abrindo o dialog com o tipo pré-selecionado.




💻 Como Editar o Código

Se você deseja trabalhar localmente usando sua própria IDE, pode clonar este repositório e enviar as alterações.

O único requisito é ter Node.js e npm instalados - instale com nvm

Siga estes passos:

Plain Text


# Passo 1: Clone o repositório usando a URL Git do projeto.
git clone <SUA_URL_GIT>

# Passo 2: Navegue até o diretório do projeto.
cd <NOME_DO_SEU_PROJETO>

# Passo 3: Instale as dependências necessárias.
npm i

# Passo 4: Inicie o servidor de desenvolvimento com recarregamento automático e visualização instantânea.
npm run dev


🛠️ Tecnologias Utilizadas

Este projeto é construído com:

•
Vite

•
TypeScript

•
React

•
shadcn/ui

•
Tailwind CSS

•
Supabase (Backend)

🚀 Como Fazer o Deploy

Para fazer o deploy da sua aplicação, utilize sua plataforma de hospedagem preferida (como Vercel, Netlify, ou um servidor próprio).

Para conectar um domínio personalizado, siga a documentação da sua plataforma de deploy.




Este README.md foi gerado e revisado com base na documentação do projeto.




