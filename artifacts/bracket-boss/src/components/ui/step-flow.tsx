import type { ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StepDefinition {
  id: string;
  label: string;
  badge?: string | number;
}

interface StepNavProps {
  steps: StepDefinition[];
  current: number;
  onSelect: (index: number) => void;
  className?: string;
}

export function StepNav({ steps, current, onSelect, className }: StepNavProps) {
  return (
    <div className={cn("flex items-center gap-1.5 overflow-x-auto pb-1", className)}>
      {steps.map((step, index) => {
        const isActive = index === current;
        const isDone = index < current;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(index)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : isDone
                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border/50 bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                isActive ? "bg-primary-foreground/20" : isDone ? "bg-primary/20" : "bg-muted-foreground/15"
              )}
            >
              {isDone ? <Check className="h-2.5 w-2.5" /> : index + 1}
            </span>
            {step.label}
            {step.badge !== undefined && <span className="ml-0.5 opacity-70">({step.badge})</span>}
          </button>
        );
      })}
    </div>
  );
}

interface StepFooterNavProps {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  hideBack?: boolean;
  hideNext?: boolean;
  nextDisabled?: boolean;
}

export function StepFooterNav({
  onBack,
  onNext,
  backLabel = "Back",
  nextLabel = "Next",
  hideBack,
  hideNext,
  nextDisabled,
}: StepFooterNavProps) {
  if (hideBack && hideNext) return null;

  return (
    <div className="flex items-center justify-between pt-2">
      {!hideBack ? (
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="font-bold">
          <ChevronLeft className="mr-1 h-4 w-4" /> {backLabel}
        </Button>
      ) : (
        <span />
      )}
      {!hideNext && (
        <Button type="button" size="sm" onClick={onNext} disabled={nextDisabled} className="font-bold">
          {nextLabel} <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function StepPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4", className)}>
      {children}
    </div>
  );
}
