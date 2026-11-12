import { redirect } from "next/navigation";
import { Foto } from "@/components/Foto";
import { auth } from "@/lib/auth";
import { CAPABILITY_FOTO } from "@/lib/leitura-foto";
import { paginaInicial } from "@/lib/pagina";
import { CAPABILITIES_BY_ROLE } from "@/lib/roles";

/** Lancar por foto: aberta a quem pode gravar pelo menos um tipo de documento. */
export default async function FotoPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = [...(session.user.role ? CAPABILITIES_BY_ROLE[session.user.role] : [])];
  if (!Object.values(CAPABILITY_FOTO).some((c) => caps.includes(c))) redirect(paginaInicial(session.user.role));
  return <Foto caps={caps} />;
}
