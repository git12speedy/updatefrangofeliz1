import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DollarSign, Package, ShoppingCart, XCircle, Store, Users, Calendar as CalendarIcon, List, History, Download, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase as sb } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { format, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const supabase: any = sb;

interface SalesSummary {
  productsSold: { name: string; quantity: number; }[];
  paymentMethodTotals: { method: string; total: number; }[];
  totalSales: number;
  initialAmount: number;
  loyaltyOrdersCount: number;
  finalAmount?: number; // Adicionado para o histórico de caixas
  openedAt: string;
  closedAt?: string;
  ordersBySource: { source: string; count: number; }[]; // NOVO: Contagem de pedidos por canal
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  payment_method: string;
  delivery: boolean;
  customer_id?: string;
  customers?: {
    name: string;
    phone: string;
  };
  order_items: Array<{
    product_name: string;
    quantity: number;
    variation_name?: string;
    product_price: number;
    subtotal: number;
  }>;
}

interface CashRegisterEntry {
  id: string;
  opened_at: string;
  closed_at: string | null;
  initial_amount: number;
  final_amount: number | null;
}

interface ReservationOrder {
  id: string;
  order_number: string;
  customer_name?: string;
  created_at: string;
  pickup_time?: string;
  customers?: {
    name: string;
  };
}

export default function Dashboard() {
  const [initialAmount, setInitialAmount] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showCloseSummaryDialog, setShowCloseSummaryDialog] = useState(false);
  const [cashRegister, setCashRegister] = useState<any>(null);
  const [stats, setStats] = useState({
    todaySales: 0,
    todayOrders: 0,
    pendingOrders: 0,
  });
  const [adminStats, setAdminStats] = useState({
    totalStores: 0,
    totalUsers: 0,
  });
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const { profile, user, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // New states for reservation selection
  const [showReservationSelectionDialog, setShowReservationSelectionDialog] = useState(false);
  const [availableReservations, setAvailableReservations] = useState<ReservationOrder[]>([]);
  const [selectedReservationIds, setSelectedReservationIds] = useState<string[]>([]);
  const [newCashRegisterId, setNewCashRegisterId] = useState<string | null>(null);

  // New states for "Todos os Pedidos"
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [ordersDateRange, setOrdersDateRange] = useState<DateRange | undefined>({
    from: undefined,
    to: undefined,
  });

  // New states for "Histórico de Caixas"
  const [cashRegisterHistory, setCashRegisterHistory] = useState<CashRegisterEntry[]>([]);
  const [showCashRegisterDetailsDialog, setShowCashRegisterDetailsDialog] = useState(false);
  const [selectedCashRegisterSummary, setSelectedCashRegisterSummary] = useState<SalesSummary | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadAdminStats();
    } else if (profile?.store_id) {
      loadCashRegister();
      loadStats();
      loadAllOrders();
      loadCashRegisterHistory();
    }
  }, [profile, isAdmin]);

  useEffect(() => {
    if (profile?.store_id) {
      loadAllOrders(); // Reload orders when date range changes
    }
  }, [ordersDateRange, profile?.store_id]);

  const loadAdminStats = async () => {
    // Load total stores
    const { count: storesCount, error: storesError } = await supabase
      .from("stores")
      .select("*", { count: "exact", head: true });

    if (storesError) {
      console.error("Erro ao carregar lojas:", storesError.message);
      toast({
        variant: "destructive",
        title: "Erro ao carregar lojas",
        description: storesError.message,
      });
    }

    // Load total users (profiles)
    const { count: usersCount, error: usersError } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    if (usersError) {
      console.error("Erro ao carregar usuários:", usersError.message);
      toast({
        variant: "destructive",
        title: "Erro ao carregar usuários",
        description: usersError.message,
      });
    }

    setAdminStats({
      totalStores: storesCount || 0,
      totalUsers: usersCount || 0,
    });
  };

  const loadCashRegister = async () => {
    const { data } = await supabase
      .from("cash_register")
      .select("*")
      .eq("store_id", profile.store_id)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setCashRegister(data);
  };

  const loadStats = async () => {
    const today = new Date().toISOString().split("T")[0];
    
    const { data: orders } = await supabase
      .from("orders")
      .select("total, status")
      .eq("store_id", profile.store_id)
      .gte("created_at", today);

    if (orders) {
      setStats({
        todaySales: orders.reduce((sum, o) => sum + parseFloat(o.total.toString()), 0),
        todayOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === "pending" || o.status === "preparing").length,
      });
    }
  };

  const loadAllOrders = async () => {
    if (!profile?.store_id) return;

    let query = supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        total,
        created_at,
        payment_method,
        delivery,
        customers (
          name,
          phone
        ),
        order_items (
          product_name,
          quantity,
          variation_name,
          product_price,
          subtotal
        )
      `)
      .eq("store_id", profile.store_id)
      .order("created_at", { ascending: false });

    if (ordersDateRange?.from) {
      query = query.gte("created_at", format(ordersDateRange.from, "yyyy-MM-dd"));
    }
    if (ordersDateRange?.to) {
      query = query.lte("created_at", format(addDays(ordersDateRange.to, 1), "yyyy-MM-dd"));
    }

    const { data, error } = await query;

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar todos os pedidos",
        description: error.message,
      });
    } else {
      setAllOrders(data || []);
    }
  };

  const loadCashRegisterHistory = async () => {
    if (!profile?.store_id) return;

    const { data, error } = await supabase
      .from("cash_register")
      .select("*")
      .eq("store_id", profile.store_id)
      .order("opened_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar histórico de caixas",
        description: error.message,
      });
    } else {
      setCashRegisterHistory(data || []);
    }
  };

  const handleOpenCashRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data: newCashRegister, error } = await supabase.from("cash_register").insert({
      store_id: profile.store_id,
      opened_by: user?.id,
      initial_amount: parseFloat(initialAmount),
    }).select().single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao abrir caixa",
        description: error.message,
      });
    } else {
      toast({
        title: "Caixa aberto com sucesso!",
      });
      setInitialAmount("");
      setIsDialogOpen(false);
      
      // Store the new cash register ID and load available reservations
      setNewCashRegisterId(newCashRegister.id);
      await loadAvailableReservations();
      setShowReservationSelectionDialog(true);
    }
  };
  
  const loadAvailableReservations = async () => {
    if (!profile?.store_id) return;
    
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        created_at,
        pickup_time,
        customers (
          name
        )
      `)
      .eq("store_id", profile.store_id)
      .is("cash_register_id", null)
      .neq("status", "delivered")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Erro ao carregar reservas disponíveis:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar reservas",
        description: error.message,
      });
    } else {
      setAvailableReservations(data || []);
    }
  };
  
  const handleAssociateReservations = async () => {
    if (!newCashRegisterId || selectedReservationIds.length === 0) {
      setShowReservationSelectionDialog(false);
      loadCashRegister();
      loadCashRegisterHistory();
      return;
    }
    
    const { error: updateOrdersError } = await supabase
      .from("orders")
      .update({ cash_register_id: newCashRegisterId })
      .in("id", selectedReservationIds);
    
    if (updateOrdersError) {
      console.error("Erro ao associar reservas ao caixa:", updateOrdersError.message);
      toast({
        variant: "destructive",
        title: "Erro ao associar reservas",
        description: updateOrdersError.message,
      });
    } else {
      toast({
        title: "Reservas associadas!",
        description: `${selectedReservationIds.length} reserva(s) foram vinculadas ao caixa.`,
      });
    }
    
    setShowReservationSelectionDialog(false);
    setSelectedReservationIds([]);
    setNewCashRegisterId(null);
    loadCashRegister();
    loadCashRegisterHistory();
  };
  
  const toggleReservationSelection = (reservationId: string) => {
    setSelectedReservationIds(prev => 
      prev.includes(reservationId)
        ? prev.filter(id => id !== reservationId)
        : [...prev, reservationId]
    );
  };

  const calculateSalesSummary = async (cashRegisterEntry: CashRegisterEntry) => {
    // Buscar todos os pedidos associados a este caixa
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, payment_method, total, status, source, order_items (product_name, quantity, variation_name, product_price, subtotal)")
      .eq("cash_register_id", cashRegisterEntry.id);

    if (ordersError) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar pedidos do caixa",
        description: ordersError.message,
      });
      return null;
    }

    const paymentMethodTotals: { [key: string]: number } = {
      dinheiro: 0,
      pix: 0,
      "crédito": 0,
      "débito": 0,
    };
    
    const ordersBySourceMap = new Map<string, number>(); // NOVO: Mapa para contagem por source
    let loyaltyOrdersCount = 0;
    let totalSales = 0;
    const methods = ["dinheiro", "pix", "crédito", "débito"];

    const productsSoldMap = new Map<string, number>();

    orders?.forEach((order: any) => {
      if (order.status === 'cancelled') {
        return; 
      }

      // 1. Contagem por Source
      const sourceKey = order.source || 'presencial';
      ordersBySourceMap.set(sourceKey, (ordersBySourceMap.get(sourceKey) || 0) + 1);

      // 2. Cálculo de Vendas e Pagamentos
      const orderTotalMonetary = parseFloat(order.total.toString());
      totalSales += orderTotalMonetary;

      const paymentMethodLower = order.payment_method ? order.payment_method.toLowerCase() : '';
      if (paymentMethodLower.includes('fidelidade')) {
        loyaltyOrdersCount++;
      }

      if (orderTotalMonetary > 0) {
        const primaryMonetaryMethod = methods.find(m => paymentMethodLower.includes(m));
        if (primaryMonetaryMethod) {
          paymentMethodTotals[primaryMonetaryMethod] += orderTotalMonetary;
        }
      }

      // 3. Produtos Vendidos
      order.order_items?.forEach((item: any) => {
        const itemName = item.variation_name ? `${item.product_name} (${item.variation_name})` : item.product_name;
        productsSoldMap.set(itemName, (productsSoldMap.get(itemName) || 0) + item.quantity);
      });
    });

    const productsSold = Array.from(productsSoldMap.entries()).map(([name, quantity]) => ({ name, quantity }));

    const methodDisplayNames: Record<string, string> = {
      dinheiro: "Dinheiro",
      pix: "PIX",
      "crédito": "Crédito",
      "débito": "Débito",
    };

    const monetaryTotalsForDisplay = methods
      .map(methodKey => ({ 
        method: methodDisplayNames[methodKey],
        total: paymentMethodTotals[methodKey] || 0,
      }))
      .filter(pm => pm.total > 0);

    // Mapeamento corrigido para garantir a diferenciação
    const sourceDisplayNames: Record<string, string> = {
      totem: "Totem",
      whatsapp: "WhatsApp",
      loja_online: "Loja Online", // Garantindo que este nome seja usado
      presencial: "Presencial",
      ifood: "Ifood",
    };

    const ordersBySource = Array.from(ordersBySourceMap.entries()).map(([sourceKey, count]) => ({
      source: sourceDisplayNames[sourceKey] || sourceKey,
      count,
    }));

    return {
      productsSold,
      paymentMethodTotals: monetaryTotalsForDisplay,
      totalSales,
      initialAmount: cashRegisterEntry.initial_amount,
      loyaltyOrdersCount,
      openedAt: cashRegisterEntry.opened_at,
      closedAt: cashRegisterEntry.closed_at || undefined,
      finalAmount: cashRegisterEntry.final_amount || undefined,
      ordersBySource, // NOVO
    };
  };

  const handlePrepareCloseCashRegister = async () => {
    if (!cashRegister) return;
    const summary = await calculateSalesSummary(cashRegister);
    if (summary) {
      setSalesSummary(summary);
      setShowCloseSummaryDialog(true);
    }
  };

  const handleConfirmCloseCashRegister = async () => {
    if (!cashRegister || !salesSummary) return;

    const cashRegisterId = cashRegister.id;

    try {
      // 1. Close the cash register
      const { error: closeRegisterError } = await supabase
        .from("cash_register")
        .update({
          closed_at: new Date().toISOString(),
          final_amount: salesSummary.totalSales,
        })
        .eq("id", cashRegisterId);

      if (closeRegisterError) throw closeRegisterError;

      // 2. Fetch all orders associated with this cash register that are NOT cancelled
      const { data: associatedOrders, error: fetchOrdersError } = await supabase
        .from("orders")
        .select("id")
        .eq("cash_register_id", cashRegisterId)
        .neq("status", "cancelled");

      if (fetchOrdersError) throw fetchOrdersError;

      // 3. Update the status of these orders to 'delivered'
      if (associatedOrders && associatedOrders.length > 0) {
        const orderIdsToUpdate = associatedOrders.map((order: any) => order.id);
        const { error: updateOrdersStatusError } = await supabase
          .from("orders")
          .update({ status: "delivered" })
          .in("id", orderIdsToUpdate);

        if (updateOrdersStatusError) throw updateOrdersStatusError;
      }

      toast({
        title: "Caixa fechado com sucesso!",
        description: "Todos os pedidos associados foram marcados como entregues.",
      });
      setShowCloseSummaryDialog(false);
      loadCashRegister();
      loadStats();
      loadAllOrders(); // Reload orders to reflect status changes
      loadCashRegisterHistory(); // Reload history to show closed cash register
    } catch (error: any) {
      console.error("Erro ao fechar caixa:", error);
      toast({
        variant: "destructive",
        title: "Erro ao fechar caixa",
        description: error.message || "Ocorreu um erro ao fechar o caixa.",
      });
    }
  };

  const handleViewCashRegisterDetails = async (entry: CashRegisterEntry) => {
    const summary = await calculateSalesSummary(entry);
    if (summary) {
      setSelectedCashRegisterSummary(summary);
      setShowCashRegisterDetailsDialog(true);
    }
  };

  const handleExportCashRegisterSummary = (summary: SalesSummary) => {
    const csvRows = [];
    csvRows.push("Tipo,Nome,Quantidade/Valor"); // Header

    csvRows.push("Resumo do Caixa");
    csvRows.push(`Data de Abertura,${format(parseISO(summary.openedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}`);
    if (summary.closedAt) {
      csvRows.push(`Data de Fechamento,${format(parseISO(summary.closedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}`);
    }
    csvRows.push(`Valor Inicial,R$ ${summary.initialAmount.toFixed(2)}`);
    csvRows.push(`Total,R$ ${summary.totalSales.toFixed(2)}`);
    if (summary.finalAmount !== undefined) {
      csvRows.push(`Valor Final Estimado,R$ ${(summary.initialAmount + summary.totalSales).toFixed(2)}`);
    }
    csvRows.push(`Pedidos com Resgate de Pontos,${summary.loyaltyOrdersCount}`);
    csvRows.push("");

    csvRows.push("Pedidos por Canal");
    summary.ordersBySource.forEach(os => {
      csvRows.push(`${os.source},${os.count}`);
    });
    csvRows.push("");

    csvRows.push("Vendas por Forma de Pagamento");
    summary.paymentMethodTotals.forEach(pm => {
      csvRows.push(`${pm.method},R$ ${pm.total.toFixed(2)}`);
    });
    csvRows.push("");

    csvRows.push("Produtos Vendidos");
    summary.productsSold.forEach(item => {
      csvRows.push(`${item.name},${item.quantity} unidades`);
    });

    const csvString = csvRows.map(row => {
      if (row.includes(',')) {
        return `"${row.replace(/"/g, '""')}"`; // Escape commas and quotes
      }
      return row;
    }).join("\n");

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `resumo_caixa_${format(parseISO(summary.openedAt), "yyyyMMdd_HHmm")}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Exportação concluída!", description: "Resumo do caixa exportado para CSV." });
    }
  };

  // Group orders by date for display
  const groupedOrders = allOrders.reduce((acc, order) => {
    const date = format(parseISO(order.created_at), "dd/MM/yyyy", { locale: ptBR });
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(order);
    return acc;
  }, {} as Record<string, Order[]>);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Visão geral do sistema" : "Resumo das vendas"}
          </p>
        </div>
        {!isAdmin && (
          <div className="flex gap-2">
            {cashRegister ? (
              <>
                <Button onClick={() => navigate("/pdv")}>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Ir para PDV
                </Button>
                <Button variant="destructive" onClick={handlePrepareCloseCashRegister}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Fechar Caixa
                </Button>
              </>
            ) : (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Abrir Caixa
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Abrir Caixa</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleOpenCashRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="initialAmount">Valor Inicial (R$)</Label>
                      <Input
                        id="initialAmount"
                        type="number"
                        step="0.01"
                        value={initialAmount}
                        onChange={(e) => setInitialAmount(e.target.value)}
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full">
                      Abrir Caixa
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </div>

      {isAdmin ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="shadow-soft hover:shadow-glow transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Lojas Cadastradas
              </CardTitle>
              <Store className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {adminStats.totalStores}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft hover:shadow-glow transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Usuários Cadastrados
              </CardTitle>
              <Users className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {adminStats.totalUsers}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-soft hover:shadow-glow transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Vendas Hoje
                </CardTitle>
                <DollarSign className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  R$ {stats.todaySales.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-soft hover:shadow-glow transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pedidos Hoje
                </CardTitle>
                <ShoppingCart className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {stats.todayOrders}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-soft hover:shadow-glow transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pedidos Pendentes
                </CardTitle>
                <Package className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {stats.pendingOrders}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card: Todos os Pedidos */}
            <Card className="shadow-soft">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <List className="h-5 w-5" />
                  Todos os Pedidos
                </CardTitle>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !ordersDateRange?.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {ordersDateRange?.from ? (
                        ordersDateRange.to ? (
                          <>
                            {format(ordersDateRange.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                            {format(ordersDateRange.to, "dd/MM/yyyy", { locale: ptBR })}
                          </>
                        ) : (
                          format(ordersDateRange.from, "dd/MM/yyyy", { locale: ptBR })
                        )
                      ) : (
                        <span>Filtrar por data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={ordersDateRange?.from}
                      selected={ordersDateRange}
                      onSelect={setOrdersDateRange}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  {Object.keys(groupedOrders).length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum pedido encontrado para o período.
                    </p>
                  ) : (
                    Object.keys(groupedOrders).map(date => (
                      <div key={date} className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 border-b pb-2">{date}</h3>
                        <div className="space-y-3">
                          {groupedOrders[date].map(order => (
                            <Card key={order.id} className="p-3 shadow-sm">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">#{order.order_number}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {order.customers?.name || "Cliente Anônimo"}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-primary">R$ {order.total.toFixed(2)}</p>
                                  <p className="text-xs text-muted-foreground">{order.status}</p>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Card: Histórico de Caixas */}
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Histórico de Caixas
                </CardTitle>
                <CardDescription>
                  Visualize o histórico de abertura e fechamento de caixas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  {cashRegisterHistory.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum caixa registrado.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {cashRegisterHistory.map(entry => (
                        <Card key={entry.id} className="p-3 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                Aberto em: {format(parseISO(entry.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </p>
                              {entry.closed_at ? (
                                <p className="text-sm text-muted-foreground">
                                  Fechado em: {format(parseISO(entry.closed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                </p>
                              ) : (
                                <p className="text-sm text-yellow-600">Aberto</p>
                              )}
                            </div>
                            <Button variant="outline" size="sm" onClick={() => handleViewCashRegisterDetails(entry)}>
                              <Info className="h-4 w-4" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Dialog open={showCloseSummaryDialog} onOpenChange={setShowCloseSummaryDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Resumo de Fechamento de Caixa</DialogTitle>
          </DialogHeader>
          {salesSummary ? (
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
              
              {/* NOVO: Pedidos por Canal */}
              <div>
                <h3 className="text-lg font-semibold mb-2">Pedidos por Canal:</h3>
                {salesSummary.ordersBySource.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    {salesSummary.ordersBySource.map((os, index) => (
                      <li key={index}>{os.source}: {os.count}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum pedido registrado neste caixa.</p>
                )}
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Produtos Vendidos:</h3>
                {salesSummary.productsSold.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    {salesSummary.productsSold.map((item, index) => (
                      <li key={index}>{item.name}: {item.quantity} unidades</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum produto vendido neste caixa.</p>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Vendas por Forma de Pagamento:</h3>
                {salesSummary.paymentMethodTotals.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    {salesSummary.paymentMethodTotals.map((pm, index) => (
                      <li key={index}>
                        {pm.method}: R$ {pm.total.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma venda monetária registrada neste caixa.</p>
                )}
              </div>
              
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-2">Pedidos Fidelidade:</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  <li>
                    Pedidos com Resgate de Pontos: <span className="font-medium text-primary">{salesSummary.loyaltyOrdersCount}</span>
                  </li>
                </ul>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between font-medium">
                  <span>Valor Inicial:</span>
                  <span>R$ {salesSummary.initialAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Total:</span>
                  <span>R$ {salesSummary.totalSales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg text-primary">
                  <span>Total Final Estimado:</span>
                  <span>R$ {(salesSummary.initialAmount + salesSummary.totalSales).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground">Carregando resumo...</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseSummaryDialog(false)}>
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmCloseCashRegister}>
              <DollarSign className="h-4 w-4 mr-2" />
              Confirmar Fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Detalhes do Histórico de Caixa */}
      <Dialog open={showCashRegisterDetailsDialog} onOpenChange={setShowCashRegisterDetailsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Caixa</DialogTitle>
          </DialogHeader>
          {selectedCashRegisterSummary ? (
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p className="font-medium">Aberto em:</p>
                <p>{format(parseISO(selectedCashRegisterSummary.openedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                {selectedCashRegisterSummary.closedAt && (
                  <>
                    <p className="font-medium">Fechado em:</p>
                    <p>{format(parseISO(selectedCashRegisterSummary.closedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                  </>
                )}
                <p className="font-medium">Valor Inicial:</p>
                <p>R$ {selectedCashRegisterSummary.initialAmount.toFixed(2)}</p>
                <p className="font-medium">Total de Vendas:</p>
                <p>R$ {selectedCashRegisterSummary.totalSales.toFixed(2)}</p>
                {selectedCashRegisterSummary.finalAmount !== undefined && (
                  <>
                    <p className="font-medium">Valor Final:</p>
                    <p>R$ {selectedCashRegisterSummary.finalAmount.toFixed(2)}</p>
                  </>
                )}
              </div>

              <h3 className="text-lg font-semibold mt-4">Pedidos por Canal:</h3>
              {selectedCashRegisterSummary.ordersBySource.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right">Contagem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCashRegisterSummary.ordersBySource.map((os, index) => (
                      <TableRow key={index}>
                        <TableCell>{os.source}</TableCell>
                        <TableCell className="text-right">{os.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum pedido registrado.</p>
              )}

              <h3 className="text-lg font-semibold mt-4">Vendas por Forma de Pagamento:</h3>
              {selectedCashRegisterSummary.paymentMethodTotals.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCashRegisterSummary.paymentMethodTotals.map((pm, index) => (
                      <TableRow key={index}>
                        <TableCell>{pm.method}</TableCell>
                        <TableCell className="text-right">R$ {pm.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma venda monetária registrada.</p>
              )}

              <h3 className="text-lg font-semibold mt-4">Produtos Vendidos:</h3>
              {selectedCashRegisterSummary.productsSold.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCashRegisterSummary.productsSold.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-right">{item.quantity} unidades</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum produto vendido.</p>
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground">Carregando detalhes...</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCashRegisterDetailsDialog(false)}>
              Fechar
            </Button>
            {selectedCashRegisterSummary && (
              <Button onClick={() => handleExportCashRegisterSummary(selectedCashRegisterSummary)}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for Reservation Selection */}
      <Dialog open={showReservationSelectionDialog} onOpenChange={setShowReservationSelectionDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecionar Reservas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione quais reservas deseja vincular a este caixa:
            </p>
            {availableReservations.length > 0 ? (
              <div className="space-y-2">
                {availableReservations.map((reservation) => {
                  const customerName = reservation.customers?.name || reservation.customer_name || "Cliente não identificado";
                  
                  // Validar e formatar datas com segurança
                  let displayDate = "Data não disponível";
                  let displayTime = "Horário não disponível";
                  
                  try {
                    if (reservation.created_at) {
                      displayDate = format(parseISO(reservation.created_at), "dd/MM/yyyy", { locale: ptBR });
                      displayTime = format(parseISO(reservation.created_at), "HH:mm", { locale: ptBR });
                    }
                    
                    if (reservation.pickup_time) {
                      displayTime = format(parseISO(reservation.pickup_time), "HH:mm", { locale: ptBR });
                    }
                  } catch (error) {
                    console.error("Erro ao formatar data:", error);
                  }
                  
                  return (
                    <div
                      key={reservation.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => toggleReservationSelection(reservation.id)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          id={`reservation-${reservation.id}`}
                          checked={selectedReservationIds.includes(reservation.id)}
                          onCheckedChange={() => toggleReservationSelection(reservation.id)}
                        />
                        <div>
                          <p className="font-medium">{customerName}</p>
                          <p className="text-sm text-muted-foreground">
                            Pedido: {reservation.order_number}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Data: {displayDate} • Horário: {displayTime}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma reserva disponível para vincular.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowReservationSelectionDialog(false);
                setSelectedReservationIds([]);
                setNewCashRegisterId(null);
                loadCashRegister();
                loadCashRegisterHistory();
              }}
            >
              Pular
            </Button>
            <Button onClick={handleAssociateReservations}>
              Confirmar Seleção ({selectedReservationIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}