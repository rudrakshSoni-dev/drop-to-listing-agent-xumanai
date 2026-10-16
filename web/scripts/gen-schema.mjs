// Generates src/lib/schema.ts (zod v4 schemas + inferred TS types) from
// packages/schema/listing.schema.json. Supports only the JSON Schema subset
// that file uses; it throws on anything else so drift is caught at `make schema`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../../packages/schema/listing.schema.json");
const outPath = resolve(here, "../src/lib/schema.ts");
const root = JSON.parse(readFileSync(schemaPath, "utf8"));
const defs = root.$defs ?? {};

const SUPPORTED = new Set([
  "$schema",
  "$id",
  "$defs",
  "title",
  "type",
  "enum",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "anyOf",
  "$ref",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
]);

function toZod(s) {
  for (const key of Object.keys(s)) {
    if (!SUPPORTED.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
  }
  if (s.$ref) return `${s.$ref.replace("#/$defs/", "")}Schema`;
  if (s.anyOf) return `z.union([${s.anyOf.map(toZod).join(", ")}])`;
  if (s.enum) return `z.enum([${s.enum.map((v) => JSON.stringify(v)).join(", ")}])`;
  if (Array.isArray(s.type)) {
    const nonNull = s.type.filter((t) => t !== "null");
    if (nonNull.length !== 1 || s.type.length !== 2)
      throw new Error("Only [T, null] unions supported");
    return `${toZod({ ...s, type: nonNull[0] })}.nullable()`;
  }
  switch (s.type) {
    case "string": {
      let out = s.format === "date-time" ? "z.iso.datetime({ offset: true })" : "z.string()";
      if (s.minLength !== undefined) out += `.min(${s.minLength})`;
      if (s.maxLength !== undefined) out += `.max(${s.maxLength})`;
      if (s.pattern) out += `.regex(new RegExp(${JSON.stringify(s.pattern)}))`;
      return out;
    }
    case "number":
    case "integer": {
      let out = s.type === "integer" ? "z.number().int()" : "z.number()";
      if (s.minimum !== undefined) out += `.min(${s.minimum})`;
      if (s.maximum !== undefined) out += `.max(${s.maximum})`;
      return out;
    }
    case "null":
      return "z.null()";
    case "array":
      return `z.array(${toZod(s.items)})`;
    case "object": {
      if (!s.properties) return `z.record(z.string(), ${toZod(s.additionalProperties)})`;
      const required = new Set(s.required ?? []);
      const fields = Object.entries(s.properties).map(([name, sub]) => {
        const z = toZod(sub);
        return `  ${name}: ${required.has(name) ? z : `${z}.optional()`},`;
      });
      const strict = s.additionalProperties === false ? ".strict()" : "";
      return `z.object({\n${fields.join("\n")}\n})${strict}`;
    }
    default:
      throw new Error(`Unsupported type: ${JSON.stringify(s.type)}`);
  }
}

// Emit $defs in dependency order so every const is declared before use.
const emitted = new Set();
const blocks = [];
function emit(name) {
  if (emitted.has(name)) return;
  const deps = JSON.stringify(defs[name]).matchAll(/"#\/\$defs\/(\w+)"/g);
  for (const [, dep] of deps) emit(dep);
  emitted.add(name);
  blocks.push(
    `export const ${name}Schema = ${toZod(defs[name])};\nexport type ${name} = z.infer<typeof ${name}Schema>;`,
  );
}
Object.keys(defs).forEach(emit);

const { title } = root;
const listing = Object.fromEntries(
  Object.entries(root).filter(([k]) => !["$defs", "$schema", "$id", "title"].includes(k)),
);
blocks.push(
  `export const ${title}Schema = ${toZod(listing)};\nexport type ${title} = z.infer<typeof ${title}Schema>;`,
);

const header =
  "// GENERATED from packages/schema/listing.schema.json by `make schema`. Do not edit.\n\n" +
  'import { z } from "zod";\n';
writeFileSync(outPath, `${header}\n${blocks.join("\n\n")}\n`);
console.log(`wrote ${outPath}`);
