export interface PromoVariable {
  key: string;
  description?: string;
  defaultValue?: string;
}

export interface PromoSlotLike {
  slot: number;
  name?: string;
  previewBody?: string;
  variables?: PromoVariable[];
}

const POSITION_DEFAULTS: Record<number, { label: string; defaultValue: string; autoLabel?: string }> = {
  1: { label: "Member name", defaultValue: "", autoLabel: "Auto member name" },
  2: { label: "Offer / occasion", defaultValue: "limited time offer" },
  3: { label: "Offer details", defaultValue: "exclusive fitness offer" },
  4: { label: "Limit / seats", defaultValue: "50" },
  5: { label: "Booking link", defaultValue: "Contact the gym" },
  6: { label: "Gym name", defaultValue: "", autoLabel: "Auto gym name" },
};

export function getPromoTemplateName(slot: PromoSlotLike) {
  return slot.name?.trim() || `Promo ${slot.slot}`;
}

export function getResolvedPromoVariables(slot: PromoSlotLike): PromoVariable[] {
  const configured = (slot.variables ?? []).filter((v) => v?.key?.trim());
  if (configured.length > 0) {
    return configured.map((v) => ({ ...v, key: v.key.trim() }));
  }

  const numericPositions = Array.from((slot.previewBody ?? "").matchAll(/{{\s*(\d+)\s*}}/g))
    .map((match) => Number(match[1]))
    .filter((n) => Number.isInteger(n) && n > 0);
  const maxPosition = numericPositions.length > 0 ? Math.max(...numericPositions) : 0;

  return Array.from({ length: maxPosition }, (_, index) => {
    const position = index + 1;
    const fallback = POSITION_DEFAULTS[position] ?? {
      label: `Message value ${position}`,
      defaultValue: `Value ${position}`,
    };
    return {
      key: String(position),
      description: fallback.autoLabel || fallback.label,
      defaultValue: fallback.defaultValue,
    };
  });
}

export function getPromoVariableLabel(variable: PromoVariable) {
  return variable.description?.trim() || POSITION_DEFAULTS[Number(variable.key)]?.label || variable.key;
}

export function getPromoDisplayValue(variable: PromoVariable, value: string | undefined) {
  const current = value?.trim() || variable.defaultValue?.trim() || "";
  if (current) return current;
  return POSITION_DEFAULTS[Number(variable.key)]?.autoLabel || "Default value";
}