import { Estoque } from "@/components/Estoque";
import { exigirPagina } from "@/lib/pagina";
import { hasCapability } from "@/lib/roles";

export default async function EstoquePage() {
  const session = await exigirPagina("view_estoque");
  const role = session.user.role;
  return (
    <Estoque
      podeMovimentar={hasCapability(role, "write_estoque")}
      podeLancarConta={hasCapability(role, "write_financial")}
    />
  );
}
