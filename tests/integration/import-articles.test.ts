import { describe, it, expect } from 'vitest';
import { createTestDb, seedBase } from '../helpers/db';
import { saveProduct } from '@/lib/products';
import { saveSaleArticle, getRecipeMap } from '@/lib/sale-articles';
import { importArticles } from '@/lib/import-articles';
import { saleArticles } from '@/db/schema';
import { eq } from 'drizzle-orm';

const row = (line: number, article: string, emplacement: string, produit: string, qty: string) => ({
  line, cells: { 'Article caisse': article, 'Emplacement': emplacement, 'Produit': produit, 'Quantité': qty },
});

describe('importArticles', () => {
  it('groupe les lignes par article, crée avec la fiche complète, rejette le groupe si un produit manque (avec suggestion)', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const poulet = await saveProduct(db, { name: 'Poulet', baseUnit: 'kg', purchasePrice: 3500 });
    await saveProduct(db, { name: 'Plantain', baseUnit: 'kg', purchasePrice: 800 });
    const report = await importArticles(db, [
      row(2, 'Poulet DG', 'Cuisine', 'Poulet', '0,4'),
      row(3, 'Poulet DG', 'Cuisine', 'Plantain', '0,2'),
      row(4, 'Mojito', 'Bar', 'Rhum', '0,05'), // Rhum inexistant
    ], { update: false });
    expect(report.created).toBe(1);
    expect(report.rejects).toHaveLength(1);
    expect(report.rejects[0].line).toBe(4);
    expect(report.rejects[0].reason).toContain('Rhum');
    const map = await getRecipeMap(db);
    const [dg] = await db.select().from(saleArticles).where(eq(saleArticles.cashName, 'Poulet DG'));
    expect(map.get(dg.id)).toEqual([
      { productId: poulet.id, qty: 0.4 },
      { productId: expect.any(Number), qty: 0.2 },
    ]);
  });
  it('suggestion pour produit proche ; emplacement invalide rejeté', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await saveProduct(db, { name: 'Plantain', baseUnit: 'kg', purchasePrice: 800 });
    const report = await importArticles(db, [
      row(2, 'Frites', 'Cuisine', 'Plantin', '0,3'),   // faute -> suggestion Plantain
      row(3, 'Test', 'Magasin', 'Plantain', '1'),       // emplacement invalide
    ], { update: false });
    expect(report.rejects).toHaveLength(2);
    expect(report.rejects[0].reason).toContain('Plantain'); // « vouliez-vous … »
    expect(report.rejects[1].reason.toLowerCase()).toContain('emplacement');
  });
  it('existant : ignoré sans update, fiche remplacée avec update ; doublon produit dans un groupe additionné', async () => {
    const db = await createTestDb();
    const { bar } = await seedBase(db);
    const castel = await saveProduct(db, { name: 'Castel', baseUnit: 'bouteille', purchasePrice: 650 });
    await saveSaleArticle(db, { cashName: 'Castel 65cl', locationId: bar.id, lines: [{ productId: castel.id!, qty: 1 }] });
    const rows = [
      row(2, 'castel 65CL', 'Bar', 'Castel', '1'),
      row(3, 'castel 65CL', 'Bar', 'Castel', '1'), // doublon -> s'additionne (qty 2)
    ];
    const r1 = await importArticles(db, rows, { update: false });
    expect(r1.ignored).toBe(1);
    const r2 = await importArticles(db, rows, { update: true });
    expect(r2.updated).toBe(1);
    const map = await getRecipeMap(db);
    const [art] = await db.select().from(saleArticles).where(eq(saleArticles.cashName, 'Castel 65cl'));
    expect(map.get(art.id)).toEqual([{ productId: castel.id, qty: 2 }]);
  });
  it('quantité invalide rejette le groupe avec la ligne fautive', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await saveProduct(db, { name: 'Poulet', baseUnit: 'kg', purchasePrice: 3500 });
    const report = await importArticles(db, [
      row(2, 'Poulet DG', 'Cuisine', 'Poulet', 'beaucoup'),
    ], { update: false });
    expect(report.rejects).toHaveLength(1);
    expect(report.rejects[0].line).toBe(2);
  });
});
