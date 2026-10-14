"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CAPABILITIES_BY_ROLE,
  ROLE_LABEL,
  type Capability,
  type Role,
} from "@/lib/roles";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  requires: Capability;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/painel", label: "Painel de metas", icon: "🎯", requires: "view_metas" },
  { href: "/comercial", label: "Orcamentos e clientes", icon: "💼", requires: "view_pedidos" },
  { href: "/pedidos", label: "Pedidos", icon: "📦", requires: "view_pedidos" },
  { href: "/producao", label: "Producao", icon: "🏭", requires: "view_producao" },
  { href: "/financeiro", label: "Financeiro", icon: "💰", requires: "view_financial" },
  { href: "/chat", label: "Chat IA", icon: "💬", requires: "use_chat" },
];

interface Props {
  userEmail?: string | null;
  userName?: string | null;
  userRole?: Role;
}

export function SidebarClient({ userEmail, userName, userRole }: Props) {
  const userCaps = userRole ? CAPABILITIES_BY_ROLE[userRole] : [];
  const visibleNav = NAV_ITEMS.filter((item) => userCaps.includes(item.requires));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });
  const pathname = usePathname();

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <>
      {/* Hamburger button - mobile only */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-40 lg:hidden bg-gray-900 text-white p-2 rounded-lg shadow-lg"
        aria-label="Abrir menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Backdrop - mobile only */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">ASApp</h1>
            <p className="text-xs text-gray-400 mt-1">Atratizzi · Blumenau</p>
          </div>
          {/* Close button - mobile only */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white transition"
            aria-label="Fechar menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {visibleNav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href + "/"));
            return (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                active={active}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* User info + theme + sign out */}
        <div className="p-4 border-t border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{userName ?? "Usuario"}</p>
              <p className="text-xs text-gray-400 truncate">{userEmail}</p>
              {userRole && (
                <p className="text-[10px] text-teal-400 mt-0.5 uppercase tracking-wide">
                  {ROLE_LABEL[userRole]}
                </p>
              )}
            </div>
            <button
              onClick={toggleDark}
              className="p-2 rounded-lg hover:bg-gray-800 transition text-gray-400 hover:text-white flex-shrink-0"
              title={dark ? "Modo claro" : "Modo escuro"}
            >
              {dark ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full text-xs text-gray-400 hover:text-white transition text-left"
          >
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

function NavLink({
  href,
  icon,
  active,
  onClick,
  children,
}: {
  href: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm font-medium
        ${
          active
            ? "bg-teal-600/20 text-teal-300 border border-teal-500/30"
            : "text-gray-300 hover:bg-gray-800 hover:text-white"
        }
      `}
    >
      <span>{icon}</span>
      <span>{children}</span>
    </Link>
  );
}
