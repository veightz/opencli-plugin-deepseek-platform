import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'apikey-create',
  description: 'Create a new DeepSeek API key',
  access: 'write',
  example: 'opencli deepseek-platform apikey-create --name my-key -f yaml',
  domain: 'platform.deepseek.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'name', help: 'Name for the new API key' },
  ],
  columns: ['Name', 'Key', 'Message'],

  func: async (page, kwargs) => {
    const keyName = kwargs.name || `key-${Date.now()}`;

    await page.goto('https://platform.deepseek.com/api_keys');
    await page.wait({ selector: 'main', timeout: 15 });
    await new Promise((r) => setTimeout(r, 2000));

    const result = await page.evaluate(async (name) => {
      const raw = localStorage.getItem('userToken');
      if (!raw) throw new Error('Not logged in.');
      const token = JSON.parse(raw).value;

      const res = await fetch('/api/v0/users/edit_api_keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          referer: 'https://platform.deepseek.com/api_keys',
          'x-app-version': '1.0.0',
        },
        body: JSON.stringify({ action: 'create', name, redacted_key: null, created_at: null }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      return data;
    }, keyName);

    const apiKey = result.data?.biz_data?.api_key?.sensitive_id
      || result.data?.api_key
      || result.api_key
      || result.data?.biz_data?.api_key?.key
      || '';

    return [{
      Name: keyName,
      Key: apiKey,
      Message: apiKey ? 'Created successfully' : JSON.stringify(result).slice(0, 200),
    }];
  },
});
