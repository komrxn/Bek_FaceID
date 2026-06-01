import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { loginSchema, type LoginInput } from "@/lib/zod";
import { useLogin } from "@/hooks/useAdminAuth";
import { ApiError } from "@/lib/api";
import { spring } from "@/lib/motion";

export default function Login() {
  const navigate = useNavigate();
  const login = useLogin();
  const [shake, setShake] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: LoginInput) => {
    try {
      await login.mutateAsync(values);
      navigate("/admin/employees", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setShake((n) => n + 1);
      } else {
        throw err;
      }
    }
  };

  return (
    <main className="min-h-full flex items-center justify-center p-6 bg-bek-bg">
      <motion.div
        key={shake}
        initial={false}
        animate={shake ? { x: [-6, 6, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-[420px]"
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.calm}
          className="rounded-2xl border border-bek-border bg-bek-surface shadow-lg p-8"
        >
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-bek-surfaceIndigo flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-bek-indigo" strokeWidth={1.75} />
            </div>
            <div className="text-display-md text-center">BEK · Учёт</div>
            <div className="text-body-sm text-bek-textMuted text-center">
              Войдите как управляющий
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Логин</Label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                placeholder="admin"
                aria-invalid={!!errors.username}
                {...register("username")}
              />
              {errors.username && (
                <p className="text-body-sm text-bek-red">{errors.username.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-body-sm text-bek-red">{errors.password.message}</p>
              )}
            </div>

            {shake > 0 && !isSubmitting && (
              <div className="rounded-lg border border-bek-redSoft bg-bek-surfaceRed px-3 py-2 text-body-sm text-bek-red">
                Неверный логин или пароль.
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              loading={isSubmitting}
              className="mt-2"
            >
              Войти
            </Button>
          </form>
        </motion.div>

        <p className="text-body-sm text-bek-textFaint text-center mt-6">
          Локальный сервер BEK · v0.3
        </p>
      </motion.div>
    </main>
  );
}
