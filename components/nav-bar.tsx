"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PlusCircle, List, BarChart2, Settings, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Erfassen", icon: PlusCircle },
  { href: "/touren", label: "Touren", icon: List },
  { href: "/monat", label: "Monat", icon: BarChart2 },
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
    <nav className="bg-white border-b sticky top-0 z-10">
      <div className="container mx-auto max-w-lg px-4">
        <div className="flex items-center justify-between h-14">
          <span className="font-semibold text-sm text-gray-800">TourLog</span>
          <div className="flex gap-1 items-center">
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
        </div>
      </div>
    </nav>
  );
}
