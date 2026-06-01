import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Key,
  ShieldAlert,
  Sliders,
  Database,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { api, ApiError } from "@/lib/api";
import {
  changePasswordSchema,
  settingsSchema,
  type ChangePasswordInput,
  type SettingsValues,
} from "@/lib/zod";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";

export default function Settings() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api({ path: "/api/settings", schema: settingsSchema }),
  });

  // Local draft — копия с сервера, правится слайдерами, сохраняется кнопкой.
  const [draft, setDraft] = useState<SettingsValues | null>(null);
  useEffect(() => {
    if (settingsQuery.data && !draft) setDraft(settingsQuery.data);
  }, [settingsQuery.data, draft]);

  const isDirty =
    settingsQuery.data &&
    draft &&
    JSON.stringify(settingsQuery.data) !== JSON.stringify(draft);

  const saveMutation = useMutation({
    mutationFn: (values: SettingsValues) =>
      api({
        method: "PATCH",
        path: "/api/settings",
        body: values,
        schema: settingsSchema,
      }),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      setDraft(data);
    },
  });

  return (
    <div className="flex flex-col gap-5 sm:gap-6 max-w-4xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-display-md sm:text-display-lg tracking-tight">Настройки</h1>
        <p className="text-body-md text-bek-textMuted">
          Изменения применяются мгновенно — без перезапуска сервера.
        </p>
      </div>

      {/* ============ Распознавание ============ */}
      <SectionCard
        icon={<Sliders className="h-5 w-5" strokeWidth={1.75} />}
        tone="indigo"
        title="Распознавание"
        description="Чем выше порог, тем строже система. Слишком строго → честным сотрудникам приходится несколько раз показываться. Слишком мягко → может перепутать похожих."
      >
        {draft && (
          <div className="flex flex-col gap-6">
            <SliderRow
              label="Порог распознавания лица"
              value={draft.recognition_threshold_strong}
              valueLabel={`${(draft.recognition_threshold_strong * 100).toFixed(0)}%`}
              min={0.5}
              max={0.95}
              step={0.01}
              warningFrom={0.78}
              hint="Рекомендуем 0.60 для стандартного освещения. Поднимать выше 0.75 — только если бывают ложные срабатывания."
              onChange={(v) =>
                setDraft({ ...draft, recognition_threshold_strong: v })
              }
            />
          </div>
        )}
      </SectionCard>

      {/* ============ Anti-spoof ============ */}
      <SectionCard
        icon={<ShieldAlert className="h-5 w-5" strokeWidth={1.75} />}
        tone="green"
        title="Защита от подделки"
        description="Анти-спуф рубит попытки отметиться по фото с телефона или распечатке. Срабатывает ДО распознавания — если уверенность ниже порога, отметка не пройдёт."
      >
        {draft && (
          <>
            <SliderRow
              label="Порог реальности лица"
              value={draft.antispoof_threshold}
              valueLabel={`${(draft.antispoof_threshold * 100).toFixed(0)}%`}
              min={0.5}
              max={0.99}
              step={0.01}
              hint="Стандарт — 0.80. Если в ресторане яркое контровое освещение у входа и система часто говорит «спуф» живым людям — снизьте до 0.70."
              onChange={(v) => setDraft({ ...draft, antispoof_threshold: v })}
            />
            <InfoCallout tone="amber">
              На сервере должны быть установлены модели anti-spoof.
              Запустите <code className="font-mono px-1.5 py-0.5 rounded bg-bek-amberSoft text-bek-amber">bash scripts/download_models.sh</code>{" "}
              один раз, иначе порог ни на что не повлияет.
            </InfoCallout>
          </>
        )}
      </SectionCard>

      {/* ============ Данные ============ */}
      <SectionCard
        icon={<Database className="h-5 w-5" strokeWidth={1.75} />}
        tone="neutral"
        title="Данные и kiosk"
        description="Сколько хранить снимки лица при отметках и должен ли kiosk пищать."
      >
        {draft && (
          <div className="flex flex-col gap-6">
            <SliderRow
              label="Хранить снимки отметок (дней)"
              value={draft.snapshot_retention_days}
              valueLabel={`${draft.snapshot_retention_days} дн.`}
              min={7}
              max={365}
              step={1}
              hint="Каждая отметка сохраняет уменьшенное фото лица. При 80 сотрудниках ~16 МБ в день. Старые автоматически удаляются."
              onChange={(v) =>
                setDraft({
                  ...draft,
                  snapshot_retention_days: Math.round(v),
                })
              }
              integer
            />

            <div className="flex items-center justify-between gap-4 pt-4 border-t border-bek-border">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Volume2 className="h-5 w-5 text-bek-textMuted shrink-0 mt-0.5" strokeWidth={1.75} />
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="text-body-md font-medium">Звук на kiosk</div>
                  <div className="text-body-sm text-bek-textMuted">
                    Короткий «дзинь» при успешной отметке.
                  </div>
                </div>
              </div>
              <Switch
                checked={draft.kiosk_sound_enabled}
                onCheckedChange={(v) =>
                  setDraft({ ...draft, kiosk_sound_enabled: v })
                }
                aria-label="Звук на kiosk"
              />
            </div>
          </div>
        )}
      </SectionCard>

      {/* ============ Save bar ============ */}
      {draft && (
        <motion.div
          initial={false}
          animate={{
            opacity: isDirty ? 1 : 0,
            y: isDirty ? 0 : 8,
            pointerEvents: isDirty ? "auto" : "none",
          }}
          transition={spring.snap}
          className="sticky bottom-24 lg:bottom-4 z-20 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-bek-text/95 text-white shadow-2xl backdrop-blur"
        >
          <div className="flex items-center gap-2 text-body-sm">
            <Info className="h-4 w-4" strokeWidth={1.75} />
            <span>Есть несохранённые изменения</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={() => setDraft(settingsQuery.data ?? null)}
              disabled={saveMutation.isPending}
            >
              Отменить
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => saveMutation.mutate(draft)}
              loading={saveMutation.isPending}
            >
              Сохранить
            </Button>
          </div>
        </motion.div>
      )}

      {/* ============ Безопасность ============ */}
      <SectionCard
        icon={<Key className="h-5 w-5" strokeWidth={1.75} />}
        tone="red"
        title="Безопасность"
        description="Смените пароль администратора. Не используйте простые пароли."
      >
        <ChangePasswordForm />
      </SectionCard>
    </div>
  );
}

