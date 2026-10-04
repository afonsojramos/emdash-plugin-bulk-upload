export type ContentFields = Record<string, { kind: string; validation?: Record<string, unknown> }>;

export function contentPayload(
  values: Record<string, unknown>,
  fields: ContentFields,
): { data: Record<string, unknown>; references?: Record<string, string[]> } {
  const data = { ...values };
  const references: Record<string, string[]> = {};

  for (const [name, value] of Object.entries(values)) {
    const field = fields[name];
    if (
      field?.kind !== "reference" ||
      typeof field.validation?.relation !== "string" ||
      !field.validation.relation
    ) {
      continue;
    }

    let ids: unknown[] = [];
    if (value != null && value !== "") {
      ids = Array.isArray(value) ? value : [value];
    }
    if (!ids.every((id): id is string => typeof id === "string" && id.trim().length > 0)) {
      throw new Error(`Reference field "${name}" must contain entry ids.`);
    }
    references[name] = [...ids];
    delete data[name];
  }

  return Object.keys(references).length > 0 ? { data, references } : { data };
}
