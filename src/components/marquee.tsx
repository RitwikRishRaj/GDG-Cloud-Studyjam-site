import type { LucideIcon } from "lucide-react";

export type MarqueeItem = { label: string; icon?: LucideIcon };

export function Marquee({
  items,
  className = "",
  trackClassName = "",
}: {
  items: MarqueeItem[];
  className?: string;
  trackClassName?: string;
}) {
  const doubled = [...items, ...items];
  return (
    <div className={`overflow-hidden border-y-2 border-ink py-2.5 ${className}`}>
      <div className={`marquee-track gap-8 pr-8 ${trackClassName}`}>
        {doubled.map((item, i) => (
          <span
            key={i}
            className="flex items-center gap-3 whitespace-nowrap text-sm font-black uppercase tracking-[0.18em]"
          >
            {item.icon && <item.icon className="size-4" strokeWidth={2.5} />}
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
