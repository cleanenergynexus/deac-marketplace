import { EmbedResize } from "@/components/EmbedResize";

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-transparent p-2">
      {/* Let the host page's background show through around the tiles. */}
      <style>{"html,body{background:transparent}"}</style>
      <EmbedResize />
      {children}
    </div>
  );
}
