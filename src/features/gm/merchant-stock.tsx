import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { GM_MAX_STOCK_QUANTITY } from '@shared/merchants'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'

import { RowAction, RowActions } from './page-actions'
import { useEditorDraft } from './use-editor-draft'

type Stock = FunctionReturnType<typeof api.merchants.getStock>
type Row = Stock[number]
const priceText = (price: number | undefined, currency: string) =>
  price === undefined ? 'Prix non renseigné' : `${price} ${currency}`.trim()

function DraftActions({
  editor,
}: {
  editor: Pick<
    ReturnType<typeof useEditorDraft>,
    'dirty' | 'pending' | 'conflict' | 'error' | 'status' | 'save' | 'discard'
  >
}) {
  return (
    <>
      <DraftGuard dirty={editor.dirty} />
      {editor.conflict && (
        <p role="alert">Cette ligne a changé. Votre brouillon est conservé.</p>
      )}
      {editor.error && <p role="alert">{editor.error}</p>}
      <span role="status">{editor.status}</span>
      <Button
        disabled={!editor.dirty || editor.pending || editor.conflict}
        onClick={() => void editor.save()}
      >
        Enregistrer
      </Button>
      {editor.dirty && (
        <Button disabled={editor.pending} onClick={() => editor.discard()}>
          Charger la version enregistrée
        </Button>
      )}
    </>
  )
}
export function ItemProfile({
  sheetId,
  disabled = false,
}: {
  sheetId: Id<'gmSheets'>
  disabled?: boolean
}) {
  const profile = useQuery(api.items.getProfile, { sheetId })
  if (profile === undefined)
    return <p role="status">Chargement du catalogue…</p>
  return (
    <ItemProfileEditor
      sheetId={sheetId}
      profile={profile}
      disabled={disabled}
    />
  )
}
function ItemProfileEditor({
  sheetId,
  profile,
  disabled,
}: {
  sheetId: Id<'gmSheets'>
  profile: FunctionReturnType<typeof api.items.getProfile>
  disabled: boolean
}) {
  const setProfile = useMutation(api.items.setProfile)
  const editor = useEditorDraft({
    value: {
      price: profile?.price?.toString() ?? '',
      currency: profile?.currency ?? '',
      category: profile?.category ?? '',
    },
    version: profile?.version ?? 0,
    autoSave: false,
    paused: disabled,
    onSave: (value, expectedVersion) =>
      setProfile({
        sheetId,
        expectedVersion,
        ...(value.price === '' ? {} : { price: Number(value.price) }),
        currency: value.currency,
        category: value.category,
      }),
  })
  return (
    <section className="panel grid gap-3 p-5" aria-label="Profil objet">
      <h2>Catalogue</h2>
      <fieldset disabled={disabled || editor.pending} className="grid gap-3">
        <label>
          Prix de référence
          <input
            type="number"
            min="0"
            step="0.01"
            value={editor.value.price}
            onChange={(event) =>
              editor.edit({ ...editor.value, price: event.target.value })
            }
          />
        </label>
        <label>
          Devise
          <input
            maxLength={20}
            value={editor.value.currency}
            onChange={(event) =>
              editor.edit({ ...editor.value, currency: event.target.value })
            }
          />
        </label>
        <label>
          Catégorie
          <input
            maxLength={80}
            value={editor.value.category}
            onChange={(event) =>
              editor.edit({ ...editor.value, category: event.target.value })
            }
          />
        </label>
        <DraftActions editor={editor} />
      </fieldset>
      <Sellers sheetId={sheetId} />
    </section>
  )
}
function Sellers({ sheetId }: { sheetId: Id<'gmSheets'> }) {
  const [cursor, setCursor] = useState<string | null>(null)
  const page = useQuery(api.items.sellers, {
    sheetId,
    paginationOpts: { cursor, numItems: 20 },
  })
  return (
    <div>
      <h2>Vendu par</h2>
      <ul>
        {page?.page.map((seller) => (
          <li key={seller.merchantId}>
            <Link
              to="/app/sheets/$sheetId"
              params={{ sheetId: seller.merchantId }}
            >
              {seller.title}
            </Link>
            {seller.deleted && ' (en corbeille)'} ·{' '}
            {seller.quantity ?? 'Illimité'} ·{' '}
            {priceText(seller.effectivePrice, seller.currency)}
          </li>
        ))}
      </ul>
      <Button disabled={cursor === null} onClick={() => setCursor(null)}>
        Premiers marchands
      </Button>
      <Button
        disabled={!page || page.isDone}
        onClick={() => {
          if (page) setCursor(page.continueCursor)
        }}
      >
        Marchands suivants
      </Button>
    </div>
  )
}
export function ItemCatalogPreview({ sheetId }: { sheetId: Id<'gmSheets'> }) {
  const profile = useQuery(api.items.getProfile, { sheetId })
  return (
    <p>
      {priceText(profile?.price, profile?.currency ?? '')} · {profile?.category}
    </p>
  )
}

