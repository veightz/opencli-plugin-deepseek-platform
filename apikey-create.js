import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'apikey-create',
  description: 'Create a new DeepSeek API key. WARNING: This creates a real key on your account.',
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

    // Click create button
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      const btn = els.find(el => el.textContent.trim() === '创建 API key' && el.offsetParent !== null);
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Fill name input with native React-compatible setter
    await page.evaluate((name) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const input = inputs.find(i => i.offsetParent !== null);
      if (!input) return;
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (proto?.set) {
        proto.set.call(input, name);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, keyName);
    await new Promise((r) => setTimeout(r, 500));

    // Click submit button
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      const submitBtn = els.find(el =>
        el.textContent.trim() === '创建' && el.children.length === 0 && el.offsetParent !== null
      );
      if (submitBtn) submitBtn.click();
    });

    // Capture the full key from the result dialog
    await new Promise((r) => setTimeout(r, 1500));
    const fullKey = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      const m = text.match(/sk-[a-zA-Z0-9]{20,}/);
      return m ? m[0] : '';
    });

    if (fullKey) {
      return [{ Name: keyName, Key: fullKey, Message: 'Created successfully' }];
    }

    return [{
      Name: keyName,
      Key: '',
      Message: 'Key created but full key only visible in dialog. Check platform.deepseek.com/api_keys to copy it.',
    }];
  },
});
