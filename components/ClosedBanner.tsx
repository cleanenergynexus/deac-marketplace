/** Red diagonal ribbon laid across a closed listing's tile. The parent must be `relative overflow-hidden`. */
export function ClosedBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-label="Closed - Sold" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div style={{ transform: `rotate(${compact ? -8 : -16}deg)` }} className={`w-[150%] border-y-4 border-white bg-red-600 text-center text-white shadow-[0_6px_20px_rgba(220,38,38,0.45)] ${compact ? "py-1.5" : "py-2.5"}`}>
        <div className={`font-black uppercase leading-none tracking-[0.3em] drop-shadow ${compact ? "text-2xl" : "text-3xl"}`}>Closed</div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.35em] text-red-100">Sold · Deal no longer available</div>
      </div>
    </div>
  );
}
