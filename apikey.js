import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'apikey',
  description: 'List DeepSeek API keys (auto from browser session)',
  access: 'read',
  example: 'opencli deepseek-platform apikey -f table',
  domain: 'platform.deepseek.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  columns: ['Name', 'Key', 'CreatedAt', 'LastUsed'],

  func: async (page, kwargs) => {
    await page.goto('https://platform.deepseek.com/api_keys');
    await page.wait({ selector: 'main', timeout: 15 });
    await new Promise((r) => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
      const body = document.body?.innerText || '';
      const rows = [];
      const lines = body.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('sk-')) {
          // Format: name  sk-xxx  created_date  status
          const parts = trimmed.split('\t');
          if (parts.length >= 4) {
          rows.push({
            Name: parts[0].trim(),
            Key: parts[1].trim(),
            CreatedAt: parts[2].trim(),
            LastUsed: parts.slice(3).join(' ').trim(),
          });
          }
        }
      }
      return rows;
    });

    if (result.length === 0) {
      throw new Error('No API keys found on the page. Create one at platform.deepseek.com/api_keys first.');
    }

    return result;
  },
});
