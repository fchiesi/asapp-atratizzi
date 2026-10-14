import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg max-w-md w-full">
        <p className="text-xs font-semibold tracking-widest text-teal-700 dark:text-teal-400 uppercase">
          Atratizzi · Sublipaper
        </p>
        <h1 className="text-3xl font-bold mt-1 mb-2">ASApp</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-8">
          Pedidos, producao, financeiro e metas da operacao de Blumenau
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full bg-teal-700 hover:bg-teal-800 text-white py-3 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
              />
            </svg>
            Entrar com Google
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-6 text-center">Acesso restrito a equipe autorizada.</p>
      </div>
    </main>
  );
}