export function MerchantStock({
  merchantId,
  projectId,
  disabled = false,
}: {
  merchantId: Id<'gmSheets'>
  projectId: Id<'gmProjects'>
  disabled?: boolean
}) {
  const rows = useQuery(api.merchants.getStock, { merchantId })
  const add = useMutation(api.merchants.addStock)
  const create = useMutation(api.gmSheets.createSheet)
  const reorder = useMutation(api.merchants.reorderStock)
  const [text, setText] = useState('')
  const results = useQuery(api.gmSheets.searchSheets, {
    projectId,
    text,
    kind: 'item',
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function perform(action: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    try {
      await action()
    } catch (error_) {
      setError(operationErrorMessage(error_))
    } finally {
      setPending(false)
    }
  }
  const blocked = disabled || pending
  return (
    <section aria-label="Stock du marchand" className="panel grid gap-3 p-5">
      <h2>Stock du marchand</h2>
      <fieldset disabled={blocked}>
        <label>
          Rechercher un objet
          <input
            value={text}
            maxLength={100}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <ul>
          {results?.map((item) => (
            <li key={item._id}>
              <Button
                disabled={rows?.some((row) => row.itemId === item._id)}
                onClick={() =>
                  void perform(() => add({ merchantId, itemId: item._id }))
                }
              >
                Ajouter {item.title}
              </Button>
            </li>
          ))}
        </ul>
        <Button
          disabled={!text.trim()}
          onClick={() =>
            void perform(async () => {
              const itemId = await create({
                projectId,
                kind: 'item',
                title: text,
              })
              await add({ merchantId, itemId })
              setText('')
            })
          }
        >
          Créer cet objet et l’ajouter
        </Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {rows === undefined ? (
        <p role="status">Chargement du stock…</p>
      ) : (
        <table>
          <caption>Objets en stock</caption>
          <thead>
            <tr>
              <th>Objet</th>
              <th>Quantité et prix</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row._id}>
                <td>
                  <Link
                    to="/app/sheets/$sheetId"
                    params={{ sheetId: row.itemId }}
                  >
                    {row.item.title}
                  </Link>
                  <StockStatus row={row} />
                  <p>
                    Prix effectif :{' '}
                    {priceText(row.effectivePrice, row.item.currency)}
                  </p>
                </td>
                <td>
                  <StockEditor
                    row={row}
                    disabled={blocked}
                    order={[-1, 1].map((offset) => (
                      <RowAction
                        key={offset}
                        disabled={
                          blocked ||
                          index + offset < 0 ||
                          index + offset >= rows.length
                        }
                        onClick={() => {
                          const ids = rows.map((entry) => entry._id)
                          ids.splice(index, 1)
                          ids.splice(index + offset, 0, row._id)
                          void perform(() => reorder({ merchantId, ids }))
                        }}
                      >
                        {offset < 0 ? 'Monter' : 'Descendre'} {row.item.title}
                      </RowAction>
                    ))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
function StockStatus({ row }: { row: Row }) {
  return (
    <span>
      {row.item.deleted
        ? 'Objet indisponible (en corbeille)'
        : row.available
          ? row.quantity === 0
            ? 'Rupture'
            : ''
          : 'Indisponible'}
    </span>
  )
}
function StockEditor({
  row,
  disabled,
  order,
}: {
  row: Row
  disabled: boolean
  /** Monter/Descendre, regroupés avec Retirer dans le menu ⋯ de la ligne. */
  order: ReactNode
}) {
  const update = useMutation(api.merchants.updateStock)
  const remove = useMutation(api.merchants.removeStock)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const editor = useEditorDraft({
    value: {
      quantity: row.quantity,
      price: row.price?.toString() ?? '',
      available: row.available,
    },
    version: row.version,
    autoSave: false,
    paused: disabled || row.item.deleted,
    onSave: (value, expectedVersion) =>
      update({
        id: row._id,
        expectedVersion,
        quantity: value.quantity,
        ...(value.price === '' ? {} : { price: Number(value.price) }),
        available: value.available,
      }),
  })
  return (
    <div>
      <fieldset
        disabled={disabled || row.item.deleted || editor.pending || removing}
      >
        <label>
          Illimité
          <input
            type="checkbox"
            checked={editor.value.quantity === null}
            onChange={(event) =>
              editor.edit({
                ...editor.value,
                quantity: event.target.checked ? null : 0,
              })
            }
          />
        </label>
        <label>
          Quantité
          <input
            type="number"
            min="0"
            max={GM_MAX_STOCK_QUANTITY}
            step="1"
            disabled={editor.value.quantity === null}
            value={editor.value.quantity ?? ''}
            onChange={(event) =>
              editor.edit({
                ...editor.value,
                quantity: event.target.valueAsNumber,
              })
            }
          />
        </label>
        <label>
          Prix appliqué
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Prix de l’objet"
            value={editor.value.price}
            onChange={(event) =>
              editor.edit({ ...editor.value, price: event.target.value })
            }
          />
        </label>
        <label>
          Disponible
          <input
            type="checkbox"
            checked={editor.value.available}
            onChange={(event) =>
              editor.edit({ ...editor.value, available: event.target.checked })
            }
          />
        </label>
        <DraftActions editor={editor} />
      </fieldset>
      <RowActions label={row.item.title}>
        {order}
        <RowAction
          disabled={disabled || editor.pending || removing}
          onClick={async () => {
            setRemoving(true)
            try {
              await remove({ id: row._id })
            } catch (error_) {
              setError(operationErrorMessage(error_))
              setRemoving(false)
            }
          }}
        >
          Retirer {row.item.title}
        </RowAction>
      </RowActions>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
export function MerchantStockPreview({
  merchantId,
  disabled,
  staticRender = false,
}: {
  merchantId: Id<'gmSheets'>
  disabled: boolean
  staticRender?: boolean
}) {
  const rows = useQuery(api.merchants.getStock, { merchantId })
  const adjust = useMutation(api.merchants.adjustQuantity)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div aria-label="Stock en direct">
      {rows === undefined && <p role="status">Chargement du stock…</p>}
      <ul>
        {rows?.map((row) => (
          <li key={row._id}>
            {row.item.title} ·{' '}
            {priceText(row.effectivePrice, row.item.currency)} ·{' '}
            <output aria-label={`Stock ${row.item.title}`}>
              {row.quantity ?? 'Illimité'}
            </output>{' '}
            <StockStatus row={row} />
            {!staticRender &&
              [-1, 1].map((delta) => (
                <Button
                  key={delta}
                  aria-label={`${delta < 0 ? 'Vendre' : 'Réassortir'} ${row.item.title}`}
                  disabled={
                    disabled ||
                    pending ||
                    row.item.deleted ||
                    !row.available ||
                    row.quantity === null ||
                    (delta < 0 && row.quantity === 0) ||
                    (delta > 0 && row.quantity === GM_MAX_STOCK_QUANTITY)
                  }
                  onClick={async () => {
                    setPending(true)
                    setError(null)
                    try {
                      await adjust({ id: row._id, delta })
                    } catch (error_) {
                      setError(operationErrorMessage(error_))
                    } finally {
                      setPending(false)
                    }
                  }}
                >
                  {delta < 0 ? '−1' : '+1'}
                </Button>
              ))}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
