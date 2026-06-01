import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarCheck2,
  ChevronLeft,
  Download,
  LogOut,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { useLogout, useMe } from "@/hooks/useAdminAuth";
import { formatTimeWithSeconds } from "@/lib/intl";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { to: "/admin/employees",   icon: Users,         label: "Сотрудники",   short: "Люди" },
  { to: "/admin/attendance",  icon: CalendarCheck2, label: "Посещаемость", short: "Учёт" },
  { to: "/admin/export",      icon: Download,      label: "Экспорт",      short: "Excel" },
  { to: "/admin/settings",    icon: SettingsIcon,  label: "Настройки",    short: "Настр." },
] as const;

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const logout = useLogout();
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const onLogout = async () => {
    await logout.mutateAsync();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-full bg-bek-bg text-bek-text flex flex-col lg:grid"
      style={{
        gridTemplateColumns: collapsed ? "72px 1fr" : "248px 1fr",
      }}
    >
      {/* ============ Mobile top bar (hidden on lg+) ============ */}
      <header className="lg:hidden sticky top-0 z-30 h-14 border-b border-bek-border bg-bek-surface/95 backdrop-blur flex items-center justify-between px-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-bek-indigo flex items-center justify-center text-white font-bold shrink-0">
            Б
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <div className="text-body-md font-semibold truncate">BEK · Учёт</div>
            <div className="text-body-sm text-bek-textMuted tabular-nums">
              {formatTimeWithSeconds(now)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-8 w-8 rounded-full bg-bek-surfaceIndigo text-bek-indigo flex items-center justify-center text-body-sm font-semibold">
            {(me?.username ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <button
            onClick={onLogout}
            aria-label="Выйти"
            className="h-9 w-9 rounded-lg hover:bg-bek-surface2 flex items-center justify-center text-bek-textMuted active:scale-95 transition-transform"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* ============ Desktop sidebar ============ */}
      <aside className="hidden lg:flex border-r border-bek-border bg-bek-surface flex-col">
        <div className="h-16 flex items-center px-4 border-b border-bek-border gap-3">
          <div className="h-8 w-8 rounded-lg bg-bek-indigo flex items-center justify-center text-white font-bold">
            Б
          </div>
          {!collapsed && (
            <div className="flex-1 flex flex-col leading-tight">
              <div className="text-body-md font-semibold">BEK · Учёт</div>
              <div className="text-body-sm text-bek-textMuted">админ-панель</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Развернуть" : "Свернуть"}
            className="h-8 w-8 rounded-md hover:bg-bek-surface2 flex items-center justify-center text-bek-textMuted"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 h-11 rounded-xl text-body-md transition-colors",
                  isActive
                    ? "bg-bek-surfaceIndigo text-bek-indigo font-medium"
                    : "text-bek-textMuted hover:bg-bek-surface2 hover:text-bek-text"
                )
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-bek-border">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-3 h-11 rounded-xl text-body-md text-bek-textMuted hover:bg-bek-surface2 hover:text-bek-red transition-colors"
            title={collapsed ? "Выйти" : undefined}
          >
            <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            {!collapsed && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      {/* ============ Main content ============ */}
      <div className="flex flex-col min-w-0">
        {/* Desktop top bar */}
        <header className="hidden lg:flex h-16 border-b border-bek-border bg-bek-surface items-center justify-end px-6 gap-4">
          <div className="text-body-md text-bek-textMuted tabular-nums">
            {formatTimeWithSeconds(now)}
          </div>
          <div className="h-6 w-px bg-bek-border" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-bek-surfaceIndigo text-bek-indigo flex items-center justify-center text-body-sm font-semibold">
              {(me?.username ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="text-body-md font-medium">{me?.username}</div>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
          className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-[1400px] w-full mx-auto"
        >
          <Outlet />
        </motion.main>
      </div>

      {/* ============ Mobile bottom nav ============ */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-[68px] bg-bek-surface/95 backdrop-blur border-t border-bek-border flex items-stretch px-2 pb-[max(env(safe-area-inset-bottom),0.25rem)]"
        aria-label="Основная навигация"
      >
        {NAV_ITEMS.map(({ to, icon: Icon, short, label }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            className={({ isActive }) =>
              cn(
                "flex-1 flex flex-col items-center justify-center gap-1 rounded-xl mx-0.5 transition-colors active:scale-95",
                isActive
                  ? "bg-bek-surfaceIndigo text-bek-indigo font-semibold"
                  : "text-bek-textMuted hover:text-bek-text"
              )
            }
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[11px] leading-none">{short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
