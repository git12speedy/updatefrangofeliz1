import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, Package, Info, MessageCircle, XCircle, Star, AlertCircle, Volume2, VolumeX } from "lucide-react";
import { supabase as sb } from "@/integrations/supabase/client";
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
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useOrderFlow } from "@/hooks/useOrderFlow"; // Importando useOrderFlow
import { Enums } from '@/integrations/supabase/types'; // Importando Enums para tipagem
import { format } from "date-fns"; // Importar format
import { ptBR } from "date-fns/locale"; // Importar ptBR
import useEmblaCarousel from 'embla-carousel-react';
import { cn } from "@/lib/utils"; // Importar cn para classes condicionais

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

interface Banner {
  id: string;
  url: string;
  order: number;
}

interface MonitorSettings {
  slideshowDelay: number; // in milliseconds
  idleTimeoutSeconds: number;
  fullscreenSlideshow: boolean;
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

export default function Monitor() {
  const { slug } = useParams();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("Monitor de Pedidos");
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [newOrderIds, setNewOrderIds] = useState<string[]>([]); // To highlight new orders
  const [banners, setBanners] = useState<Banner[]>([]); // Estado para os banners
  const { toast } = useToast();
  const { notify, isEnabled: isSoundEnabled, toggleSound } = useSoundNotification();
  const { activeFlow, loading: orderFlowLoading } = useOrderFlow();

  // Monitor Settings states
  const [monitorSettings, setMonitorSettings] = useState<MonitorSettings>({
    slideshowDelay: 5000, // Default 5 seconds
    idleTimeoutSeconds: 30, // Default 30 seconds
    fullscreenSlideshow: false,
  });
  const [isIdle, setIsIdle] = useState(false);
  // Novo estado para forçar o reset do timer de ociosidade
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());

  // Configuração do carrossel sem plugins
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  // Slideshow Autoplay
  useEffect(() => {
    if (!emblaApi || !isIdle || banners.length === 0) return;
  
    const autoplay = () => {
      emblaApi.scrollNext();
    };
  
    const timer = setInterval(autoplay, monitorSettings.slideshowDelay);
  
    return () => clearInterval(timer);
  }, [emblaApi, isIdle, banners.length, monitorSettings.slideshowDelay]);


