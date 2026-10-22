/* Shared helpers for the data tables (EntityPage and the drives table). */

export const blank = (value) => value === undefined || value === null || String(value).trim() === ''

/** CSS classes for a table cell, from the column config (sticky, nowrap, wrap, index). */
export const cellClass = (column) => [column.sticky && `sticky-${column.sticky}`, column.nowrap && 'nowrap', column.wrap && 'wrap', column.format === 'index' && 'num'].filter(Boolean).join(' ') || undefined
