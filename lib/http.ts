import { AppError } from './store.ts';
export function apiError(error: unknown) {
  if (error instanceof AppError) return Response.json({error:error.message},{status:error.status});
  if (error instanceof SyntaxError) return Response.json({error:'O formato dos dados enviados é inválido.'},{status:400});
  console.error('Clicker API:', error);
  return Response.json({error:'Não foi possível concluir. Tente novamente.'},{status:500});
}
export function assertLocalMutation(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let originUrl: URL;
  try { originUrl = new URL(origin); } catch { throw new AppError('Origem da solicitação não permitida.',403); }
  const own = new URL(request.url);
  // Next can expose an internal request URL behind an HTTPS reverse proxy.
  // Host is the browser-facing authority; do not trust arbitrary forwarded hosts.
  const host = request.headers.get('host') || own.host;
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http' ? `${forwardedProtocol}:` : own.protocol;
  if (originUrl.host !== host || originUrl.protocol !== protocol) throw new AppError('Origem da solicitação não permitida.',403);
}
