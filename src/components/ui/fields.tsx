const FIELD = 'bg-night border border-line rounded-[10px] p-3 text-cream placeholder:text-muted focus:outline-2 focus:outline-action min-h-12';

export function Input({ className = '', ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD} ${className}`} {...rest} />;
}

export function Select({ className = '', children, ref, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & {
  ref?: React.Ref<HTMLSelectElement>;
}) {
  return <select ref={ref} className={`${FIELD} ${className}`} {...rest}>{children}</select>;
}

export function DateField({ className = '', ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input type="date" className={`${FIELD} ${className}`} {...rest} />;
}
