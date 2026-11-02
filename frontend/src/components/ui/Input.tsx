import clsx from 'clsx';
import { forwardRef, type InputHTMLAttributes } from 'react';

/** Filled grey input, as on the login card. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx(
        'h-[52px] w-full rounded-lg bg-surface px-4 text-sm text-ink placeholder:text-ink-faint outline-none ring-brand-200 focus:ring-2',
        className,
      )}
      {...props}
    />
  );
});

/** Small bordered numeric box ("00") used for delay / hourly limit. */
export const NumberBox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function NumberBox(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      min={0}
      className={clsx(
        'h-9 w-16 rounded-md border border-line bg-white px-2.5 text-sm text-ink placeholder:text-ink-faint outline-none',
        'focus:border-brand-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
        className,
      )}
      {...props}
    />
  );
});

/** Borderless underlined row field used throughout the compose form. */
export const LineInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function LineInput(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx('h-8 w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none', className)}
      {...props}
    />
  );
});
