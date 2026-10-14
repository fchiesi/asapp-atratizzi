import { redirect } from "next/navigation";
import { SidebarClient } from "@/components/SidebarClient";
import { auth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
      <SidebarClient userEmail={session.user.email} userName={session.user.name} userRole={session.user.role} />
      <main className="flex-1 overflow-auto w-full lg:w-auto">{children}</main>
    </div>
  );
}
