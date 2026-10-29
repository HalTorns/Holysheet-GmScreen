import { ConvexError } from 'convex/values'

import type { Doc } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { ownedScreen } from './gmAccess'
import { assertVersion, recordHistory } from './gmEditing'
import { normalizeWidget, widgetBudget } from './gmFormats'
import type { Widget } from './gmFormats'
import { limitUserOperation } from './rateLimits'

type Definition =
  | Pick<Extract<Widget, { kind: 'checklist' }>, 'kind' | 'config' | 'state'>
  | Pick<Extract<Widget, { kind: 'counter' }>, 'kind' | 'config' | 'state'>
  | Pick<Extract<Widget, { kind: 'dice' }>, 'kind' | 'config' | 'state'>
  | Pick<Extract<Widget, { kind: 'sheet' }>, 'kind' | 'config' | 'state'>
  | Pick<Extract<Widget, { kind: 'table' }>, 'kind' | 'config' | 'state'>
  | Pick<Extract<Widget, { kind: 'clock' }>, 'kind' | 'config' | 'state'>
  | Pick<Extract<Widget, { kind: 'initiative' }>, 'kind' | 'config' | 'state'>

export async function saveWidget(
  ctx: MutationCtx,
  raw: Doc<'gmNotes'>,
  expectedVersion: number,
  input: Definition,
  intent: 'edit' | 'restore' | 'control' = 'edit'
) {
  const widget = normalizeWidget(raw)
  assertVersion(widget.version, expectedVersion)
  if (widget.kind !== input.kind)
    throw new ConvexError({ code: 'INVALID_INPUT' })
  const screen = await ownedScreen(ctx, widget.screenId, widget.ownerId)
  if (
    screen.layoutLocked &&
    JSON.stringify(widget.config) !== JSON.stringify(input.config)
  )
    throw new ConvexError({ code: 'LAYOUT_LOCKED' })
  if (intent === 'edit' && widget.kind === 'clock' && input.kind === 'clock') {
    const { title: _oldTitle, ...oldConfig } = widget.config
    const { title: _newTitle, ...newConfig } = input.config
    const structureChanged =
      JSON.stringify(oldConfig) !== JSON.stringify(newConfig)
    const requiredState = structureChanged
      ? input.config.mode === 'segments'
        ? { filled: 0 }
        : { running: false, elapsedMs: 0 }
      : widget.state
    const sameState =
      'filled' in requiredState
        ? 'filled' in input.state && input.state.filled === requiredState.filled
        : 'running' in input.state &&
          input.state.running === requiredState.running &&
          input.state.elapsedMs === requiredState.elapsedMs &&
          input.state.startedAt ===
            ('startedAt' in requiredState ? requiredState.startedAt : undefined)
    if (!sameState) throw new ConvexError({ code: 'INVALID_INPUT' })
  }
  let definition: Definition
  if (input.kind === 'checklist')
    definition = { kind: input.kind, config: input.config, state: input.state }
  else if (input.kind === 'counter')
    definition = { kind: input.kind, config: input.config, state: input.state }
  else if (input.kind === 'sheet')
    definition = { kind: input.kind, config: input.config, state: input.state }
  else if (input.kind === 'table')
    definition = { kind: input.kind, config: input.config, state: input.state }
  else if (input.kind === 'clock')
    definition = { kind: input.kind, config: input.config, state: input.state }
  else if (input.kind === 'initiative')
    definition = { kind: input.kind, config: input.config, state: input.state }
  else
    definition = { kind: input.kind, config: input.config, state: input.state }
  if (input.kind === 'checklist') {
    const ids = new Set(input.config.items.map((item) => item.id))
    definition = {
      kind: input.kind,
      config: input.config,
      state: {
        checkedIds: input.state.checkedIds.filter(
          (id) =>
            ids.has(id) ||
            widget.kind !== 'checklist' ||
            !widget.config.items.some((item) => item.id === id)
        ),
      },
    }
  }
  // Detaching a valid source captures its current value atomically, never a client copy.
  if (
    intent === 'edit' &&
    widget.kind === 'counter' &&
    widget.config.source.type === 'variable' &&
    input.kind === 'counter' &&
    input.config.source.type === 'local'
  ) {
    const source = await ctx.db.get(
      'gmVariables',
      widget.config.source.variableId
    )
    if (
      source &&
      source.ownerId === widget.ownerId &&
      source.projectId === widget.projectId &&
      source.type === 'number'
    )
      definition = {
        kind: input.kind,
        config: input.config,
        state: { value: source.value },
      }
    else if (!('value' in input.state))
      throw new ConvexError({ code: 'INVALID_INPUT' })
  }
  if (
    definition.kind === 'counter' &&
    definition.config.source.type === 'variable'
  ) {
    const source = await ctx.db.get(
      'gmVariables',
      definition.config.source.variableId
    )
    if (
      !source ||
      source.ownerId !== widget.ownerId ||
      source.projectId !== widget.projectId ||
      source.type !== 'number'
    )
      throw new ConvexError({ code: 'INVALID_INPUT' })
  }
  if (definition.kind === 'sheet' && definition.config.sheetId) {
    const sheet = await ctx.db.get('gmSheets', definition.config.sheetId)
    if (
      !sheet ||
      sheet.ownerId !== widget.ownerId ||
      sheet.projectId !== widget.projectId ||
      sheet.deletedAt !== undefined
    )
      throw new ConvexError({ code: 'NOT_FOUND' })
  }
  const updated = widgetBudget({
    ...widget,
    ...definition,
    updatedAt: Date.now(),
    version: widget.version + 1,
  })
  if (
    JSON.stringify({
      kind: widget.kind,
      config: widget.config,
      state: widget.state,
    }) === JSON.stringify(definition)
  )
    return widget.version
  await limitUserOperation(ctx, 'gmEditorWrite', widget.ownerId)
  if (widget.kind === 'checklist')
    await recordHistory(ctx, widget, {
      kind: widget.kind,
      config: widget.config,
      state: widget.state,
    })
  else if (widget.kind === 'counter')
    await recordHistory(ctx, widget, {
      kind: widget.kind,
      config: widget.config,
      state: widget.state,
    })
  else if (widget.kind === 'sheet')
    await recordHistory(ctx, widget, {
      kind: widget.kind,
      config: widget.config,
      state: widget.state,
    })
  else if (widget.kind === 'table')
    await recordHistory(ctx, widget, {
      kind: widget.kind,
      config: widget.config,
      state: widget.state,
    })
  else if (widget.kind === 'clock')
    await recordHistory(ctx, widget, {
      kind: widget.kind,
      config: widget.config,
      state: widget.state,
    })
  else if (widget.kind === 'initiative')
    await recordHistory(ctx, widget, {
      kind: widget.kind,
      config: widget.config,
      state: widget.state,
    })
  else
    await recordHistory(ctx, widget, {
      kind: widget.kind,
      config: widget.config,
      state: widget.state,
    })
  const { _id, _creationTime: _time, ...value } = updated
  await ctx.db.replace('gmNotes', _id, value)
  return updated.version
}
