import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, Package, Info, MessageCircle, XCircle, Search, ArrowRight, Check, Star, Volume2, VolumeX, Printer } from "lucide-react";
import { supabase as sb } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useSoundNotification } from "@/hooks/useSoundNotification";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import RealTimeClock from "@/components/RealTimeClock";
import { useOrderFlow } from "@/hooks/useOrderFlow"; // Importando useOrderFlow
import { Enums } from '@/integrations/supabase/types'; // Importando Enums para tipagem
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils"; // Importando cn
import { format } from "date-fns"; // Importar format
import { ptBR } from "date-fns/locale"; // Importar ptBR
import NotificationCenter from "@/components/NotificationCenter"; // NOVO: Importando NotificationCenter

const supabase: any = sb;

interface Order {
  id: string;
  order_number: string;
  source: string;
  status: Enums<'order_status'>; // Usando a tipagem do Supabase
  total: number;
  created_at: string;
  payment_method: string;
  delivery: boolean;
  delivery_address?: string;
  delivery_number?: string;
  delivery_reference?: string;
  pickup_time?: string;
  reservation_date?: string;
  customer_id?: string;
  customer_name?: string; // Nome do cliente informado diretamente
  customers?: {
    name: string;
    phone: string;
  };
  order_items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    variation_name?: string;
    product_price: number;
    subtotal: number;
  }>;
}

// Paleta de cores customizada para os badges
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: 'bg-[#C3D3E2]', text: 'text-gray-800', border: 'border-[#C3D3E2]' }, // Aguardando (Cinza Azulado)
  preparing: { bg: 'bg-[#FFEB99]', text: 'text-yellow-900', border: 'border-[#FFEB99]' }, // Em preparo (Amarelo Suave)
  ready: { bg: 'bg-[#B2E5B2]', text: 'text-green-900', border: 'border-[#B2E5B2]' }, // Pronto (Verde Claro)
  delivered: { bg: 'bg-green-500', text: 'text-white', border: 'border-green-500' },
  cancelled: { bg: 'bg-gray-300', text: 'text-gray-800', border: 'border-gray-300' },
};

