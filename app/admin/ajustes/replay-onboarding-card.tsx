"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnboardingTour } from "@/components/admin/onboarding/onboarding-tour";

export function ReplayOnboardingCard() {
  const { replay } = useOnboardingTour();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tutorial</CardTitle>
        <CardDescription>Repite el recorrido guiado por las secciones del sistema.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={replay}>
          <RotateCcw className="size-4" />
          Repetir tutorial
        </Button>
      </CardContent>
    </Card>
  );
}
