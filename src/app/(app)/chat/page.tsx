import { Chat } from "@/components/Chat";
import { exigirPagina } from "@/lib/pagina";

export default async function ChatPage() {
  await exigirPagina("use_chat");
  return <Chat />;
}
