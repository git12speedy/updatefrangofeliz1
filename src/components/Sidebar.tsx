import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Gift,
  BarChart2,
  Settings,
  Package,
  Store,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Monitor,
  LogOut, // Importando o ícone de LogOut
  DollarSign, // NOVO: Importando DollarSign para Assinaturas
  ListTodo, // NOVO: Importando ListTodo para Tarefas
  Users, // NOVO: Importando Users para Cadastros
  Wallet, // NOVO: Importando Wallet para Finanças
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { useSidebar } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import NotificationCenter from '@/components/NotificationCenter';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  roles?: string[]; // Define quais roles podem ver este item (se não definido, todos veem)
  hideForAdmin?: boolean; // NOVO: Se true, este item será ocultado para admins
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'PDV', href: '/pdv', icon: ShoppingCart, hideForAdmin: true },
  { name: 'Painel de Pedidos', href: '/painel', icon: ClipboardList, hideForAdmin: true },
  { name: 'Fidelidade', href: '/fidelidade', icon: Gift, hideForAdmin: true },
  { name: 'Produtos', href: '/produtos', icon: ShoppingCart, hideForAdmin: true },
  { name: 'Estoque', href: '/estoque', icon: Package, hideForAdmin: true },
  { name: 'Marketing', href: '/marketing', icon: Megaphone, hideForAdmin: true },
  { name: 'Tarefas', href: '/tarefas', icon: ListTodo, hideForAdmin: true }, // NOVO: Item de Tarefas
  { name: 'Cadastros', href: '/cadastros', icon: Users, hideForAdmin: true }, // NOVO: Item de Cadastros
  { name: 'Minhas Finanças', href: '/financas', icon: Wallet, hideForAdmin: true }, // NOVO: Item de Finanças
  { name: 'Relatórios', href: '/relatorios', icon: BarChart2 },
  { name: 'Minha Loja', href: '/minha-loja', icon: Store, hideForAdmin: true },
  { name: 'Lojas', href: '/lojas', icon: Store, roles: ['admin'] }, // Apenas admins veem
  { name: 'Assinaturas', href: '/assinaturas', icon: DollarSign, roles: ['admin'] }, // NOVO: Apenas admins veem
  { name: 'Configurações', href: '/configuracoes', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const { profile, isAdmin, signOut } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();

  const filteredNavItems = navItems.filter(item => {
    // Se o item tem 'roles' e o usuário NÃO tem a role necessária, oculta.
    if (item.roles && !item.roles.some(role => (isAdmin && role === 'admin'))) {
      return false;
    }
    // Se o item tem 'hideForAdmin' como true e o usuário é admin, oculta.
    if (item.hideForAdmin && isAdmin) {
      return false;
    }
    return true;
  });

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col border-r bg-sidebar transition-all duration-300',
        isCollapsed ? 'w-20' : 'w-64'
      )}
    >
      <div className="flex items-center justify-between p-4 h-16">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-sidebar-primary truncate">Food Flow</h2>
            <NotificationCenter />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </Button>
      </div>
      <Separator className="bg-sidebar-border" />
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className={cn(
                    'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    isCollapsed && 'justify-center'
                  )}
                >
                  <Icon className={cn('h-5 w-5', !isCollapsed && 'mr-3')} />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto p-4 text-center text-xs text-sidebar-foreground">
        {!isCollapsed && (
          <>
            <p className="font-semibold">{profile?.full_name || 'Usuário'}</p>
            <p className="text-muted-foreground">{profile?.email}</p>
          </>
        )}
        {/* Botão de Deslogar */}
        <Button
          variant="ghost"
          className={cn(
            "w-full mt-2 flex items-center",
            isCollapsed ? "justify-center" : "justify-start"
          )}
          onClick={signOut}
        >
          <LogOut className={cn('h-5 w-5', !isCollapsed && 'mr-3')} />
          {!isCollapsed && <span className="truncate">Deslogar</span>}
        </Button>
      </div>
    </aside>
  );
}