/**
 * Small OpenAI chat helper for Doodle.
 * Prefer server proxy (backend OPENAI_API_KEY) so the browser never needs a public key.
 * Injectable for tests; never throws to callers — returns null on failure.
 */

const API_KEY = typeof process !== 'undefined' ? (process.env.OPENAI_API_KEY || '') : '';

function hasUsableKey(key = API_KEY) {
  if (!key) return false;
  return !/your-openai-key|replace-me|placeholder|sk-your/i.test(key);
}

async function resolveApiRequest(apiRequestImpl) {
  if (typeof apiRequestImpl === 'function') return apiRequestImpl;
  try {
    const mod = await import('../../apiClient.js');
    return typeof mod.apiRequest === 'function' ? mod.apiRequest : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {{
 *   system: string,
 *   user: string,
 *   model?: string,
 *   temperature?: number,
 *   maxTokens?: number,
 *   fetchImpl?: typeof fetch,
 *   apiRequestImpl?: Function,
 * }} opts
 * @returns {Promise<string|null>}
 */
export async function completeChatText(opts = {}) {
  const {
    system,
    user,
    model = 'gpt-4o-mini',
    temperature = 0.5,
    maxTokens = 700,
    fetchImpl = typeof fetch === 'function' ? fetch : null,
    apiRequestImpl,
  } = opts;
  if (!system || !user) return null;

  // Prefer authenticated backend proxy (enforces quota + metering).
  const request = await resolveApiRequest(apiRequestImpl);
  if (request) {
    try {
      const { data, error } = await request('/llm/doodle-chat', {
        method: 'POST',
        body: JSON.stringify({
          system,
          user,
          model,
          temperature,
          max_tokens: maxTokens,
        }),
        timeoutMs: 60000,
      });
      if (!error && data?.text) {
        const text = String(data.text).trim();
        if (text) return text;
      }
    } catch (_) {
      /* fall through to rare direct-key path */
    }
  }

  // Last resort for local/tests only — bypasses server quota; do not ship a browser key.
  if (hasUsableKey() && fetchImpl) {
    try {
      const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text.trim()) return text.trim();
      }
    } catch (_) {
      /* ignore */
    }
  }

  return null;
}

export function ageBandFromChild(child = {}) {
  let age = null;
  if (child.age != null && Number.isFinite(Number(child.age))) {
    age = Number(child.age);
  } else if (child.date_of_birth || child.birth_date || child.dob) {
    const raw = child.date_of_birth || child.birth_date || child.dob;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
    }
  }
  const grade = String(child.grade_label || child.grade || '').trim();
  if (age == null && grade) {
    if (/pre-?k|preschool/i.test(grade)) age = 4;
    else if (/^k(?:indergarten)?$/i.test(grade)) age = 5;
    else if (/^\d{1,2}/.test(grade)) age = 5 + Number(grade.match(/^(\d{1,2})/)[1]);
  }
  if (age == null) return { band: 'elementary', ageLabel: 'elementary age', age: null, grade: grade || null };
  if (age <= 7) return { band: 'early', ageLabel: `about ${age}`, age, grade: grade || null };
  if (age <= 11) return { band: 'elementary', ageLabel: `about ${age}`, age, grade: grade || null };
  if (age <= 14) return { band: 'middle', ageLabel: `about ${age}`, age, grade: grade || null };
  return { band: 'high', ageLabel: `about ${age}`, age, grade: grade || null };
}
