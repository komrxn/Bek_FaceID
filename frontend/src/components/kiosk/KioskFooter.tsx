import { Link } from "react-router-dom";
import { ShieldCheck, Wifi, WifiOff } from "lucide-react";

interface Props {
  online: boolean;
}

export function KioskFooter({ online }: Props) {
  return (
    <footer className="absolute bottom-0 inset-x-0 flex items-center justify-between px-12 py-6 text-bek-darkTextFaint text-body-sm">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-bek-darkSurface border border-bek-darkBorder flex items-center justify-center text-white font-bold">
          Б
        </div>
        <span className="text-bek-darkTextMuted">BEK · Учёт</span>
        <span className="text-bek-darkTextFaint">v0.4</span>
      </div>
      <div className="flex items-center gap-6">
        {online ? (
          <div className="flex items-center gap-2 text-bek-green">
            <Wifi className="h-4 w-4" strokeWidth={1.75} />
            <span className="text-bek-darkTextMuted">сервер на связи</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-bek-red">
            <WifiOff className="h-4 w-4 animate-pulse" strokeWidth={1.75} />
            <span className="text-bek-darkTextMuted">нет связи</span>
          </div>
        )}
        <Link
          to="/admin"
          className="flex items-center gap-2 text-bek-darkTextFaint hover:text-bek-darkText transition-colors"
        >
          <ShieldCheck className="h-4 w-4" strokeWidth={1.75} />
          админ
        </Link>
      </div>
    </footer>
  );
}
