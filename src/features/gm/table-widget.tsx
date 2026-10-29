import type { Widget } from '@convex/lib/gmFormats'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'

import { parseTablePaste, tableFromPaste } from './table-paste'

type Session = Extract<Widget, { kind: 'table' | 'clock' | 'initiative' }>
export function TableWidget({
  widget,
  locked,
  readOnly,
  disabled,
  sessionDisabled,
  edit,
  paste,
}: {
  widget: Extract<Session, { kind: 'table' }>
  locked: boolean
  readOnly: boolean
  disabled: boolean
  sessionDisabled: boolean
  edit: (value: Session) => void
  paste: (value: Session) => void
}) {
  const [preview, setPreview] = useState<ReturnType<
    typeof parseTablePaste
  > | null>(null)
  const [headers, setHeaders] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <div className="overflow-x-auto">
        <table>
          <caption>{widget.config.title || 'Tableau'}</caption>
          <thead>
            <tr>
              {widget.config.columns.map((column, index) => (
                <th scope="col" key={column.id}>
                  {readOnly ? (
                    column.label
                  ) : (
                    <>
                      <input
                        aria-label={`Colonne ${index + 1}`}
                        value={column.label}
                        maxLength={60}
                        disabled={locked || disabled}
                        onChange={(event) =>
                          edit({
                            ...widget,
                            config: {
                              ...widget.config,
                              columns: widget.config.columns.map((entry) =>
                                entry.id === column.id
                                  ? { ...entry, label: event.target.value }
                                  : entry
                              ),
                            },
                          })
                        }
                      />
                      <Button
                        disabled={
                          locked ||
                          disabled ||
                          widget.config.columns.length === 1
                        }
                        onClick={() =>
                          edit({
                            ...widget,
                            config: {
                              ...widget.config,
                              columns: widget.config.columns.filter(
                                (entry) => entry.id !== column.id
                              ),
                            },
                            state: {
                              rows: widget.state.rows.map((row) => ({
                                ...row,
                                cells: row.cells.filter(
                                  (_, cellIndex) => cellIndex !== index
                                ),
                              })),
                            },
                          })
                        }
                      >
                        Supprimer la colonne {index + 1}
                      </Button>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {widget.state.rows.map((row, rowIndex) => (
              <tr key={row.id}>
                {row.cells.map((cell, columnIndex) => (
                  <td key={widget.config.columns[columnIndex]?.id}>
                    {readOnly ? (
                      cell
                    ) : (
                      <input
                        aria-label={`Cellule ${rowIndex + 1}, ${columnIndex + 1}`}
                        value={cell}
                        maxLength={500}
                        disabled={disabled}
                        onChange={(event) =>
                          edit({
                            ...widget,
                            state: {
                              rows: widget.state.rows.map((entry) =>
                                entry.id === row.id
                                  ? {
                                      ...entry,
                                      cells: entry.cells.map((value, index) =>
                                        index === columnIndex
                                          ? event.target.value
                                          : value
                                      ),
                                    }
                                  : entry
                              ),
                            },
                          })
                        }
                      />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td>
                    <Button
                      disabled={disabled}
                      onClick={() =>
                        edit({
                          ...widget,
                          state: {
                            rows: widget.state.rows.filter(
                              (entry) => entry.id !== row.id
                            ),
                          },
                        })
                      }
                    >
                      Supprimer la ligne {rowIndex + 1}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <>
          <Button
            disabled={locked || disabled || widget.config.columns.length >= 12}
            onClick={() =>
              edit({
                ...widget,
                config: {
                  ...widget.config,
                  columns: [
                    ...widget.config.columns,
                    {
                      id: crypto.randomUUID(),
                      label: `Colonne ${widget.config.columns.length + 1}`,
                    },
                  ],
                },
                state: {
                  rows: widget.state.rows.map((row) => ({
                    ...row,
                    cells: [...row.cells, ''],
                  })),
                },
              })
            }
          >
            Ajouter une colonne
          </Button>
          <Button
            disabled={disabled || widget.state.rows.length >= 100}
            onClick={() =>
              edit({
                ...widget,
                state: {
                  rows: [
                    ...widget.state.rows,
                    {
                      id: crypto.randomUUID(),
                      cells: widget.config.columns.map(() => ''),
                    },
                  ],
                },
              })
            }
          >
            Ajouter une ligne
          </Button>
          <label>
            Coller un tableau
            <textarea
              disabled={disabled}
              value=""
              onChange={(event) => {
                event.currentTarget.value = ''
              }}
              onPaste={(event) => {
                event.preventDefault()
                setError(null)
                try {
                  const parsed = parseTablePaste(
                    event.clipboardData.getData('text/html'),
                    event.clipboardData.getData('text/plain')
                  )
                  setPreview(parsed)
                  setHeaders(parsed.headers)
                } catch (error_) {
                  setError(
                    operationErrorMessage(
                      error_,
                      error_ instanceof Error ? error_.message : undefined
                    )
                  )
                }
              }}
            />
          </label>
          {preview && (
            <div>
              <p>
                {preview.cells.length - (headers ? 1 : 0)} lignes ×{' '}
                {preview.cells[0]?.length ?? 0} colonnes
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={headers}
                  onChange={(event) => setHeaders(event.target.checked)}
                />
                Première ligne = en-têtes
              </label>
              <Button
                disabled={sessionDisabled}
                onClick={() => {
                  try {
                    const parsed = tableFromPaste(preview, headers)
                    const sameColumns =
                      parsed.columns.length === widget.config.columns.length &&
                      parsed.columns.every(
                        (column, index) =>
                          column.label === widget.config.columns[index]?.label
                      )
                    if (locked && !sameColumns) {
                      setError(
                        'Disposition verrouillée : les colonnes du collage changent la structure.'
                      )
                      return
                    }
                    paste({
                      ...widget,
                      config: {
                        ...widget.config,
                        columns: sameColumns
                          ? widget.config.columns
                          : parsed.columns,
                      },
                      state: { rows: parsed.rows },
                    })
                    setPreview(null)
                    setError(null)
                  } catch (error_) {
                    setError(
                      operationErrorMessage(
                        error_,
                        error_ instanceof Error ? error_.message : undefined
                      )
                    )
                  }
                }}
              >
                Confirmer le collage
              </Button>
              <Button onClick={() => setPreview(null)}>
                Annuler le collage
              </Button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </>
  )
}
