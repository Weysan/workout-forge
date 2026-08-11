"use client";

import { useMemo, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { BENCHMARK_SEED_DATA, CATEGORY_TABS } from "@/constants/seedData";
import type { Benchmark } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

/**
 * Searchable benchmark shortcut.
 *
 * Opens in a dialog rather than a popover: on a phone a popover anchored to a
 * field gets shoved around by the on-screen keyboard, while a dialog owns the
 * viewport and keeps the search field pinned above the results.
 */
export function BenchmarkPicker({
  selected,
  onSelect,
  onClear,
}: {
  selected: Benchmark | null;
  onSelect: (benchmark: Benchmark) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    return CATEGORY_TABS.map((tab) => ({
      label: tab.label,
      items: BENCHMARK_SEED_DATA.filter((b) => b.category === tab.value),
    })).filter((group) => group.items.length > 0);
  }, []);

  return (
    <>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="min-h-12 flex-1 justify-between px-3.5 font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SearchIcon className="text-muted-foreground size-4 shrink-0" />
            {selected ? (
              <span className="truncate font-semibold">{selected.name}</span>
            ) : (
              <span className="text-muted-foreground/70">
                Search benchmarks, heroes, lifts…
              </span>
            )}
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground size-4 shrink-0" />
        </Button>

        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear benchmark"
            onClick={onClear}
          >
            <XIcon />
          </Button>
        )}
      </div>

      {selected && (
        <p className="text-muted-foreground text-xs">
          Linked to{" "}
          <span className="text-primary font-semibold">{selected.name}</span> —
          this session will count towards that record.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-4 max-h-[calc(100svh-2rem)] translate-y-0 gap-3 overflow-hidden p-0 sm:top-1/2 sm:-translate-y-1/2"
          showCloseButton={false}
        >
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle className="text-base">Pick a workout</DialogTitle>
          </DialogHeader>

          <Command
            // `keywords` on each item drive matching, so cmdk's own scoring is
            // enough — no custom filter needed.
            className="overflow-hidden"
          >
            <CommandInput placeholder="Fran, Murph, back squat, 5k…" autoFocus />
            <CommandList className="max-h-[60svh]">
              <CommandEmpty>
                No match. Close this and enter a custom workout instead.
              </CommandEmpty>

              {grouped.map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.items.map((benchmark) => (
                    <CommandItem
                      key={benchmark.id}
                      value={benchmark.name}
                      keywords={[benchmark.category, benchmark.type, benchmark.id]}
                      onSelect={() => {
                        onSelect(benchmark);
                        setOpen(false);
                      }}
                    >
                      <span className="flex-1 truncate font-medium">
                        {benchmark.name}
                      </span>
                      <Badge variant="outline">{benchmark.type}</Badge>
                      <CheckIcon
                        className={cn(
                          "text-primary size-4 shrink-0",
                          selected?.id === benchmark.id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
