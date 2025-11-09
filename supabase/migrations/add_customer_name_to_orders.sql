-- Add customer_name field to orders table
-- This allows storing the customer name directly even without a customer_id
-- Useful when customer provides name but not phone number

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS customer_name TEXT;

COMMENT ON COLUMN public.orders.customer_name IS 'Nome do cliente informado no pedido, usado quando não há customer_id cadastrado';
