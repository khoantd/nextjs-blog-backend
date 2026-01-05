// LiteLLM proxy completion utility
export async function completion(params: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
}) {
  const apiKey = process.env.LITELLM_API_KEY || 'sk-a2hvYWR1ZTpzay0xMjM0';
  const baseUrl = process.env.LITELLM_BASE_URL || 'http://khoadue.me:4010';
  
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(params)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LiteLLM Proxy Error: ${response.status} - ${error}`);
  }
  
  return response.json();
}
