import { lazy, Suspense } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { useMe } from "@/hooks/useAdminAuth";
import { isNative } from "@/lib/platform";

/**
 * KioskOnly — when the bundle is running inside the Capacitor APK we redirect
 * every admin route back to `/`. The admin panel is meant for a laptop / phone
 * browser via the Cloudflare URL, not for the front-of-house tablet.
 */
function KioskOnly({ children }: { children: React.ReactNode }) {
  if (isNative()) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const Kiosk = lazy(() => import("@/pages/Kiosk"));
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const Login = lazy(() => import("@/pages/admin/Login"));
const Employees = lazy(() => import("@/pages/admin/Employees"));
const Attendance = lazy(() => import("@/pages/admin/Attendance"));
const Export = lazy(() => import("@/pages/admin/Export"));
const Settings = lazy(() => import("@/pages/admin/Settings"));

function FullScreenLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-bek-indigo border-t-transparent" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <FullScreenLoader />;
  if (!me) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <FullScreenLoader />;
  if (me) return <Navigate to="/admin/employees" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Suspense fallback={<FullScreenLoader />}>
        <Kiosk />
      </Suspense>
    ),
  },
  {
    path: "/admin/login",
    element: (
      <KioskOnly>
        <Suspense fallback={<FullScreenLoader />}>
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        </Suspense>
      </KioskOnly>
    ),
  },
  {
    path: "/admin",
    element: (
      <KioskOnly>
        <Suspense fallback={<FullScreenLoader />}>
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        </Suspense>
      </KioskOnly>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/employees" replace /> },
      {
        path: "employees",
        element: (
          <Suspense fallback={<FullScreenLoader />}>
            <Employees />
          </Suspense>
        ),
      },
      {
        path: "attendance",
        element: (
          <Suspense fallback={<FullScreenLoader />}>
            <Attendance />
          </Suspense>
        ),
      },
      {
        path: "export",
        element: (
          <Suspense fallback={<FullScreenLoader />}>
            <Export />
          </Suspense>
        ),
      },
      {
        path: "settings",
        element: (
          <Suspense fallback={<FullScreenLoader />}>
            <Settings />
          </Suspense>
        ),
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
