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

      const costTypes = ['PROMPT_CACHE_HIT_TOKEN', 'PROMPT_CACHE_MISS_TOKEN', 'RESPONSE_TOKEN'];

      // Per-model: monthly cost per usage type (from cost API)
      const monthlyCostByType = {};
      if (Array.isArray(costData.data?.biz_data)) {
        for (const entry of costData.data.biz_data) {
          for (const m of entry.total || []) {
            monthlyCostByType[m.model] = Object.fromEntries(
              (m.usage || []).map((u) => [u.type, parseFloat(u.amount || 0)])
            );
          }
        }
      }

      // Per-model: monthly token total per usage type (from amount API total)
      const monthlyTokensByType = {};
      for (const m of amountData.data?.biz_data?.total || []) {
        monthlyTokensByType[m.model] = Object.fromEntries(
          (m.usage || []).map((u) => [u.type, parseFloat(u.amount || 0)])
        );
      }

      const days = amountData.data?.biz_data?.days || [];

      let rows = days.flatMap((day) =>
        day.data.map((m) => {
          const usageMap = Object.fromEntries(
            (m.usage || []).map((u) => [u.type, parseFloat(u.amount || 0)])
          );

          // Per-type proportional allocation, then normalize
          let rawCost = 0;
          const modelCost = monthlyCostByType[m.model] || {};
          const modelTokens = monthlyTokensByType[m.model] || {};
          for (const type of costTypes) {
            const dailyAmt = usageMap[type] || 0;
            const monthlyAmt = modelTokens[type] || 0;
            const typeCost = modelCost[type] || 0;
            if (dailyAmt > 0 && monthlyAmt > 0) {
              rawCost += (dailyAmt / monthlyAmt) * typeCost;
            }
          }

          return {
            Date: day.date,
            Model: m.model,
            Requests: String(usageMap['REQUEST'] || 0),
            CacheHit: String(usageMap['PROMPT_CACHE_HIT_TOKEN'] || 0),
            CacheMiss: String(usageMap['PROMPT_CACHE_MISS_TOKEN'] || 0),
            OutputTokens: String(usageMap['RESPONSE_TOKEN'] || 0),
            CostCNY: rawCost.toFixed(2),
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

      // Normalize: force each model's daily cost sum to match monthly total
      const modelCostSum2 = {};
      for (const r of rows) {
        modelCostSum2[r.Model] = (modelCostSum2[r.Model] || 0) + parseFloat(r.CostCNY);
      }
      for (const r of rows) {
        const modelTypes = monthlyCostByType[r.Model] || {};
        const target = costTypes.reduce((s, t) => s + (modelTypes[t] || 0), 0);
        const actual = modelCostSum2[r.Model] || 1;
        if (target > 0 && Math.abs(actual - target) > 0.005) {
          r.CostCNY = (parseFloat(r.CostCNY) * target / actual).toFixed(2);
        }
      }

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
