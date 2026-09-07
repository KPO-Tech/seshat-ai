import type { NodeProperty } from './types'

function passesDisplayIf(prop: NodeProperty, parameters: Record<string, unknown>): boolean {
  if (!prop.displayIf) return true
  const current = parameters[prop.displayIf.field]
  return prop.displayIf.equals.includes(typeof current === 'boolean' ? String(current) : typeof current === 'string' ? current : '')
}

// Static validation badge (Tier 2.5) - n8n's own version calls each node
// type's real ValidateParameters (Go, server-side) before every execution;
// scoped down here to the one check expressible entirely client-side with
// data already on hand (the node-types catalog's own NodeProperty.required,
// already fetched for ParameterForm - no network round-trip, works even for
// a never-saved job). Deeper per-type checks (a malformed URL, switch cases
// cross-referencing an unknown case name) still surface for real via 2.4's
// "Test this node" instead of being duplicated here as a second, static-
// only validation layer. A node type with no Properties schema at all
// (subworkflow/set) has nothing to check, same as ParameterForm's own raw-
// JSON fallback for those types.
export function missingRequiredFields(properties: NodeProperty[] | undefined, parameters: Record<string, unknown> | undefined): string[] {
  if (!properties) return []
  const params = parameters ?? {}
  return properties
    .filter((p) => p.required && passesDisplayIf(p, params))
    .filter((p) => {
      if (p.type === 'boolean') return false // false is a valid value, never "missing"
      const v = params[p.name]
      return v === undefined || v === null || v === ''
    })
    .map((p) => p.displayName)
}
