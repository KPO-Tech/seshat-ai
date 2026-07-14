import { Table } from 'antd'
import type { TableProps } from 'antd'

export function ConsoleTable<RecordType extends object>(props: TableProps<RecordType>) {
  return <Table<RecordType> {...props} scroll={props.scroll ?? { x: 'max-content' }} />
}
