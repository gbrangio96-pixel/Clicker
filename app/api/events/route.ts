import { createEvent } from '@/lib/store';
import { apiError, assertLocalMutation } from '@/lib/http';
export async function POST(request:Request) { try { assertLocalMutation(request); return Response.json({event:createEvent(await request.json())},{status:201}); } catch(error) { return apiError(error); } }
