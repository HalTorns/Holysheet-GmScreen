import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { Check, ChevronRight } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Menus de l'éditeur : déroulants, sous-menus et menu contextuel partagent les
// mêmes éléments. Base UI fournit le focus, le clavier et les rôles ARIA.

const popupClass =
  'z-50 min-w-48 rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg outline-none'
const itemClass =
  'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted'

const Menu = MenuPrimitive.Root
const MenuTrigger = MenuPrimitive.Trigger
const MenuRadioGroup = MenuPrimitive.RadioGroup

function MenuContent({
  className,
  align = 'start',
  side,
  children,
  ...props
}: MenuPrimitive.Popup.Props & {
  align?: MenuPrimitive.Positioner.Props['align']
  side?: MenuPrimitive.Positioner.Props['side']
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="z-50 outline-none"
        align={align}
        side={side}
        sideOffset={4}
      >
        <MenuPrimitive.Popup className={cn(popupClass, className)} {...props}>
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuShortcut({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-auto pl-4 font-sans text-xs text-muted-foreground">
      {children}
    </kbd>
  )
}

function MenuItem({
  className,
  shortcut,
  children,
  ...props
}: MenuPrimitive.Item.Props & { shortcut?: string }) {
  return (
    <MenuPrimitive.Item className={cn(itemClass, className)} {...props}>
      {children}
      {shortcut && <MenuShortcut>{shortcut}</MenuShortcut>}
    </MenuPrimitive.Item>
  )
}

function MenuCheckboxItem({
  className,
  children,
  ...props
}: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      className={cn(itemClass, 'relative pl-7', className)}
      closeOnClick={false}
      {...props}
    >
      <MenuPrimitive.CheckboxItemIndicator className="absolute left-2">
        <Check className="size-4" />
      </MenuPrimitive.CheckboxItemIndicator>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function MenuRadioItem({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      className={cn(itemClass, 'relative pl-7', className)}
      {...props}
    >
      <MenuPrimitive.RadioItemIndicator className="absolute left-2">
        <Check className="size-4" />
      </MenuPrimitive.RadioItemIndicator>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function MenuSeparator({ className, ...props }: ComponentProps<'div'>) {
  return (
    <MenuPrimitive.Separator
      className={cn('my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function MenuSub({
  label,
  disabled,
  children,
}: {
  label: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <MenuPrimitive.SubmenuRoot>
      <MenuPrimitive.SubmenuTrigger
        className={cn(itemClass, 'justify-between')}
        disabled={disabled}
      >
        {label}
        <ChevronRight className="size-4" />
      </MenuPrimitive.SubmenuTrigger>
      <MenuContent side="right" align="start">
        {children}
      </MenuContent>
    </MenuPrimitive.SubmenuRoot>
  )
}

const ContextMenu = ContextMenuPrimitive.Root
const ContextMenuTrigger = ContextMenuPrimitive.Trigger

function ContextMenuContent({
  className,
  children,
  ...props
}: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="z-50 outline-none">
        <ContextMenuPrimitive.Popup
          className={cn(popupClass, className)}
          {...props}
        >
          {children}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuTrigger,
}
