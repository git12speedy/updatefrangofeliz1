import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase as sb } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast"; // Importando useToast

const supabase: any = sb;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  profile: any;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast(); // Inicializando useToast

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            loadProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        loadProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      
      setProfile(profileData);

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      
      setIsAdmin(rolesData?.some(r => r.role === "admin") ?? false);
    } catch (error) {
      console.error("Error loading profile:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar perfil",
        description: (error as Error).message,
      });
    }
  };

  const signIn = async (email: string, password: string, rememberMe: boolean = false) => {
    // Configurar a persistência da sessão antes do login
    if (rememberMe) {
      // Se "lembrar de mim" estiver marcado, usar persistência local (1 ano)
      await supabase.auth.setSession({
        access_token: '',
        refresh_token: ''
      });
    }
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        // Se rememberMe estiver true, a sessão persiste por mais tempo
        // Caso contrário, usa o padrão do Supabase
      }
    });
    
    if (!error && rememberMe) {
      // Armazenar flag de "lembrar de mim" no localStorage
      localStorage.setItem('rememberMe', 'true');
      // Definir um timestamp de expiração de 1 ano
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      localStorage.setItem('sessionExpiry', oneYearFromNow.toISOString());
    } else if (!error) {
      // Limpar flags se não marcou "lembrar de mim"
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('sessionExpiry');
    }
    
    if (!error) {
      navigate("/");
    }
    
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    
    return { error };
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      // Limpar flags de "lembrar de mim"
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('sessionExpiry');
      
      if (error) {
        console.error("Error during signOut:", error);
        toast({
          variant: "destructive",
          title: "Erro ao sair",
          description: error.message,
        });
      } else {
        toast({
          title: "Deslogado com sucesso!",
          description: "Você foi desconectado do sistema.",
        });
      }
    } catch (error) {
      console.error("Unexpected error during signOut:", error);
      toast({
        variant: "destructive",
        title: "Erro inesperado ao sair",
        description: (error as Error).message,
      });
    } finally {
      // Sempre navega para o login, mesmo que signOut tenha um erro,
      // para garantir que a UI reflita um estado deslogado.
      navigate("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, signUp, signOut, profile, isAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}