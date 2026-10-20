import { createOrder } from '@/lib/store';
import { apiError, assertLocalMutation } from '@/lib/http';
export async function POST(request:Request) { try { assertLocalMutation(request); return Response.json(createOrder(await request.json()),{status:201,headers:{'Cache-Control':'no-store'}}); } catch(error) { return apiError(error); } }
