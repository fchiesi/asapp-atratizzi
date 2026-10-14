import { Pedidos } from "@/components/Pedidos";
import { exigirPagina } from "@/lib/pagina";
import { hasCapability } from "@/lib/roles";

export default async function PedidosPage() {
  const session = await exigirPagina("view_pedidos");
  return <Pedidos podeEditar={hasCapability(session.user.role, "write_pedidos")} />;
}
