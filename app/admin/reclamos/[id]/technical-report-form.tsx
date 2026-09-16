"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createTechnicalReportAction } from "@/lib/actions/warranties";

export function TechnicalReportForm({ claimId }: { claimId: string }) {
  const [diagnosis, setDiagnosis] = useState("");
  const [testsPerformed, setTestsPerformed] = useState("");
  const [observations, setObservations] = useState("");
  const [result, setResult] = useState("");
  const [decision, setDecision] = useState("");
  const [justification, setJustification] = useState("");
  const [touched, setTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const diagnosisInvalid = diagnosis.trim().length < 3;
  const resultInvalid = result.trim().length < 3;
  const decisionInvalid = decision.trim().length < 3;

  const submit = () => {
    setTouched(true);
    if (diagnosisInvalid || resultInvalid || decisionInvalid) return;
    startTransition(async () => {
      const res = await createTechnicalReportAction(claimId, {
        diagnosis: diagnosis.trim(),
        result: result.trim(),
        decision: decision.trim(),
        testsPerformed: testsPerformed.trim() || undefined,
        observations: observations.trim() || undefined,
        justification: justification.trim() || undefined,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Reporte técnico agregado.");
        setDiagnosis("");
        setTestsPerformed("");
        setObservations("");
        setResult("");
        setDecision("");
        setJustification("");
        setTouched(false);
        router.refresh();
      }
    });
  };

  return (
    <FieldGroup>
      <Field data-invalid={touched && diagnosisInvalid}>
        <FieldLabel htmlFor="reportDiagnosis">Diagnóstico</FieldLabel>
        <Textarea id="reportDiagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} />
        <FieldError errors={touched && diagnosisInvalid ? [{ message: "Indica el diagnóstico" }] : []} />
      </Field>
      <Field>
        <FieldLabel htmlFor="reportTests">Pruebas realizadas (opcional)</FieldLabel>
        <Textarea id="reportTests" value={testsPerformed} onChange={(e) => setTestsPerformed(e.target.value)} rows={2} />
      </Field>
      <Field>
        <FieldLabel htmlFor="reportObservations">Observaciones (opcional)</FieldLabel>
        <Textarea id="reportObservations" value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} />
      </Field>
      <Field data-invalid={touched && resultInvalid}>
        <FieldLabel htmlFor="reportResult">Resultado</FieldLabel>
        <Textarea id="reportResult" value={result} onChange={(e) => setResult(e.target.value)} rows={2} />
        <FieldError errors={touched && resultInvalid ? [{ message: "Indica el resultado" }] : []} />
      </Field>
      <Field data-invalid={touched && decisionInvalid}>
        <FieldLabel htmlFor="reportDecision">Decisión</FieldLabel>
        <Textarea id="reportDecision" value={decision} onChange={(e) => setDecision(e.target.value)} rows={2} />
        <FieldError errors={touched && decisionInvalid ? [{ message: "Indica la decisión" }] : []} />
      </Field>
      <Field>
        <FieldLabel htmlFor="reportJustification">Justificación (opcional)</FieldLabel>
        <Textarea
          id="reportJustification"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={2}
        />
      </Field>
      <Button onClick={submit} disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar reporte técnico"}
      </Button>
    </FieldGroup>
  );
}
