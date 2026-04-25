import { test, expect } from '@playwright/test';

// Use the saved auth state from tests/setup/.auth/user.json
test.use({ storageState: 'tests/setup/.auth/user.json' });

test.describe('Saku Main Flow', () => {
  
  test('Complete User Journey Flow', async ({ page }) => {
    // 1. Dashboard Check - Name Capitalization
    await page.goto('/');
    const dashboardHeader = page.locator('h1').first();
    await expect(dashboardHeader).toBeVisible();
    const headerText = await dashboardHeader.innerText();
    
    // Verify it's not empty and follows capitalization (first letter should be uppercase)
    expect(headerText.length).toBeGreaterThan(0);
    expect(headerText[0]).toBe(headerText[0].toUpperCase());
    console.log(`Verified Dashboard Name: ${headerText}`);

    // 2. Search Shortcut Test (Ctrl+K)
    // We test Ctrl+K (handled dynamically by Topbar for Windows)
    await page.keyboard.press('Control+K');
    const searchInput = page.locator('input[placeholder*="Cari"], input[placeholder*="Search"]');
    await expect(searchInput).toBeFocused();
    await searchInput.fill('Test Search');
    console.log('Verified Search Bar Shortcut (Ctrl+K)');

    // 3. Transactions Flow
    await page.goto('/transactions');
    await expect(page.locator('h1:has-text("Transaksi"), h1:has-text("Transactions")')).toBeVisible();
    
    // Add Transaction
    await page.locator('button:has-text("Tambah Transaksi"), button:has-text("Add Transaction"), button:has-text("Tambah")').first().click();
    await page.locator('button:has-text("Pemasukan"), button:has-text("Income")').click();
    await page.fill('input[name="amount"]', '1000000');
    
    // Select first category
    const categorySelect = page.locator('select[name="categoryId"]');
    await categorySelect.selectOption({ index: 1 });
    
    const txnDesc = `Testing Flow ${Date.now()}`;
    await page.fill('input[name="description"]', txnDesc);
    await page.click('button[type="submit"]');
    
    // Verify it appears in the list
    await expect(page.locator(`text=${txnDesc}`)).toBeVisible({ timeout: 10000 });
    console.log('Verified Transaction Creation Flow');

    // 4. Accounts Flow & Chart Sync
    await page.goto('/accounts');
    await expect(page.locator('h1:has-text("Akun")')).toBeVisible();
    
    // Verify donut chart is visible
    const donutChart = page.locator('svg').first();
    await expect(donutChart).toBeVisible();
    
    // Add a new account (using the Plus button in the header)
    await page.locator('button:has(svg)').nth(1).click(); // Header plus button
    await page.fill('input[name="name"]', 'Bank BCA Test');
    await page.fill('input[name="balance"]', '5000000');
    await page.click('button:has-text("Simpan"), button:has-text("Save")');
    
    // Verify account appears
    await expect(page.locator('text=Bank BCA Test')).toBeVisible();
    console.log('Verified Account Creation and Chart Visibility');

    // 5. Budget Flow
    await page.goto('/budget');
    await expect(page.locator('h1:has-text("Anggaran"), h1:has-text("Budget")')).toBeVisible();
    // Verify Usage Gauge is visible (it's the first svg on the page)
    await expect(page.locator('svg').first()).toBeVisible();
    console.log('Verified Budget Page Visibility');

    // 6. Profile Flow
    await page.goto('/profile');
    const profileName = page.locator('h2').first();
    const profileNameText = await profileName.innerText();
    expect(profileNameText.length).toBeGreaterThan(0);
    expect(profileNameText[0]).toBe(profileNameText[0].toUpperCase());
    console.log(`Verified Profile Name Capitalization: ${profileNameText}`);
  });
});
