import { authorizeOrder, orderDownloads } from '@/lib/store';
import { apiError } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) { try { const token=new URL(request.url).searchParams.get('token')||'';const order=authorizeOrder((await params).id,token);return Response.json({order,downloads:orderDownloads(order,token)},{headers:{'Cache-Control':'no-store'}}); } catch(error) { return apiError(error); } }
