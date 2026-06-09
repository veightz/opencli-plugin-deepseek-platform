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

    // Find the key's redacted_key and created_at from the page text
    const keyInfo = await page.evaluate((name) => {
      const body = document.body?.innerText || '';
      const lines = body.split('\n').filter(l => l.includes('sk-'));
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 3 && parts[0].trim() === name) {
          return {
            redacted_key: parts[1].trim(),
            created_at: parts[2].trim(),
          };
        }
      }
      return null;
    }, keyName);

    if (!keyInfo) {
      return [{ Name: keyName, Status: 'Not found', Message: 'Key not found. Use apikey to list all keys.' }];
    }

    // Parse created_at date to timestamp
    const dateStr = keyInfo.created_at;
    const created_at = dateStr && dateStr !== '-'
      ? Math.floor(new Date(dateStr).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    // Call the delete API
    const result = await page.evaluate(async ({ redacted_key, created_at }) => {
      const raw = localStorage.getItem('userToken');
      if (!raw) throw new Error('Not logged in.');
      const token = JSON.parse(raw).value;

      const body = {
        action: 'delete',
        name: null,
        redacted_key,
        created_at,
      };

      const res = await fetch('/api/v0/users/edit_api_keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          referer: 'https://platform.deepseek.com/api_keys',
          'x-app-version': '1.0.0',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      return data;
    }, { redacted_key: keyInfo.redacted_key, created_at });

    return [{ Name: keyName, Status: 'Deleted', Message: 'Key deleted via API' }];
  },
});
