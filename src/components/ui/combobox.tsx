'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { filterComboOptions, resolveExact, type ComboOption } from '@/lib/combo-filter';

export type { ComboOption };

// Champ produit/article avec autocomplétion (spec combobox §2). Le champ visible
// porte le NOM ; l'id (ou le label si valueAs="label") part dans un input hidden —
// le contrat FormData des actions serveur est inchangé. L'état interne s'aligne
// sur le cycle de vie des formulaires maison : remontage par key={attempt} (via
// defaultValue) et formRef.reset() (écoute de l'événement reset natif).
export function Combobox({
  name, options, defaultValue, placeholder, required, valueAs = 'id', onSelect, className = '',
}: {
  name: string;
  options: ComboOption[];
  defaultValue?: number | string;
  placeholder?: string;
  required?: boolean;
  valueAs?: 'id' | 'label';
  onSelect?: (id: number | null) => void;
  className?: string;
}) {
  const initial = defaultValue != null && defaultValue !== ''
    ? options.find((o) => String(o.id) === String(defaultValue)) ?? null
    : null;
  const [text, setText] = useState(initial?.label ?? '');
  const [chosen, setChosen] = useState<ComboOption | null>(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // jsx-a11y/role-has-required-aria-props : role="combobox" exige aria-controls.
  const listboxId = useId();

  // formRef.current?.reset() des parents (succès de soumission) doit aussi vider
  // l'état interne du combobox : on écoute le reset NATIF du formulaire hôte.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => { setText(''); setChosen(null); setOpen(false); };
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, []);

  // Fermeture au tap hors du composant.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const suggestions = filterComboOptions(options, chosen ? '' : text, 8);
  const pick = (o: ComboOption) => {
    setText(o.label); setChosen(o); setOpen(false); onSelect?.(o.id);
  };
  const hiddenValue = chosen ? (valueAs === 'label' ? chosen.label : String(chosen.id)) : '';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input type="hidden" name={name} value={hiddenValue} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={text}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className="bg-night border border-line rounded-[10px] p-3 text-cream placeholder:text-muted focus:outline-2 focus:outline-action min-h-12 w-full pr-9"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          // Texte modifié après sélection -> l'id n'est plus garanti : on l'invalide.
          if (chosen) { setChosen(null); onSelect?.(null); }
          setOpen(true); setActive(0);
        }}
        onBlur={() => {
          // Résolution exacte : « castel 65cl » tapé puis champ suivant, sans tap.
          if (!chosen && text.trim()) {
            const exact = resolveExact(options, text);
            if (exact) { setText(exact.label); setChosen(exact); onSelect?.(exact.id); }
          }
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') {
            // Entrée choisit la suggestion active au lieu de soumettre le formulaire.
            if (suggestions[active]) { e.preventDefault(); pick(suggestions[active]); }
          } else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {(text !== '' || chosen) && (
        <button type="button" aria-label="Effacer"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-cream px-1"
          onPointerDown={(e) => {
            e.preventDefault();
            setText(''); setChosen(null); setOpen(false); onSelect?.(null);
            inputRef.current?.focus();
          }}>
          ×
        </button>
      )}
      {open && suggestions.length > 0 && (
        <ul id={listboxId} role="listbox"
          className="absolute z-10 inset-x-0 top-full mt-1 bg-card border border-line rounded-[10px] max-h-64 overflow-y-auto shadow-lg">
          {suggestions.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}
              className={`px-3 py-2.5 cursor-pointer ${i === active ? 'bg-surface' : ''}`}
              // onPointerDown (pas onClick) : la sélection doit précéder le blur de l'input,
              // sinon la liste se ferme avant que le tap n'atteigne l'option.
              onPointerDown={(e) => { e.preventDefault(); pick(o); }}
              onPointerMove={() => setActive(i)}>
              {o.group && <span className="text-muted text-[10px] uppercase tracking-wider mr-2">{o.group}</span>}
              <span className="text-cream">{o.label}</span>
              {o.sublabel && <span className="text-muted text-xs ml-2">{o.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
