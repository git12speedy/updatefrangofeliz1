-- =====================================================
-- INSTRUÇÕES: Execute este SQL no Supabase SQL Editor
-- =====================================================
-- 
-- Para ativar a funcionalidade de WhatsApp Inteligente:
-- 1. Acesse o painel do Supabase (https://supabase.com)
-- 2. Vá em "SQL Editor"
-- 3. Cole e execute o código abaixo
-- 
-- =====================================================

-- Adicionar colunas para WhatsApp AI na tabela stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS whatsapp_ai_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS whatsapp_ai_api_key TEXT;

-- Adicionar campo de observação/notas na tabela orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- Adicionar colunas necessárias na tabela products
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_packaging BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_perishable BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2) DEFAULT 0.00;

-- Criar tabela para vincular embalagens a produtos
CREATE TABLE IF NOT EXISTS product_packaging_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packaging_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(packaging_id, product_id)
);

-- Adicionar RLS policies para product_packaging_links
ALTER TABLE product_packaging_links ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas se existirem e recriar
DROP POLICY IF EXISTS "Users can view packaging links from their store" ON product_packaging_links;
DROP POLICY IF EXISTS "Users can insert packaging links to their store" ON product_packaging_links;
DROP POLICY IF EXISTS "Users can update packaging links from their store" ON product_packaging_links;
DROP POLICY IF EXISTS "Users can delete packaging links from their store" ON product_packaging_links;

CREATE POLICY "Users can view packaging links from their store"
  ON product_packaging_links FOR SELECT
  USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert packaging links to their store"
  ON product_packaging_links FOR INSERT
  WITH CHECK (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update packaging links from their store"
  ON product_packaging_links FOR UPDATE
  USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete packaging links from their store"
  ON product_packaging_links FOR DELETE
  USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_product_packaging_links_packaging_id ON product_packaging_links(packaging_id);
CREATE INDEX IF NOT EXISTS idx_product_packaging_links_product_id ON product_packaging_links(product_id);
CREATE INDEX IF NOT EXISTS idx_product_packaging_links_store_id ON product_packaging_links(store_id);

-- Adicionar campos para Itens Compostos nas variações
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS is_composite BOOLEAN DEFAULT FALSE;
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS raw_material_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS raw_material_variation_id UUID REFERENCES product_variations(id) ON DELETE SET NULL;
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS yield_quantity INTEGER DEFAULT 1;

-- Criar tabela para rastrear transações de itens compostos (para reversão em cancelamentos)
CREATE TABLE IF NOT EXISTS composite_item_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES product_variations(id) ON DELETE CASCADE,
  raw_material_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  raw_material_consumed INTEGER NOT NULL,
  variations_generated INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reversed_at TIMESTAMP WITH TIME ZONE
);

-- Adicionar RLS policies para composite_item_transactions
ALTER TABLE composite_item_transactions ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas se existirem e recriar
DROP POLICY IF EXISTS "Users can view composite transactions from their orders" ON composite_item_transactions;
DROP POLICY IF EXISTS "Users can insert composite transactions for their orders" ON composite_item_transactions;
DROP POLICY IF EXISTS "Users can update composite transactions from their orders" ON composite_item_transactions;

CREATE POLICY "Users can view composite transactions from their orders"
  ON composite_item_transactions FOR SELECT
  USING (order_id IN (
    SELECT id FROM orders WHERE store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can insert composite transactions for their orders"
  ON composite_item_transactions FOR INSERT
  WITH CHECK (order_id IN (
    SELECT id FROM orders WHERE store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can update composite transactions from their orders"
  ON composite_item_transactions FOR UPDATE
  USING (order_id IN (
    SELECT id FROM orders WHERE store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- Adicionar índices para melhor performance dos itens compostos
CREATE INDEX IF NOT EXISTS idx_composite_item_transactions_order_id ON composite_item_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_composite_item_transactions_variation_id ON composite_item_transactions(variation_id);
CREATE INDEX IF NOT EXISTS idx_composite_item_transactions_raw_material ON composite_item_transactions(raw_material_product_id);
CREATE INDEX IF NOT EXISTS idx_product_variations_raw_material ON product_variations(raw_material_product_id) WHERE is_composite = true;

-- =====================================================
-- Pronto! As funcionalidades foram ativadas.
-- =====================================================
