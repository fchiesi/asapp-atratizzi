import { Comercial } from "@/components/Comercial";
import { exigirPagina } from "@/lib/pagina";
import { hasCapability } from "@/lib/roles";

export default async function ComercialPage() {
  const session = await exigirPagina("view_pedidos");
  return <Comercial podeEditar={hasCapability(session.user.role, "write_pedidos")} />;
}
