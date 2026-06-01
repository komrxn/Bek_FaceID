/**
 * PhotoDropzone — multi-photo input with drag/paste/click + thumbnail preview.
 *
 * Uses a single `FileList` as the source of truth; thumbnails are URL.createObjectURL
 * blobs (revoked on unmount). Caller is responsible for sending the files in
 * the form submission.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";

const MAX_PHOTOS = 3;

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export function PhotoDropzone({ files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Thumbnails are object URLs — revoke when files change or on unmount.
  const previews = useMemo(
    () => files.map((f) => URL.createObjectURL(f)),
    [files]
  );
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews]
  );

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const next = [...files];
      for (const f of Array.from(incoming)) {
        if (next.length >= MAX_PHOTOS) break;
        if (!f.type.startsWith("image/")) continue;
        next.push(f);
      }
      onChange(next);
    },
    [files, onChange]
  );

  const removeAt = (i: number) => {
    const next = files.slice();
    next.splice(i, 1);
    onChange(next);
  };

  // Paste handler bound to window when component is mounted.
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length) addFiles(imgs);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles, disabled]);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-2xl p-6 transition-colors cursor-pointer text-center",
          dragOver
            ? "border-bek-indigo bg-bek-surfaceIndigo"
            : "border-bek-border bg-bek-surface2 hover:border-bek-indigo/40",
          disabled && "opacity-60 cursor-not-allowed"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center gap-2">
          <div className="h-12 w-12 rounded-xl bg-white border border-bek-border flex items-center justify-center">
            {files.length ? (
              <Camera className="h-5 w-5 text-bek-indigo" strokeWidth={1.75} />
            ) : (
              <ImagePlus className="h-5 w-5 text-bek-indigo" strokeWidth={1.75} />
            )}
          </div>
          <div className="text-body-md font-medium text-bek-text">
            Перетащите фото, вставьте из буфера или нажмите
          </div>
          <div className="text-body-sm text-bek-textMuted">
            До {MAX_PHOTOS} фото · JPEG / PNG · лицо должно быть чётким
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {previews.map((url, i) => (
            <div
              key={url}
              className="relative aspect-square rounded-xl overflow-hidden border border-bek-border bg-bek-surface group"
            >
              <img src={url} alt={`фото ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Удалить фото"
                className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-bek-text/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <div className="absolute bottom-1.5 left-1.5 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-bek-text/70 text-white font-semibold">
                {i === 0 ? "ОСНОВНОЕ" : `№ ${i + 1}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
