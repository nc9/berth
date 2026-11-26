// Minimal JSON Schema checker for the subset berth's schema uses:
// type, enum, const, pattern, minimum, exclusiveMinimum, properties, required,
// additionalProperties (boolean or schema), items, anyOf and local $ref.
type Schema = Record<string, any>;

function typeOk(type: string, v: unknown): boolean {
  switch (type) {
    case "object":
      return typeof v === "object" && v !== null && !Array.isArray(v);
    case "array":
      return Array.isArray(v);
    case "string":
      return typeof v === "string";
    case "boolean":
      return typeof v === "boolean";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    default:
      return false;
  }
}

export function checkSchema(
  root: Schema,
  value: unknown,
  schema: Schema = root,
  path = "$",
): string[] {
  if (schema.$ref !== undefined) {
    const name = String(schema.$ref).replace("#/$defs/", "");
    const target = root.$defs?.[name];
    if (!target) return [`${path}: unresolved $ref ${schema.$ref}`];
    return checkSchema(root, value, target, path);
  }
  if (schema.anyOf) {
    const tries = (schema.anyOf as Schema[]).map((s) =>
      checkSchema(root, value, s, path),
    );
    if (tries.some((t) => t.length === 0)) return [];
    return [`${path}: matches none of the allowed shapes (${tries[0]![0]})`];
  }
  const errs: string[] = [];
  if ("const" in schema && value !== schema.const)
    errs.push(`${path}: must be ${JSON.stringify(schema.const)}`);
  if (schema.type && !typeOk(schema.type, value))
    return [...errs, `${path}: must be ${schema.type}`];
  if (schema.enum && !schema.enum.includes(value))
    errs.push(`${path}: must be one of ${schema.enum.join(", ")}`);
  if (typeof value === "string" && schema.pattern)
    if (!new RegExp(schema.pattern).test(value))
      errs.push(`${path}: does not match ${schema.pattern}`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errs.push(`${path}: must be >= ${schema.minimum}`);
    if (
      schema.exclusiveMinimum !== undefined &&
      value <= schema.exclusiveMinimum
    )
      errs.push(`${path}: must be > ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value) && schema.items)
    value.forEach((v, i) =>
      errs.push(...checkSchema(root, v, schema.items, `${path}[${i}]`)),
    );
  if (typeOk("object", value)) {
    const o = value as Record<string, unknown>;
    for (const k of schema.required ?? [])
      if (!(k in o)) errs.push(`${path}: missing required "${k}"`);
    for (const [k, v] of Object.entries(o)) {
      const sub = schema.properties?.[k];
      if (sub) errs.push(...checkSchema(root, v, sub, `${path}.${k}`));
      else if (schema.additionalProperties === false)
        errs.push(`${path}: unknown property "${k}"`);
      else if (typeof schema.additionalProperties === "object")
        errs.push(
          ...checkSchema(root, v, schema.additionalProperties, `${path}.${k}`),
        );
    }
  }
  return errs;
}
