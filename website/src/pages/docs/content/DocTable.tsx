import type { ReactNode } from 'react'
import styles from './DocTable.module.css'

type DocTableProps = {
  children: ReactNode
  variant?: 'balanced' | 'dense'
  className?: string
}

export default function DocTable({ children, variant = 'balanced', className = '' }: DocTableProps) {
  const variantClass = variant === 'dense' ? styles.tableDense : styles.tableBalanced
  const tableClassName = [styles.table, variantClass, className].filter(Boolean).join(' ')

  return (
    <div className={styles.wrap}>
      <table className={tableClassName}>{children}</table>
    </div>
  )
}
