import { useEffect, useState } from "react";
import { formatDate, formatTime } from "@/lib/intl";

interface Props {
  /** small=top-corner kiosk chrome, big=idle hero */
  size?: "small" | "big";
}

export function Clock({ size = "small" }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (size === "big") {
    return (
      <div className="flex flex-col items-center gap-1 sm:gap-2">
        <div className="text-display-lg sm:text-display-xl xl:text-display-2xl tabular-nums text-bek-darkText leading-none">
          {formatTime(now)}
        </div>
        <div className="text-body-md sm:text-display-sm text-bek-darkTextMuted">{formatDate(now)}</div>
      </div>
    );
  }
  return (
    <div className="text-display-sm tabular-nums text-bek-darkText">
      {formatTime(now)}
    </div>
  );
}
