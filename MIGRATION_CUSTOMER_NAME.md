# Migration: Adicionar campo customer_name à tabela orders

## Descrição
Esta migration adiciona o campo `customer_name` à tabela `orders` para permitir armazenar o nome do cliente diretamente no pedido, mesmo quando o cliente não possui cadastro (sem customer_id).

## Como Executar

### Opção 1: Via Supabase Dashboard

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. Vá em **SQL Editor** no menu lateral
4. Clique em **New query**
5. Cole o conteúdo do arquivo `supabase/migrations/add_customer_name_to_orders.sql`
6. Clique em **Run** para executar

### Opção 2: Via CLI do Supabase (se configurado)

```bash
supabase db push
```

## Conteúdo da Migration

```sql
-- Add customer_name field to orders table
-- This allows storing the customer name directly even without a customer_id
-- Useful when customer provides name but not phone number

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS customer_name TEXT;

COMMENT ON COLUMN public.orders.customer_name IS 'Nome do cliente informado no pedido, usado quando não há customer_id cadastrado';
```

## Impacto

### Tabelas Afetadas
- `orders` - Adiciona coluna `customer_name` (TEXT, nullable)

### Comportamento
- **PDV**: Ao criar um pedido, o nome digitado no campo "Nome do Cliente" será salvo neste campo
- **Totem**: Ao finalizar um pedido, o nome digitado no popup será salvo neste campo
- **Painel de Pedidos**: Exibirá o nome do cliente na ordem: `customers.name` > `customer_name` > "Cliente Anônimo"
- **Monitor**: Exibirá o nome do cliente na mesma ordem de prioridade

### Retrocompatibilidade
✅ Esta migration é 100% retrocompatível:
- Pedidos existentes não serão afetados (campo será NULL)
- A lógica de exibição usa fallback para manter o comportamento anterior
- Não há necessidade de migração de dados

## Teste

Após executar a migration, teste:

1. **PDV**: Criar pedido apenas com nome (sem telefone)
2. **Totem**: Finalizar pedido digitando nome no popup
3. **Painel de Pedidos**: Verificar se o nome aparece no lugar de "Cliente Anônimo"
4. **Monitor**: Verificar se o nome aparece corretamente
