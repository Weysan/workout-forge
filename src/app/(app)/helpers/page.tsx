"use client";

import { BarbellLoader } from "@/components/barbell-loader";
import { WeightConverter } from "@/components/weight-converter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Calculators for the things a training session asks you to work out on the spot.
 *
 * Nothing here reads or writes the log — these are pure tools, which is why they
 * sit on their own page rather than being buried in the workout form. The
 * barbell loader comes first: it is the one reached for mid-session, with a bar
 * on the floor and a rest clock running.
 */
export default function HelpersPage() {
  return (
    <div className="space-y-5">
      <section className="space-y-1 pt-5">
        <h1 className="font-display text-2xl leading-tight font-extrabold">
          Helpers
        </h1>
        <p className="text-muted-foreground text-sm">
          Maths you should not be doing between sets.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-widest uppercase">
            Barbell loader
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarbellLoader />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-widest uppercase">
            Weight converter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WeightConverter />
        </CardContent>
      </Card>
    </div>
  );
}
