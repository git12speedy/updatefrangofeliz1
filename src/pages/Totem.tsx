import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Minus, Clock, Calendar as CalendarIcon, AlertCircle, CheckCircle2, CreditCard, Banknote, QrCode, Gift, Star } from "lucide-react"; // Importar Gift e Star
import { supabase as sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, setHours, setMinutes, getDay, startOfDay, isAfter, isBefore, isSameDay } from "date-fns"; // Importar isAfter, isBefore, isSameDay
import { cn } from "@/lib/utils";
import useEmblaCarousel from 'embla-carousel-react'; // Importando Embla
import { ptBR } from "date-fns/locale"; // Importar ptBR
import { useClickSound } from "@/hooks/useClickSound"; // Importando o novo hook
import { useOrderFlow } from "@/hooks/useOrderFlow"; // Importando useOrderFlow

const supabase: any = sb;

interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  image_url?: string;
  earns_loyalty_points: boolean;
  loyalty_points_value: number;
  has_variations: boolean; // Adicionado
  can_be_redeemed_with_points: boolean; // NOVO: Pode ser resgatado com pontos
  redemption_points_cost: number; // NOVO: Custo em pontos
  min_variation_price?: number; // Novo campo
  max_variation_price?: number; // Novo campo
  category_id?: string; // Adicionado
}

interface Category {
  id: string;
  name: string;
}

interface Variation {
  id: string;
  product_id: string;
  name: string;
  price_adjustment: number;
  stock_quantity: number;
}

interface CartItem extends Product {
  quantity: number;
  selectedVariation?: Variation; // Adicionado
  isRedeemedWithPoints: boolean; // NOVO: Indica se este item está sendo pago com pontos
}

type PaymentMethod = "pix" | "credito" | "debito" | "dinheiro";

const paymentMethodIcons = {
  pix: QrCode,
  credito: CreditCard,
  debito: Banknote,
  dinheiro: Banknote,
};

const paymentMethodLabels = {
  pix: "PIX",
  credito: "Crédito",
  debito: "Débito",
  dinheiro: "Dinheiro",
};

// Interfaces para horários de funcionamento (copiadas de Settings.tsx)
interface StoreOperatingHour {
  id: string;
  store_id: string;
  day_of_week: number; // 0 for Sunday, 6 for Saturday
  is_open: boolean;
  open_time: string | null; // HH:mm
  close_time: string | null; // HH:mm
}

interface StoreSpecialDay {
  id: string;
  store_id: string;
  date: string; // YYYY-MM-DD
  is_open: boolean;
  open_time: string | null; // HH:mm
  close_time: string | null; // HH:mm
}

