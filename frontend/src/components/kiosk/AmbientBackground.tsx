/**
 * Ambient kiosk background — pure CSS, no canvas.
 *
 * Layered radial gradients drift on long ease-in-out keyframes. Total
 * GPU impact is one composite per layer; safe even on a budget tablet.
 */

export function AmbientBackground() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-bek-darkBg">
      {/* Base slate vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, #15203e 0%, #0B1020 70%)",
        }}
      />
      {/* Indigo drift */}
      <div
        className="absolute -inset-[20%] animate-drift-a"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(79,70,229,0.18) 0%, transparent 50%)",
          filter: "blur(40px)",
        }}
      />
      {/* Blue counter-drift */}
      <div
        className="absolute -inset-[20%] animate-drift-b"
        style={{
          background:
            "radial-gradient(circle at 70% 70%, rgba(37,99,235,0.14) 0%, transparent 55%)",
          filter: "blur(50px)",
        }}
      />
      {/* Soft top vignette for chrome */}
      <div
        className="absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.35), transparent)",
        }}
      />
    </div>
  );
}
