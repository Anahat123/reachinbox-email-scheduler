import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'outline' | 'soft' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-200',
  outline: 'border border-brand-500 text-brand-600 bg-white hover:bg-brand-50 disabled:border-brand-200 disabled:text-brand-200',
  soft: 'bg-brand-100 text-ink hover:bg-brand-50 disabled:opacity-60',
  ghost: 'text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-4 text-xs rounded-full',
  md: 'h-9 px-4 text-sm rounded-full',
  lg: 'h-12 px-5 text-sm rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}