  // Effect to remove the 'New' indicator after 10 seconds
  useEffect(() => {
    if (newOrderIds.length > 0) {
      const timer = setTimeout(() => {
        setNewOrderIds(prev => prev.slice(1));
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [newOrderIds]);

  useEffect(() => {
    loadStoreInfo();
  }, [slug]);

  useEffect(() => {
    if (storeId) {
      loadBanners(); // Carregar banners quando o storeId estiver disponível
      loadMonitorSettings(); // Carregar configurações do monitor
    }
  }, [storeId]);

  // NOVO EFEITO: Timer de Ociosidade baseado em lastActivityTime
  useEffect(() => {
    let idleTimer: NodeJS.Timeout | null = null;
    const idleTimeoutMs = monitorSettings.idleTimeoutSeconds * 1000;

    if (idleTimeoutMs > 0) {
      // Se houver atividade recente, agende o timer
      idleTimer = setTimeout(() => {
        setIsIdle(true);
        console.log(`Monitor: Entrando em modo ocioso após ${monitorSettings.idleTimeoutSeconds}s.`);
      }, idleTimeoutMs);
    } else {
      // Se o timeout for 0, nunca fica ocioso (sempre mostra pedidos)
      setIsIdle(false);
    }

    // Se houver uma nova atividade, o lastActivityTime muda, o useEffect roda,
    // o timer anterior é limpo e um novo é agendado.
    return () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        console.log("Monitor: Timer de ociosidade resetado/limpo.");
      }
    };
  }, [lastActivityTime, monitorSettings.idleTimeoutSeconds]);


  const showSlideshow = isIdle && banners.length > 0;
  console.log("Monitor: showSlideshow:", showSlideshow);


  useEffect(() => {
    if (storeId && !orderFlowLoading && activeFlow.length > 0) {
      loadOrders();

      const channel = supabase
        .channel('orders-changes-monitor')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `store_id=eq.${storeId}`,
          },
          (payload: any) => {
            console.log('Monitor: Realtime event received!', payload);
            
            // 1. Resetar o timer de ociosidade
            setLastActivityTime(Date.now());
            setIsIdle(false); // GARANTINDO QUE SAIA DO MODO OCIOSO IMEDIATAMENTE

            if (payload.eventType === 'INSERT') {
              const newOrder = payload.new as Order;
              if (newOrder.source === 'whatsapp' || newOrder.source === 'totem' || newOrder.source === 'loja_online') {
                notify();
                setNewOrderIds(prev => [...prev, newOrder.id]);
              }
              // Adicionar um pequeno delay para garantir que o novo registro seja propagado
              setTimeout(() => {
                loadOrders();
              }, 100); 
            } else if (payload.eventType === 'UPDATE') {
              // Para updates (mudança de status), carregue imediatamente
              loadOrders();
            }
            // DELETE events are handled by loadOrders() as well
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [storeId, orderFlowLoading, activeFlow, notify]);

  const loadStoreInfo = async () => {
    let query = supabase.from("stores" as any).select("id, name, display_name, image_url, monitor_slideshow_delay, monitor_idle_timeout_seconds, monitor_fullscreen_slideshow");
    
    if (slug) {
      query = query.eq("slug", slug);
    } else {
      toast({
        variant: "destructive",
        title: "Loja não especificada",
        description: "Por favor, acesse o monitor com a URL da loja (ex: /monitor/minha-loja).",
      });
      return;
    }
    
    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      toast({
        variant: "destructive",
        title: "Loja não encontrada",
        description: slug ? "Esta URL de loja não existe" : "Nenhuma loja disponível",
      });
      setStoreId(null);
      return;
    }

    setStoreId((data as any).id); // This is where storeId is set
    setStoreName((data as any).display_name || (data as any).name);
    setStoreLogoUrl((data as any).image_url || null);
    setMonitorSettings({
      slideshowDelay: data.monitor_slideshow_delay || 5000,
      idleTimeoutSeconds: data.monitor_idle_timeout_seconds || 30,
      fullscreenSlideshow: data.monitor_fullscreen_slideshow || false,
    });
  };

  const loadBanners = async () => {
    if (!storeId) {
      console.log("Monitor: loadBanners skipped, storeId is null.");
      return;
    }

    const { data, error } = await supabase
      .from("banners")
      .select("id, url, order")
      .eq("store_id", storeId)
      .order("order", { ascending: true });

    if (error) {
      console.error("Monitor: Erro ao carregar banners:", error.message);
      toast({
        variant: "destructive",
        title: "Erro ao carregar banners",
        description: error.message,
      });
    } else {
      console.log("Monitor: Banners carregados:", data);
      setBanners(data || []);
    }
  };

  const loadMonitorSettings = async () => {
    if (!storeId) return;

    const { data, error } = await supabase
      .from("stores")
      .select("monitor_slideshow_delay, monitor_idle_timeout_seconds, monitor_fullscreen_slideshow")
      .eq("id", storeId)
      .single();

    if (error) {
      console.error("Erro ao carregar configurações do monitor:", error.message);
    } else if (data) {
      setMonitorSettings({
        slideshowDelay: data.monitor_slideshow_delay || 5000,
        idleTimeoutSeconds: data.monitor_idle_timeout_seconds || 30,
        fullscreenSlideshow: data.monitor_fullscreen_slideshow || false,
      });
    }
  };

  const loadOrders = async () => {
    if (!storeId || activeFlow.length === 0) return;

    const statusesToFetch = activeFlow;

    if (statusesToFetch.length === 0) {
      setOrders([]);
      return;
    }

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
      .eq("store_id", storeId)
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
  };

  const getStatusBadge = (status: Enums<'order_status'>) => {
    const label = STATUS_LABELS[status] || status;
    const colors = STATUS_COLORS[status] || STATUS_COLORS.pending;
    
    return (
      <Badge 
        className={`${colors.bg} ${colors.text} border ${colors.border}`}
        variant="outline"
      >
        {label}
      </Badge>
    );
  };

  const getActiveStatusColumns = () => {
    return activeFlow.map(statusKey => ({
      status_key: statusKey,
      status_label: STATUS_LABELS[statusKey] || statusKey,
    }));
  };

  const activeColumns = getActiveStatusColumns();
  
  const getOrdersByStatus = (statusKey: Enums<'order_status'>) => {
    return orders.filter(o => o.status === statusKey);
  };

  const getStatusIcon = (statusKey: Enums<'order_status'>) => {
    const icons: Record<Enums<'order_status'>, any> = {
      pending: Clock,
      preparing: Package,
      ready: CheckCircle,
      delivered: CheckCircle,
      cancelled: XCircle,
    };
    return icons[statusKey] || Clock;
  };

  if (!storeId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-primary/5 to-primary/10">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <AlertCircle className="h-24 w-24 text-destructive" />
            </div>
            <CardTitle className="text-2xl text-center">Loja Não Encontrada</CardTitle>
            <p className="text-center text-muted-foreground">
              Verifique a URL. O monitor deve ser acessado com o slug da loja (ex: /monitor/minha-loja).
            </p>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Se showSlideshow é true, mostramos tela cheia de slideshow
  if (showSlideshow) {
    return (
      <div 
        className="min-h-screen w-full flex items-center justify-center bg-black"
        onClick={() => {
          setIsIdle(false);
          setLastActivityTime(Date.now());
        }}
      >
        {banners.length > 0 ? (
          <div className="embla w-full h-screen">
            <div className="embla__viewport h-full" ref={emblaRef}>
              <div className="embla__container flex h-full">
                {banners.map((banner) => (
                  <div className="embla__slide flex-none w-full h-full" key={banner.id}>
                    <img 
                      src={banner.url} 
                      alt={`Banner ${banner.order}`} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder.svg";
                        e.currentTarget.style.objectFit = 'contain';
                        e.currentTarget.style.backgroundColor = '#000';
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Card className="w-full max-w-md shadow-xl text-center bg-background">
            <CardHeader>
              <AlertCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <CardTitle className="text-2xl">Nenhum Pedido Ativo</CardTitle>
              <p className="text-muted-foreground">
                Aguardando novos pedidos.
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Adicione banners na página de Marketing para exibir promoções aqui.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Barra Superior Fixa */}
      <div className="sticky top-0 bg-background z-10 p-6 -mx-6 -mt-6 border-b shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {storeLogoUrl && (
              <img src={storeLogoUrl} alt={`${storeName} logo`} className="h-12 object-contain" />
            )}
            <div>
              <h1 className="text-3xl font-bold text-foreground">{storeName}</h1>
              <p className="text-muted-foreground">Monitor de Pedidos</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <RealTimeClock />
            
            {/* Botão de Ativação de Som */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                toggleSound(!isSoundEnabled);
                if (!isSoundEnabled) {
                  notify(); 
                }
              }}
              className={cn("flex items-center gap-2", isSoundEnabled ? "text-success border-success" : "text-muted-foreground")}
            >
              {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {isSoundEnabled ? "Som Ativo" : "Ativar Som"}
            </Button>
          </div>
        </div>
      </div>

      {/* Conteúdo Roolável (Colunas de Pedidos) */}
      <div className="flex-1 overflow-y-auto pt-6">
        {/* Show orders */}
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
                  {columnOrders.length > 0 ? columnOrders.map((order) => {
                    const isNew = newOrderIds.includes(order.id);
                    const customerName = order.customers?.name || order.customer_name || 'Cliente Anônimo';
                    const pickupTime = order.pickup_time;
                    const isReservationOrder = !!order.reservation_date;
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
                        </CardContent>
                      </Card>
                    );
                  }) : (
                    <div className="text-center text-muted-foreground py-8">Nenhum pedido neste status.</div>
                  )}
                </div>
              );
            })}
          </div>
      </div>
    </div>
  );
}