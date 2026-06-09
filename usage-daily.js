import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'usage-daily',
  description: 'Query DeepSeek daily token usage (auto from browser session)',
  access: 'read',
  example: 'opencli deepseek-platform usage-daily --month 6 --year 2026 --model flash -f table',
  domain: 'platform.deepseek.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'month', type: 'int', default: 0, help: 'Month (1-12, default: current)' },
    { name: 'year', type: 'int', default: 0, help: 'Year (default: current)' },
    { name: 'model', help: 'Filter by model name (e.g. deepseek-v4-flash)' },
    { name: 'top', type: 'int', default: 0, help: 'Show only last N days' },
  ],
  columns: ['Date', 'Model', 'Requests', 'CacheHit', 'CacheMiss', 'OutputTokens', 'CostCNY'],

  func: async (page, kwargs) => {
    await page.goto('https://platform.deepseek.com/usage');
    await page.wait({ selector: 'main', timeout: 15 });

    const now = new Date();
    const month = kwargs.month || (now.getMonth() + 1);
    const year = kwargs.year || now.getFullYear();

    const result = await page.evaluate(async ({ month, year, model, top }) => {
      const raw = localStorage.getItem('userToken');
      if (!raw) {
        throw new Error('Not logged in. Please log into platform.deepseek.com first.');
      }
      const token = JSON.parse(raw).value;

      const headers = {
        Authorization: `Bearer ${token}`,
        Referer: 'https://platform.deepseek.com/usage',
        accept: '*/*',
      };

      const [amountRes, costRes] = await Promise.all([
        fetch(`/api/v0/usage/amount?month=${month}&year=${year}`, { headers }),
        fetch(`/api/v0/usage/cost?month=${month}&year=${year}`, { headers }),
      ]);

      if (!amountRes.ok) throw new Error(`Amount API error ${amountRes.status}`);
      if (!costRes.ok) throw new Error(`Cost API error ${costRes.status}`);

      const amountData = await amountRes.json();
      const costData = await costRes.json();

      if (amountData.code !== 0) throw new Error(`Platform API error: ${amountData.msg || 'unknown'}`);

      // Build per-model monthly cost by usage type
      const monthlyCost = {};
      if (Array.isArray(costData.data?.biz_data)) {
        for (const entry of costData.data.biz_data) {
          for (const m of entry.total || []) {
            monthlyCost[m.model] = Object.fromEntries(
              (m.usage || []).map((u) => [u.type, parseFloat(u.amount || 0)])
            );
          }
        }
      }

      // Build per-model monthly token totals by usage type
      const monthlyTokens = {};
      for (const m of amountData.data?.biz_data?.total || []) {
        monthlyTokens[m.model] = Object.fromEntries(
          (m.usage || []).map((u) => [u.type, parseFloat(u.amount || 0)])
        );
      }

      const days = amountData.data?.biz_data?.days || [];

      let rows = days.flatMap((day) =>
        day.data.map((m) => {
          const usageMap = Object.fromEntries(
            (m.usage || []).map((u) => [u.type, parseFloat(u.amount || 0)])
          );

          // Allocate daily cost proportionally by each usage type
          let dailyCost = 0;
          const modelCost = monthlyCost[m.model];
          const modelTokens = monthlyTokens[m.model];
          if (modelCost && modelTokens) {
            for (const [type, dailyAmount] of Object.entries(usageMap)) {
              if (dailyAmount > 0 && (modelTokens[type] || 0) > 0) {
                dailyCost += (dailyAmount / modelTokens[type]) * (modelCost[type] || 0);
              }
            }
          }

          return {
            Date: day.date,
            Model: m.model,
            Requests: String(usageMap['REQUEST'] || 0),
            CacheHit: String(usageMap['PROMPT_CACHE_HIT_TOKEN'] || 0),
            CacheMiss: String(usageMap['PROMPT_CACHE_MISS_TOKEN'] || 0),
            OutputTokens: String(usageMap['RESPONSE_TOKEN'] || 0),
            CostCNY: dailyCost.toFixed(4),
          };
        })
      );

      // Filter out dates with no usage at all
      const datesWithUsage = new Set();
      for (const r of rows) {
        if (r.Requests !== '0' || r.CacheHit !== '0' || r.CacheMiss !== '0' || r.OutputTokens !== '0') {
          datesWithUsage.add(r.Date);
        }
      }
      rows = rows.filter((r) => datesWithUsage.has(r.Date));

      if (model) {
        rows = rows.filter((r) => r.Model.includes(model));
      }

      if (top > 0) {
        const seen = new Set();
        rows = rows
          .sort((a, b) => b.Date.localeCompare(a.Date))
          .filter((r) => {
            if (seen.has(r.Date)) return true;
            if (seen.size >= top) return false;
            seen.add(r.Date);
            return true;
          });
      }

      return rows;
    }, { month, year, model: kwargs.model, top: kwargs.top });

    return result;
  },
});
