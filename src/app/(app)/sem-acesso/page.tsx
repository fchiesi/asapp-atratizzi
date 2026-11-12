import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { paginaInicial } from "@/lib/pagina";

/** Destino de quem entrou mas nao tem nenhuma pagina liberada. */
export default async function SemAcessoPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const destino = paginaInicial(session.user.role);
  if (destino !== "/sem-acesso") redirect(destino);
  return (
    <div className="min-h-screen p-6 pb-28 lg:pb-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-3">Sem acesso liberado</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Voce entrou como <b>{session.user.email}</b>, mas ainda nao ha nenhuma area do ASApp liberada para o seu
        usuario. Fale com o Fernando.
      </p>
    </div>
  );
}
