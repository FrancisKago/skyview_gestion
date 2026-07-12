'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { formNumber, formValues } from '@/lib/forms';
import { createUser, setUserActive } from '@/lib/users';
import type { Role } from '@/lib/auth';

export type UserFormState = {
  error?: string;
  // En cas d'erreur : valeurs soumises à réinjecter en defaultValue, et compteur
  // de tentatives servant de `key` côté client pour forcer le remontage des
  // champs (React 19 réinitialise les champs non contrôlés à chaque soumission).
  // Le mot de passe n'est volontairement PAS renvoyé (il ne doit pas transiter
  // dans la réponse ni rester dans l'état client) : l'utilisateur le retape.
  values?: Record<string, string>;
  attempt?: number;
};

const FIELDS = ['name', 'username', 'role'] as const;

export async function createUserAction(prev: UserFormState, formData: FormData):
  Promise<UserFormState> {
  await requireRole(['admin']);
  const fail = (error?: string): UserFormState =>
    ({ error, values: formValues(formData, FIELDS), attempt: (prev.attempt ?? 0) + 1 });
  let res: Awaited<ReturnType<typeof createUser>>;
  try {
    res = await createUser(db, {
      name: String(formData.get('name') ?? ''),
      username: String(formData.get('username') ?? ''),
      password: String(formData.get('password') ?? ''),
      role: String(formData.get('role') ?? '') as Role,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return fail('Service indisponible, veuillez réessayer.');
  }
  if (!res.ok) return fail(res.error);
  revalidatePath('/admin/utilisateurs');
  // Succès : état vide → key repart à 0, les champs remontent vides (le reset
  // automatique après soumission est le comportement souhaité en création).
  return {};
}

export async function toggleUserAction(formData: FormData) {
  await requireRole(['admin']);
  const userId = formNumber(formData, 'userId'); // finite ou null (garde-fou : userId forgé)
  if (userId == null) return;
  let res: Awaited<ReturnType<typeof setUserActive>>;
  try {
    res = await setUserActive(db, userId, formData.get('active') === 'true');
  } catch {
    return;
  }
  // Action de formulaire simple (sans useActionState) : pas d'affichage d'erreur,
  // le garde-fou "dernier admin actif" protège la DB ; on ne revalide que sur succès.
  if (!res.ok) return;
  revalidatePath('/admin/utilisateurs');
}
