'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { formNumber } from '@/lib/forms';
import { createUser, setUserActive, updateUser } from '@/lib/users';
import type { Role } from '@/lib/auth';

export type UserFormState = { error?: string };

export async function createUserAction(_prev: UserFormState, formData: FormData):
  Promise<UserFormState> {
  await requireRole(['admin']);
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
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/utilisateurs');
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

export async function updateUserAction(_prev: UserFormState, formData: FormData):
  Promise<UserFormState> {
  await requireRole(['admin']);
  const id = formNumber(formData, 'id'); // finite ou null (garde-fou : id forgé)
  if (id == null) return { error: 'Utilisateur invalide' };
  let res: Awaited<ReturnType<typeof updateUser>>;
  try {
    res = await updateUser(db, {
      id,
      name: String(formData.get('name') ?? ''),
      role: String(formData.get('role') ?? '') as Role,
      password: String(formData.get('password') ?? '') || undefined,
    });
  } catch {
    // Convention maison (cf. src/app/login/actions.ts) : ne jamais laisser
    // fuiter une erreur DB brute vers le client.
    return { error: 'Service indisponible, veuillez réessayer.' };
  }
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/utilisateurs');
  // Après une mise à jour, retirer ?edit de l'URL. redirect() lance
  // NEXT_REDIRECT : il doit rester HORS du try/catch ci-dessus.
  redirect('/admin/utilisateurs');
}
