import { Producao } from "@/components/Producao";
import { exigirPagina } from "@/lib/pagina";
import { hasCapability } from "@/lib/roles";

export default async function ProducaoPage() {
  const session = await exigirPagina("view_producao");
  return <Producao podeApontar={hasCapability(session.user.role, "production_apontamento")} />;
}
