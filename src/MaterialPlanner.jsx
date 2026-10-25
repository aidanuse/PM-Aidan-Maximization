import React, { useState } from "react";
import { Button, Field } from "./ui.jsx";
import { materialRequirement } from "../shared/field-work.js";

export default function MaterialPlanner({
  inventory,
  materials,
  estimates = [],
  onApply,
  onNavigate,
}) {
  const [itemId, setItemId] = useState("");
  const [form, setForm] = useState({
    floorArea: "",
    wallArea: "",
    coats: "",
    allowancePercent: "",
    wholeUnits: true,
    confirmed: false,
  });
  const [applied, setApplied] = useState(false);
  const item = inventory.find((i) => i.id === itemId);
  const change = (key, value) => {
    setForm((f) => ({
      ...f,
      [key]: value,
      confirmed: key === "confirmed" ? value : false,
    }));
    setApplied(false);
  };
  const technical = item?.technical;
  const ready = Boolean(
    item?.exactProduct?.trim() &&
    item.unit?.trim() &&
    technical?.source?.trim() &&
    technical.checkedOn &&
    technical.coverageConditions?.trim() &&
    technical.coverageSqftPerUnit > 0,
  );
  const complete = [
    form.floorArea,
    form.wallArea,
    form.coats,
    form.allowancePercent,
  ].every((v) => v !== "");
  const result =
    ready && complete
      ? materialRequirement({
          ...form,
          floorArea: Number(form.floorArea),
          wallArea: Number(form.wallArea),
          coats: Number(form.coats),
          allowancePercent: Number(form.allowancePercent),
          coverage: technical.coverageSqftPerUnit,
        })
      : null;
  return (
    <details className="card field-plan-summary">
      <summary>Plan material quantities · optional</summary>
      <p>
        Use a documented coverage rate for the chosen thickness and counting
        unit. Enter floor and wall areas separately; use 0 for an area that is
        not included. Combine floor and wall areas only when the same coverage
        applies. For different rates on the same product, enter a combined
        requirement in Jobs from separate takeoffs.
      </p>
      {estimates.map((estimate) => (
        <div className="production-entry" key={estimate.inventoryId}>
          <strong>Recorded calculation: {estimate.exactProduct}</strong>
          <p>
            {estimate.floorArea} sq ft floor + {estimate.wallArea} sq ft wall ·{" "}
            {estimate.coats} coat(s) · {estimate.coverage} sq ft /{" "}
            {estimate.unit} / coat · {estimate.allowancePercent}% allowance →{" "}
            {estimate.units} {estimate.unit}
          </p>
          <p>
            Source checked {estimate.checkedOn}: {estimate.source}
            <br />
            {estimate.coverageConditions}
          </p>
          {materials.find((m) => m.inventoryId === estimate.inventoryId)
            ?.quantity !== estimate.units && (
            <p>
              The current job requirement differs from this calculation.
              Recalculate if the scope changed.
            </p>
          )}
        </div>
      ))}
      <Field label="Product for material plan">
        <select
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
            setForm((f) => ({ ...f, confirmed: false }));
            setApplied(false);
          }}
        >
          <option value="">Choose an inventory product</option>
          {inventory.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.unit || "unit unknown"})
            </option>
          ))}
        </select>
      </Field>
      {item && !ready && (
        <p>
          Add the exact product, counting unit, coverage, coverage conditions,
          source and checked date in{" "}
          <Button type="button" onClick={() => onNavigate("inventory")}>
            Inventory
          </Button>{" "}
          before calculating.
        </p>
      )}
      {ready && (
        <>
          <p>
            <strong>{item.exactProduct}</strong> ·{" "}
            {technical.coverageSqftPerUnit} sq ft / {item.unit} / coat
            <br />
            Source checked {technical.checkedOn}: {technical.source}
          </p>
          <p className="field-plan-note">
            <strong>Coverage basis:</strong> {technical.coverageConditions}
          </p>
          <div className="form-grid">
            {[
              ["floorArea", "Floor area (sq ft)"],
              ["wallArea", "Wall area (sq ft)"],
              ["coats", "Number of coats"],
              ["allowancePercent", "Planning allowance (%)"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  min={key === "coats" ? "1" : "0"}
                  step={key === "coats" ? "1" : "any"}
                  value={form[key]}
                  onChange={(e) => change(key, e.target.value)}
                  placeholder="Enter explicitly"
                />
              </Field>
            ))}
          </div>
          <Field label="Round up to complete counting units">
            <input
              type="checkbox"
              checked={form.wholeUnits}
              onChange={(e) => change("wholeUnits", e.target.checked)}
            />
          </Field>
          {result && (
            <div className="production-entry">
              <p>
                Before allowance: {result.netUnits.toFixed(3)} {item.unit}
                <br />
                With {form.allowancePercent}% allowance:{" "}
                {result.withAllowance.toFixed(3)} {item.unit}
                <br />
                <strong>
                  Planned requirement: {result.units} {item.unit}
                </strong>
              </p>
              <p>
                Recorded stock:{" "}
                {item.quantity == null
                  ? "unknown — count before loading"
                  : `${item.quantity} ${item.unit}; ${Math.max(0, result.units - item.quantity)} short before other jobs’ demand`}
              </p>
            </div>
          )}
          {complete && !result && (
            <p role="alert">
              Use positive area and coverage, a whole number of coats, and a
              nonnegative allowance.
            </p>
          )}
          <Field label="I checked that this coverage, unit, thickness and conditions apply to this job">
            <input
              type="checkbox"
              checked={form.confirmed}
              onChange={(e) => change("confirmed", e.target.checked)}
            />
          </Field>
          <Button
            type="button"
            disabled={!result || !form.confirmed}
            onClick={() => {
              onApply(
                [
                  ...materials.filter((m) => m.inventoryId !== itemId),
                  { inventoryId: itemId, quantity: result.units },
                ],
                [
                  ...estimates.filter((m) => m.inventoryId !== itemId),
                  {
                    inventoryId: itemId,
                    floorArea: Number(form.floorArea),
                    wallArea: Number(form.wallArea),
                    coats: Number(form.coats),
                    allowancePercent: Number(form.allowancePercent),
                    coverage: technical.coverageSqftPerUnit,
                    units: result.units,
                    unit: item.unit,
                    wholeUnits: form.wholeUnits,
                    exactProduct: item.exactProduct,
                    source: technical.source,
                    checkedOn: technical.checkedOn,
                    coverageConditions: technical.coverageConditions,
                  },
                ],
              );
              setApplied(true);
            }}
          >
            Set this product’s job requirement
          </Button>
          <p role="status">
            {applied
              ? "Requirement added to your draft. Save the field plan to keep it."
              : "Replaces this product’s existing job requirement. Stock changes only through actual consumption or recounts."}
          </p>
        </>
      )}
    </details>
  );
}
