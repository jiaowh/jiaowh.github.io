// Read-only market data requests only. Never use this to retry message delivery:
// an ambiguous Telegram response could otherwise duplicate a sent notification.
export async function fetchMarketJSON(url,{
  headers,fetchImpl=globalThis.fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
}={}) {
  const delays=[2000,5000];
  for(let attempt=0;attempt<3;attempt++){
    let retryAfter=0;
    try {
      const response=await fetchImpl(url,{headers,signal:AbortSignal.timeout(20000)});
      if(!response.ok){
        const error=Error(`Market data HTTP ${response.status}`);
        error.retryable=[408,429].includes(response.status)||response.status>=500;
        const wait=response.headers?.get?.('retry-after');
        if(wait)retryAfter=Math.max(0,Number.isFinite(Number(wait))?Number(wait)*1000:Date.parse(wait)-Date.now());
        throw error;
      }
      return await response.json();
    } catch(error){
      const transient=error.retryable===true||['TypeError','TimeoutError','AbortError','SyntaxError'].includes(error.name);
      if(!transient||attempt===2||retryAfter>30000)throw error;
      console.warn(`Market data retry ${attempt+2}/3: ${error.message}`);
      await sleep(Math.max(delays[attempt],retryAfter||0));
    }
  }
}
