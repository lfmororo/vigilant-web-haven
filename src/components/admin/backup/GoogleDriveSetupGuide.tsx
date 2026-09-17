import { CheckCircle2, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const GOOGLE_CLOUD_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials";

interface TutorialStepProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

function TutorialStep({ number, title, children }: TutorialStepProps) {
  return (
    <div className="grid grid-cols-[2rem_1fr] gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {number}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <div className="text-sm leading-6 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export interface GoogleDriveSetupGuideProps {
  redirectUri: string;
}

export function GoogleDriveSetupGuide({ redirectUri }: GoogleDriveSetupGuideProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" /> Como cadastrar e autorizar o Google Drive
        </CardTitle>
        <CardDescription>
          Faça o cadastro uma vez no Google e autorize cada servidor usando a conta que receberá os backups.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={["cadastro", "autorizacao"]} className="w-full">
          <AccordionItem value="cadastro">
            <AccordionTrigger>1. Criar as credenciais no Google</AccordionTrigger>
            <AccordionContent className="space-y-5">
              <Button asChild variant="outline" size="sm">
                <a href={GOOGLE_CLOUD_CONSOLE_URL} target="_blank" rel="noreferrer">
                  Abrir Google Cloud Console <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <TutorialStep number={1} title="Crie ou selecione um projeto">
                No topo da página, escolha um projeto existente ou crie um projeto exclusivo para os backups.
              </TutorialStep>
              <TutorialStep number={2} title="Ative a API do Google Drive">
                Acesse <strong>APIs e serviços → Biblioteca</strong>, procure por <strong>Google Drive API</strong> e clique em
                <strong> Ativar</strong>.
              </TutorialStep>
              <TutorialStep number={3} title="Configure a tela de consentimento">
                Em <strong>APIs e serviços → Tela de consentimento OAuth</strong>, informe o nome do aplicativo e o e-mail de
                suporte. Se o aplicativo estiver em teste, adicione como usuário de teste a conta Google que armazenará os backups.
              </TutorialStep>
              <TutorialStep number={4} title="Crie o acesso OAuth">
                Em <strong>Credenciais</strong>, escolha <strong>Criar credenciais → ID do cliente OAuth</strong> e selecione
                <strong> Aplicativo para computador</strong>. Essa opção evita divergências no endereço de retorno.
              </TutorialStep>
              <TutorialStep number={5} title="Copie os dois dados">
                Copie o <strong>ID do cliente</strong> e a <strong>chave secreta do cliente</strong>. Cole nos campos Google Client ID
                e Google Client Secret acima e clique em <strong>Salvar configuração</strong>.
              </TutorialStep>
              <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
                Se utilizar uma credencial do tipo <strong>Aplicativo da Web</strong>, adicione exatamente este endereço em
                <strong> URIs de redirecionamento autorizados</strong>:
                <code className="mt-2 block overflow-x-auto text-xs text-foreground">{redirectUri}</code>
                <p className="mt-2"><strong>localhost</strong> e <strong>127.0.0.1</strong> são endereços diferentes para o Google.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="autorizacao">
            <AccordionTrigger>2. Autorizar o agente no servidor</AccordionTrigger>
            <AccordionContent className="space-y-5">
              <TutorialStep number={1} title="Baixe e extraia o pacote">
                Salve o pacote do agente no servidor e extraia todos os arquivos para uma pasta permanente.
              </TutorialStep>
              <TutorialStep number={2} title="Execute como administrador">
                Clique com o botão direito em <strong>instalar.cmd</strong> e escolha <strong>Executar como administrador</strong>.
                O instalador solicitará as pastas que serão copiadas.
              </TutorialStep>
              <TutorialStep number={3} title="Entre na conta Google">
                O navegador abrirá a autorização. Entre na conta que receberá os backups, confirme o acesso ao Google Drive e aguarde
                a mensagem de autorização concluída.
              </TutorialStep>
              <TutorialStep number={4} title="Se o navegador não abrir">
                Execute <strong>autorizar-google.cmd</strong>, copie o endereço exibido e abra-o no navegador do mesmo servidor.
                Depois de autorizar, feche a janela e conclua a instalação.
              </TutorialStep>
              <div className="flex gap-3 rounded-md border border-border p-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  A autorização fica salva somente no servidor. Não compartilhe a pasta do agente nem os arquivos de configuração.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="verificacao">
            <AccordionTrigger>3. Confirmar o primeiro backup</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Execute <strong>executar-backup.cmd</strong> e confirme estes resultados antes de deixar o agente como serviço:
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  "A execução termina sem erro de autorização.",
                  "A pasta configurada aparece no Google Drive.",
                  "O progresso e a conclusão aparecem neste menu Backup.",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {item}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}