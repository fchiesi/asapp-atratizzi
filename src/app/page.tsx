import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { paginaInicial } from "@/lib/pagina";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(paginaInicial(session.user.role));
}
