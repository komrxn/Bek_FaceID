import { useEffect, useState } from "react";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

function compute(d: Date): TimeOfDay {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

export function useTimeOfDay(): TimeOfDay {
  const [tod, setTod] = useState<TimeOfDay>(() => compute(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTod(compute(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);
  return tod;
}

export function greetingFor(tod: TimeOfDay): string {
  switch (tod) {
    case "morning":   return "Доброе утро";
    case "afternoon": return "Добрый день";
    case "evening":   return "Добрый вечер";
    case "night":     return "Доброй ночи";
  }
}
