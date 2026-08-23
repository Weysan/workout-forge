"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronRightIcon, SearchIcon, TrophyIcon } from "lucide-react";

import { cn, fromDateKey } from "@/lib/utils";
import { formatScore } from "@/lib/scoring";
import { useUnitSystem } from "@/lib/hooks/use-profile";
import { useRecordMap } from "@/lib/hooks/use-prs";
import {
  BENCHMARK_SEED_DATA,
  PERFORMANCE_TABS,
  SEASON_STAGES,
  SEASON_TAB,
  SEASONS,
  type PerformanceTab,
  type SeasonStage,
} from "@/constants/seedData";
import type { Benchmark, PersonalRecord } from "@/lib/types";
import { PrDetailSheet } from "@/components/pr-detail-sheet";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export default function PerformancePage() {
  const [tab, setTab] = useState<PerformanceTab>("Lift");
  const [search, setSearch] = useState("");
  const [openBenchmark, setOpenBenchmark] = useState<Benchmark | null>(null);

  // The season browser opens on the most recent season's Open — the workouts
  // most likely to have just been trained.
  const [season, setSeason] = useState<number>(SEASONS[0]);
  const [stage, setStage] = useState<SeasonStage>("Open");

  const { map: records, isPending } = useRecordMap();

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return BENCHMARK_SEED_DATA.filter((benchmark) => {
      // The season tab is two categories behind a year, not one category.
      if (tab === SEASON_TAB) {
        if (benchmark.category !== stage) return false;
        if (benchmark.season !== season) return false;
      } else if (benchmark.category !== tab) {
        return false;
      }
      if (term === "") return true;
      return benchmark.name.toLowerCase().includes(term);
    });
  }, [tab, season, stage, search]);

  // Movements with a result float to the top: a wall of dashes buries the data
  // the athlete actually came here for.
  //
  // Season workouts are the exception — they are released in a fixed order and
  // read as a numbered list, so 25.3 jumping above 25.1 because it has a score
  // would make the season harder to scan, not easier.
  const sorted = useMemo(() => {
    if (tab === SEASON_TAB) {
      return [...visible].sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...visible].sort((a, b) => {
      const aHas = records.has(a.id) ? 0 : 1;
      const bHas = records.has(b.id) ? 0 : 1;
      return aHas - bHas || a.name.localeCompare(b.name);
    });
  }, [visible, records, tab]);

  const totalRecords = records.size;

  return (
    <div className="space-y-5">
      <section className="space-y-1 pt-5">
        <h1 className="font-display text-2xl leading-tight font-extrabold">
          Performance
        </h1>
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-semibold tabular">
            {totalRecords}
          </span>{" "}
          {totalRecords === 1 ? "record" : "records"} on the board
        </p>
      </section>

      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search movements"
          className="pl-10"
          type="search"
          aria-label="Search movements"
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as PerformanceTab)}>
        <TabsList>
          {PERFORMANCE_TABS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {PERFORMANCE_TABS.map((entry) => (
          <TabsContent key={entry.value} value={entry.value} className="pt-4">
            {entry.value === SEASON_TAB && (
              <div className="mb-4 space-y-2">
                <ToggleGroup
                  type="single"
                  value={String(season)}
                  // Radix lets a single-select group be toggled back off; the
                  // season browser has no "no season" state, so the empty value
                  // is ignored rather than emptying the grid.
                  onValueChange={(value) => value && setSeason(Number(value))}
                  aria-label="Season"
                >
                  {SEASONS.map((year) => (
                    <ToggleGroupItem
                      key={year}
                      value={String(year)}
                      className="tabular"
                    >
                      {year}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>

                <ToggleGroup
                  type="single"
                  value={stage}
                  onValueChange={(value) =>
                    value && setStage(value as SeasonStage)
                  }
                  aria-label="Competition stage"
                >
                  {SEASON_STAGES.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}

            {isPending ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <p className="text-muted-foreground border-border/70 rounded-xl border border-dashed px-4 py-12 text-center text-sm">
                {search.trim() !== ""
                  ? `Nothing matches “${search}”.`
                  : entry.value === SEASON_TAB
                    ? `No ${stage} workouts recorded for ${season}.`
                    : "Nothing here yet."}
              </p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {sorted.map((benchmark) => (
                  <PrCard
                    key={benchmark.id}
                    benchmark={benchmark}
                    record={records.get(benchmark.id)}
                    onOpen={() => setOpenBenchmark(benchmark)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <PrDetailSheet
        benchmark={openBenchmark}
        record={openBenchmark ? records.get(openBenchmark.id) : undefined}
        open={openBenchmark !== null}
        onOpenChange={(open) => {
          if (!open) setOpenBenchmark(null);
        }}
      />
    </div>
  );
}

function PrCard({
  benchmark,
  record,
  onOpen,
}: {
  benchmark: Benchmark;
  record: PersonalRecord | undefined;
  onOpen: () => void;
}) {
  const unitSystem = useUnitSystem();
  const hasRecord = record !== undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
        hasRecord
          ? "border-primary/30 bg-card hover:border-primary/60"
          : "border-border/70 bg-card/40 hover:bg-elevated",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{benchmark.name}</div>

        {hasRecord ? (
          <>
            <div className="tabular font-display mt-1 text-2xl leading-none font-extrabold text-gradient-pr">
              {formatScore(record.scoreType, record.bestValue, unitSystem)}
            </div>
            {record.achievedOn && (
              <div className="text-muted-foreground mt-1.5 text-[11px]">
                {format(fromDateKey(record.achievedOn), "d MMM yyyy")}
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground/60 mt-1 text-sm">
            No result yet
          </div>
        )}
      </div>

      {hasRecord ? (
        <TrophyIcon className="text-primary size-5 shrink-0" />
      ) : (
        <ChevronRightIcon className="text-muted-foreground/50 size-5 shrink-0" />
      )}
    </button>
  );
}
