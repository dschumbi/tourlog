"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PlusCircle, List, BarChart2, Settings, LogOut, Receipt, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Erfassen", icon: PlusCircle },
  { href: "/touren", label: "Touren", icon: List },
  { href: "/auslagen", label: "Auslagen", icon: Receipt },
  { href: "/monat", label: "Monat", icon: BarChart2 },
  { href: "/statistik", label: "Statistik", icon: TrendingUp },
  { href: "/einstellungen", label: "Settings", icon: Settings },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    fetch("/api/auth/password")
      .then((r) => r.json())
      .then((d) => setHasPassword(d.hasPassword))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <>
      <nav className="bg-white border-b sticky top-0 z-40">
        <div className="container mx-auto max-w-lg md:max-w-2xl lg:max-w-4xl px-4">
          <div className="flex items-center justify-between h-14">
            <span className="font-semibold text-sm text-gray-800">TourLog</span>
            <div className="hidden md:flex gap-1 items-center">
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center px-3 py-1 rounded-md text-xs gap-0.5 transition-colors ${
                    pathname === href
                      ? "text-blue-600 bg-blue-50"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              ))}
              {hasPassword && (
                <button
                  onClick={handleLogout}
                  className="flex flex-col items-center px-3 py-1 rounded-md text-xs gap-0.5 text-gray-500 hover:text-gray-800 transition-colors"
                  title="Abmelden"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              )}
            </div>
            {hasPassword && (
              <button
                onClick={handleLogout}
                className="md:hidden flex items-center justify-center h-8 w-8 rounded-md text-gray-500 hover:text-gray-800 transition-colors"
                title="Abmelden"
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </nav>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t pb-safe">
        <div className="flex items-stretch justify-between">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] transition-colors ${
                pathname === href ? "text-blue-600" : "text-gray-500"
              }`}
            >
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