// Mapeamento de chaves de status para rótulos de exibição
const STATUS_LABELS: Record<Enums<'order_status'>, string> = {
  pending: "Aguardando",
  preparing: "Em Preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export default function OrderPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [motoboyWhatsappNumber, setMotoboyWhatsappNumber] = useState<string | null>(null);
  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const { profile } = useAuth();
  const { toast } = useToast();
  const { notify, isEnabled: isSoundEnabled, toggleSound } = useSoundNotification(); // Desestruturando para o botão
  const { activeFlow, getNextStatus } = useOrderFlow(); // Usando o hook useOrderFlow

  // Efeito para remover o indicador 'Novo' após 10 segundos
  useEffect(() => {
    if (newOrderIds.length > 0) {
      const timer = setTimeout(() => {
        setNewOrderIds(prev => prev.slice(1));
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [newOrderIds]);

  useEffect(() => {
    if (profile?.store_id && activeFlow.length > 0) { // Garante que activeFlow esteja carregado
      loadOrders();
      loadMotoboyNumber();

      const channel = supabase
        .channel('orders-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `store_id=eq.${profile.store_id}`,
          },
          (payload: any) => {
            console.log('OrderPanel: Realtime event received!', payload); // Log para depuração
            if (payload.eventType === 'INSERT') {
              const newOrder = payload.new as Order;
              if (newOrder.source === 'whatsapp' || newOrder.source === 'totem' || newOrder.source === 'loja_online') { // Adicionado loja_online
                notify();
                setNewOrderIds(prev => [...prev, newOrder.id]);
              }
            }
            loadOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile, notify, activeFlow]); // Adicionado activeFlow e notify às dependências

  const loadMotoboyNumber = async () => {
    if (!profile?.store_id) return;

    const { data, error } = await supabase
      .from("stores")
      .select("motoboy_whatsapp_number")
      .eq("id", profile.store_id)
      .single();

    if (error) {
      console.error("Erro ao carregar número do motoboy:", error);
    } else if (data) {
      setMotoboyWhatsappNumber(data.motoboy_whatsapp_number);
    }
  };

  const loadOrders = useCallback(async () => {
    if (!profile?.store_id || activeFlow.length === 0) return;

    // O painel de pedidos deve mostrar apenas os status ativos no fluxo,
    // além de 'delivered' e 'cancelled' para fins de histórico/visualização rápida.
    // No entanto, as colunas serão apenas para os status ativos do fluxo.
    const statusesToFetch = [...activeFlow, 'delivered', 'cancelled'];

    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        customers (
          name,
          phone
        ),
        order_items (
          product_id,
          product_name,
          quantity,
          variation_name,
          product_price,
          subtotal
        )
      `)
      .eq("store_id", profile.store_id)
      .in("status", statusesToFetch)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar pedidos",
        description: error.message,
      });
    } else {
      setOrders(data || []);
    }
  }, [profile, activeFlow, toast]); // Adicionado activeFlow e toast às dependências

  const updateOrderStatus = async (orderId: string, status: Enums<'order_status'>) => {
    // Fetch the full order details before updating status
    const { data: orderToUpdate, error: fetchOrderError } = await supabase
      .from("orders")
      .select("id, customer_id, payment_method, order_number")
      .eq("id", orderId)
      .single();

    if (fetchOrderError || !orderToUpdate) {
      toast({
        variant: "destructive",
        title: "Erro ao buscar pedido",
        description: fetchOrderError?.message || "Pedido não encontrado.",
      });
      return;
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderId);

    if (updateError) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar pedido",
        description: updateError.message,
      });
      return;
    }

    // --- Lógica de devolução de pontos de fidelidade ao cancelar ---
    if (status === "cancelled" && orderToUpdate.payment_method?.toLowerCase().includes("fidelidade") && orderToUpdate.customer_id) {
      try {
        // Buscar transações de resgate de pontos para este pedido
        const { data: redeemedTransactions, error: transactionsError } = await supabase
          .from("loyalty_transactions")
          .select("points")
          .eq("order_id", orderId)
          .eq("transaction_type", "redeem"); // Pontos de resgate são negativos

        if (transactionsError) throw transactionsError;

        let totalPointsToReturn = 0;
        redeemedTransactions.forEach((tx: { points: number }) => {
          totalPointsToReturn += Math.abs(tx.points); // Somar o valor absoluto dos pontos resgatados
        });

        if (totalPointsToReturn > 0) {
          // Atualizar pontos do cliente
          const { data: customerData, error: customerError } = await supabase
            .from("customers")
            .select("points")
            .eq("id", orderToUpdate.customer_id)
            .single();

          if (customerError) throw customerError;

          const newCustomerPoints = (customerData?.points || 0) + totalPointsToReturn;
          const { error: updateCustomerError } = await supabase
            .from("customers")
            .update({ points: newCustomerPoints })
            .eq("id", orderToUpdate.customer_id);

          if (updateCustomerError) throw updateCustomerError;

          // Registrar transação de devolução de pontos
          const { error: insertTransactionError } = await supabase
            .from("loyalty_transactions")
            .insert({
              customer_id: orderToUpdate.customer_id,
              order_id: orderId,
              points: totalPointsToReturn,
              transaction_type: "earn",
              store_id: profile.store_id,
              description: `Pontos devolvidos por cancelamento do pedido ${orderToUpdate.order_number}`,
            });

          if (insertTransactionError) throw insertTransactionError;

          toast({
            title: "Pedido cancelado e pontos devolvidos!",
            description: `Pedido ${orderToUpdate.order_number} cancelado. ${totalPointsToReturn} pontos devolvidos ao cliente.`,
          });
        } else {
          toast({
            title: "Pedido cancelado!",
            description: `Pedido ${orderToUpdate.order_number} cancelado.`,
          });
        }
      } catch (loyaltyError: any) {
        console.error("Erro ao processar fidelidade no cancelamento:", loyaltyError);
        toast({
          variant: "destructive",
          title: "Erro ao devolver pontos",
          description: `Pedido cancelado, mas houve um erro ao devolver os pontos: ${loyaltyError.message}`,
        });
      }
    } else {
      toast({
        title: "Pedido atualizado!",
      });
    }
    // --- Fim da lógica de devolução de pontos ---

    loadOrders();
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm("Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.")) {
      return;
    }
    await updateOrderStatus(orderId, "cancelled");
  };

  const handleSendWhatsappToMotoboy = (order: Order) => {
    if (!motoboyWhatsappNumber) {
      toast({
        variant: "destructive",
        title: "Número do motoboy não configurado",
        description: "Configure o número de WhatsApp do motoboy nas Configurações da Loja.",
      });
      return;
    }

    let message = `*NOVO PEDIDO DE ENTREGA*\n\n`;
    message += `*Pedido:* #${order.order_number}\n`;
    message += `*Cliente:* ${order.customers?.name || 'N/A'}\n`;
    message += `*Telefone:* ${order.customers?.phone || 'N/A'}\n`;
    message += `*Endereço:* ${order.delivery_address}, ${order.delivery_number}\n`;
    if (order.delivery_reference) {
      message += `*Referência:* ${order.delivery_reference}\n`;
    }
    message += `*Total:* R$ ${order.total.toFixed(2)}\n`;
    message += `*Pagamento:* ${order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)}\n\n`;
    message += `*Itens:*\n`;
    order.order_items.forEach(item => {
      message += `- ${item.quantity}x ${item.product_name} ${item.variation_name ? `(${item.variation_name})` : ''}\n`;
    });

    const whatsappUrl = `https://wa.me/${motoboyWhatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handlePrintOrder = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Erro ao imprimir",
        description: "Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está desativado.",
      });
      return;
    }

    const customerName = order.customers?.name || order.customer_name || 'Cliente Anônimo';
    const customerPhone = order.customers?.phone || 'N/A';
    const orderDate = new Date(order.created_at).toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pedido #${order.order_number}</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              max-width: 300px;
              margin: 20px auto;
              padding: 0;
              font-size: 12px;
            }
            .header {
              text-align: center;
              background-color: #2a2a2a !important;
              color: white;
              padding: 15px 10px;
              margin-bottom: 10px;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              color-adjust: exact;
            }
            .header h1 {
              margin: 0;
              font-size: 18px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .header .phone {
              margin-top: 5px;
              font-size: 14px;
            }
            .content {
              padding: 10px;
            }
            .order-info {
              margin-bottom: 5px;
            }
            .order-info div {
              margin: 2px 0;
              font-size: 12px;
            }
            .section {
              margin: 5px 0;
              padding: 5px 0;
            }
            .section-title {
              font-weight: bold;
              margin-bottom: 3px;
              font-size: 12px;
            }
            .section div {
              font-size: 12px;
            }
            .item {
              display: flex;
              justify-content: space-between;
              margin: 3px 0;
            }
            .divider {
              border-top: 1px dashed #333;
              margin: 8px 0;
            }
            .total {
              font-size: 14px;
              font-weight: bold;
              margin-top: 8px;
            }
            .footer {
              text-align: center;
              margin-top: 10px;
              font-size: 11px;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              .header {
                background-color: #2a2a2a !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${customerName.toUpperCase()}</h1>
            ${customerPhone !== 'N/A' ? `<div class="phone">${customerPhone}</div>` : ''}
          </div>

          <div class="content">
            <div class="order-info">
              <div>Pedido #${order.order_number}</div>
              <div>${orderDate}</div>
            </div>

            ${order.delivery ? `
              <div class="divider"></div>
              <div class="section">
                <div class="section-title">ENTREGA</div>
                <div>${order.delivery_address}, ${order.delivery_number}</div>
                ${order.delivery_reference ? `<div>Ref: ${order.delivery_reference}</div>` : ''}
              </div>
            ` : ''}

            ${order.pickup_time ? `
              <div class="divider"></div>
              <div class="section">
                <div class="section-title">RETIRADA</div>
                <div>Horário: ${order.pickup_time}</div>
              </div>
            ` : ''}

            ${order.reservation_date ? `
              <div class="divider"></div>
              <div class="section">
                <div class="section-title">RESERVA</div>
                <div>Data: ${new Date(order.reservation_date).toLocaleDateString('pt-BR')}</div>
              </div>
            ` : ''}

            <div class="divider"></div>

            <div class="section">
              <div class="section-title">ITENS DO PEDIDO</div>
              ${order.order_items.map(item => {
                const isRedeemed = item.product_price === 0 && item.subtotal === 0;
                return `
                  <div class="item">
                    <span>${item.quantity}x ${item.product_name}${item.variation_name ? ` (${item.variation_name})` : ''}${isRedeemed ? ' ⭐' : ''}</span>
                    <span>${isRedeemed ? 'RESGATADO' : `R$ ${item.subtotal.toFixed(2)}`}</span>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="divider"></div>

            <div class="section">
              <div><strong>Pagamento:</strong> ${order.payment_method}</div>
            </div>

            <div class="total">
              TOTAL: R$ ${order.total.toFixed(2)}
            </div>

            <div class="footer">
              Obrigado pela preferência!
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 250);
            };
            
            // Fecha a janela automaticamente após imprimir ou cancelar
            window.onafterprint = function() {
              setTimeout(function() {
                window.close();
              }, 100);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const getStatusBadge = (status: Enums<'order_status'>) => {
    const label = STATUS_LABELS[status] || status;
    const colors = STATUS_COLORS[status] || STATUS_COLORS.pending;
    
    return (
      <Badge 
        className={`${colors.bg} ${colors.text} border ${colors.border} hover:opacity-90 transition-opacity`}
        variant="outline"
      >
        {label}
      </Badge>
    );
  };

  // Esta função agora gera as colunas de exibição com base no activeFlow
  const getDisplayColumns = () => {
    return activeFlow.map(statusKey => ({
      status_key: statusKey,
      status_label: STATUS_LABELS[statusKey] || statusKey,
    }));
  };

  const activeColumns = getDisplayColumns();
  
  const getOrdersByStatus = (statusKey: Enums<'order_status'>) => {
    const filteredByStatus = orders.filter(o => o.status === statusKey);
    
    // Aplicar filtro de busca
    if (!searchTerm) return filteredByStatus;

    const lowerCaseSearch = searchTerm.toLowerCase();
    return filteredByStatus.filter(order => 
      order.order_number.toLowerCase().includes(lowerCaseSearch) ||
      order.customers?.name?.toLowerCase().includes(lowerCaseSearch) ||
      order.customers?.phone?.includes(lowerCaseSearch)
    );
  };

  const renderOrderActions = (order: Order) => {
    const nextStatus = getNextStatus(order.status);
    
    // Cor suave de azul para mover
    const moveButtonClass = "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 transition-all";
    // Cor suave de vermelho para cancelar
    const cancelButtonClass = "bg-[#E57373]/10 text-[#E57373] hover:bg-[#E57373]/20 transition-all";
    // Cor suave de verde para concluir
    const completeButtonClass = "bg-green-500/10 text-green-700 hover:bg-green-500/20 transition-all";

    return (
      <div className="space-y-2">
        {nextStatus && (
          <Button
            onClick={() => updateOrderStatus(order.id, nextStatus)}
            className={`w-full ${moveButtonClass}`}
            size="sm"
            variant="outline"
          >
            Mover para {STATUS_LABELS[nextStatus]} <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
        {!nextStatus && ( // Se não há próximo status no fluxo ativo, a opção é "Concluir" (delivered)
          <Button
            onClick={() => updateOrderStatus(order.id, "delivered")}
            className={`w-full ${completeButtonClass}`}
            size="sm"
            variant="outline"
          >
            <Check className="h-4 w-4 mr-2" />
            Concluir
          </Button>
        )}
        {order.status !== "cancelled" && order.status !== "delivered" && ( // Só permite cancelar se não estiver já cancelado ou entregue
          <Button
            onClick={() => handleCancelOrder(order.id)}
            className={`w-full ${cancelButtonClass}`}
            size="sm"
            variant="outline"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        )}
      </div>
    );
  };

  const getStatusIcon = (statusKey: Enums<'order_status'>) => {
    const icons: Record<Enums<'order_status'>, any> = {
      pending: Clock,
      preparing: Package,
      ready: CheckCircle,
      delivered: CheckCircle, // Entregue usa o mesmo ícone de pronto
      cancelled: XCircle,
    };
    return icons[statusKey] || Clock;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Barra Superior Fixa */}
      <div className="sticky top-0 bg-background z-10 p-6 -mx-6 -mt-6 border-b shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Painel de Pedidos</h1>
            <p className="text-muted-foreground">Acompanhe os pedidos em tempo real</p>
          </div>
          {/* Relógio e Botões de Ação */}
          <div className="flex items-center gap-4">
            <RealTimeClock />
            
            {/* Botão de Ativação de Som */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                toggleSound(!isSoundEnabled);
                // Tenta tocar o som imediatamente após a ativação para testar a permissão
                if (!isSoundEnabled) {
                  notify(); 
                }
              }}
              className={cn("flex items-center gap-2", isSoundEnabled ? "text-success border-success" : "text-muted-foreground")}
            >
              {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {isSoundEnabled ? "Som Ativo" : "Ativar Som"}
            </Button>

            {/* NOVO: Notification Center */}
            <NotificationCenter />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número do pedido, nome ou telefone do cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Conteúdo Roolável (Colunas de Pedidos) */}
      <div className="flex-1 overflow-y-auto pt-6">
        <div className={`grid grid-cols-1 gap-6 ${activeColumns.length === 1 ? 'lg:grid-cols-1' : activeColumns.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
          {activeColumns.map((statusConfig) => {
            const StatusIcon = getStatusIcon(statusConfig.status_key);
            const columnOrders = getOrdersByStatus(statusConfig.status_key);
            
            return (
              <div key={statusConfig.status_key} className="space-y-4">
                <div className="flex items-center gap-2">
                  <StatusIcon className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">{statusConfig.status_label} ({columnOrders.length})</h2>
                </div>
                {columnOrders.map((order) => {
                  const isNew = newOrderIds.includes(order.id);
                  const customerName = order.customers?.name || order.customer_name || 'Cliente Anônimo';
                  const pickupTime = order.pickup_time;
                  const isReservationOrder = !!order.reservation_date; // Verifica se é um pedido de reserva
                  const formattedDate = order.reservation_date ? format(new Date(order.reservation_date), 'dd/MM', { locale: ptBR }) : null;

                  // Construção do cabeçalho no formato: Nome | Horário | Data
                  const headerText = [
                    customerName,
                    pickupTime,
                    isReservationOrder && formattedDate ? formattedDate : null
                  ].filter(Boolean).join(' | ');

                  return (
                    <Card key={order.id} className="shadow-soft relative transition-shadow hover:shadow-medium">
                      {isNew && (
                        <div 
                          className="absolute -top-1 -right-1 z-50 text-4xl animate-bounce"
                          style={{ 
                            filter: 'drop-shadow(0 0 8px rgba(255, 0, 0, 0.5))',
                            animation: 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                          }}
                        >
                          🔥
                        </div>
                      )}
                      {/* Cabeçalho conciso (Fundo cinza) */}
                      <div className="bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-center py-2 rounded-t-lg font-bold text-sm">
                        {headerText}
                      </div>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center justify-between text-base">
                          <div className="flex items-center gap-2">
                            <span>{order.order_number}</span>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <Info className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Detalhes do Pedido</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3 text-sm">
                                  <div><strong>Pedido:</strong> {order.order_number}</div>
                                  <div><strong>Origem:</strong> {order.source.charAt(0).toUpperCase() + order.source.slice(1)}</div>
                                  <div><strong>Pagamento:</strong> {order.payment_method}</div>
                                  <div><strong>Total:</strong> R$ {order.total.toFixed(2)}</div>
                                  {order.customers && (
                                    <>
                                      <div><strong>Cliente:</strong> {order.customers.name}</div>
                                      <div><strong>Telefone:</strong> {order.customers.phone}</div>
                                    </>
                                  )}
                                  {order.delivery && (
                                    <>
                                      <div><strong>Entrega:</strong> Sim</div>
                                      {order.delivery_address && <div><strong>Endereço:</strong> {order.delivery_address}, {order.delivery_number}</div>}
                                      {order.delivery_reference && <div><strong>Referência:</strong> {order.delivery_reference}</div>}
                                    </>
                                  )}
                                  {!order.delivery && (order.pickup_time || order.reservation_date) && (
                                    <>
                                      <div><strong>Retirada:</strong> Sim</div>
                                      {order.pickup_time && <div><strong>Horário:</strong> {order.pickup_time}</div>}
                                      {order.reservation_date && <div><strong>Data da Reserva:</strong> {new Date(order.reservation_date).toLocaleDateString()}</div>}
                                    </>
                                  )}
                                  <div className="pt-2 border-t">
                                    <strong>Itens:</strong>
                                    {order.order_items.map((item, idx) => {
                                      const isRedeemed = item.product_price === 0 && item.subtotal === 0;
                                      return (
                                        <div key={idx} className="flex justify-between mt-1">
                                          <span className="flex items-center gap-1">
                                            {item.product_name} {item.variation_name && `(${item.variation_name})`}
                                            {isRedeemed && <Star className="h-3 w-3 text-purple-600 fill-purple-600" aria-label="Resgatado com pontos" />}
                                          </span>
                                          <span className="font-medium">x{item.quantity}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="flex gap-2 mt-4">
                                    {order.delivery && motoboyWhatsappNumber && (
                                      <Button
                                        onClick={() => handleSendWhatsappToMotoboy(order)}
                                        className="flex-1"
                                        variant="outline"
                                      >
                                        <MessageCircle className="h-4 w-4 mr-2" />
                                        WhatsApp Motoboy
                                      </Button>
                                    )}
                                    <Button
                                      onClick={() => handlePrintOrder(order)}
                                      className={order.delivery && motoboyWhatsappNumber ? "flex-1" : "w-full"}
                                      variant="outline"
                                    >
                                      <Printer className="h-4 w-4 mr-2" />
                                      Imprimir Pedido
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                          {getStatusBadge(order.status)}
                        </CardTitle>
                        {/* Nome do cliente abaixo do número do pedido */}
                        <p className="text-sm text-muted-foreground">{customerName}</p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-sm space-y-1">
                          {order.order_items.map((item, idx) => {
                            const isRedeemed = item.product_price === 0 && item.subtotal === 0;
                            return (
                              <div key={idx} className="flex justify-between">
                                <span className="flex items-center gap-1">
                                  {item.product_name} {item.variation_name && `(${item.variation_name})`}
                                  {isRedeemed && <Star className="h-3 w-3 text-purple-600 fill-purple-600" aria-label="Resgatado com pontos" />}
                                </span>
                                <span className="font-medium">x{item.quantity}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-col gap-2">
                          {order.delivery && motoboyWhatsappNumber && (
                            <Button
                              onClick={() => handleSendWhatsappToMotoboy(order)}
                              className="w-full"
                              size="sm"
                              variant="outline"
                            >
                              <MessageCircle className="h-4 w-4 mr-2" />
                              WhatsApp Motoboy
                            </Button>
                          )}
                          {renderOrderActions(order)}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}