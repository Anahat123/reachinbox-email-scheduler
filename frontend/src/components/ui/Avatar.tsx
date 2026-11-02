/* eslint-disable @next/next/no-img-element */
import clsx from 'clsx';
import { initials } from '@/lib/format';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={style}
        referrerPolicy="no-referrer"
        className={clsx('shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span
      style={style}
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-medium text-white', className)}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
