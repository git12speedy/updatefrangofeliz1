"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase as sb } from "@/integrations/supabase/client";
import { differenceInDays, parseISO, startOfDay } from "date-fns";

const supabase: any = sb;

interface Notification {
  id: string;
  message: string;
  timestamp: string;
  type: 'order' | 'stock' | 'task';
  read: boolean;
}

export default function NotificationCenter() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [lastOrderCheck, setLastOrderCheck] = useState<string | null>(null);
  const [notifiedTasks, setNotifiedTasks] = useState<Set<string>>(new Set());

  // Carregar preferências de notificação
  const getTaskNotificationEnabled = useCallback(() => {
    const saved = localStorage.getItem('task_notifications_enabled');
    return saved ? JSON.parse(saved) : true; // Ativado por padrão
  }, []);

  // Verificar estoque baixo
  const checkLowStock = useCallback(async () => {
    if (!profile?.store_id) return;

    const { data: store } = await supabase
      .from('stores')
      .select('ifood_stock_alert_enabled, ifood_stock_alert_threshold')
      .eq('id', profile.store_id)
      .single();

    if (!store?.ifood_stock_alert_enabled) return;

    const { data: products } = await supabase
      .from('products')
      .select('id, name, stock_quantity')
      .eq('store_id', profile.store_id)
      .eq('active', true)
      .lte('stock_quantity', store.ifood_stock_alert_threshold || 0);

    if (products && products.length > 0) {
      products.forEach(product => {
        const existingNotif = notifications.find(n => 
          n.type === 'stock' && n.message.includes(product.name)
        );
        
        if (!existingNotif) {
          const newNotif: Notification = {
            id: `stock-${product.id}-${Date.now()}`,
            message: `Estoque baixo: ${product.name} (${product.stock_quantity} unidades)`,
            timestamp: new Date().toISOString(),
            type: 'stock',
            read: false,
          };
          setNotifications(prev => [newNotif, ...prev]);
        }
      });
    }
  }, [profile, notifications]);

  // Verificar tarefas próximas ao prazo
  const checkUpcomingTasks = useCallback(async () => {
    if (!profile?.store_id || !getTaskNotificationEnabled()) return;

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, due_date')
      .eq('store_id', profile.store_id)
      .not('due_date', 'is', null);

    if (tasks && tasks.length > 0) {
      const today = startOfDay(new Date());
      
      tasks.forEach(task => {
        if (!task.due_date) return;
        
        const dueDate = startOfDay(parseISO(task.due_date));
        const daysUntilDue = differenceInDays(dueDate, today);
        
        // Notificar 1 dia antes
        if (daysUntilDue === 1 && !notifiedTasks.has(`${task.id}-1day`)) {
          const newNotif: Notification = {
            id: `task-${task.id}-1day-${Date.now()}`,
            message: `Tarefa "${task.title}" vence amanhã!`,
            timestamp: new Date().toISOString(),
            type: 'task',
            read: false,
          };
          setNotifications(prev => [newNotif, ...prev]);
          setNotifiedTasks(prev => new Set(prev).add(`${task.id}-1day`));
        }
        
        // Notificar no dia
        if (daysUntilDue === 0 && !notifiedTasks.has(`${task.id}-today`)) {
          const newNotif: Notification = {
            id: `task-${task.id}-today-${Date.now()}`,
            message: `Tarefa "${task.title}" vence hoje!`,
            timestamp: new Date().toISOString(),
            type: 'task',
            read: false,
          };
          setNotifications(prev => [newNotif, ...prev]);
          setNotifiedTasks(prev => new Set(prev).add(`${task.id}-today`));
        }
      });
    }
  }, [profile, getTaskNotificationEnabled, notifiedTasks]);

  // Monitorar novos pedidos
  useEffect(() => {
    if (!profile?.store_id) return;

    const channel = supabase
      .channel('new-orders-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${profile.store_id}`,
        },
        (payload: any) => {
          const order = payload.new;
          const newNotif: Notification = {
            id: `order-${order.id}-${Date.now()}`,
            message: `Novo pedido #${order.order_number} recebido!`,
            timestamp: order.created_at,
            type: 'order',
            read: false,
          };
          setNotifications(prev => [newNotif, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.store_id]);

  // Verificar estoque e tarefas periodicamente
  useEffect(() => {
    if (!profile?.store_id) return;

    // Verificação inicial
    checkLowStock();
    checkUpcomingTasks();

    // Verificar a cada 5 minutos
    const interval = setInterval(() => {
      checkLowStock();
      checkUpcomingTasks();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [profile?.store_id, checkLowStock, checkUpcomingTasks]);

  const handleDismiss = (id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  const handleClearAll = () => {
    setNotifications([]);
    toast({ title: "Todas as notificações limpas." });
    setIsDialogOpen(false);
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {notifications.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Notificações ({notifications.length})</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[300px] py-4">
          <div className="space-y-3 pr-4">
            {notifications.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma notificação.</p>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} className="flex items-center justify-between p-3 bg-accent rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{notif.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(notif.timestamp).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDismiss(notif.id)}>
                    OK
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={handleClearAll} disabled={notifications.length === 0}>
            Limpar Tudo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}