// Automation graph components consume the shared dataflow wire types from
// `renderer/types` so Scheduling and other future platforms do not need to
// import from Automation internals.
export type {
  DataflowDefinition,
  DataflowNode,
  DisplayCondition,
  NodeDescription,
  NodeProperty,
  NodePropertyOption,
  NodePropertyType,
  NodeTraceEntry,
  OnErrorMode,
  Run,
  RunStatus,
  UIPosition,
} from '@/types/dataflow'

export { RUN_STATUS_LABEL } from '@/types/dataflow'

export const UI_POSITION_KEY = '__ui_position'

export type Variable = {
  id: string
  organization_id: string
  name: string
  value: string
}