export default function Totem() {
  const { slug } = useParams();
  const [storeId, setStoreId] = useState<string | null>(undefined); // Change initial state to undefined
  const [storeName, setStoreName] = useState("Minha Loja");
  const [storeActive, setStoreActive] = useState(true);
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);
  const [isStoreNotFound, setIsStoreNotFound] = useState(false); // New state
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [allVariations, setAllVariations] = useState<Variation[]>([]); // Todas as variações carregadas
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [isDelivery, setIsDelivery] = useState(false); // Adicionado isDelivery
  const [reservationDate, setReservationDate] = useState<Date | undefined>(undefined); 
  const [pickupTime, setPickupTime] = useState<string>("");
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState("");
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [lastOrderNumber, setLastOrderNumber] = useState("");
  const [showSelectVariationDialog, setShowSelectVariationDialog] = useState(false); // Novo estado
  const [productToSelectVariation, setProductToSelectVariation] = useState<Product | null>(null); // Produto para selecionar variação
  const [selectedVariationForProduct, setSelectedVariationForProduct] = useState<Variation | null>(null); // Variação selecionada no modal
  const [showCustomerNameDialog, setShowCustomerNameDialog] = useState(false); // Novo estado para popup de nome
  const [tempCustomerName, setTempCustomerName] = useState(""); // Nome temporário para o popup
  
  // New states for category filter
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Store operating hours and special days
  const [operatingHours, setOperatingHours] = useState<StoreOperatingHour[]>([]);
  const [specialDays, setSpecialDays] = useState<StoreSpecialDay[]>([]);

  const [emblaRef] = useEmblaCarousel({ dragFree: true, containScroll: 'trimSnaps' });

  const { toast } = useToast();
  const { playClick } = useClickSound(); // Inicializando o hook de som
  const { getInitialStatus } = useOrderFlow(); // Usando o novo hook

  // NOVO: Cálculo do subtotal monetário e total de pontos a serem resgatados
  const monetarySubtotal = cart.reduce((sum, item) => 
    sum + (item.isRedeemedWithPoints ? 0 : (item.price * item.quantity)), 0
  );
  const pointsToRedeem = cart.reduce((sum, item) => 
    sum + (item.isRedeemedWithPoints ? (item.redemption_points_cost * item.quantity) : 0), 0
  );
  const totalMonetary = monetarySubtotal; // Definido aqui para ser acessível a isOrderValid
  // ------------------------------------------------

  // --- Lógica de Busca de Cliente em Tempo Real ---
  useEffect(() => {
    if (storeId && phone.length >= 10) {
      const checkCustomer = async () => {
        const { data: existingCustomer } = await supabase
          .from("customers" as any)
          .select("id, name, phone, points")
          .eq("phone", phone)
          .eq("store_id", storeId)
          .maybeSingle();

        if (existingCustomer) {
          setCustomer(existingCustomer as unknown as Customer);
          setName(existingCustomer.name); // Preenche o nome se o cliente for encontrado
        } else {
          setCustomer(null);
          setName(""); // Limpa o nome se o cliente não for encontrado
        }
      };
      checkCustomer();
    } else if (phone.length < 10) {
      setCustomer(null);
      setName("");
    }
  }, [phone, storeId]);
  // ------------------------------------------------

  useEffect(() => {
    loadStoreInfo();
  }, [slug]);

  useEffect(() => {
    if (storeId) {
      loadOperatingHours();
      loadSpecialDays();
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId && operatingHours.length > 0 && specialDays.length >= 0) {
      const nextOpenDate = findNextOpenDate();
      if (nextOpenDate) {
        setReservationDate(nextOpenDate);
      }
    }
  }, [storeId, operatingHours, specialDays]);

  useEffect(() => {
    if (storeId) {
      loadCategories();
      loadProductsAndVariations();
    }
  }, [storeId, selectedCategoryId]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showSuccessScreen && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (showSuccessScreen && countdown === 0) {
      handleNewOrder();
    }
    return () => clearTimeout(timer);
  }, [showSuccessScreen, countdown]);

  const loadStoreInfo = async () => {
    if (!slug) {
      toast({
        variant: "destructive",
        title: "Loja não especificada",
        description: "Por favor, acesse o totem com a URL correta (ex: /totem/minha-loja).",
      });
      setStoreId(null); // Indicate no store found
      setIsStoreNotFound(true); // Set flag for not found
      return;
    }

    let query = supabase.from("stores" as any).select("id, name, display_name, is_active, image_url");
    query = query.eq("slug", slug);
    
    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      toast({
        variant: "destructive",
        title: "Loja não encontrada",
        description: slug ? "Esta URL de loja não existe" : "Nenhuma loja disponível",
      });
      setStoreId(null); // Indicate no store found
      setIsStoreNotFound(true); // Set flag for not found
      return;
    }

    setStoreId((data as any).id);
    setStoreName((data as any).display_name || (data as any).name);
    setStoreActive((data as any).is_active ?? true);
    setStoreLogoUrl((data as any).image_url || null);
    setIsStoreNotFound(false); // Reset flag if store is found
  };

  const loadCategories = async () => {
    if (!storeId) return;
    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .eq("store_id", storeId)
      .order("name");

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar categorias",
        description: error.message,
      });
    } else {
      setCategories(data || []);
    }
  };

  const loadProductsAndVariations = async () => {
    if (!storeId) return;

    let productsQuery = supabase
      .from("products" as any)
      .select("id, name, price, stock_quantity, image_url, earns_loyalty_points, loyalty_points_value, has_variations, can_be_redeemed_with_points, redemption_points_cost, category_id") // NOVO: Selecionar novas colunas
      .eq("store_id", storeId)
      .eq("active", true)
      .order("name");

    if (selectedCategoryId) {
      productsQuery = productsQuery.eq("category_id", selectedCategoryId);
    } else if (selectedCategoryId === null) {
      // If 'All' is selected, no category filter is applied
    }

    const { data: productsData, error: productsError } = await productsQuery;

    if (productsError) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar produtos",
        description: productsError.message,
      });
      return;
    }

    const productIdsWithVariations = (productsData || []).filter((p: Product) => p.has_variations).map((p: Product) => p.id);
    let variationsData: Variation[] = [];

    if (productIdsWithVariations.length > 0) {
      const { data: fetchedVariations, error: variationsError } = await supabase
        .from("product_variations")
        .select("*")
        .in("product_id", productIdsWithVariations)
        .order("name");

      if (variationsError) {
        toast({
          variant: "destructive",
          title: "Erro ao carregar variações",
          description: variationsError.message,
      });
        return;
      }
      variationsData = fetchedVariations || [];
    }
    setAllVariations(variationsData);

    const variationsByProductId = new Map<string, Variation[]>();
    variationsData.forEach(v => {
      const existing = variationsByProductId.get(v.product_id) || [];
      existing.push(v);
      variationsByProductId.set(v.product_id, existing);
    });

    const productsWithCalculatedPrices = (productsData || []).map((product: Product) => {
      if (product.has_variations) {
        const productVariations = variationsByProductId.get(product.id) || [];
        if (productVariations.length > 0) {
          const finalPrices = productVariations.map(v => product.price + v.price_adjustment);
          product.min_variation_price = Math.min(...finalPrices);
          product.max_variation_price = Math.max(...finalPrices);
        } else {
          product.min_variation_price = 0;
          product.max_variation_price = 0;
        }
      }
      return product;
    });

    setProducts(productsWithCalculatedPrices as unknown as Product[]);
  };

  const loadOperatingHours = async () => {
    if (!storeId) return;
    const { data, error } = await supabase
      .from("store_operating_hours")
      .select("*")
      .eq("store_id", storeId)
      .order("day_of_week");
    if (error) {
      console.error("Erro ao carregar horários de funcionamento:", error.message);
    } else {
      setOperatingHours(data || []);
    }
  };

  const loadSpecialDays = async () => {
    if (!storeId) return;
    const { data, error } = await supabase
      .from("store_special_days")
      .select("*")
      .eq("store_id", storeId)
      .order("date");
    if (error) {
      console.error("Erro ao carregar dias especiais:", error.message);
    } else {
      setSpecialDays(data || []);
    }
  };

  // Check if store is open on a specific date (without time)
  const isDateAvailableForReservation = (date: Date) => {
    if (!storeId) return false;

    const formattedDate = format(date, "yyyy-MM-dd");
    const dayOfWeek = getDay(date); // 0 for Sunday, 6 for Saturday

    // Check for special day override first
    const specialDay = specialDays.find(sd => sd.date === formattedDate);

    if (specialDay) {
      return specialDay.is_open; // Use special day setting
    }

    // If no special day, check regular operating hours
    const regularHours = operatingHours.find(oh => oh.day_of_week === dayOfWeek);

    return regularHours?.is_open ?? false;
  };

  // Function to find the next open date
  const findNextOpenDate = () => {
    let date = startOfDay(new Date());
    // Check today first
    if (isDateAvailableForReservation(date)) {
      return date;
    }
    // Check up to 30 days ahead
    for (let i = 1; i <= 30; i++) {
      const nextDate = addDays(date, i);
      if (isDateAvailableForReservation(nextDate)) {
        return nextDate;
      }
    }
    return undefined; // Fallback if no open date found in 30 days
  };

  const isStoreOpen = (date: Date, time: string | null) => {
    if (!storeId) return false;

    const formattedDate = format(date, "yyyy-MM-dd");
    const dayOfWeek = getDay(date); // 0 for Sunday, 6 for Saturday

    // Check for special day override first
    const specialDay = specialDays.find(sd => sd.date === formattedDate);

    const checkTimeRange = (openTime: string, closeTime: string) => {
      if (!time) {
        // If time is null, check if current time is within range (for immediate orders)
        if (!isSameDay(date, new Date())) return false; // Only check current time if date is today
        
        const now = new Date();
        const openDateTime = setMinutes(setHours(date, parseInt(openTime.split(':')[0])), parseInt(openTime.split(':')[1]));
        const closeDateTime = setMinutes(setHours(date, parseInt(closeTime.split(':')[0])), parseInt(closeTime.split(':')[1]));
        
        return isAfter(now, openDateTime) && isBefore(now, closeDateTime);
      } else {
        // If time is provided, check if the selected time is within range
        const pickupDateTime = setMinutes(setHours(date, parseInt(time.split(':')[0])), parseInt(time.split(':')[1]));
        const openDateTime = setMinutes(setHours(date, parseInt(openTime.split(':')[0])), parseInt(openTime.split(':')[1]));
        const closeDateTime = setMinutes(setHours(date, parseInt(closeTime.split(':')[0])), parseInt(closeTime.split(':')[1]));
        
        return isAfter(pickupDateTime, openDateTime) && isBefore(pickupDateTime, closeDateTime);
      }
    };

    if (specialDay) {
      if (!specialDay.is_open || !specialDay.open_time || !specialDay.close_time) return false;
      return checkTimeRange(specialDay.open_time, specialDay.close_time);
    }

    // If no special day, check regular operating hours
    const regularHours = operatingHours.find(oh => oh.day_of_week === dayOfWeek);

    if (!regularHours || !regularHours.is_open || !regularHours.open_time || !regularHours.close_time) return false;

    return checkTimeRange(regularHours.open_time, regularHours.close_time);
  };

  const addToCart = (product: Product) => {
    if (product.has_variations) {
      setProductToSelectVariation(product);
      setShowSelectVariationDialog(true);
    } else {
      addProductToCart(product);
    }
  };

  const addProductToCart = (product: Product, variation?: Variation) => {
    playClick(); // Toca o som de clique
    
    const itemPrice = variation ? product.price + variation.price_adjustment : product.price;
    const itemStock = variation ? variation.stock_quantity : product.stock_quantity;
    
    const existingItem = cart.find(item => 
      item.id === product.id && item.selectedVariation?.id === variation?.id
    );
    
    if (existingItem) {
      if (existingItem.quantity >= itemStock) {
        toast({
          variant: "destructive",
          title: "Estoque insuficiente",
          description: `Apenas ${itemStock} unidades disponíveis para ${product.name} ${variation?.name ? `(${variation.name})` : ''}.`,
        });
        return;
      }
      setCart(cart.map((item) =>
        item.id === product.id && item.selectedVariation?.id === variation?.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      if (1 > itemStock) { // Check if initial quantity (1) exceeds stock
        toast({
          variant: "destructive",
          title: "Estoque insuficiente",
          description: `Apenas ${itemStock} unidades disponíveis para ${product.name} ${variation?.name ? `(${variation.name})` : ''}.`,
        });
        return;
      }
      setCart([...cart, { 
        ...product, 
        id: product.id, // Keep original product ID
        quantity: 1, 
        price: itemPrice, // Use adjusted price
        stock_quantity: itemStock, // Use variation stock
        selectedVariation: variation,
        isRedeemedWithPoints: false, // NOVO: Inicialmente não resgatado
      }]);
    }
    toast({
      title: "Produto adicionado!",
      description: `${product.name} ${variation ? `(${variation.name})` : ''} adicionado ao carrinho.`,
    });
  };

  const handleSelectVariationAndAddToCart = () => {
    if (!productToSelectVariation || !selectedVariationForProduct) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Selecione uma variação válida.",
      });
      return;
    }
    addProductToCart(productToSelectVariation, selectedVariationForProduct);
    setShowSelectVariationDialog(false);
    setProductToSelectVariation(null);
    setSelectedVariationForProduct(null);
  };

  const updateQuantity = (productId: string, variationId: string | undefined, quantity: number) => {
    const itemInCart = cart.find(item => 
      item.id === productId && item.selectedVariation?.id === variationId
    );

    if (!itemInCart) return;

    const currentStock = itemInCart.selectedVariation 
      ? itemInCart.selectedVariation.stock_quantity 
      : itemInCart.stock_quantity;

    if (quantity > currentStock) {
      toast({
        variant: "destructive",
        title: "Estoque insuficiente",
        description: `Apenas ${currentStock} unidades disponíveis para ${itemInCart.name} ${itemInCart.selectedVariation?.name ? `(${itemInCart.selectedVariation.name})` : ''}.`,
      });
      return;
    }

    if (quantity === 0) {
      setCart(cart.filter(item => !(item.id === productId && item.selectedVariation?.id === variationId)));
    } else {
      setCart(cart.map(item =>
        item.id === productId && item.selectedVariation?.id === variationId
          ? { ...item, quantity }
          : item
      ));
    }
  };

  // NOVO: Função para alternar o status de resgate de um item
  const toggleRedeemItem = (productId: string, variationId: string | undefined, isRedeemed: boolean) => {
    if (!customer) {
      toast({
        variant: "destructive",
        title: "Cliente não identificado",
        description: "Faça login para usar pontos de fidelidade.",
      });
      return;
    }

    setCart(prevCart => {
      const updatedCart = prevCart.map(item => {
        if (item.id === productId && item.selectedVariation?.id === variationId) {
          if (isRedeemed) {
            // Verificar se o cliente tem pontos suficientes para resgatar este item
            const pointsNeeded = item.redemption_points_cost * item.quantity;
            if (customer.points < pointsNeeded) {
              toast({
                variant: "destructive",
                title: "Pontos insuficientes",
                description: `Você precisa de ${pointsNeeded} pontos para resgatar ${item.name} (${item.quantity}x).`,
              });
              return item; // Não altera o item se os pontos forem insuficientes
            }
            return { ...item, isRedeemedWithPoints: true };
          } else {
            return { ...item, isRedeemedWithPoints: false };
          }
        }
        return item;
      });
      return updatedCart;
    });
  };

  const handleNewOrder = () => {
    setCart([]);
    setPaymentMethod(null);
    setReservationDate(findNextOpenDate()); // Reset to next open date
    setPickupTime("");
    setIsDelivery(false);
    setNeedsChange(false);
    setChangeFor("");
    setShowSuccessScreen(false);
    setCountdown(5);
    setLastOrderNumber("");
    loadProductsAndVariations();
  };

  const isOrderValid = () => {
    if (cart.length === 0) return false;
    if (totalMonetary > 0 && !paymentMethod) return false; // Payment method is mandatory if there's a monetary total

    // Data é sempre obrigatória
    if (!reservationDate) return false;
    
    // Se a data for hoje, o horário é opcional (assumimos "agora")
    if (isSameDay(reservationDate, new Date())) {
      // Se for hoje, verifica se a loja está aberta AGORA (se pickupTime for nulo) ou no horário selecionado
      if (!isStoreOpen(reservationDate, pickupTime || null)) return false;
    } else {
      // Se a data for futura, o horário é obrigatório
      if (!pickupTime) return false;
      if (!isStoreOpen(reservationDate, pickupTime)) return false;
    }

    return true;
  };

  // Nova função para abrir o popup de nome e depois finalizar
  const handleFinishOrderClick = () => {
    // Validações iniciais
    const monetarySubtotal = cart.reduce((sum, item) => 
      sum + (item.isRedeemedWithPoints ? 0 : (item.price * item.quantity)), 0
    );
    const totalMonetary = monetarySubtotal;

    if (!isOrderValid()) {
      if (cart.length === 0) {
        toast({ variant: "destructive", title: "Carrinho vazio" });
      } else if (totalMonetary > 0 && !paymentMethod) {
        toast({ variant: "destructive", title: "Selecione forma de pagamento" });
      } else if (!reservationDate) {
        toast({ variant: "destructive", title: "Data obrigatória", description: "Selecione a data de retirada/entrega" });
      } else if (!isStoreOpen(reservationDate, pickupTime || null)) {
        toast({ variant: "destructive", title: "Loja fechada", description: "A loja não está aberta neste dia ou horário." });
      } else if (!isSameDay(reservationDate, new Date()) && !pickupTime) {
        toast({ variant: "destructive", title: "Horário obrigatório", description: "Para pedidos futuros, selecione o horário de retirada." });
      }
      return;
    }

    // Abrir popup de nome
    setShowCustomerNameDialog(true);
  };

  const finishOrder = async () => {
    console.log("--- finishOrder started (Totem) ---");
    console.log("Current storeId:", storeId);
    console.log("Is delivery:", isDelivery);
    console.log("Reservation Date:", reservationDate ? format(reservationDate, "yyyy-MM-dd HH:mm:ss") : "null");
    console.log("Pickup Time:", pickupTime);

    // Move calculations to the top
    const monetarySubtotal = cart.reduce((sum, item) => 
      sum + (item.isRedeemedWithPoints ? 0 : (item.price * item.quantity)), 0
    );
    const pointsToRedeem = cart.reduce((sum, item) => 
      sum + (item.isRedeemedWithPoints ? (item.redemption_points_cost * item.quantity) : 0), 0
    );
    const totalMonetary = monetarySubtotal; // Total a ser pago em dinheiro/cartão/pix

    if (!isOrderValid()) {
      // This toast will be more specific based on the first invalid condition
      if (cart.length === 0) {
        toast({ variant: "destructive", title: "Carrinho vazio" });
      } else if (totalMonetary > 0 && !paymentMethod) {
        toast({ variant: "destructive", title: "Selecione forma de pagamento" });
      } else if (!reservationDate) {
        toast({ variant: "destructive", title: "Data obrigatória", description: "Selecione a data de retirada/entrega" });
      } else if (!isStoreOpen(reservationDate, pickupTime || null)) {
        toast({ variant: "destructive", title: "Loja fechada", description: "A loja não está aberta neste dia ou horário." });
      } else if (!isSameDay(reservationDate, new Date()) && !pickupTime) {
        toast({ variant: "destructive", title: "Horário obrigatório", description: "Para pedidos futuros, selecione o horário de retirada." });
      }
      return;
    }

    if (!storeId) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Loja não disponível",
      });
      return;
    }

    if (!storeActive) {
      toast({
        variant: "destructive",
        title: "Loja fechada",
        description: "A loja não está aceitando pedidos no momento",
      });
      return;
    }

    // --- Lógica de Verificação/Criação de Cliente (OPCIONAL) ---
    let customerIdForOrder: string | null = null;
    let currentCustomer: Customer | null = customer; // Use the customer state if already loaded by useEffect

    if (phone && phone.length >= 10) {
      if (!currentCustomer) { // If customer not found by useEffect, try to find/create now
        const { data: existingCustomer } = await supabase
          .from("customers" as any)
          .select("id, name, phone, points")
          .eq("phone", phone)
          .eq("store_id", storeId)
          .maybeSingle();

        if (existingCustomer) {
          currentCustomer = existingCustomer as unknown as Customer;
        } else if (name) { // Only create if name is provided
          const { data: newCustomer, error: newCustomerError } = await supabase
            .from("customers" as any)
            .insert({ phone, name, points: 0, store_id: storeId })
            .select()
            .single();

          if (newCustomerError) {
            toast({ variant: "destructive", title: "Erro ao cadastrar cliente", description: newCustomerError.message });
            return; // Block order if customer creation fails
          }
          currentCustomer = newCustomer as unknown as Customer;
          setCustomer(currentCustomer); // Update state
        } else {
          // If phone is provided but no existing customer and no name, proceed without customer_id
          // This means the user chose not to provide a name for a new customer.
          // The order will be created without a customer_id.
          toast({ title: "Aviso", description: "Pedido será registrado sem nome de cliente para pontos de fidelidade." });
        }
      }
      customerIdForOrder = currentCustomer?.id || null;
    }
    // If phone is not provided, customerIdForOrder remains null.
    // --- Fim da Lógica de Cliente ---

    const orderNumber = `PED-${Date.now().toString().slice(-6)}`;

    // Construir a string final do método de pagamento
    const paymentMethodsArray: string[] = [];
    if (pointsToRedeem > 0) {
      paymentMethodsArray.push("Fidelidade");
    }
    if (totalMonetary > 0 && paymentMethod) {
      paymentMethodsArray.push(paymentMethodLabels[paymentMethod]);
    }
    let finalPaymentMethod = paymentMethodsArray.join(' + '); // Declared with let

    let cashRegisterIdForOrder = null;
    // An order requires an open cash register if it's for delivery OR if it's a pickup/reservation for today.
    const requiresOpenCashRegister = isDelivery || (reservationDate && isSameDay(reservationDate, new Date()));
    console.log("Requires open cash register:", requiresOpenCashRegister);

    if (requiresOpenCashRegister) { 
      console.log("Attempting to find open cash register for storeId:", storeId);
      const { data: openCashRegister, error: cashRegisterError } = await supabase
        .from("cash_register" as any)
        .select("id")
        .eq("store_id", storeId)
        .is("closed_at", null)
        .maybeSingle();

      if (cashRegisterError) {
        console.error("Error fetching open cash register:", cashRegisterError);
        toast({
          variant: "destructive",
          title: "Erro ao verificar caixa",
          description: cashRegisterError.message,
        });
        return;
      }

      if (openCashRegister) {
        cashRegisterIdForOrder = openCashRegister.id;
        console.log("Found open cash register:", cashRegisterIdForOrder);
      } else {
        console.log("No open cash register found for storeId:", storeId);
        toast({
          variant: "destructive",
          title: "Caixa fechado",
          description: "Não é possível fazer pedidos imediatos com o caixa fechado.",
        });
        return;
      }
    }
    console.log("Final cashRegisterIdForOrder:", cashRegisterIdForOrder);
    // If requiresOpenCashRegister is false (i.e., it's a future reservation/pickup), cashRegisterIdForOrder remains null.
    // This is the desired behavior for future reservations.

    // Se a data for hoje e o horário estiver vazio, salvamos como null para indicar "agora"
    const finalPickupTime = isSameDay(reservationDate, new Date()) && !pickupTime ? null : pickupTime;

    // Determinar o status inicial dinamicamente
    const initialStatus = getInitialStatus();

    const { data: order, error } = await supabase
      .from("orders" as any)
      .insert({
        store_id: storeId,
        order_number: orderNumber,
        customer_id: customerIdForOrder, // Usar o customerIdForOrder (pode ser null)
        customer_name: name || null, // Salvar o nome digitado mesmo sem customer_id
        source: "totem",
        total: totalMonetary, // Usar o total monetário
        payment_method: finalPaymentMethod, // Usar a string combinada
        reservation_date: reservationDate ? format(reservationDate, "yyyy-MM-dd") : null,
        pickup_time: finalPickupTime, // Usar o horário final (pode ser null)
        delivery: isDelivery,
        delivery_address: null, // Totem doesn't handle delivery address directly in this flow
        delivery_number: null,
        delivery_reference: null,
        delivery_cep: null,
        change_for: paymentMethod === "dinheiro" && needsChange ? parseFloat(changeFor) : null,
        cash_register_id: cashRegisterIdForOrder, // Assign cash register ID here
        status: initialStatus, // Usar o status inicial dinâmico
      })
      .select()
      .single();

    if (error || !order) {
      toast({
        variant: "destructive",
        title: "Erro ao criar pedido",
        description: error?.message,
      });
      return;
    }

    const orderItems = cart.map((item) => ({
      order_id: (order as any).id,
      product_id: item.id,
      product_name: item.name,
      product_price: item.isRedeemedWithPoints ? 0 : item.price, // Preço 0 se resgatado
      quantity: item.quantity,
      subtotal: item.isRedeemedWithPoints ? 0 : (item.price * item.quantity), // Subtotal 0 se resgatado
      product_variation_id: item.selectedVariation?.id || null, // Salvar ID da variação
      variation_name: item.selectedVariation?.name || null, // Salvar nome da variação
    }));

    await supabase.from("order_items" as any).insert(orderItems);

    const stockUpdatePromises = cart.map(async (item) => {
      if (item.selectedVariation) {
        // Update variation stock
        const { error: stockError } = await supabase
          .from("product_variations")
          .update({ stock_quantity: item.selectedVariation.stock_quantity - item.quantity })
          .eq("id", item.selectedVariation.id);

        if (stockError) {
          console.error(`Erro ao atualizar estoque da variação ${item.selectedVariation.name}:`, stockError.message);
        }
      } else {
        // Update base product stock
        const { error: stockError } = await supabase
          .from("products")
          .update({ stock_quantity: item.stock_quantity - item.quantity })
          .eq("id", item.id);

        if (stockError) {
          console.error(`Erro ao atualizar estoque do produto ${item.name}:`, stockError.message);
        }
      }
    });

    await Promise.all(stockUpdatePromises);

    // NOVO: Lógica para deduzir pontos dos itens resgatados
    if (pointsToRedeem > 0 && currentCustomer && 'id' in currentCustomer) {
      await supabase
        .from("customers" as any)
        .update({ points: currentCustomer.points - pointsToRedeem })
        .eq("id", currentCustomer.id);

      await supabase
        .from("loyalty_transactions" as any)
        .insert({
          customer_id: currentCustomer.id,
          order_id: (order as any).id,
          points: -pointsToRedeem, // Pontos negativos para resgate
          transaction_type: "redeem",
          store_id: storeId,
          description: `Resgate de ${pointsToRedeem} pontos no pedido ${orderNumber}`,
        });
    }
    // Removida a lógica de atribuição de pontos (earn) daqui. Será feita no OrderPanel.

    toast({
      title: "Pedido finalizado!",
      description: `Pedido ${orderNumber} criado com sucesso`,
    });

    setLastOrderNumber(orderNumber);
    setShowSuccessScreen(true);
  };

  const timeSlots = [];
  for (let hour = 10; hour <= 14; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 10 && minute === 0) continue;
      if (hour === 14 && minute > 0) break;
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      timeSlots.push(time);
    }
  }

  // Group products by category
  const productsByCategory: { [key: string]: Product[] } = {};
  products.forEach(product => {
    const categoryName = categories.find(cat => cat.id === product.category_id)?.name || "Sem Categoria";
    if (!productsByCategory[categoryName]) {
      productsByCategory[categoryName] = [];
    }
    productsByCategory[categoryName].push(product);
  });

  const sortedCategoryNames = Object.keys(productsByCategory).sort((a, b) => {
    if (a === "Sem Categoria") return 1;
    if (b === "Sem Categoria") return -1;
    return a.localeCompare(b);
  });

  if (storeId === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground">Carregando totem...</p>
      </div>
    );
  }

  if (isStoreNotFound) { // Store not found or slug missing
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-primary/5 to-primary/10">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <AlertCircle className="h-24 w-24 text-destructive" />
            </div>
            <CardTitle className="text-2xl text-center">Loja Não Encontrada</CardTitle>
            <p className="text-center text-muted-foreground">
              Verifique a URL. O monitor deve ser acessado com a URL da loja (ex: /monitor/minha-loja).
            </p>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!storeActive) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-primary/5 to-primary/10">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            {storeLogoUrl && (
              <div className="flex justify-center mb-4">
                <img src={storeLogoUrl} alt={`${storeName} logo`} className="h-24 object-contain" />
              </div>
            )}
            <CardTitle className="text-2xl text-center flex items-center justify-center gap-2">
              <AlertCircle className="h-6 w-6" />
              {storeName}
            </CardTitle>
            <p className="text-center text-muted-foreground">
              Desculpe, estamos fechados no momento. Volte mais tarde!
            </p>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (showSuccessScreen) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-success/5 to-success/10 text-center animate-fade-in">
        <div className="p-6"> {/* Conteúdo da tela de sucesso com padding */}
          <CheckCircle2 className="h-32 w-32 text-success mb-8 animate-bounce mx-auto" />
          <h1 className="text-5xl font-bold text-foreground mb-4">Pedido Concluído!</h1>
          <p className="text-2xl text-muted-foreground mb-8">
            Seu pedido <span className="font-bold text-primary">#{lastOrderNumber}</span> foi enviado. Só aguardar!
          </p>
          <Button onClick={handleNewOrder} className="w-full max-w-xs text-lg py-6 shadow-soft">
            Fazer Novo Pedido ({countdown}s)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10">
      <div className="max-w-6xl mx-auto p-6">
        <Card className="shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                {storeLogoUrl && (
                  <div className="flex justify-start mb-2">
                    <img src={storeLogoUrl} alt={`${storeName} logo`} className="h-16 object-contain" />
                  </div>
                )}
                <CardTitle className="text-2xl">{storeName}</CardTitle>
                <p className="text-muted-foreground">Faça seu pedido</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Nosso Cardápio</h3>
              
              {/* Category Filter Carousel */}
              <div className="embla overflow-hidden" ref={emblaRef}>
                <div className="embla__container flex gap-2 pb-2 flex-nowrap">
                  <Button
                    variant={selectedCategoryId === null ? "default" : "outline"}
                    onClick={() => setSelectedCategoryId(null)}
                    className="embla__slide flex-shrink-0"
                  >
                    Todas
                  </Button>
                  {categories.map((category) => (
                    <Button
                      key={category.id}
                      variant={selectedCategoryId === category.id ? "default" : "outline"}
                      onClick={() => setSelectedCategoryId(category.id)}
                      className="embla__slide flex-shrink-0"
                    >
                      {category.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Product Sections by Category */}
              {sortedCategoryNames.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum produto disponível nesta categoria.
                </p>
              ) : (
                sortedCategoryNames.map(categoryName => (
                  <div key={categoryName} className="space-y-4">
                    <h4 className="text-xl font-bold mt-6 mb-4">{categoryName}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {productsByCategory[categoryName].map((product) => {
                        const isOutOfStock = product.has_variations 
                          ? allVariations.filter(v => v.product_id === product.id).every(v => v.stock_quantity === 0)
                          : product.stock_quantity === 0;
                        return (
                          <Card key={product.id}>
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3">
                                {product.image_url && (
                                  <img
                                    src={product.image_url}
                                    alt={product.name}
                                    className="w-16 h-16 object-cover rounded"
                                  />
                                )}
                                <div className="flex-1">
                                  <p className="font-medium">{product.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {product.has_variations ? "Com variações" : `Estoque: ${product.stock_quantity}`}
                                  </p>
                                  <p className="text-lg font-bold text-primary">
                                    {product.has_variations ? (
                                      product.min_variation_price === product.max_variation_price ? (
                                        `R$ ${product.min_variation_price?.toFixed(2)}`
                                      ) : (
                                        `R$ ${product.min_variation_price?.toFixed(2)} - ${product.max_variation_price?.toFixed(2)}`
                                      )
                                    ) : (
                                      `R$ ${product.price.toFixed(2)}`
                                    )}
                                  </p>
                                </div>
                                <Button onClick={() => addToCart(product)} size="sm" disabled={isOutOfStock}>
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {cart.length > 0 && (
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>Seu Carrinho</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {cart.map((item) => (
                      <div key={`${item.id}-${item.selectedVariation?.id || ''}`} className="flex items-center justify-between gap-2 p-3 bg-accent rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">
                            {item.name} {item.selectedVariation && `(${item.selectedVariation.name})`}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-muted-foreground">
                              {item.isRedeemedWithPoints ? (
                                <span className="text-purple-600">{item.redemption_points_cost.toFixed(0)} pts cada</span>
                              ) : (
                                `R$ ${item.price.toFixed(2)} cada`
                              )}
                            </p>
                            {item.can_be_redeemed_with_points && customer && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 flex items-center gap-1"
                                onClick={() => toggleRedeemItem(item.id, item.selectedVariation?.id, !item.isRedeemedWithPoints)}
                              >
                                <Star className={cn("h-4 w-4", item.isRedeemedWithPoints ? "fill-primary text-primary" : "text-muted-foreground")} />
                                <span className="text-xs">Fidelidade?</span>
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(item.id, item.selectedVariation?.id, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(item.id, item.selectedVariation?.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <div className="space-y-3 pt-4 border-t">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="phone">Número para ganhar pontos (opcional)</Label>
                          <Input
                            id="phone"
                            type="tel"
                            placeholder="(11) 99999-9999"
                            value={phone}
                            onChange={(e) => {
                              setPhone(e.target.value.replace(/\D/g, ''));
                            }}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            // Removido 'required'
                          />
                        </div>

                        {/* Mostrar campo de nome APENAS se o telefone for válido (>= 10) E o cliente NÃO tiver sido encontrado */}
                        {phone.length >= 10 && !customer && (
                          <div className="space-y-2">
                            <Label htmlFor="name">Seu Nome (opcional, para novos clientes)</Label>
                            <Input
                              id="name"
                              placeholder="Seu nome"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              // Removido 'required'
                            />
                          </div>
                        )}
                        {phone.length >= 10 && customer && (
                          <div className="p-3 bg-accent rounded-lg">
                            <p className="font-medium">Olá, {customer.name}!</p>
                            <p className="text-sm text-muted-foreground">Seu número já está cadastrado.</p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label>Forma de Pagamento</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {(["pix", "credito", "debito", "dinheiro"] as PaymentMethod[]).map((method) => { // Removido "fidelidade" daqui
                              const Icon = paymentMethodIcons[method];
                              return (
                                <Button
                                  key={method}
                                  variant={paymentMethod === method ? "default" : "outline"}
                                  onClick={() => setPaymentMethod(method)}
                                  className="flex flex-col items-center justify-center gap-1 h-16 text-lg"
                                >
                                  <Icon className="h-6 w-6" />
                                  {paymentMethodLabels[method]}
                                </Button>
                              );
                            })}
                          </div>
                        </div>

                        {paymentMethod === "dinheiro" && (
                          <>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="needsChange"
                                checked={needsChange}
                                onCheckedChange={(checked) => setNeedsChange(checked === true)}
                              />
                              <Label htmlFor="needsChange">Precisa de troco?</Label>
                            </div>
                            {needsChange && (
                              <div className="space-y-2">
                                <Label>Troco para quanto?</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={changeFor}
                                  onChange={(e) => setChangeFor(e.target.value)}
                                />
                              </div>
                            )}
                          </>
                       )}

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="isDelivery"
                              checked={isDelivery}
                              onCheckedChange={(checked) => {
                                setIsDelivery(checked === true);
                                // For totem, delivery address is not collected here, but the flag is important
                              }}
                            />
                            <Label htmlFor="isDelivery">É para entrega?</Label>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="pickupTime">
                              <Clock className="inline h-4 w-4 mr-1" />
                              Horário de Retirada (Opcional para hoje)
                            </Label>
                            <Select value={pickupTime} onValueChange={setPickupTime}>
                              <SelectTrigger id="pickupTime">
                                <SelectValue placeholder="Selecione o horário" />
                              </SelectTrigger>
                              <SelectContent>
                                {timeSlots.map((time) => (
                                  <SelectItem key={time} value={time}>
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!isSameDay(reservationDate || new Date(), new Date()) && (
                              <p className="text-xs text-destructive">
                                ⚠️ Para pedidos futuros, o horário é obrigatório.
                              </p>
                            )}
                          </div>
                        </div>

                        {pointsToRedeem > 0 && (
                          <div className="flex items-center justify-between text-sm text-purple-600 font-medium">
                            <span>Pontos a Resgatar:</span>
                            <span>{pointsToRedeem} pts</span>
                          </div>
                        )}
                        <div className="text-lg font-bold text-right">
                          Total Monetário: R$ {totalMonetary.toFixed(2)}
                        </div>

                        <Button onClick={handleFinishOrderClick} className="w-full h-12 text-xl" disabled={!isOrderValid()}>
                          Finalizar Pedido
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog para selecionar variação */}
      <Dialog open={showSelectVariationDialog} onOpenChange={setShowSelectVariationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione a Variação</DialogTitle>
          </DialogHeader>
          {productToSelectVariation && (
            <div className="space-y-4">
              <p className="text-lg font-semibold">{productToSelectVariation.name}</p>
              <Select
                value={selectedVariationForProduct?.id || ""}
                onValueChange={(value) => setSelectedVariationForProduct(allVariations.find(v => v.id === value) || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma variação" />
                </SelectTrigger>
                <SelectContent>
                  {allVariations
                    .filter(v => v.product_id === productToSelectVariation.id && v.stock_quantity > 0)
                    .map(variation => (
                      <SelectItem key={variation.id} value={variation.id}>
                        {variation.name} (R$ {(productToSelectVariation.price + variation.price_adjustment).toFixed(2)}) - Estoque: {variation.stock_quantity}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedVariationForProduct && selectedVariationForProduct.stock_quantity === 0 && (
                <p className="text-sm text-destructive">Esta variação está sem estoque.</p>
              )}
              <Button 
                onClick={handleSelectVariationAndAddToCart} 
                className="w-full"
                disabled={!selectedVariationForProduct || selectedVariationForProduct.stock_quantity === 0}
              >
                Adicionar ao Carrinho
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog para nome do cliente */}
      <Dialog open={showCustomerNameDialog} onOpenChange={setShowCustomerNameDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">Nome do Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-muted-foreground">
              Digite seu nome para identificarmos seu pedido:
            </p>
            <Input
              id="customer-name-dialog-input"
              type="text"
              placeholder="Seu nome (opcional)"
              value={tempCustomerName}
              onChange={(e) => setTempCustomerName(e.target.value)}
              className="text-lg h-12"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (tempCustomerName.trim()) {
                    setName(tempCustomerName);
                  }
                  setShowCustomerNameDialog(false);
                  finishOrder();
                }
              }}
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 text-lg"
                onClick={() => {
                  setTempCustomerName("");
                  setShowCustomerNameDialog(false);
                  finishOrder();
                }}
              >
                Pular
              </Button>
              <Button
                className="flex-1 h-12 text-lg"
                onClick={() => {
                  if (tempCustomerName.trim()) {
                    setName(tempCustomerName);
                  }
                  setShowCustomerNameDialog(false);
                  finishOrder();
                }}
              >
                OK
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}