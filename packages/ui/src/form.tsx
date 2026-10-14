import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { Controller, FormProvider, useFormContext } from "react-hook-form"

import { cn } from "./cn"
import { Label } from "./label"
import type { ControllerProps, FieldPath, FieldValues } from "react-hook-form"

const Form = FormProvider

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null)
interface FormItemContextValue {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue | null>(null)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...properties
}: ControllerProps<TFieldValues, TName>) => (
  <FormFieldContext.Provider value={{ name: properties.name }}>
    <Controller {...properties} />
  </FormFieldContext.Provider>
)

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  if (!fieldContext || !itemContext) {
    throw new Error("useFormField should be used within <FormField> and <FormItem>")
  }

  const fieldState = getFieldState(fieldContext.name, formState)
  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...properties }, reference) => {
    const id = React.useId()

    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={reference} className={cn("space-y-2", className)} {...properties} />
      </FormItemContext.Provider>
    )
  }
)
FormItem.displayName = "FormItem"

const FormLabel = React.forwardRef<HTMLLabelElement, React.ComponentPropsWithoutRef<typeof Label>>(
  ({ className, ...properties }, reference) => {
    const { error, formItemId } = useFormField()

    return (
      <Label
        ref={reference}
        className={cn(error && "text-destructive", className)}
        htmlFor={formItemId}
        {...properties}
      />
    )
  }
)
FormLabel.displayName = "FormLabel"

/**
 * FormControl - Radix Slot 的替代. base-ui 无独立 Slot;
 * 手动 clone 子元素并合并 aria/id props (react-hook-form 场景).
 */
const FormControl = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ children, ...properties }, reference) => {
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

    if (!React.isValidElement(children)) {
      return null
    }
    const child = children as React.ReactElement<
      React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }
    >
    const merged = mergeProps<"div">(
      {
        id: formItemId,
        "aria-describedby": error
          ? `${formDescriptionId} ${formMessageId}`
          : `${formDescriptionId}`,
        "aria-invalid": !!error,
        ...properties,
      } as unknown as React.ComponentPropsWithoutRef<"div">,
      child.props as unknown as React.ComponentPropsWithoutRef<"div">
    )
    return React.cloneElement(child, {
      ...merged,
      ref: reference,
    } as React.HTMLAttributes<HTMLElement> & {
      ref: React.Ref<HTMLElement>
    })
  }
)
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...properties }, reference) => {
  const { formDescriptionId } = useFormField()

  return (
    <p
      ref={reference}
      id={formDescriptionId}
      className={cn("text-muted-foreground text-[0.8rem]", className)}
      {...properties}
    />
  )
})
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...properties }, reference) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? "") : children

  if (!body) {
    return null
  }

  return (
    <p
      ref={reference}
      id={formMessageId}
      className={cn("text-destructive text-[0.8rem] font-medium", className)}
      {...properties}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = "FormMessage"

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
