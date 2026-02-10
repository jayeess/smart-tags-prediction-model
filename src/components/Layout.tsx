import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Clock,
  Settings,
  Brain,
  Utensils,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/analyze", icon: Search, label: "Analyze" },
  { to: "/tables", icon: Utensils, label: "Table View" },
  { to: "/history", icon: Clock, label: "History" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">eMenu</h1>
              <p className="text-xs text-gray-400">Smart Tags AI</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-400 border-r-2 border-indigo-400"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="text-xs text-gray-500">
            Tenant: <span className="text-gray-400">restaurant_001</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
