import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type BadgeInfo = {
  id: string;
  name: string;
  icon: string;
  description?: string | null;
};

export function BadgeInfoChip({ badge }: { badge: BadgeInfo }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 bg-sky/10 border border-sky/20 rounded-full px-3 py-1 transition-colors hover:bg-sky/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky/60"
          aria-label={`View badge details for ${badge.name}`}
        >
          <span className="text-base leading-none">{badge.icon}</span>
          <span className="text-xs font-bold text-sky">{badge.name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <p className="text-sm font-bold text-foreground flex items-center gap-2">
          <span className="text-base leading-none">{badge.icon}</span>
          {badge.name}
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {badge.description?.trim() || "No description available yet."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
