"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, LayoutDashboard, Loader2, Settings } from "lucide-react";
import { supabase as sb } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import TaskColumn from "@/components/TaskColumn";
import { DragDropContext, Droppable, DropResult } from 'react-beautiful-dnd';
import { format, addMonths, isBefore, parseISO } from 'date-fns';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types'; // Import Tables

type TaskColumnData = Tables<'task_columns'>;
type TaskData = Tables<'tasks'>;
type ChecklistItemInsert = TablesInsert<'task_checklist_items'>;
type TaskMediaInsert = TablesInsert<'task_media'>;

export default function Tasks() {
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [columns, setColumns] = useState<TaskColumnData[]>([]);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [taskNotificationsEnabled, setTaskNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('task_notifications_enabled');
    return saved ? JSON.parse(saved) : true;
  });

  const supabase = sb;

  // Salvar preferência de notificações
  useEffect(() => {
    localStorage.setItem('task_notifications_enabled', JSON.stringify(taskNotificationsEnabled));
  }, [taskNotificationsEnabled]);

  const loadColumnsAndTasks = useCallback(async () => {
    if (!profile?.store_id) return;

    setLoading(true);
    const { data: columnsData, error: columnsError } = await supabase
      .from("task_columns")
      .select("*")
      .eq("store_id", profile.store_id)
      .order("order_index");

    if (columnsError) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as colunas." });
      setLoading(false);
      return;
    }

    const { data: tasksData, error: tasksError } = await supabase
      .from("tasks")
      .select("*")
      .eq("store_id", profile.store_id)
      .order("order_index");

    if (tasksError) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as tarefas." });
      setLoading(false);
      return;
    }

    setColumns(columnsData || []);
    setTasks(tasksData || []);
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => {
    if (!authLoading && profile?.store_id) {
      loadColumnsAndTasks();
    }
  }, [authLoading, profile, loadColumnsAndTasks]);

  // Handle recurring tasks on load
  useEffect(() => {
    if (!loading && tasks.length > 0) {
      const today = new Date();
      const tasksToDuplicate: TaskData[] = [];

      tasks.forEach(task => {
        if (task.is_recurring && task.recurrence_interval === 'monthly' && task.last_recurrence_date) {
          const lastRecurrence = parseISO(task.last_recurrence_date);
          const nextRecurrenceMonth = addMonths(lastRecurrence, 1);

          // If the next recurrence month is before or is the current month
          if (isBefore(nextRecurrenceMonth, addMonths(today, 1)) && !isBefore(nextRecurrenceMonth, lastRecurrence)) {
            tasksToDuplicate.push(task);
          }
        }
      });

      if (tasksToDuplicate.length > 0) {
        handleDuplicateRecurringTasks(tasksToDuplicate);
      }
    }
  }, [loading, tasks]); // Only run when tasks are loaded and not loading

  const handleDuplicateRecurringTasks = async (tasksToDuplicate: TaskData[]) => {
    const newTasks: TaskData[] = [];
    const updatePromises: Promise<void>[] = []; // Explicitly type as Promise<void>[]

    for (const originalTask of tasksToDuplicate) {
      const newLastRecurrenceDate = format(addMonths(parseISO(originalTask.last_recurrence_date || new Date().toISOString()), 1), "yyyy-MM-dd");
      
      // Create new task
      const { data: newTask, error: newTaskError } = await supabase
        .from("tasks")
        .insert({
          store_id: originalTask.store_id,
          column_id: originalTask.column_id,
          title: originalTask.title,
          description: originalTask.description,
          order_index: originalTask.order_index + 1, // Place it after the original
          is_recurring: originalTask.is_recurring,
          recurrence_interval: originalTask.recurrence_interval,
          last_recurrence_date: newLastRecurrenceDate, // New task gets updated recurrence date
        })
        .select()
        .single();

      if (newTaskError) {
        console.error("Error duplicating recurring task:", newTaskError.message);
        continue;
      }
      newTasks.push(newTask);

      // Duplicate checklist items
      const { data: originalChecklist, error: checklistError } = await supabase
        .from("task_checklist_items")
        .select("*")
        .eq("task_id", originalTask.id);
      
      if (!checklistError && originalChecklist) {
        const newChecklistItems: ChecklistItemInsert[] = originalChecklist.map(item => ({
          task_id: newTask.id,
          text: item.text,
          is_completed: false, // New items are not completed
          order_index: item.order_index,
        }));
        await supabase.from("task_checklist_items").insert(newChecklistItems);
      }

      // Duplicate media (optional, might be too much for recurring tasks)
      const { data: originalMedia, error: mediaError } = await supabase
        .from("task_media")
        .select("*")
        .eq("task_id", originalTask.id);

      if (!mediaError && originalMedia) {
        for (const media of originalMedia) {
          const newMedia: TaskMediaInsert = {
            task_id: newTask.id,
            file_url: media.file_url,
            file_name: media.file_name,
            file_type: media.file_type,
            file_size: media.file_size,
          };
          await supabase.from("task_media").insert(newMedia);
        }
      }

      // Update original task's last_recurrence_date to prevent immediate re-duplication
      updatePromises.push(
        (async () => {
          const { error } = await supabase.from("tasks")
            .update({ last_recurrence_date: newLastRecurrenceDate })
            .eq("id", originalTask.id);
          if (error) {
            console.error("Error updating original task's last_recurrence_date:", error.message);
          }
        })()
      );
    }

    await Promise.all(updatePromises);
    if (newTasks.length > 0) {
      toast({ title: "Tarefas recorrentes criadas!", description: `${newTasks.length} tarefas foram duplicadas para o próximo período.` });
      loadColumnsAndTasks(); // Reload all data
    }
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    if (!profile?.store_id) return;

    const newOrderIndex = columns.length > 0 ? Math.max(...columns.map(col => col.order_index)) + 1 : 0;

    const { error } = await supabase
      .from("task_columns")
      .insert({
        store_id: profile.store_id,
        name: newColumnName,
        order_index: newOrderIndex,
      });

    if (error) {
      toast({ variant: "destructive", title: "Erro ao criar coluna", description: error.message });
    } else {
      toast({ title: "Coluna criada!" });
      setNewColumnName("");
      setShowAddColumnDialog(false);
      loadColumnsAndTasks();
    }
  };

  const handleUpdateColumn = (updatedColumn: TaskColumnData) => {
    setColumns(prev => prev.map(col => col.id === updatedColumn.id ? updatedColumn : col));
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta coluna? Todas as tarefas nela serão excluídas permanentemente.")) return;

    const { error } = await supabase
      .from("task_columns")
      .delete()
      .eq("id", columnId);

    if (error) {
      toast({ variant: "destructive", title: "Erro ao excluir coluna", description: error.message });
    } else {
      toast({ title: "Coluna excluída!" });
      loadColumnsAndTasks();
    }
  };

  const handleAddTask = async (columnId: string, title: string) => {
    if (!profile?.store_id) return;

    const columnTasks = tasks.filter(task => task.column_id === columnId);
    const newOrderIndex = columnTasks.length > 0 ? Math.max(...columnTasks.map(task => task.order_index)) + 1 : 0;

    const { error } = await supabase
      .from("tasks")
      .insert({
        store_id: profile.store_id,
        column_id: columnId,
        title: title,
        description: null,
        order_index: newOrderIndex,
      });

    if (error) {
      toast({ variant: "destructive", title: "Erro ao adicionar tarefa", description: error.message });
    } else {
      toast({ title: "Tarefa adicionada!" });
      loadColumnsAndTasks();
    }
  };

  const handleUpdateTask = (updatedTask: TaskData) => {
    setTasks(prev => prev.map(task => task.id === updatedTask.id ? updatedTask : task));
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta tarefa?")) return;

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      toast({ variant: "destructive", title: "Erro ao excluir tarefa", description: error.message });
    } else {
      toast({ title: "Tarefa excluída!" });
      loadColumnsAndTasks();
    }
  };

  const handleDuplicateTask = async (taskToDuplicate: TaskData) => {
    if (!profile?.store_id) return;

    const newOrderIndex = tasks.filter(t => t.column_id === taskToDuplicate.column_id).length > 0
      ? Math.max(...tasks.filter(t => t.column_id === taskToDuplicate.column_id).map(t => t.order_index)) + 1
      : 0;

    const { data: newTask, error: newTaskError } = await supabase
      .from("tasks")
      .insert({
        store_id: profile.store_id,
        column_id: taskToDuplicate.column_id,
        title: `${taskToDuplicate.title} (Cópia)`,
        description: taskToDuplicate.description,
        order_index: newOrderIndex,
        is_recurring: false, // Duplicated task is not recurring by default
        recurrence_interval: null,
        last_recurrence_date: null,
      })
      .select()
      .single();

    if (newTaskError) {
      toast({ variant: "destructive", title: "Erro ao duplicar tarefa", description: newTaskError.message });
      return;
    }

    // Duplicate checklist items
    const { data: originalChecklist, error: checklistError } = await supabase
      .from("task_checklist_items")
      .select("*")
      .eq("task_id", taskToDuplicate.id);
    
    if (!checklistError && originalChecklist) {
      const newChecklistItems: ChecklistItemInsert[] = originalChecklist.map(item => ({
        task_id: newTask.id,
        text: item.text,
        is_completed: false,
        order_index: item.order_index,
      }));
      await supabase.from("task_checklist_items").insert(newChecklistItems);
    }

    // Duplicate media
    const { data: originalMedia, error: mediaError } = await supabase
      .from("task_media")
      .select("*")
      .eq("task_id", taskToDuplicate.id);

    if (!mediaError && originalMedia) {
      for (const media of originalMedia) {
        const newMedia: TaskMediaInsert = {
          task_id: newTask.id,
          file_url: media.file_url,
          file_name: media.file_name,
          file_type: media.file_type,
          file_size: media.file_size,
        };
        await supabase.from("task_media").insert(newMedia);
      }
    }

    toast({ title: "Tarefa duplicada!" });
    loadColumnsAndTasks();
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    const startColumn = columns.find(col => col.id === source.droppableId);
    const endColumn = columns.find(col => col.id === destination.droppableId);

    if (!startColumn || !endColumn) return;

    // Moving task within the same column
    if (startColumn.id === endColumn.id) {
      const newTasks = Array.from(tasks);
      const draggedTask = newTasks.find(task => task.id === draggableId);
      if (!draggedTask) return;

      const columnTasks = newTasks.filter(task => task.column_id === startColumn.id).sort((a, b) => a.order_index - b.order_index);
      const [removed] = columnTasks.splice(source.index, 1);
      columnTasks.splice(destination.index, 0, removed);

      const updatedTasksInColumn = columnTasks.map((task, index) => ({
        ...task,
        order_index: index,
      }));

      setTasks(prev => prev.map(task => {
        const updated = updatedTasksInColumn.find(ut => ut.id === task.id);
        return updated || task;
      }));

      // Persist order to DB
      const updatePromises = updatedTasksInColumn.map(task =>
        supabase.from("tasks").update({ order_index: task.order_index }).eq("id", task.id).then(() => {})
      );
      await Promise.all(updatePromises);

    } else { // Moving task to a different column
      const newTasks = Array.from(tasks);
      const draggedTask = newTasks.find(task => task.id === draggableId);
      if (!draggedTask) return;

      // Remove from old column
      const startColumnTasks = newTasks.filter(task => task.column_id === startColumn.id).sort((a, b) => a.order_index - b.order_index);
      startColumnTasks.splice(source.index, 1);

      // Add to new column
      const endColumnTasks = newTasks.filter(task => task.column_id === endColumn.id).sort((a, b) => a.order_index - b.order_index);
      endColumnTasks.splice(destination.index, 0, { ...draggedTask, column_id: endColumn.id });

      // Re-index both columns
      const updatedStartColumnTasks = startColumnTasks.map((task, index) => ({ ...task, order_index: index }));
      const updatedEndColumnTasks = endColumnTasks.map((task, index) => ({ ...task, order_index: index }));

      setTasks(prev => prev.map(task => {
        const updated = updatedStartColumnTasks.find(ut => ut.id === task.id) || updatedEndColumnTasks.find(ut => ut.id === task.id);
        return updated || task;
      }));

      // Persist changes to DB
      const updatePromises = [
        ...updatedStartColumnTasks.map(task =>
          supabase.from("tasks").update({ order_index: task.order_index }).eq("id", task.id).then(() => {})
        ),
        ...updatedEndColumnTasks.map(task =>
          supabase.from("tasks").update({ column_id: task.column_id, order_index: task.order_index }).eq("id", task.id).then(() => {})
        ),
      ];
      await Promise.all(updatePromises);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Carregando tarefas...</p>
      </div>
    );
  }

  if (!profile?.store_id) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Você precisa estar vinculado a uma loja para gerenciar tarefas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tarefas</h1>
          <p className="text-muted-foreground">Organize suas atividades no formato Kanban</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettingsDialog(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Configurações
          </Button>
          <Dialog open={showAddColumnDialog} onOpenChange={setShowAddColumnDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Coluna
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Coluna</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Input
                  placeholder="Nome da coluna"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddColumnDialog(false)}>Cancelar</Button>
                <Button onClick={handleAddColumn}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="all-columns" direction="horizontal" type="column">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="flex gap-6 overflow-x-auto pb-4"
            >
              {columns.map((column) => (
                <TaskColumn
                  key={column.id}
                  column={column}
                  tasks={tasks.filter(task => task.column_id === column.id).sort((a, b) => a.order_index - b.order_index)}
                  onAddTask={handleAddTask}
                  onUpdateTask={handleUpdateTask}
                  onDeleteTask={handleDeleteTask}
                  onDuplicateTask={handleDuplicateTask}
                  onUpdateColumn={handleUpdateColumn}
                  onDeleteColumn={handleDeleteColumn}
                  storeId={profile.store_id || ''}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Dialog de Configurações */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Configurações de Tarefas</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Toggle de Notificações de Tarefas */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Notificações de Tarefas</label>
                <p className="text-xs text-muted-foreground">
                  Receber notificações 1 dia antes e no dia de vencimento das tarefas
                </p>
              </div>
              <Switch
                checked={taskNotificationsEnabled}
                onCheckedChange={setTaskNotificationsEnabled}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSettingsDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}