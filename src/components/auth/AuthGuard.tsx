import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireAdminOrTechnician?: boolean;
}

const AuthGuard = ({ children, requireAdmin = false, requireAdminOrTechnician = false }: AuthGuardProps) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Sem permissão: volta para a tela inicial do próprio perfil (a rota /dashboard não existe).
  const home = role === "admin" ? "/admin" : role === "technician" ? "/admin/helpdesk" : "/helpdesk";

  if (requireAdmin && role !== "admin") {
    return <Navigate to={home} replace />;
  }

  if (requireAdminOrTechnician && role !== "admin" && role !== "technician") {
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;
