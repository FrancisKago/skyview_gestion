import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { importProducts } from '@/lib/import-products';
import { products } from '@/db/schema';
import { eq } from 'drizzle-orm';

const row = (line: number, cells: Record<string, string>) => ({
  line,
  cells: {
    'Nom': '', 'Catégorie': '', 'Unité de base': '', 'Conditionnement': '',
    'Taille conditionnement': '', "Prix d'achat (FCFA)": '', "Seuil d'alerte": '',
    ...cells,
  },
});

describe('importProducts', () => {
  it('crée les nouveaux, ignore les existants (case décochée), rejette les invalides', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await saveProduct(db, { name: 'Castel 65cl', baseUnit: 'bouteille', purchasePrice: 650 });
    const report = await importProducts(db, [
      row(2, { 'Nom': 'Riz', 'Catégorie': 'Vivres', 'Unité de base': 'kg', "Prix d'achat (FCFA)": '500' }),
      row(3, { 'Nom': 'castel 65CL', 'Unité de base': 'bouteille', "Prix d'achat (FCFA)": '700' }), // existant (normalisé)
      row(4, { 'Nom': 'Sans prix', 'Unité de base': 'kg' }), // prix manquant
      row(5, { 'Nom': 'Whisky', 'Unité de base': 'L', "Prix d'achat (FCFA)": 'abc' }), // prix non numérique
    ], { update: false });
    expect(report.created).toBe(1);
    expect(report.ignored).toBe(1);
    expect(report.updated).toBe(0);
    expect(report.rejects).toHaveLength(2);
    expect(report.rejects[0].line).toBe(4);
    // l'existant n'a pas bougé
    const [castel] = await db.select().from(products).where(eq(products.name, 'Castel 65cl'));
    expect(castel.purchasePrice).toBe(650);
  });
  it('met à jour les existants quand update=true ; cellule optionnelle vide = champ effacé', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await saveProduct(db, {
      name: 'Castel 65cl', baseUnit: 'bouteille', purchasePrice: 650,
      packName: 'casier', packSize: 12, alertThreshold: 24, category: 'Bières',
    });
    const report = await importProducts(db, [
      row(2, { 'Nom': 'Castel 65cl', 'Unité de base': 'bouteille', "Prix d'achat (FCFA)": '700' }),
    ], { update: true });
    expect(report.updated).toBe(1);
    const [after] = await db.select().from(products).where(eq(products.name, 'Castel 65cl'));
    expect(after.purchasePrice).toBe(700);
    expect(after.packName).toBeNull();        // effacé (cellule vide)
    expect(after.alertThreshold).toBeNull();  // effacé
    expect(after.category).toBe('');          // effacé
  });
  it('doublon interne au fichier : la dernière ligne fait foi, comptée dans duplicates', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const report = await importProducts(db, [
      row(2, { 'Nom': 'Riz', 'Unité de base': 'kg', "Prix d'achat (FCFA)": '500' }),
      row(3, { 'Nom': 'riz', 'Unité de base': 'kg', "Prix d'achat (FCFA)": '550' }),
    ], { update: false });
    expect(report.created).toBe(1);
    expect(report.duplicates).toBe(1);
    const [riz] = await db.select().from(products).where(eq(products.name, 'riz'));
    expect(riz.purchasePrice).toBe(550);
  });
  it('conditionnement incomplet rejeté (règle saveProduct)', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const report = await importProducts(db, [
      row(2, { 'Nom': 'Sucre', 'Unité de base': 'kg', 'Conditionnement': 'sac', "Prix d'achat (FCFA)": '400' }),
    ], { update: false });
    expect(report.rejects).toHaveLength(1);
    expect(report.rejects[0].reason).toContain('Conditionnement');
  });
});
