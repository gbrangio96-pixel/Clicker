import { readFile } from 'node:fs/promises';
import path from 'node:path';
export default async function Credits() {
  const attribution=await readFile(path.join(process.cwd(),'fixtures','photos','ATTRIBUTION.md'),'utf8');
  return <main style={{maxWidth:900,margin:'60px auto',padding:'0 24px'}}><a href="/loja">← Voltar à loja</a><h1 style={{fontSize:40,marginTop:32}}>Créditos das fotografias</h1><p>As fotografias iniciais são amostras para testar a plataforma. As compras são simuladas.</p><pre style={{whiteSpace:'pre-wrap',lineHeight:1.8,fontFamily:'inherit',marginTop:24}}>{attribution}</pre></main>;
}
