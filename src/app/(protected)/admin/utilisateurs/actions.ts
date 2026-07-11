'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { requireRole } from '@/lib/session';
import { formNumber } from '@/lib/forms';
import { createUser, setUserActive } from '@/lib/users';
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
  try {
    await setUserActive(db, userId, formData.get('active') === 'true');
  } catch {
    return;
  }
  revalidatePath('/admin/utilisateurs');
}
