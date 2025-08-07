// components/ui/card.tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-xl border bg-white text-black shadow", className)} {...props} />
  )
)
Card.displayName = "Card"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

export { Card, CardContent }

// components/ui/button.tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return <Comp ref={ref} className={cn("inline-flex items-center justify-center rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700", className)} {...props} />
})
Button.displayName = "Button"

export { Button }

// components/ui/input.tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  return <input ref={ref} className={cn("flex h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", className)} {...props} />
})
Input.displayName = "Input"

export { Input }

// components/ui/label.tsx
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "@/lib/utils"

const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }

// components/ui/select.tsx
'use client'

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root
const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(({ className, ...props }, ref) => (
  <SelectPrimitive.Trigger ref={ref} className={cn("flex h-10 w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", className)} {...props} />
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectValue = SelectPrimitive.Value

const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content ref={ref} className={cn("z-50 mt-1 w-full rounded-md border bg-white p-1 text-sm shadow-lg", className)} {...props}>
      {children}
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item ref={ref} className={cn("relative flex cursor-default select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-blue-100", className)} {...props}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
