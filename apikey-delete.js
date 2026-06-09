import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'apikey-delete',
  description: 'Delete a DeepSeek API key by name',
  access: 'write',
  example: 'opencli deepseek-platform apikey-delete --name my-key',
  domain: 'platform.deepseek.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'name', help: 'Name of the API key to delete' },
  ],
  columns: ['Name', 'Status', 'Message'],

  func: async (page, kwargs) => {
    const keyName = kwargs.name;
    if (!keyName) throw new Error('--name is required');

    await page.goto('https://platform.deepseek.com/api_keys');
    await page.wait({ selector: 'main', timeout: 15 });
    await new Promise((r) => setTimeout(r, 2000));

    // Verify the key exists
    const exists = await page.evaluate((name) => {
      const body = document.body?.innerText || '';
      return body.includes(name);
    }, keyName);

    if (!exists) {
      return [{ Name: keyName, Status: 'Not found', Message: 'Key not found' }];
    }

    // Find the key's row and click the action button in the last column
    await page.evaluate((name) => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const nameEl = allEls.find(el =>
        (el.textContent || '').trim() === name && el.children.length === 0
      );
      if (!nameEl) throw new Error('name element not found');

      const row = nameEl.closest('tr');
      if (!row) throw new Error('row not found');

      // Last child of the row contains the action button
      const actionCell = row.children[row.children.length - 1];
      if (!actionCell) throw new Error('action cell not found');

      const actionBtn = actionCell.querySelector('[role="button"]');
      if (!actionBtn) throw new Error('action button in cell not found');

      actionBtn.click();
    }, keyName);

    // Wait for confirmation dialog
    await new Promise((r) => setTimeout(r, 1500));

    // Click the confirm delete button in the dialog
    await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const visible = allEls.filter(el => el.offsetParent !== null);

      // Look for confirm button: text "确认" or "确定" or "删除"
      const confirmBtn = visible.find(el => {
        const t = (el.textContent || '').trim();
        return (t === '确认' || t === '确定' || t === '确认删除' || t.toLowerCase() === 'delete' || t.toLowerCase() === 'confirm')
          && el.offsetParent !== null;
      });
      if (confirmBtn) {
        confirmBtn.click();
      }
    });

    await new Promise((r) => setTimeout(r, 2000));

    return [{ Name: keyName, Status: 'Deleted', Message: 'Key deleted successfully' }];
  },
});
