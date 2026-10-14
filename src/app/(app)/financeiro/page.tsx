import { Financeiro } from "@/components/Financeiro";
import { exigirPagina } from "@/lib/pagina";
import { mesAtual } from "@/lib/planilha";
import { hasCapability } from "@/lib/roles";

export default async function FinanceiroPage() {
  const session = await exigirPagina("view_financial");
  return <Financeiro mesInicial={mesAtual()} podeEditar={hasCapability(session.user.role, "write_financial")} />;
}
