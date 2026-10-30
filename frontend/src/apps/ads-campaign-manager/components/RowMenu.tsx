import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@shared/ui/Icon';

export interface RowMenuItem {
  action: string;
  label: string;
  icon: IconName;
  danger?: boolean;
  onClick: () => void;
}

/** The per-row "⋯ More" menu: closes on outside click, Escape, or after picking an item. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`ads-menu${open ? ' is-open' : ''}`}>
      <button type="button" className="ads-icon-btn ads-menu__toggle" data-action="more" aria-label={label} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} title="More actions" onClick={() => setOpen((o) => !o)}>
        <Icon name="more" size={16} />
      </button>
      <div className="ads-menu__list" role="menu" hidden={!open}>
        {items.map((item) => (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            className={`ads-menu__item${item.danger ? ' ads-menu__item--danger' : ''}`}
            data-action={item.action}
            onClick={() => {
              setOpen(false);
              item.onClick();
            }}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
