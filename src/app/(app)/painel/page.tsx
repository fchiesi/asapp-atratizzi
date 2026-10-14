import { PainelMetas } from "@/components/PainelMetas";
import { exigirPagina } from "@/lib/pagina";
import { mesAtual } from "@/lib/planilha";

export default async function PainelPage() {
  await exigirPagina("view_metas");
  return <PainelMetas mesInicial={mesAtual()} />;
}
