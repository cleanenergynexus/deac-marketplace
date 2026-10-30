import { EmbedResize } from "@/components/EmbedResize";

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Let the host page's background show through around the tiles. */}
      <style>{"html,body{background:transparent;margin:0}"}</style>
      <EmbedResize className="bg-transparent p-2">{children}</EmbedResize>
    </>
  );
}
