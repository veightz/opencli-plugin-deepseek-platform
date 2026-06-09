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

    const result = await page.evaluate(async (name) => {
      const raw = localStorage.getItem('userToken');
      if (!raw) return { error: 'not logged in' };
      const token = JSON.parse(raw).value;

      // 1) List all keys with their created_at via the list API
      const listRes = await fetch('/api/v0/users/get_api_keys', {
        headers: {
          Authorization: `Bearer ${token}`,
          accept: '*/*',
          referer: 'https://platform.deepseek.com/api_keys',
          'x-app-version': '1.0.0',
        },
      });
      if (!listRes.ok) return { error: `list API failed: ${listRes.status}` };
      const listData = await listRes.json();
      const keys = listData.data?.biz_data?.api_keys || listData.data?.api_keys || listData.api_keys || [];

      // 2) Find the target key by name
      const target = keys.find(k => k.name === name);
      if (!target) return { error: `key "${name}" not found in list` };
      if (!target.created_at) return { error: 'key found but no created_at' };

      // 3) Delete using the exact created_at
      const delRes = await fetch('/api/v0/users/edit_api_keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          referer: 'https://platform.deepseek.com/api_keys',
          'x-app-version': '1.0.0',
        },
        body: JSON.stringify({
          action: 'delete',
          name: null,
          redacted_key: target.sensitive_id || target.redacted_key || '',
          created_at: target.created_at,
        }),
      });

      if (!delRes.ok) return { error: `delete API failed: ${delRes.status}` };
      const delData = await delRes.json();
      return { success: true, created_at: target.created_at };
    }, keyName);

    if (result.success) {
      return [{ Name: keyName, Status: 'Deleted', Message: `ts=${result.created_at}` }];
    }

    return [{ Name: keyName, Status: 'Failed', Message: result.error }];
  },
});
