'use client';

import { useQueryClient } from '@tanstack/react-query';
import { RotateCw, Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IconButton } from '@/components/ui/Button';

/** Search box backed by Elasticsearch; the query lives in the URL (?q=) so tabs and refresh keep it. */
export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const urlQuery = params.get('q') ?? '';
  const [value, setValue] = useState(urlQuery);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => setValue(urlQuery), [urlQuery]);

  useEffect(() => {
    if (value.trim() === urlQuery) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      next.delete('page');
      router.replace(`${pathname}${next.size ? `?${next}` : ''}`);
    }, 300);
    return () => clearTimeout(t);
  }, [value, urlQuery, params, pathname, router]);

  const refresh = async () => {
    setSpinning(true);
    await qc.invalidateQueries({ queryKey: ['emails'] });
    await qc.invalidateQueries({ queryKey: ['counts'] });
    setTimeout(() => setSpinning(false), 400);
  };

  return (
    <div className="flex items-center gap-2 px-4 pt-5">
      <label className="flex h-10 w-full max-w-[672px] items-center gap-2 rounded-full bg-surface px-4">
        <Search className="h-4 w-4 text-ink-faint" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search"
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
        {value && (
          <button type="button" aria-label="Clear search" onClick={() => setValue('')} className="text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>
      <IconButton aria-label="Refresh" onClick={refresh}>
        <RotateCw className={spinning ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
      </IconButton>
    </div>
  );
}
