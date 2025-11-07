"use client";

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Trash2, Edit, Copy, CalendarDays, Upload, FileText, X, Loader2, Image, Video, Music, File, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, addMonths, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Draggable } from 'react-beautiful-dnd';
import { v4 as uuidv4 } from 'uuid';
import { Tables } from '@/integrations/supabase/types';

type Task = Tables<'tasks'>;
type ChecklistItem = Tables<'task_checklist_items'>;
type TaskMedia = Tables<'task_media'>;

interface TaskCardProps {
  task: Task;
  index: number;
  onUpdateTask: (updatedTask: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onDuplicateTask: (taskToDuplicate: Task) => void;
  storeId: string;
}

const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export default function TaskCard({ task, index, onUpdateTask, onDeleteTask, onDuplicateTask, storeId }: TaskCardProps) {
  const { toast } = useToast();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description || "");
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [newChecklistItemText, setNewChecklistItemText] = useState("");
  const [taskMedia, setTaskMedia] = useState<TaskMedia[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecurring, setIsRecurring] = useState(task.is_recurring);
  const [recurrenceInterval, setRecurrenceInterval] = useState(task.recurrence_interval || 'monthly');
  const [lastRecurrenceDate, setLastRecurrenceDate] = useState<Date | undefined>(task.last_recurrence_date ? parseISO(task.last_recurrence_date) : undefined);

  const loadChecklistItems = async () => {
    const { data, error } = await supabase
      .from("task_checklist_items")
      .select("*")
      .eq("task_id", task.id)
      .order("order_index");
    if (error) {
      console.error("Error loading checklist items:", error.message);
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar o checklist." });
    } else {
      setChecklistItems(data || []);
    }
  };

  const loadTaskMedia = async () => {
    const { data, error } = await supabase
      .from("task_media")
      .select("*")
      .eq("task_id", task.id);
    if (error) {
      console.error("Error loading task media:", error.message);
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as mídias." });
    } else {
      setTaskMedia(data || []);
    }
  };

  const handleOpenEditDialog = () => {
    setShowEditDialog(true);
    loadChecklistItems();
    loadTaskMedia();
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setIsRecurring(task.is_recurring);
    setRecurrenceInterval(task.recurrence_interval || 'monthly');
    setLastRecurrenceDate(task.last_recurrence_date ? parseISO(task.last_recurrence_date) : undefined);
  };

  const handleToggleCompleted = async () => {
    const newCompletedStatus = !task.is_completed;
    const { error } = await supabase
      .from("tasks")
      .update({ is_completed: newCompletedStatus })
      .eq("id", task.id);

    if (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível atualizar a tarefa." });
    } else {
      onUpdateTask({ ...task, is_completed: newCompletedStatus });
      toast({ 
        title: newCompletedStatus ? "Tarefa concluída!" : "Tarefa reaberta!",
      });
    }
  };

  const handleSaveTask = async () => {
    const { error } = await supabase
      .from("tasks")
      .update({
        title: editTitle,
        description: editDescription,
        is_recurring: isRecurring,
        recurrence_interval: isRecurring ? recurrenceInterval : null,
        last_recurrence_date: isRecurring && lastRecurrenceDate ? format(lastRecurrenceDate, "yyyy-MM-dd") : null,
      })
      .eq("id", task.id);

    if (error) {
      toast({ variant: "destructive", title: "Erro ao salvar tarefa", description: error.message });
    } else {
      onUpdateTask({ ...task, title: editTitle, description: editDescription, is_recurring: isRecurring, recurrence_interval: isRecurring ? recurrenceInterval : null, last_recurrence_date: isRecurring && lastRecurrenceDate ? format(lastRecurrenceDate, "yyyy-MM-dd") : null });
      toast({ title: "Tarefa atualizada!" });
      setShowEditDialog(false);
    }
  };

