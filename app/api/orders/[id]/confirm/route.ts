import { confirmOrder } from '@/lib/store';
import { apiError, assertLocalMutation } from '@/lib/http';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) { try { assertLocalMutation(request);const input=await request.json();return Response.json(confirmOrder((await params).id,input.accessToken),{headers:{'Cache-Control':'no-store'}}); } catch(error) { return apiError(error); } }