// ============ Section ============

interface SectionProps {
  icon: React.ReactNode;
  tone: "indigo" | "green" | "amber" | "red" | "neutral";
  title: string;
  description: string;
  children: React.ReactNode;
}

const TONE_BG: Record<SectionProps["tone"], string> = {
  indigo: "bg-bek-surfaceIndigo text-bek-indigo",
  green: "bg-bek-surfaceGreen text-bek-green",
  amber: "bg-bek-amberSoft text-bek-amber",
  red: "bg-bek-surfaceRed text-bek-red",
  neutral: "bg-bek-surface2 text-bek-textMuted",
};

function SectionCard({ icon, tone, title, description, children }: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", TONE_BG[tone])}>
            {icon}
          </div>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

// ============ Slider ============

interface SliderRowProps {
  label: string;
  value: number;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
  warningFrom?: number;
  onChange: (v: number) => void;
  integer?: boolean;
}

function SliderRow({
  label,
  value,
  valueLabel,
  min,
  max,
  step,
  hint,
  warningFrom,
  onChange,
  integer,
}: SliderRowProps) {
  const isWarn = warningFrom !== undefined && value > warningFrom;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-body-md">{label}</Label>
        <div
          className={cn(
            "tabular-nums font-semibold text-display-sm",
            isWarn ? "text-bek-amber" : "text-bek-text"
          )}
        >
          {valueLabel}
          {isWarn && (
            <span className="inline-flex items-center gap-1 text-body-sm ml-2 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
              слишком строго
            </span>
          )}
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(integer ? Math.round(v[0]) : v[0])}
      />
      {hint && <p className="text-body-sm text-bek-textMuted">{hint}</p>}
    </div>
  );
}

// ============ Callout ============

function InfoCallout({ tone, children }: { tone: "amber" | "indigo"; children: React.ReactNode }) {
  const cls =
    tone === "amber"
      ? "border-bek-amberSoft bg-bek-amberSoft/50 text-bek-amber"
      : "border-bek-indigoSoft bg-bek-surfaceIndigo text-bek-indigo";
  return (
    <div className={cn("flex items-start gap-2 px-3 py-2.5 rounded-xl border text-body-sm", cls)}>
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} />
      <div className="text-bek-text leading-relaxed">{children}</div>
    </div>
  );
}

// ============ Change password ============

function ChangePasswordForm() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const mutation = useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api({
        method: "POST",
        path: "/api/auth/change-password",
        body: {
          current_password: input.current_password,
          new_password: input.new_password,
        },
      }),
  });

  const onSubmit = async (input: ChangePasswordInput) => {
    setServerError(null);
    try {
      await mutation.mutateAsync(input);
      setDone(true);
      reset();
      setTimeout(() => setDone(false), 4000);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(typeof err.message === "string" ? err.message : "Не удалось сменить пароль.");
      } else {
        throw err;
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current_password">Текущий пароль</Label>
        <div className="relative">
          <Input
            id="current_password"
            type={showCurrent ? "text" : "password"}
            autoComplete="current-password"
            {...register("current_password")}
          />
          <EyeButton shown={showCurrent} onClick={() => setShowCurrent((v) => !v)} />
        </div>
        {errors.current_password && (
          <p className="text-body-sm text-bek-red">{errors.current_password.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new_password">Новый пароль</Label>
          <div className="relative">
            <Input
              id="new_password"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              {...register("new_password")}
            />
            <EyeButton shown={showNew} onClick={() => setShowNew((v) => !v)} />
          </div>
          {errors.new_password && (
            <p className="text-body-sm text-bek-red">{errors.new_password.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm_password">Повторите новый</Label>
          <Input
            id="confirm_password"
            type={showNew ? "text" : "password"}
            autoComplete="new-password"
            {...register("confirm_password")}
          />
          {errors.confirm_password && (
            <p className="text-body-sm text-bek-red">{errors.confirm_password.message}</p>
          )}
        </div>
      </div>

      {serverError && (
        <div className="rounded-lg border border-bek-redSoft bg-bek-surfaceRed px-3 py-2 text-body-sm text-bek-red">
          {serverError}
        </div>
      )}

      {done && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.snap}
          className="flex items-center gap-2 text-bek-green text-body-sm"
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
          Пароль обновлён. При следующем входе используйте новый.
        </motion.div>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Сменить пароль
        </Button>
      </div>
    </form>
  );
}

function EyeButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-bek-textMuted hover:text-bek-text"
    >
      {shown ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
    </button>
  );
}
