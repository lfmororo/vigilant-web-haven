import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Network, 
  Server, 
  Settings, 
  ShieldCheck, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Globe, 
  Key,
  Info,
  ExternalLink
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const GdmsTutorial = () => {
  const navigate = useNavigate();

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <Badge variant="outline" className="mb-1">Tutorial</Badge>
            <h1 className="text-3xl font-bold tracking-tight">Configuração do Gateway GDMS</h1>
            <p className="text-muted-foreground mt-1">
              Guia passo a passo para integração e gerenciamento de dispositivos Grandstream via nuvem.
            </p>
          </div>
        </div>

        {/* 1. Introdução */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">1. Introdução</h2>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p>
                O <strong>Grandstream Device Management System (GDMS)</strong> é uma plataforma de nuvem que permite o gerenciamento, provisionamento e monitoramento centralizado de dispositivos Grandstream. 
                Este guia foca na configuração do gateway para permitir que o sistema se comunique com a API da Grandstream.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" /> Pré-requisitos
                  </h3>
                  <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                    <li>Conta ativa no <a href="https://www.gdms.cloud" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">GDMS Cloud <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Perfil de desenvolvedor aprovado (API)</li>
                    <li>Dispositivos Grandstream conectados à internet</li>
                    <li>Client ID e Client Secret gerados no portal GDMS</li>
                  </ul>
                </div>
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-500" /> Segurança
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    As credenciais da API são sensíveis. O sistema armazena essas informações de forma segura para realizar a coleta automática de dados.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 2. Acesso à Interface */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">2. Acesso à Interface de Gerenciamento</h2>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm">
                Para configurar a integração, você precisará acessar o portal GDMS e obter as credenciais de autenticação.
              </p>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="flex-none flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                  <span>Acesse <strong>https://www.gdms.cloud</strong> e faça login com sua conta administradora.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-none flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                  <span>No menu lateral, navegue até <strong>System Setup</strong> &gt; <strong>API Application</strong>.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-none flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                  <span>Crie uma nova aplicação para obter o <strong>Client ID</strong> e <strong>Client Secret</strong>.</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </section>

        {/* 3. Configuração de Rede Básica */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">3. Configuração de Rede Básica</h2>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm">
                Certifique-se de que os dispositivos físicos que serão monitorados via SNMP ou provisionados via GDMS tenham acesso estável à rede.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <Server className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Endereçamento IP</p>
                    <p className="text-xs text-muted-foreground">Recomendamos IP Estático para gateways locais para evitar perdas de conexão SNMP.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <Zap className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">DNS e Gateway</p>
                    <p className="text-xs text-muted-foreground">O dispositivo deve ser capaz de resolver o domínio <code>gdms.cloud</code> para sincronização na nuvem.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 4. Configuração do Gateway GDMS no Sistema */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">4. Configuração do Gateway GDMS no Painel</h2>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm">
                Siga estes passos dentro deste painel administrativo para ativar o monitoramento:
              </p>
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Passo a Passo no Painel</h4>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Vá em <strong>Monitoramento</strong> &gt; <strong>Dispositivos</strong>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Clique em <strong>Novo Dispositivo</strong> e selecione o Tipo <strong>Grandstream</strong>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Clique no botão <strong>Testar Conexão GDMS</strong> para validar suas credenciais
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Insira o seu <strong>ID da Conta</strong>, <strong>Client ID</strong> e <strong>Secret</strong>
                    </li>
                  </ul>
                </div>
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 text-yellow-600 rounded-md border border-yellow-500/20 text-xs">
                  <Key className="w-4 h-4 shrink-0" />
                  As credenciais OAuth2 garantem que o sistema possa buscar status de portas, uptime e alertas sem intervenção manual.
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 5. Configurações Avançadas */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">5. Configurações Avançadas</h2>
          </div>
          <Card>
            <CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
              <div className="border p-4 rounded-lg">
                <h3 className="font-medium text-sm mb-1">VPN e Firewall</h3>
                <p className="text-xs text-muted-foreground">
                  Caso o monitoramento seja feito via SNMP (Local), certifique-se de que a porta 161 (UDP) esteja aberta no firewall e que exista uma rota para o coletor.
                </p>
              </div>
              <div className="border p-4 rounded-lg">
                <h3 className="font-medium text-sm mb-1">Logs de Sincronização</h3>
                <p className="text-xs text-muted-foreground">
                  O sistema mantém logs de cada tentativa de polling com a GDMS. Verifique "Último Erro" na lista de dispositivos caso o status esteja "Offline".
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 6. Solução de Problemas */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">6. Solução de Problemas Comuns</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-destructive/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
                  Falha de Autenticação (401)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Geralmente causado por <strong>Client Secret</strong> incorreto ou aplicação de API expirada no portal GDMS. Verifique se a região (Global vs Europa) está correta.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Dispositivo não aparece na API
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Certifique-se de que o dispositivo foi adicionado ao seu portal GDMS Cloud e está vinculado à mesma conta usada para gerar o Client ID.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Timeout de Rede
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Verifique se o servidor onde o coletor está rodando possui acesso de saída para os domínios da Grandstream.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  SNMP Não Responde
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Confirme se a <strong>SNMP Community</strong> configurada no dispositivo físico é a mesma informada no cadastro deste painel.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 7. Conclusão */}
        <section className="space-y-4 pt-6">
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 mx-auto" />
              <div>
                <h2 className="text-xl font-bold">Configuração Concluída!</h2>
                <p className="text-sm opacity-90 mt-2">
                  Com o gateway configurado, o sistema iniciará a coleta automática de status e performance dos seus dispositivos Grandstream.
                </p>
              </div>
              <Button variant="secondary" onClick={() => navigate("/admin/mikrotik")}>
                Ir para Monitoramento
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </AdminLayout>
  );
};

export default GdmsTutorial;
