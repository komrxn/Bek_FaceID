/**
 * Kiosk footer — lives in normal flow as the last flex child of <main>.
 *
 * Single row, never overlays content. Truncates on narrow phones.
 */

import { Link } from "react-router-dom";
import { ShieldCheck, Wifi, WifiOff } from "lucide-react";

interface Props {
  online: boolean;
}

export function KioskFooter({ online }: Props) {
  return (
    <footer
      className="relative z-20 flex items-center justify-between gap-3
                 px-4 sm:px-8 lg:px-12 py-3 sm:py-4 lg:py-5
                 text-bek-darkTextFaint text-body-sm border-t border-white/5"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-bek-darkSurface border border-bek-darkBorder
                        flex items-center justify-center text-white font-bold shrink-0">
          Б
        </div>
        <span className="text-bek-darkTextMuted truncate">BEK · Учёт</span>
        <span className="text-bek-darkTextFaint hidden sm:inline">v0.4</span>
      </div>
      <div className="flex items-center gap-3 sm:gap-5 shrink-0">
        {online ? (
          <div className="flex items-center gap-1.5 sm:gap-2 text-bek-green">
            <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
            <span className="text-bek-darkTextMuted hidden xs:inline">на связи</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2 text-bek-red">
            <WifiOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-pulse" strokeWidth={1.75} />
            <span className="text-bek-darkTextMuted hidden xs:inline">нет связи</span>
          </div>
        )}
        <Link
          to="/admin"
          className="flex items-center gap-1.5 sm:gap-2 text-bek-darkTextFaint
                     hover:text-bek-darkText transition-colors"
        >
          <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
          <span className="hidden xs:inline">админ</span>
        </Link>
      </div>
    </footer>
  );
}
