#!/usr/bin/env node
/**
 * Captures screenshots of the dashboard for testing.
 * Run: npx playwright install chromium  (once)
 *      node capture-screenshots.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = 'dashboard-screenshots';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // 1. Navigate to dashboard
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/1-dashboard-initial.png`, fullPage: true });

    // 2. Click first order in sidebar (button with order id)
    const firstOrderBtn = page.locator('aside button').first();
    const hasOrders = await firstOrderBtn.count() > 0;
    if (hasOrders) {
      await firstOrderBtn.click();
      await page.waitForTimeout(2000); // wait for flow graph
      await page.screenshot({ path: `${OUT}/2-dashboard-with-flow.png`, fullPage: true });
    } else {
      await page.screenshot({ path: `${OUT}/2-no-orders.png`, fullPage: true });
    }
  } catch (err) {
    console.error(err);
    await page.screenshot({ path: `${OUT}/error.png`, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
