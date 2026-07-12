import { describe, it, expect } from 'vitest';
import { formNumber, formValues } from '@/lib/forms';

describe('formNumber', () => {
  it('nombre fini, null si vide ou non numérique', () => {
    const fd = new FormData();
    fd.set('ok', '12.5');
    fd.set('vide', '  ');
    fd.set('texte', 'abc');
    expect(formNumber(fd, 'ok')).toBe(12.5);
    expect(formNumber(fd, 'vide')).toBeNull();
    expect(formNumber(fd, 'texte')).toBeNull();
    expect(formNumber(fd, 'absent')).toBeNull();
  });
});

describe('formValues', () => {
  it("n'extrait que les clés demandées, telles que soumises", () => {
    const fd = new FormData();
    fd.set('name', 'Castel 65cl');
    fd.set('packSize', '12');
    fd.set('password', 'secret');
    expect(formValues(fd, ['name', 'packSize'])).toEqual({
      name: 'Castel 65cl',
      packSize: '12',
    });
  });
  it('omet les clés absentes (le client affichera un champ vide)', () => {
    const fd = new FormData();
    fd.set('name', 'X');
    expect(formValues(fd, ['name', 'category'])).toEqual({ name: 'X' });
  });
});
