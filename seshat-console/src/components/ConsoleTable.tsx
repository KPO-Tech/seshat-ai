import { Alert, Table } from 'antd'
import type { TableProps } from 'antd'
import { getErrorMessage } from '@/api/errors'

type ConsoleTableProps<RecordType extends object> = TableProps<RecordType> & {
  /**
   * Pass the owning query's `error` here whenever it's truthy (i.e. only on
   * a genuinely failed fetch, not while loading or on a successful empty
   * result). Renders a distinct error state instead of falling through to
   * the table's empty state — a failed request (403 on a resource that
   * belongs to another org, a timeout, a 500) must never look identical to
   * "this list is genuinely empty" on an admin surface. See the 2026-08-06
   * audit: previously nothing on this table distinguished the two.
   */
  queryError?: unknown
}

export function ConsoleTable<RecordType extends object>({ queryError, ...props }: ConsoleTableProps<RecordType>) {
  if (queryError) {
    return <Alert type="error" showIcon message="Couldn't load this data" description={getErrorMessage(queryError)} />
  }
  return <Table<RecordType> {...props} scroll={props.scroll ?? { x: 'max-content' }} />
}
