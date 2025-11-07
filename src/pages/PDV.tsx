import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import useEmblaCarousel from 'embla-carousel-react';
import { 
  Plus, 
  Minus, 
  ShoppingCart, 
  Trash2,
  Hash,
  Smartphone,
  Monitor,
  User,
  CreditCard,
  Banknote,
  QrCode,
  Star, // Usaremos este ícone para favoritos
  Gift, // Importar ícone de presente para resgate
  MapPin, // Adicionado para endereços
  Home, // Adicionado para endereços
  Briefcase, // Adicionado para endereços
  Edit, // Adicionado para editar endereço
  Search, // Para busca
  Clock, // Para histórico
  Printer, // Para impressão
  X, // Para fechar
} from "lucide-react";
import { supabase as sb } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { cn } from "@/lib/utils"; // Import cn for conditional classNames
import { useClickSound } from "@/hooks/useClickSound"; // Importando o novo hook
import { useOrderFlow } from "@/hooks/useOrderFlow"; // Importando useOrderFlow
import ProductCardWithVariations from "@/components/ProductCardWithVariations"; // NOVO: Importando o novo componente
const supabase: any = sb;

interface Product {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  has_variations: boolean; // Adicionado
  earns_loyalty_points: boolean; // Adicionado
  loyns_loyalty_points_value: number; // Adicionado
  can_be_redeemed_with_points: boolean; // NOVO: Pode ser resgatado com pontos
  redemption_points_cost: number; // NOVO: Custo em pontos
  min_variation_price?: number; // Novo campo
  max_variation_price?: number; // Novo campo
  category_id?: string; // Categoria do produto
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
  is_composite?: boolean; // Se é um item composto
  raw_material_product_id?: string; // ID da matéria-prima (produto)
  raw_material_variation_id?: string; // ID da matéria-prima (variação)
  yield_quantity?: number; // Rendimento
}

interface CartItem extends Product {
  quantity: number;
  selectedVariation?: Variation; // Adicionado
  isRedeemedWithPoints: boolean; // NOVO: Indica se este item está sendo pago com pontos
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number;
}

interface CustomerAddress {
  id: string;
  customer_id: string;
  name: string; // Personalized name like "Casa", "Trabalho"
  address: string; // Street
  number: string;
  neighborhood: string; // New field
  reference: string;
  cep: string;
}

type OrderSource = "totem" | "whatsapp" | "loja_online" | "presencial" | "ifood";
type PaymentMethod = "pix" | "credito" | "debito" | "dinheiro" | "fidelidade";

