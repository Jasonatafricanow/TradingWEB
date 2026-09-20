import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/services/auth/auth-middleware';
import { parsePosJson, posApiErrorResponse } from '@/services/admin/pos-api-response';
import { parsePosExchangeRequest } from '@/services/admin/pos-contracts';
import { PosApiError } from '@/services/admin/pos-errors';
import { exchangePosOrder } from '@/services/admin/pos-exchange-service';
import { requirePosOperatorSession } from '@/services/admin/pos-operator-session-service';

const POS_ACCOUNT_ROLES = new Set(['admin', 'manager', 'operator']);

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user.staffId || !user.role || !POS_ACCOUNT_ROLES.has(user.role)) {
      throw new PosApiError('FORBIDDEN', 'Insufficient permissions', 403);
    }
    const operator = await requirePosOperatorSession(request, user.id);
    const body = parsePosExchangeRequest(await parsePosJson(request));
    if (body.store_id !== operator.storeId || body.replacement.staff_id !== operator.staffId) {
      throw new PosApiError('OPERATOR_MISMATCH', 'Operator session does not match exchange request', 403);
    }
    const data = await exchangePosOrder({ ...body, account_user_id: user.id, operator });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return posApiErrorResponse(error);
  }
}