  const handleAddChecklistItem = async () => {
    if (!newChecklistItemText.trim()) return;
    const newOrderIndex = checklistItems.length > 0 ? Math.max(...checklistItems.map(item => item.order_index)) + 1 : 0;
    const { data, error } = await supabase
      .from("task_checklist_items")
      .insert({
        task_id: task.id,
        text: newChecklistItemText,
        is_completed: false,
        order_index: newOrderIndex,
      })
      .select()
      .single();
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível adicionar o item." });
    } else {
      setChecklistItems(prev => [...prev, data]);
      setNewChecklistItemText("");
    }
  };

  const handleToggleChecklistItem = async (item: ChecklistItem) => {
    const { error } = await supabase
      .from("task_checklist_items")
      .update({ is_completed: !item.is_completed })
      .eq("id", item.id);
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível atualizar o item." });
    } else {
      setChecklistItems(prev => prev.map(i => i.id === item.id ? { ...i, is_completed: !i.is_completed } : i));
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    const { error } = await supabase
      .from("task_checklist_items")
      .delete()
      .eq("id", itemId);
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir o item." });
    } else {
      setChecklistItems(prev => prev.filter(i => i.id !== itemId));
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({ variant: "destructive", title: "Arquivo muito grande", description: `O tamanho máximo permitido é ${MAX_FILE_SIZE_MB}MB.` });
      return;
    }

    setIsUploading(true);
    const filePath = `${storeId}/${task.id}/${uuidv4()}-${file.name}`;
    const { data, error: uploadError } = await supabase.storage
      .from('task-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      toast({ variant: "destructive", title: "Erro ao fazer upload", description: uploadError.message });
      setIsUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('task-media')
      .getPublicUrl(filePath);
    
    const fileUrl = publicUrlData.publicUrl;

    const { error: insertError } = await supabase
      .from("task_media")
      .insert({
        task_id: task.id,
        file_url: fileUrl,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
      });

    if (insertError) {
      toast({ variant: "destructive", title: "Erro ao salvar mídia", description: insertError.message });
    } else {
      toast({ title: "Mídia adicionada!" });
      loadTaskMedia();
    }
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear the input
    }
  };

  const handleDeleteMedia = async (mediaId: string, filePath: string) => {
    if (!confirm("Tem certeza que deseja excluir esta mídia?")) return;

    // Extract path from URL for Supabase storage deletion
    const pathSegments = filePath.split('/task-media/');
    const storagePath = pathSegments.length > 1 ? pathSegments[1] : '';

    if (!storagePath) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível determinar o caminho do arquivo no storage." });
      return;
    }

    const { error: deleteStorageError } = await supabase.storage
      .from('task-media')
      .remove([storagePath]);

    if (deleteStorageError) {
      toast({ variant: "destructive", title: "Erro ao excluir arquivo do storage", description: deleteStorageError.message });
      return;
    }

    const { error: deleteDbError } = await supabase
      .from("task_media")
      .delete()
      .eq("id", mediaId);

    if (deleteDbError) {
      toast({ variant: "destructive", title: "Erro ao excluir mídia do banco", description: deleteDbError.message });
    } else {
      toast({ title: "Mídia excluída!" });
      loadTaskMedia();
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (fileType.startsWith('video/')) return <Video className="h-4 w-4" />;
    if (fileType.startsWith('audio/')) return <Music className="h-4 w-4" />;
    if (fileType === 'application/pdf') return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const handleRecurrenceChange = (value: string) => {
    setRecurrenceInterval(value);
    if (value === 'monthly' && !lastRecurrenceDate) {
      setLastRecurrenceDate(new Date()); // Set initial date for monthly recurrence
    }
  };

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided) => (
        <Card
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="mb-3 bg-card shadow-sm hover:shadow-md transition-shadow cursor-grab"
        >
          <CardHeader className="p-3 flex flex-row items-center justify-between">
            <CardTitle className={`text-base font-semibold ${task.is_completed ? 'line-through text-muted-foreground' : ''}`}>
              {task.title}
            </CardTitle>
            <div className="flex gap-1">
              {task.is_recurring && (
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              )}
              <Button 
                variant={task.is_completed ? "default" : "ghost"} 
                size="sm" 
                className={`h-6 w-6 p-0 ${task.is_completed ? 'bg-green-500 hover:bg-green-600' : ''}`}
                onClick={handleToggleCompleted}
                title={task.is_completed ? "Marcar como não concluída" : "Marcar como concluída"}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleOpenEditDialog}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-sm text-muted-foreground">
            {task.description && <p className="line-clamp-2">{task.description}</p>}
            {checklistItems.filter(item => !item.is_completed).length > 0 && (
              <div className="flex items-center gap-1 mt-2 text-xs">
                <ChecklistIcon className="h-3 w-3" />
                <span>{checklistItems.filter(item => item.is_completed).length}/{checklistItems.length} concluídos</span>
              </div>
            )}
          </CardContent>

          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editar Tarefa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="editTitle">Título</Label>
                  <Input id="editTitle" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editDescription">Descrição</Label>
                  <Textarea id="editDescription" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} />
                </div>

                {/* Checklist */}
                <div className="space-y-2 border-t pt-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <ChecklistIcon className="h-5 w-5" /> Checklist
                  </h3>
                  <div className="space-y-2">
                    {checklistItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`item-${item.id}`}
                          checked={item.is_completed}
                          onCheckedChange={() => handleToggleChecklistItem(item)}
                        />
                        <Label htmlFor={`item-${item.id}`} className={item.is_completed ? "line-through text-muted-foreground" : ""}>
                          {item.text}
                        </Label>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto text-destructive" onClick={() => handleDeleteChecklistItem(item.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Novo item de checklist"
                      value={newChecklistItemText}
                      onChange={(e) => setNewChecklistItemText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                    />
                    <Button onClick={handleAddChecklistItem} size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Mídia */}
                <div className="space-y-2 border-t pt-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Upload className="h-5 w-5" /> Mídia
                  </h3>
                  <div className="space-y-2">
                    {taskMedia.map((media) => (
                      <div key={media.id} className="flex items-center gap-2 p-2 border rounded-md">
                        {getFileIcon(media.file_type)}
                        <a href={media.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm truncate hover:underline">
                          {media.file_name}
                        </a>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDeleteMedia(media.id, media.file_url)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Input type="file" ref={fileInputRef} onChange={handleFileUpload} disabled={isUploading} />
                  {isUploading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Tamanho máximo: {MAX_FILE_SIZE_MB}MB. Qualquer tipo de arquivo.</p>
                </div>

                {/* Recorrência */}
                <div className="space-y-2 border-t pt-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" /> Recorrência
                  </h3>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isRecurring"
                      checked={isRecurring}
                      onCheckedChange={(checked) => setIsRecurring(checked === true)}
                    />
                    <Label htmlFor="isRecurring">Tarefa Recorrente?</Label>
                  </div>
                  {isRecurring && (
                    <div className="space-y-2 mt-2">
                      <Label htmlFor="recurrenceInterval">Intervalo</Label>
                      <Select value={recurrenceInterval} onValueChange={handleRecurrenceChange}>
                        <SelectTrigger id="recurrenceInterval">
                          <SelectValue placeholder="Selecione o intervalo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          {/* <SelectItem value="weekly">Semanal</SelectItem> */}
                          {/* Adicionar outras opções de recorrência aqui */}
                        </SelectContent>
                      </Select>
                      {recurrenceInterval === 'monthly' && (
                        <div className="space-y-2 mt-2">
                          <Label htmlFor="lastRecurrenceDate">Última Data de Recorrência</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal"
                              >
                                <CalendarDays className="mr-2 h-4 w-4" />
                                {lastRecurrenceDate ? format(lastRecurrenceDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={lastRecurrenceDate}
                                onSelect={setLastRecurrenceDate}
                                initialFocus
                                locale={ptBR}
                              />
                            </PopoverContent>
                          </Popover>
                          <p className="text-xs text-muted-foreground">
                            A tarefa será duplicada no próximo mês após esta data.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="flex justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onDuplicateTask(task)}>
                    <Copy className="h-4 w-4 mr-2" /> Duplicar
                  </Button>
                  <Button variant="destructive" onClick={() => onDeleteTask(task.id)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </Button>
                </div>
                <Button onClick={handleSaveTask}>Salvar Alterações</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      )}
    </Draggable>
  );
}

// Ícone de Checklist (para evitar import circular)
const ChecklistIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
    <path d="M12 15h8"></path>
    <path d="M12 9h8"></path>
    <path d="M8 15h.01"></path>
    <path d="M8 9h.01"></path>
  </svg>
);