export default function PDV() {
  const [products, setProducts] = useState<Product[]>([]);
  const [allVariations, setAllVariations] = useState<Variation[]>([]); // Todas as variações carregadas
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Novos estados para funcionalidades
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [favoriteProductIds, setFavoriteProductIds] = useState<string[]>([]);
  const [printEnabled, setPrintEnabled] = useState(true);
  
  // Embla carousel para categorias
  const [emblaRef] = useEmblaCarousel({ loop: false, align: 'start' });
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [source, setSource] = useState<OrderSource>("presencial");
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showSelectVariationDialog, setShowSelectVariationDialog] = useState(false); // Novo estado
  const [productToSelectVariation, setProductToSelectVariation] = useState<Product | null>(null); // Produto para selecionar variação
  const [selectedVariationForProduct, setSelectedVariationForProduct] = useState<Variation | null>(null); // Variação selecionada no modal
  const [showPaymentDialog, setShowPaymentDialog] = useState(false); // Mantido, mas não usado diretamente aqui
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [changeFor, setChangeFor] = useState("");

  // New states for delivery address
  const [address, setAddress] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [reference, setReference] = useState("");
  const [cep, setCep] = useState("");
  const [skipCep, setSkipCep] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null);

  // New states for editing saved addresses
  const [showEditSavedAddressDialog, setShowEditSavedAddressDialog] = useState(false);
  const [editingSavedAddress, setEditingSavedAddress] = useState<CustomerAddress | null>(null);
  const [editAddressName, setEditAddressName] = useState("");
  const [editAddressStreet, setEditAddressStreet] = useState("");
  const [editAddressNumber, setEditAddressNumber] = useState("");
  const [editAddressNeighborhood, setEditAddressNeighborhood] = useState("");
  const [editAddressReference, setEditAddressReference] = useState("");
  const [editAddressCep, setEditAddressCep] = useState("");
  const [editAddressSkipCep, setEditAddressSkipCep] = useState(false);
  
  // Estado para animação de moeda
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  
  // NOVO: Estado para a configuração do alerta iFood
  const [ifoodStockAlertEnabled, setIfoodStockAlertEnabled] = useState(false);
  const [ifoodStockAlertThreshold, setIfoodStockAlertThreshold] = useState(0); // NOVO: Estado para o threshold

  const { profile, user } = useAuth();
  const { toast } = useToast();
  const { playClick } = useClickSound(); // Inicializando o hook de som
  const { getInitialStatus } = useOrderFlow(); // Usando o novo hook

  // Carregar favoritos e histórico de busca do localStorage
  useEffect(() => {
    const storedFavorites = localStorage.getItem('pdv_favorites');
    const storedHistory = localStorage.getItem('pdv_search_history');
    const storedPrintEnabled = localStorage.getItem('pdv_print_enabled');
    
    if (storedFavorites) {
      setFavoriteProductIds(JSON.parse(storedFavorites));
    }
    if (storedHistory) {
      setSearchHistory(JSON.parse(storedHistory));
    }
    if (storedPrintEnabled !== null) {
      setPrintEnabled(JSON.parse(storedPrintEnabled));
    }
  }, []);

  useEffect(() => {
    if (profile?.store_id) {
      loadProductsAndVariations();
      loadCategories();
      loadIfoodSettings(); // NOVO: Carregar configurações do iFood
    }
  }, [profile]);

  useEffect(() => {
    if (customer?.id) {
      loadSavedAddresses();
    } else {
      setSavedAddresses([]);
      setSelectedSavedAddressId(null);
    }
  }, [customer]);

  // NOVO: Função para carregar configurações do iFood
  const loadIfoodSettings = async () => {
    if (!profile?.store_id) return;
    const { data, error } = await supabase
      .from("stores")
      .select("ifood_stock_alert_enabled, ifood_stock_alert_threshold") // Selecionar o threshold
      .eq("id", profile.store_id)
      .single();

    if (error) {
      console.error("Erro ao carregar configurações do iFood:", error);
    } else if (data) {
      setIfoodStockAlertEnabled(data.ifood_stock_alert_enabled ?? false);
      setIfoodStockAlertThreshold(data.ifood_stock_alert_threshold ?? 0); // NOVO: Setar o threshold
    }
  };

  const loadCategories = async () => {
    if (!profile?.store_id) return;
    
    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .eq("store_id", profile.store_id)
      .order("name");

    if (error) {
      console.error("Erro ao carregar categorias:", error);
    } else {
      setCategories(data || []);
    }
  };

  const loadProductsAndVariations = async () => {
    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("id, name, price, stock_quantity, has_variations, earns_loyalty_points, loyalty_points_value, can_be_redeemed_with_points, redemption_points_cost, category_id") // Incluir category_id
      .eq("store_id", profile.store_id)
      .eq("active", true)
      .order("name");

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

    setProducts(productsWithCalculatedPrices);
  };

  const checkCustomer = async (phoneNumber: string) => {
    const { data } = await supabase
      .from("customers" as any)
      .select("*")
      .eq("store_id", profile.store_id)
      .eq("phone", phoneNumber)
      .maybeSingle();

    return data;
  };

  // Funções auxiliares para favoritos
  const toggleFavorite = (productId: string) => {
    const newFavorites = favoriteProductIds.includes(productId)
      ? favoriteProductIds.filter(id => id !== productId)
      : [...favoriteProductIds, productId];
    
    setFavoriteProductIds(newFavorites);
    localStorage.setItem('pdv_favorites', JSON.stringify(newFavorites));
    
    toast({
      title: favoriteProductIds.includes(productId) ? "Removido dos favoritos" : "Adicionado aos favoritos",
      duration: 2000,
    });
  };

  // Funções para busca
  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (term.length > 0) {
      setShowSearchHistory(false);
    }
  };

  const addToSearchHistory = (term: string) => {
    if (!term.trim()) return;
    
    const newHistory = [term, ...searchHistory.filter(t => t !== term)].slice(0, 5);
    setSearchHistory(newHistory);
    localStorage.setItem('pdv_search_history', JSON.stringify(newHistory));
  };

  const selectFromHistory = (term: string) => {
    setSearchTerm(term);
    setShowSearchHistory(false);
    addToSearchHistory(term);
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('pdv_search_history');
  };

  // Função para alternar impressão
  const togglePrint = () => {
    const newValue = !printEnabled;
    setPrintEnabled(newValue);
    localStorage.setItem('pdv_print_enabled', JSON.stringify(newValue));
    
    toast({
      title: newValue ? "Impressão ativada" : "Impressão desativada",
      description: newValue ? "Pedidos serão impressos automaticamente" : "Pedidos não serão impressos",
      duration: 3000,
    });
  };

  // Filtrar produtos (sem ordenação por favoritos aqui)
  const getFilteredProducts = () => {
    let filtered = products;

    // Filtrar por busca
    if (searchTerm) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtrar por categoria
    if (selectedCategoryId) {
      filtered = filtered.filter(p => p.category_id === selectedCategoryId);
    }

    return filtered;
  };

  // Agrupar produtos por categoria, com categoria especial "Favoritos" no topo
  const getProductsByCategory = () => {
    const filtered = getFilteredProducts();
    const grouped: { [key: string]: Product[] } = {};

    // Separar favoritos e não-favoritos
    const favorites = filtered.filter(p => favoriteProductIds.includes(p.id));
    const nonFavorites = filtered.filter(p => !favoriteProductIds.includes(p.id));

    // Se houver favoritos, criar categoria especial "⭐ Favoritos"
    if (favorites.length > 0) {
      grouped["⭐ Favoritos"] = favorites;
    }

    // Agrupar produtos não-favoritos por categoria
    nonFavorites.forEach(product => {
      const categoryName = categories.find(cat => cat.id === product.category_id)?.name || "Sem Categoria";
      if (!grouped[categoryName]) {
        grouped[categoryName] = [];
      }
      grouped[categoryName].push(product);
    });

    return grouped;
  };

  const handleCustomerLookup = async () => {
    if (!phone) return;
    
    const customerData = await checkCustomer(phone);
    if (customerData && 'id' in customerData) {
      setCustomer(customerData as unknown as Customer);
      toast({
        title: "Cliente encontrado!",
        description: `Bem-vindo ${(customerData as unknown as Customer).name}`,
      });
    } else {
      setShowCustomerDialog(true);
    }
  };

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      toast({ variant: "destructive", title: "Telefone é obrigatório." });
      return;
    }

    let currentCustomer = customer;
    if (!currentCustomer) {
      // Try to find again in case it was just created in another tab/session
      const existingCustomer = await checkCustomer(phone);
      if (existingCustomer) {
        currentCustomer = existingCustomer as unknown as Customer;
      } else if (customerName) {
        // Create new customer if not found and name is provided
        const { data: newCustomer, error: newCustomerError } = await supabase
          .from("customers" as any)
          .insert({ phone, name: customerName, points: 0, store_id: profile.store_id })
          .select()
          .single();

        if (newCustomerError) {
          toast({ variant: "destructive", title: "Erro ao cadastrar cliente", description: newCustomerError.message });
          return;
        }
        currentCustomer = newCustomer as unknown as Customer;
        toast({ title: "Cliente cadastrado!", description: `Bem-vindo, ${customerName}!` });
      } else {
        // If phone is provided but no existing customer and no name, proceed without customer_id
        toast({ title: "Aviso", description: "Pedido será registrado sem nome de cliente para pontos de fidelidade." });
      }
    }

    setCustomer(currentCustomer);
    setShowCustomerDialog(false);
    
    if (pendingProduct) {
      await addProductToCart(pendingProduct);
      setPendingProduct(null);
    }
  };

  const handleAddToCart = async (product: Product, variation?: Variation) => {
    if ((source === "whatsapp" || source === "ifood") && !phone) {
      setPendingProduct(product);
      setShowCustomerDialog(true);
      return;
    }

    // Se o produto tem variações e nenhuma variação foi passada (clique no botão principal),
    // abre o diálogo de seleção de variação.
    // Se uma variação foi passada (clique nos botões de variação do carrossel), adiciona diretamente.
    if (product.has_variations && !variation) {
      setProductToSelectVariation(product);
      setShowSelectVariationDialog(true);
    } else {
      await addProductToCart(product, variation);
    }
  };

  // Função auxiliar para verificar estoque de matéria-prima de item composto
  const checkRawMaterialStock = async (variation: Variation, quantityNeeded: number): Promise<boolean> => {
    if (!variation.is_composite) return true;
    
    const { raw_material_product_id, raw_material_variation_id, yield_quantity } = variation;
    if (!raw_material_product_id && !raw_material_variation_id) return true;

    const isRawMaterialVariation = !!raw_material_variation_id;
    const rawMaterialId = isRawMaterialVariation ? raw_material_variation_id : raw_material_product_id;
    const rawMaterialTable = isRawMaterialVariation ? "product_variations" : "products";

    try {
      const { data: rawMaterial, error } = await supabase
        .from(rawMaterialTable)
        .select("stock_quantity, name")
        .eq("id", rawMaterialId)
        .single();

      if (error || !rawMaterial) {
        console.error("Erro ao verificar estoque da matéria-prima:", error);
        return false;
      }

      // Calcular quantas unidades de matéria-prima são necessárias
      const rawMaterialNeeded = Math.ceil(quantityNeeded / (yield_quantity || 1));
      return rawMaterial.stock_quantity >= rawMaterialNeeded;
    } catch (error) {
      console.error("Erro ao verificar estoque da matéria-prima:", error);
      return false;
    }
  };

  const addProductToCart = async (product: Product, variation?: Variation) => {
    playClick(); // Toca o som de clique
    
    const itemPrice = variation ? product.price + variation.price_adjustment : product.price;
    const itemStock = variation ? (variation.stock_quantity ?? 0) : (product.stock_quantity ?? 0);
    const itemId = variation ? `${product.id}-${variation.id}` : product.id;
    const isComposite = variation?.is_composite || false; // Verificar se é item composto

    const existingItem = cart.find(item => 
      item.id === product.id && item.selectedVariation?.id === variation?.id
    );
    
    if (existingItem) {
      const newQuantity = existingItem.quantity + 1;
      
      // Para itens normais, verifica o estoque normalmente
      if (!isComposite && newQuantity > itemStock) {
        toast({
          variant: "destructive",
          title: "Estoque insuficiente",
          description: `Apenas ${itemStock} unidades disponíveis para ${product.name} ${variation?.name ? `(${variation.name})` : ''}.`,
        });
        return;
      }
      
      // Para itens compostos, verifica se precisa de matéria-prima
      if (isComposite && newQuantity > itemStock && variation) {
        const quantityFromRawMaterial = newQuantity - itemStock;
        const hasRawMaterialStock = await checkRawMaterialStock(variation, quantityFromRawMaterial);
        
        if (!hasRawMaterialStock) {
          toast({
            variant: "destructive",
            title: "Matéria-prima insuficiente",
            description: `Não há matéria-prima suficiente para produzir ${product.name} ${variation?.name ? `(${variation.name})` : ''}.`,
          });
          return;
        }
      }
      
      setCart(cart.map(item =>
        item.id === product.id && item.selectedVariation?.id === variation?.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      // Para itens normais, verifica o estoque normalmente
      if (!isComposite && itemStock < 1) {
        toast({
          variant: "destructive",
          title: "Estoque insuficiente",
          description: `Apenas ${itemStock} unidades disponíveis para ${product.name} ${variation?.name ? `(${variation.name})` : ''}.`,
        });
        return;
      }
      
      // Para itens compostos, verifica se precisa de matéria-prima
      if (isComposite && itemStock < 1 && variation) {
        const hasRawMaterialStock = await checkRawMaterialStock(variation, 1);
        
        if (!hasRawMaterialStock) {
          toast({
            variant: "destructive",
            title: "Matéria-prima insuficiente",
            description: `Não há matéria-prima suficiente para produzir ${product.name} ${variation?.name ? `(${variation.name})` : ''}.`,
          });
          return;
        }
      }
      
      setCart([...cart, { 
        ...product,
        stock_quantity: itemStock, // IMPORTANTE: Deve vir DEPOIS do spread para sobrescrever
        id: product.id, // Keep original product ID
        quantity: 1, 
        price: itemPrice, // Use adjusted price
        selectedVariation: variation,
        isRedeemedWithPoints: false, // NOVO: Inicialmente não resgatado
      }]);
    }
  };

  const handleSelectVariationAndAddToCart = async () => {
    if (!productToSelectVariation || !selectedVariationForProduct) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Selecione uma variação válida.",
      });
      return;
    }
    await addProductToCart(productToSelectVariation, selectedVariationForProduct);
    setShowSelectVariationDialog(false);
    setProductToSelectVariation(null);
    setSelectedVariationForProduct(null);
  };

  const updateQuantity = async (productId: string, variationId: string | undefined, quantity: number) => {
    const itemInCart = cart.find(item => 
      item.id === productId && item.selectedVariation?.id === variationId
    );

    if (!itemInCart) return;

    const currentStock = itemInCart.selectedVariation 
      ? itemInCart.selectedVariation.stock_quantity 
      : itemInCart.stock_quantity;

    const isComposite = itemInCart.selectedVariation?.is_composite || false;

    // Para itens normais, verifica o estoque normalmente
    if (!isComposite && quantity > currentStock) {
      toast({
        variant: "destructive",
        title: "Estoque insuficiente",
        description: `Apenas ${currentStock} unidades disponíveis para ${itemInCart.name} ${itemInCart.selectedVariation?.name ? `(${itemInCart.selectedVariation.name})` : ''}.`,
      });
      return;
    }

    // Para itens compostos, verifica se precisa de matéria-prima
    if (isComposite && quantity > currentStock && itemInCart.selectedVariation) {
      const quantityFromRawMaterial = quantity - currentStock;
      const hasRawMaterialStock = await checkRawMaterialStock(itemInCart.selectedVariation, quantityFromRawMaterial);
      
      if (!hasRawMaterialStock) {
        toast({
          variant: "destructive",
          title: "Matéria-prima insuficiente",
          description: `Não há matéria-prima suficiente para produzir ${itemInCart.name} ${itemInCart.selectedVariation?.name ? `(${itemInCart.selectedVariation.name})` : ''}.`,
        });
        return;
      }
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
        description: "Identifique o cliente para usar pontos de fidelidade.",
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

  const clearCart = () => {
    setCart([]);
    setPhone("");
    setCustomerName("");
    setCustomer(null);
    setPaymentMethod(null);
    setIsDelivery(false);
    setDeliveryFee("");
    setChangeFor("");
    // Clear address fields
    setAddress("");
    setNumber("");
    setNeighborhood("");
    setReference("");
    setCep("");
    setSkipCep(false);
    setSaveAddress(false);
    setSelectedSavedAddressId(null);
  };

  // NOVO: Cálculo do subtotal monetário e total de pontos a serem resgatados
  const monetarySubtotal = cart.reduce((sum, item) => 
    sum + (item.isRedeemedWithPoints ? 0 : (item.price * item.quantity)), 0
  );
  const pointsToRedeem = cart.reduce((sum, item) => 
    sum + (item.isRedeemedWithPoints ? (item.redemption_points_cost * item.quantity) : 0), 0
  );

  const deliveryAmount = isDelivery && deliveryFee ? parseFloat(deliveryFee) : 0;
  const totalMonetary = monetarySubtotal + deliveryAmount; // Total a ser pago em dinheiro/cartão/pix

  const printOrder = (orderNumber: string) => {
    if (!printEnabled) {
      console.log('Impressão desativada. Pedido não será impresso.');
      return;
    }
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Erro ao imprimir",
        description: "Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está desativado.",
      });
      return;
    }

    const customerName = customer?.name || 'Cliente Anônimo';
    const customerPhone = phone || 'N/A';
    const orderDate = new Date().toLocaleDateString('pt-BR', { 
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
          <title>Pedido #${orderNumber}</title>
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
              <div>Pedido #${orderNumber}</div>
              <div>${orderDate}</div>
            </div>

            ${isDelivery ? `
              <div class="divider"></div>
              <div class="section">
                <div class="section-title">ENTREGA</div>
                <div>${address}, ${number}</div>
                ${neighborhood ? `<div>${neighborhood}</div>` : ''}
                ${reference ? `<div>Ref: ${reference}</div>` : ''}
                ${cep && !skipCep ? `<div>CEP: ${cep}</div>` : ''}
              </div>
            ` : ''}

            <div class="divider"></div>

            <div class="section">
              <div class="section-title">ITENS DO PEDIDO</div>
              ${cart.map(item => {
                const isRedeemed = item.isRedeemedWithPoints;
                return `
                  <div class="item">
                    <span>${item.quantity}x ${item.name}${item.selectedVariation ? ` (${item.selectedVariation.name})` : ''}${isRedeemed ? ' ⭐' : ''}</span>
                    <span>${isRedeemed ? 'RESGATADO' : `R$ ${(item.price * item.quantity).toFixed(2)}`}</span>
                  </div>
                `;
              }).join('')}
            </div>

            ${isDelivery && deliveryAmount > 0 ? `
              <div class="divider"></div>
              <div class="section">
                <div>Taxa de Entrega: R$ ${deliveryAmount.toFixed(2)}</div>
              </div>
            ` : ''}

            <div class="divider"></div>

            <div class="section">
              <div><strong>Pagamento:</strong> ${paymentMethod?.charAt(0).toUpperCase() + paymentMethod?.slice(1)}</div>
              ${paymentMethod === "dinheiro" && changeFor ? `<div><strong>Troco para:</strong> R$ ${parseFloat(changeFor).toFixed(2)}</div>` : ''}
            </div>

            <div class="total">
              TOTAL: R$ ${totalMonetary.toFixed(2)}
            </div>

            ${pointsToRedeem > 0 ? `
              <div class="total">
                PONTOS RESGATADOS: ${pointsToRedeem} pts
              </div>
            ` : ''}

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

  const loadSavedAddresses = async () => {
    if (!customer?.id) return;

    const { data, error } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", customer.id)
      .order("name");

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar endereços salvos",
        description: error.message,
      });
    } else {
      setSavedAddresses(data || []);
    }
  };

  const handleSaveAddress = async () => {
    if (!customer?.id || !address || !neighborhood) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar endereço",
        description: "Preencha Rua e Bairro para salvar o endereço.",
      });
      return;
    }

    const { error } = await supabase.from("customer_addresses").insert({
      customer_id: customer.id,
      name: "Endereço Salvo", // Default name, user can edit later
      address,
      number,
      neighborhood,
      reference,
      cep: skipCep ? null : cep,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar endereço",
        description: error.message,
      });
    } else {
      toast({
        title: "Endereço salvo com sucesso!",
      });
      loadSavedAddresses();
      setSaveAddress(false);
    }
  };

  const handleSelectSavedAddress = (addressId: string) => {
    const selected = savedAddresses.find(addr => addr.id === addressId);
    if (selected) {
      setAddress(selected.address);
      setNumber(selected.number || "");
      setNeighborhood(selected.neighborhood);
      setReference(selected.reference || "");
      setCep(selected.cep || "");
      setSkipCep(!selected.cep);
      setSelectedSavedAddressId(addressId);
    }
  };

  const openEditSavedAddressDialog = (addr: CustomerAddress) => {
    setEditingSavedAddress(addr);
    setEditAddressName(addr.name);
    setEditAddressStreet(addr.address);
    setEditAddressNumber(addr.number || "");
    setEditAddressNeighborhood(addr.neighborhood);
    setEditAddressReference(addr.reference || "");
    setEditAddressCep(addr.cep || "");
    setEditAddressSkipCep(!addr.cep);
    setShowEditSavedAddressDialog(true);
  };

  const handleUpdateSavedAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSavedAddress || !customer?.id) return;

    if (!editAddressName || !editAddressStreet || !editAddressNeighborhood) {
      toast({ variant: "destructive", title: "Campos obrigatórios", description: "Nome, Rua e Bairro são obrigatórios." });
      return;
    }

    const addressData = {
      name: editAddressName,
      address: editAddressStreet,
      number: editAddressNumber || null,
      neighborhood: editAddressNeighborhood,
      reference: editAddressReference || null,
      cep: editAddressSkipCep ? null : editAddressCep || null,
    };

    const { error } = await supabase
      .from("customer_addresses")
      .update(addressData)
      .eq("id", editingSavedAddress.id);

    if (error) {
      toast({ variant: "destructive", title: "Erro ao atualizar endereço", description: error.message });
    } else {
      toast({ title: "Endereço atualizado!" });
      setShowEditSavedAddressDialog(false);
      loadSavedAddresses();
    }
  };

  const handleDeleteSavedAddress = async (addressId: string) => {
    if (!confirm("Tem certeza que deseja excluir este endereço?")) return;

    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", addressId);

    if (error) {
      toast({ variant: "destructive", title: "Erro ao excluir endereço", description: error.message });
    } else {
      toast({ title: "Endereço excluído!" });
      loadSavedAddresses();
    }
  };

  const finishOrder = async () => {
    try {
      // Move calculations to the top
      const monetarySubtotal = cart.reduce((sum, item) => 
        sum + (item.isRedeemedWithPoints ? 0 : (item.price * item.quantity)), 0
      );
      const pointsToRedeem = cart.reduce((sum, item) => 
        sum + (item.isRedeemedWithPoints ? (item.redemption_points_cost * item.quantity) : 0), 0
      );
      const deliveryAmount = isDelivery && deliveryFee ? parseFloat(deliveryFee) : 0;
      const totalMonetary = monetarySubtotal + deliveryAmount; // Total a ser pago em dinheiro/cartão/pix

      if (cart.length === 0) {
        toast({
          variant: "destructive",
          title: "Carrinho vazio",
          description: "Adicione produtos antes de finalizar",
        });
        return;
      }

    // Modificação aqui: paymentMethod é obrigatório SOMENTE se houver um total monetário > 0
    if (totalMonetary > 0 && !paymentMethod) {
      toast({
        variant: "destructive",
        title: "Selecione forma de pagamento",
      });
      return;
    }

    // Se houver itens resgatados com pontos, o método de pagamento "fidelidade" não é usado para o total monetário.
    // O método "fidelidade" é para resgatar um prêmio (como um produto específico que custa 9 pontos, por exemplo).
    // A lógica de "pagar a diferença" já está sendo tratada pelo `isRedeemedWithPoints` em cada item.
    // Portanto, se `pointsToRedeem > 0`, o `paymentMethod` não pode ser "fidelidade" para o restante monetário.
    if (pointsToRedeem > 0 && paymentMethod === "fidelidade") {
      toast({
        variant: "destructive",
        title: "Forma de pagamento inválida",
        description: "Selecione uma forma de pagamento monetária para o restante do pedido.",
      });
      return;
    }

    if (isDelivery && (!address || !neighborhood)) {
      toast({
        variant: "destructive",
        title: "Endereço e Bairro obrigatórios para entrega",
      });
      return;
    }

    const { data: cashRegister } = await supabase
      .from("cash_register" as any)
      .select("id")
      .eq("store_id", profile.store_id)
      .is("closed_at", null)
      .maybeSingle();

    if (!cashRegister || !('id' in cashRegister)) {
      toast({
        variant: "destructive",
        title: "Caixa fechado",
        description: "Abra o caixa antes de fazer vendas",
      });
      return;
    }

    const cashRegisterId = (cashRegister as any).id;

    const orderNumber = `PED-${Date.now().toString().slice(-6)}`;

    let customerId = customer?.id || null;

    // Construir a string final do método de pagamento
    const paymentMethodsArray: string[] = [];
    if (pointsToRedeem > 0) {
      paymentMethodsArray.push("Fidelidade");
    }
    if (totalMonetary > 0 && paymentMethod) {
      paymentMethodsArray.push(paymentMethodLabels[paymentMethod]);
    }
    const finalPaymentMethod = paymentMethodsArray.join(' + ');

    // Determinar o status inicial dinamicamente
    const initialStatus = getInitialStatus();

    const { data: order, error: orderError } = await supabase
      .from("orders" as any)
      .insert({
        store_id: profile.store_id,
        order_number: orderNumber,
        customer_id: customerId,
        source,
        total: totalMonetary, // Usar o total monetário
        payment_method: finalPaymentMethod, // Usar a string combinada
        delivery: isDelivery,
        delivery_fee: deliveryAmount,
        change_for: paymentMethod === "dinheiro" && changeFor ? parseFloat(changeFor) : null,
        cash_register_id: cashRegisterId,
        created_by: user?.id,
        delivery_address: isDelivery ? address : null,
        delivery_number: isDelivery ? number : null,
        delivery_neighborhood: isDelivery ? neighborhood : null,
        delivery_reference: isDelivery ? reference : null,
        delivery_cep: isDelivery && !skipCep ? cep : null,
        status: initialStatus, // Usar o status inicial dinâmico
      })
      .select()
      .single();

    if (orderError || !order || !('id' in order)) {
      toast({
        variant: "destructive",
        title: "Erro ao criar pedido",
        description: orderError?.message || "Erro desconhecido",
      });
      return;
    }

    const orderId = (order as any)?.id;
    const orderItems = cart.map(item => ({
      order_id: orderId,
      product_id: item.id,
      product_name: item.name,
      product_price: item.isRedeemedWithPoints ? 0 : item.price, // Preço 0 se resgatado
      quantity: item.quantity,
      subtotal: item.isRedeemedWithPoints ? 0 : (item.price * item.quantity), // Subtotal 0 se resgatado
      product_variation_id: item.selectedVariation?.id || null, // Salvar ID da variação
      variation_name: item.selectedVariation?.name || null, // Salvar nome da variação
    }));

    const { error: itemsError } = await supabase
      .from("order_items" as any)
      .insert(orderItems);

    if (itemsError) {
      toast({
        variant: "destructive",
        title: "Erro ao adicionar itens",
        description: itemsError.message,
      });
      return;
    }

    // --- ATUALIZAÇÃO DE ESTOQUE (PRODUTOS E VARIAÇÕES) E LÓGICA DE ALERTA IFOOD ---
    const stockUpdatePromises = cart.map(async (item) => {
      let currentDbStock = 0;
      let tableName = "";
      let itemId = "";

      if (item.selectedVariation) {
        tableName = "product_variations";
        itemId = item.selectedVariation.id;
        const { data: dbVariation, error: dbError } = await supabase
          .from(tableName)
          .select("stock_quantity, is_composite")
          .eq("id", itemId)
          .single();
        if (dbError) {
          console.error(`Erro ao buscar estoque da variação ${item.selectedVariation.name}:`, dbError.message);
          return; // Skip update for this item if stock can't be fetched
        }
        currentDbStock = dbVariation?.stock_quantity ?? 0;
        
        // Para produtos compostos SEM estoque, permitir valores negativos temporários
        const isComposite = dbVariation?.is_composite || false;
        const newQuantity = isComposite 
          ? currentDbStock - item.quantity  // Permite negativo para compostos
          : Math.max(0, currentDbStock - item.quantity); // Não permite negativo para produtos normais

        // Lógica de Alerta iFood
        if (ifoodStockAlertEnabled) {
          // Alerta se o estoque final for menor ou igual ao threshold E maior ou igual a 0
          // Não alertar para estoques negativos (produtos compostos sem estoque usando matéria-prima)
          if (newQuantity >= 0 && newQuantity <= ifoodStockAlertThreshold) {
            const productName = item.name + (item.selectedVariation ? ` (${item.selectedVariation.name})` : '');
            toast({
              variant: "destructive",
              title: "⚠️ Alerta IFOOD",
              description: `O produto "${productName}" atingiu o limite de estoque (${newQuantity} unidades). Lembre-se de pausá-lo no iFood!`,
              duration: 15000, // Long duration for critical alert
              action: (
                <ToastAction altText="Fechar alerta">OK</ToastAction>
              ),
            });
          }
        }

        // Atualizar estoque no banco de dados
        const { error: stockUpdateError } = await supabase
          .from(tableName)
          .update({ stock_quantity: newQuantity })
          .eq("id", itemId);

        if (stockUpdateError) {
          console.error(`Erro ao atualizar estoque de ${item.name}:`, stockUpdateError.message);
        }
      } else {
        tableName = "products";
        itemId = item.id;
        const { data: dbProduct, error: dbError } = await supabase
          .from(tableName)
          .select("stock_quantity")
          .eq("id", itemId)
          .single();
        if (dbError) {
          console.error(`Erro ao buscar estoque do produto ${item.name}:`, dbError.message);
          return; // Skip update for this item if stock can't be fetched
        }
        currentDbStock = dbProduct?.stock_quantity ?? 0;
        
        const newQuantity = Math.max(0, currentDbStock - item.quantity);

        // Lógica de Alerta iFood
        if (ifoodStockAlertEnabled) {
          // Alerta se o estoque final for menor ou igual ao threshold E maior ou igual a 0
          // Não alertar para estoques negativos
          if (newQuantity >= 0 && newQuantity <= ifoodStockAlertThreshold) {
            const productName = item.name;
            toast({
              variant: "destructive",
              title: "⚠️ Alerta IFOOD",
              description: `O produto "${productName}" atingiu o limite de estoque (${newQuantity} unidades). Lembre-se de pausá-lo no iFood!`,
              duration: 15000, // Long duration for critical alert
              action: (
                <ToastAction altText="Fechar alerta">OK</ToastAction>
              ),
            });
          }
        }

        // Atualizar estoque no banco de dados
        const { error: stockUpdateError } = await supabase
          .from(tableName)
          .update({ stock_quantity: newQuantity })
          .eq("id", itemId);

        if (stockUpdateError) {
          console.error(`Erro ao atualizar estoque de ${item.name}:`, stockUpdateError.message);
        }
      }
    });

    await Promise.all(stockUpdatePromises);
    
    // --- INÍCIO DA LÓGICA DE ITENS COMPOSTOS ---
    // Para cada item com variação composta, processar estoque corretamente
    const compositeItemPromises = cart.map(async (item) => {
      // Só processar se tiver variação e for composta
      if (!item.selectedVariation) return;

      // Buscar dados completos da variação
      const { data: variation, error: varError } = await supabase
        .from("product_variations")
        .select("is_composite, raw_material_product_id, raw_material_variation_id, yield_quantity")
        .eq("id", item.selectedVariation.id)
        .single();

      if (varError || !variation || !variation.is_composite) return;

      const { is_composite, raw_material_product_id, raw_material_variation_id, yield_quantity } = variation;

      if (!is_composite || (!raw_material_product_id && !raw_material_variation_id)) return;

      // REGRA: Verificar se havia estoque suficiente do produto composto ANTES da venda
      // O estoque que estava disponível antes da venda está em item.stock_quantity
      // Se houver estoque suficiente, apenas consome do estoque (já foi feito na atualização normal)
      // Se NÃO houver estoque suficiente, consome da matéria-prima
      
      const stockBeforeSale = item.stock_quantity || 0; // Estoque antes da venda
      
      if (stockBeforeSale >= item.quantity) {
        // Tinha estoque suficiente do produto composto, não precisa consumir matéria-prima
        console.log(`Produto composto ${item.name} tinha estoque suficiente (${stockBeforeSale}). Não consumindo matéria-prima.`);
        return;
      }

      // Não tinha estoque suficiente, precisa consumir matéria-prima e GERAR estoque
      const quantityNeeded = item.quantity - stockBeforeSale; // Quantidade que precisa vir da matéria-prima
      
      // Determinar se a matéria-prima é produto ou variação
      const isRawMaterialVariation = !!raw_material_variation_id;
      const rawMaterialId = isRawMaterialVariation ? raw_material_variation_id : raw_material_product_id;
      const rawMaterialTable = isRawMaterialVariation ? "product_variations" : "products";

      // Buscar estoque atual da matéria-prima
      const { data: rawMaterial, error: rawError } = await supabase
        .from(rawMaterialTable)
        .select("stock_quantity, name")
        .eq("id", rawMaterialId)
        .single();

      if (rawError || !rawMaterial) {
        console.error(`Erro ao buscar matéria-prima para ${item.name}:`, rawError?.message);
        return;
      }

      // Calcular quantas unidades de matéria-prima consumir (apenas para o que falta)
      const rawMaterialToConsume = Math.ceil(quantityNeeded / yield_quantity);

      // Reduzir estoque da matéria-prima
      const newRawMaterialStock = Math.max(0, rawMaterial.stock_quantity - rawMaterialToConsume);

      const { error: updateRawError } = await supabase
        .from(rawMaterialTable)
        .update({ stock_quantity: newRawMaterialStock })
        .eq("id", rawMaterialId);

      if (updateRawError) {
        console.error(`Erro ao atualizar estoque da matéria-prima ${rawMaterial.name}:`, updateRawError.message);
        return;
      }

      // IMPORTANTE: GERAR estoque do produto composto
      // Cada matéria-prima gera yield_quantity unidades do produto composto
      const unitsGenerated = rawMaterialToConsume * yield_quantity;
      
      // Buscar estoque atual do produto composto (após a venda já ter sido descontada)
      const { data: currentVariation, error: getCurrentError } = await supabase
        .from("product_variations")
        .select("stock_quantity")
        .eq("id", item.selectedVariation.id)
        .single();

      if (getCurrentError || !currentVariation) {
        console.error(`Erro ao buscar estoque atual da variação:`, getCurrentError?.message);
        return;
      }

      // Novo estoque = estoque atual (já descontado) + unidades geradas
      // Exemplo: Estoque era 0, vendeu 1 (ficou -1), gera 2 (fica 1)
      const currentStock = currentVariation?.stock_quantity ?? 0;
      const newCompositeStock = currentStock + unitsGenerated;

      console.log(`DEBUG: Produto composto ${item.name}: estoque atual = ${currentStock}, gerando ${unitsGenerated}, novo = ${newCompositeStock}`);

      const { error: updateCompositeError } = await supabase
        .from("product_variations")
        .update({ stock_quantity: newCompositeStock })
        .eq("id", item.selectedVariation.id);

      if (updateCompositeError) {
        console.error(`Erro ao atualizar estoque do produto composto:`, updateCompositeError.message);
        return;
      }

      console.log(`Produto composto ${item.name}: Consumiu ${rawMaterialToConsume} matéria-prima, gerou ${unitsGenerated} unidades, estoque final = ${newCompositeStock}.`);

      // Registrar a transação para possível reversão
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", orderId)
        .eq("product_id", item.id)
        .eq("variation_id", item.selectedVariation.id);

      if (!itemsError && orderItems && orderItems.length > 0) {
        await supabase
          .from("composite_item_transactions")
          .insert({
            order_id: orderId,
            order_item_id: orderItems[0].id,
            variation_id: item.selectedVariation.id,
            raw_material_product_id: raw_material_product_id,
            raw_material_consumed: rawMaterialToConsume,
            variations_generated: unitsGenerated, // Unidades que foram geradas
          });
      }
    });

    await Promise.all(compositeItemPromises);
    // --- FIM DA LÓGICA DE ITENS COMPOSTOS ---
    
    // --- INÍCIO DA LÓGICA DE ATUALIZAÇÃO DE ESTOQUE DE EMBALAGENS ---
    // Para cada produto vendido, verificar se há embalagens vinculadas e decrementar o estoque
    const packagingUpdatePromises = cart.map(async (item) => {
      // Buscar embalagens vinculadas a este produto
      const { data: packagingLinks, error: packagingError } = await supabase
        .from("product_packaging_links")
        .select("packaging_id, quantity")
        .eq("product_id", item.id)
        .eq("store_id", profile.store_id);

      if (packagingError) {
        console.error(`Erro ao buscar embalagens para ${item.name}:`, packagingError.message);
        return;
      }

      if (!packagingLinks || packagingLinks.length === 0) return;

      // Para cada embalagem vinculada, decrementar o estoque
      for (const link of packagingLinks) {
        const { data: packaging, error: getPackagingError } = await supabase
          .from("products")
          .select("stock_quantity, name")
          .eq("id", link.packaging_id)
          .single();

        if (getPackagingError || !packaging) {
          console.error(`Erro ao buscar embalagem ${link.packaging_id}:`, getPackagingError?.message);
          continue;
        }

        // Calcular novo estoque da embalagem
        const packagingUsed = link.quantity * item.quantity;
        const newPackagingStock = Math.max(0, packaging.stock_quantity - packagingUsed);

        // Atualizar estoque da embalagem
        const { error: updatePackagingError } = await supabase
          .from("products")
          .update({ stock_quantity: newPackagingStock })
          .eq("id", link.packaging_id);

        if (updatePackagingError) {
          console.error(`Erro ao atualizar estoque da embalagem ${packaging.name}:`, updatePackagingError.message);
        }
      }
    });

    await Promise.all(packagingUpdatePromises);
    // --- FIM DA LÓGICA DE ATUALIZAÇÃO DE ESTOQUE DE EMBALAGENS ---
    // --- FIM DA ATUALIZAÇÃO DE ESTOQUE E LÓGICA DE ALERTA IFOOD ---

    // NOVO: Lógica para deduzir pontos dos itens resgatados
    if (pointsToRedeem > 0 && customer && 'id' in customer) {
      await supabase
        .from("customers" as any)
        .update({ points: customer.points - pointsToRedeem })
        .eq("id", customer.id);

      await supabase
        .from("loyalty_transactions" as any)
        .insert({
          customer_id: customer.id,
          order_id: orderId,
          points: -pointsToRedeem, // Pontos negativos para resgate
          transaction_type: "redeem",
          store_id: profile.store_id,
          description: `Resgate de ${pointsToRedeem} pontos no pedido ${orderNumber}`,
        });
    }
    // Removida a lógica de atribuição de pontos (earn) daqui. Será feita no OrderPanel.

    if (saveAddress && customer?.id && address && neighborhood) {
      await handleSaveAddress();
    }

      // Mostrar animação de moeda
      setShowCoinAnimation(true);
      setTimeout(() => setShowCoinAnimation(false), 1500);

      printOrder(orderNumber);
      clearCart();
      setShowPaymentDialog(false);
      loadProductsAndVariations(); // Recarregar produtos e variações para refletir o estoque atualizado
    } catch (error: any) {
      console.error("Erro ao finalizar pedido:", error);
      toast({
        variant: "destructive",
        title: "Erro ao finalizar pedido",
        description: error?.message || "Ocorreu um erro inesperado. O pedido pode ter sido criado parcialmente.",
      });
    }
  };

  const sourceIcons = {
    totem: Monitor,
    whatsapp: Smartphone,
    loja_online: ShoppingCart,
    presencial: User,
    ifood: ShoppingCart,
  };

  const paymentMethodIcons = {
    pix: QrCode,
    credito: CreditCard,
    debito: CreditCard,
    dinheiro: Banknote,
    fidelidade: Star,
  };

  const paymentMethodLabels = {
    pix: "PIX",
    credito: "Crédito",
    debito: "Débito",
    dinheiro: "Dinheiro",
    fidelidade: "Fidelidade",
  };

  const productsByCategory = getProductsByCategory();
  const sortedCategoryNames = Object.keys(productsByCategory).sort((a, b) => {
    // "⭐ Favoritos" sempre no topo
    if (a === "⭐ Favoritos") return -1;
    if (b === "⭐ Favoritos") return 1;
    
    // "Sem Categoria" sempre no final
    if (a === "Sem Categoria") return 1;
    if (b === "Sem Categoria") return -1;
    
    // Demais categorias em ordem alfabética
    return a.localeCompare(b);
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-2rem)]">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">PDV - Ponto de Venda</h1>
            <p className="text-muted-foreground">Selecione os produtos para adicionar ao pedido</p>
          </div>
          
          {/* Botão de Impressão */}
          <Button
            variant={printEnabled ? "default" : "destructive"}
            size="sm"
            onClick={togglePrint}
            className="flex items-center gap-2"
          >
            <Printer className="h-4 w-4 mr-2" />
            {printEnabled ? "Impressão Ativa" : "Impressão Desativada"}
          </Button>
        </div>

        {/* Campo de Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produtos..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchHistory.length > 0 && setShowSearchHistory(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchTerm) {
                addToSearchHistory(searchTerm);
                setShowSearchHistory(false);
              }
            }}
            className="pl-10 pr-10"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 px-2"
            >
              ✕
            </Button>
          )}
          
          {/* Histórico de Busca */}
          {showSearchHistory && searchHistory.length > 0 && (
            <Card className="absolute top-full mt-2 w-full z-50 shadow-lg">
              <CardContent className="p-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Buscas Recentes
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSearchHistory}
                    className="h-6 text-xs"
                  >
                    Limpar
                  </Button>
                </div>
                {searchHistory.map((term, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    onClick={() => selectFromHistory(term)}
                    className="w-full justify-start text-left mb-1"
                  >
                    {term}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Filtro de Categorias */}
        <div className="embla overflow-hidden w-full" ref={emblaRef}>
          <div className="embla__container flex gap-2 pb-2">
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

        {/* Produtos por Categoria */}
        <div className="overflow-y-auto max-h-[calc(100vh-18rem)]">
          {sortedCategoryNames.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum produto encontrado.
            </p>
          ) : (
            sortedCategoryNames.map(categoryName => {
              return (
                <div key={categoryName} className="mb-6">
                  <h3 className={cn(
                    "text-xl font-bold mb-3 sticky top-0 py-2 z-10",
                    "bg-background" 
                  )}>
                    {categoryName}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {productsByCategory[categoryName].map((product) => {
                    const productVariations = allVariations.filter(v => v.product_id === product.id);
                    // Para produtos com variações, considerar "sem estoque" apenas se TODAS as variações
                    // estiverem sem estoque E nenhuma for composta
                    const isOutOfStock = product.has_variations 
                      ? productVariations.every(v => v.stock_quantity === 0 && !v.is_composite)
                      : product.stock_quantity === 0;
                    const isFavorite = favoriteProductIds.includes(product.id);

                    return (
                      <ProductCardWithVariations
                        key={product.id}
                        product={product}
                        productVariations={productVariations}
                        isOutOfStock={isOutOfStock}
                        isFavorite={isFavorite}
                        toggleFavorite={toggleFavorite}
                        handleAddToCart={handleAddToCart}
                      />
                    );
                  })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Cliente Fidelidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                id="customer-phone-input" // Added ID for easier targeting
                type="tel"
                placeholder="Celular do cliente"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { // Added onKeyDown handler
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCustomerLookup();
                  }
                }}
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <Button onClick={handleCustomerLookup} size="sm">
                OK
              </Button>
            </div>
            {customer && (
              <div className="p-3 bg-primary/10 rounded-lg">
                <p className="font-medium">{customer.name}</p>
                <p className="text-sm text-muted-foreground">
                  {customer.points} pontos
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Carrinho
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(["presencial", "whatsapp", "ifood"] as OrderSource[]).map((s) => {
              const Icon = sourceIcons[s];
              return (
                <Button
                  key={s}
                  variant={source === s ? "default" : "outline"}
                  onClick={() => setSource(s)}
                  size="sm"
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              );
            })}
          </div>
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Carrinho vazio
              </p>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={`${item.id}-${item.selectedVariation?.id || ''}`} className="flex items-center justify-between p-3 bg-accent rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        {item.name} {item.selectedVariation && `(${item.selectedVariation.name})`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.isRedeemedWithPoints ? (
                          <span className="text-purple-600">{item.redemption_points_cost.toFixed(0)} pts cada</span>
                        ) : (
                          `R$ ${item.price.toFixed(2)} cada`
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 justify-end flex-col"> {/* MODIFICADO: Adicionado flex-col para empilhar */}
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
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, item.selectedVariation?.id, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, item.selectedVariation?.id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <>
                <Separator />
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="delivery" className="cursor-pointer">Entrega?</Label>
                    <Checkbox
                      id="delivery"
                      checked={isDelivery}
                      onCheckedChange={(checked) => {
                        setIsDelivery(checked === true);
                        // Clear address fields when toggling off delivery
                        if (!checked) {
                          setAddress("");
                          setNumber("");
                          setNeighborhood("");
                          setReference("");
                          setCep("");
                          setSkipCep(false);
                          setSaveAddress(false);
                          setSelectedSavedAddressId(null);
                        }
                      }}
                    />
                  </div>
                  
                  {isDelivery && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="deliveryFee">Taxa de Entrega</Label>
                        <Input
                          id="deliveryFee"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={deliveryFee}
                          onChange={(e) => setDeliveryFee(e.target.value)}
                        />
                      </div>

                      {savedAddresses.length > 0 && (
                        <div className="space-y-2">
                          <Label htmlFor="savedAddress">Endereços Salvos</Label>
                          <Select value={selectedSavedAddressId || ""} onValueChange={handleSelectSavedAddress}>
                            <SelectTrigger id="savedAddress">
                              <SelectValue placeholder="Selecionar endereço salvo" />
                            </SelectTrigger>
                            <SelectContent>
                              {savedAddresses.map(addr => (
                                <SelectItem key={addr.id} value={addr.id}>
                                  {addr.name} - {addr.address}, {addr.number} ({addr.neighborhood})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Rua</Label>
                        <Input
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label>Número</Label>
                          <Input
                            value={number}
                            onChange={(e) => setNumber(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Bairro</Label>
                          <Input
                            value={neighborhood}
                            onChange={(e) => setNeighborhood(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Referência</Label>
                        <Input
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="cep">CEP</Label>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={() => setSkipCep(!skipCep)}
                          >
                            {skipCep ? "Informar CEP" : "Não sei o CEP"}
                          </Button>
                        </div>
                        {!skipCep && (
                          <Input
                            id="cep"
                            value={cep}
                            onChange={(e) => setCep(e.target.value.replace(/\D/g, ''))}
                            placeholder="00000-000"
                            inputMode="numeric"
                          />
                        )}
                      </div>
                      {customer && ( // Only show save address option if customer is identified
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="saveAddress"
                            checked={saveAddress}
                            onCheckedChange={(checked) => setSaveAddress(checked === true)}
                          />
                          <Label htmlFor="saveAddress">Salvar endereço para próxima compra</Label>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Forma de Pagamento</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["pix", "credito", "debito", "dinheiro"] as PaymentMethod[]).map((method) => { // Removido "fidelidade" daqui
                        const Icon = paymentMethodIcons[method];
                        return (
                          <Button
                            key={method}
                            variant={paymentMethod === method ? "default" : "outline"}
                            onClick={() => setPaymentMethod(method)}
                            className="flex items-center justify-center gap-2"
                          >
                            <Icon className="h-4 w-4 mr-2" />
                            {paymentMethodLabels[method]}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {paymentMethod === "dinheiro" && (
                    <div className="space-y-2">
                      <Label htmlFor="changeFor">Troco para quanto?</Label>
                      <Input
                        id="changeFor"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={changeFor}
                        onChange={(e) => setChangeFor(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <Separator />
                
                <div className="space-y-2">
                  {pointsToRedeem > 0 && (
                    <div className="flex items-center justify-between text-sm text-purple-600 font-medium">
                      <span>Pontos a Resgatar:</span>
                      <span>{pointsToRedeem} pts</span>
                    </div>
                  )}
                  {isDelivery && deliveryFee && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Subtotal Monetário:</span>
                      <span>R$ {monetarySubtotal.toFixed(2)}</span>
                    </div>
                  )}
                  {isDelivery && deliveryFee && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Taxa de Entrega:</span>
                      <span>R$ ${deliveryAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-lg font-semibold">
                    <span>Total:</span>
                    <span className="text-primary">R$ {totalMonetary.toFixed(2)}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={clearCart}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Limpar
                    </Button>
                    <Button onClick={finishOrder} className="shadow-soft">
                      <Hash className="h-4 w-4 mr-2" />
                      Finalizar
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Informações do Cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCustomerSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nome (se for cliente novo)</Label>
              <Input
                id="name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do cliente"
              />
            </div>
            <Button type="submit" className="w-full">
              Confirmar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
              {selectedVariationForProduct && selectedVariationForProduct.stock_quantity === 0 && !selectedVariationForProduct.is_composite && (
                <p className="text-sm text-destructive">Esta variação está sem estoque.</p>
              )}
              {selectedVariationForProduct && selectedVariationForProduct.stock_quantity === 0 && selectedVariationForProduct.is_composite && (
                <p className="text-sm text-muted-foreground">Este produto será feito sob demanda da matéria-prima.</p>
              )}
              <Button 
                onClick={handleSelectVariationAndAddToCart} 
                className="w-full"
                disabled={!selectedVariationForProduct}
              >
                Adicionar ao Carrinho
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog para Editar Endereço Salvo */}
      <Dialog open={showEditSavedAddressDialog} onOpenChange={(open) => {
        setShowEditSavedAddressDialog(open);
        if (!open) {
          setEditingSavedAddress(null);
          setEditAddressName("");
          setEditAddressStreet("");
          setEditAddressNumber("");
          setEditAddressNeighborhood("");
          setEditAddressReference("");
          setEditAddressCep("");
          setEditAddressSkipCep(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar Endereço Salvo
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateSavedAddress} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editAddressName">Nome do Endereço (Ex: Casa, Trabalho)</Label>
              <Input
                id="editAddressName"
                value={editAddressName}
                onChange={(e) => setEditAddressName(e.target.value)}
                placeholder="Ex: Casa"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAddressStreet">Rua</Label>
              <Input
                id="editAddressStreet"
                value={editAddressStreet}
                onChange={(e) => setEditAddressStreet(e.target.value)}
                placeholder="Ex: Rua das Flores"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAddressNumber">Número</Label>
              <Input
                id="editAddressNumber"
                value={editAddressNumber}
                onChange={(e) => setEditAddressNumber(e.target.value)}
                placeholder="Ex: 123"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAddressNeighborhood">Bairro</Label>
              <Input
                id="editAddressNeighborhood"
                value={editAddressNeighborhood}
                onChange={(e) => setEditAddressNeighborhood(e.target.value)}
                placeholder="Ex: Centro"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAddressReference">Referência (Opcional)</Label>
              <Input
                id="editAddressReference"
                value={editAddressReference}
                onChange={(e) => setEditAddressReference(e.target.value)}
                placeholder="Ex: Próximo à padaria"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="editAddressCep">CEP</Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setEditAddressSkipCep(!editAddressSkipCep)}
                >
                  {editAddressSkipCep ? "Informar CEP" : "Não sei o CEP"}
                </Button>
              </div>
              {!editAddressSkipCep && (
                <Input
                  id="editAddressCep"
                  value={editAddressCep}
                  onChange={(e) => setEditAddressCep(e.target.value.replace(/\D/g, ''))}
                  placeholder="00000-000"
                  inputMode="numeric"
                />
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditSavedAddressDialog(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Animação de Moeda */}
      {showCoinAnimation && (
        <div className="fixed bottom-8 right-8 pointer-events-none z-50">
          <div className="animate-coin-rise">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-lg flex items-center justify-center text-xl animate-coin-spin">
              💰
            </div>
          </div>
        </div>
      )}
    </div>
  );
}