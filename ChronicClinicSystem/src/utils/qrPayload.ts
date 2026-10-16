// QR payloads are small JSON strings so codes stay easy to scan on weak cameras.
// type: 'activation' (doctor -> patient) | 'checkin' (patient -> receptionist)

export type QrType = 'activation' | 'checkin';

export type QrPayload = {
  v: 1;
  type: QrType;
  patientId?: string;
  doctorId?: string;
  clinicId?: string;
  conditions?: string[]; // stored on the patient's phone only
  medications?: string[]; // stored on the patient's phone only
  tokenCode?: string;
  exp?: number;
};

export type ParseResult =
  | { ok: true; data: QrPayload }
  | { ok: false; message: string };

const ACTIVATION_TTL_MS = 10 * 60 * 1000; // doctor-issued code valid for 10 minutes

export function buildActivationPayload(input: {
  patientId: string;
  doctorId: string;
  clinicId: string;
  conditions: string[];
  medications: string[];
}): string {
  const payload: QrPayload = {
    v: 1,
    type: 'activation',
    ...input,
    exp: Date.now() + ACTIVATION_TTL_MS,
  };
  return JSON.stringify(payload);
}

// Returns a message the user can act on if the code is not usable.
export function parseQrPayload(raw: string, expectedType?: QrType): ParseResult {
  let data: QrPayload;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'This is not a clinic QR code. Try again.' };
  }
  if (!data || data.v !== 1 || !data.type) {
    return { ok: false, message: 'This QR code is not from this app.' };
  }
  if (expectedType && data.type !== expectedType) {
    return { ok: false, message: `Wrong kind of code. Expected a ${expectedType} code.` };
  }
  if (data.exp && Date.now() > data.exp) {
    return { ok: false, message: 'This code has expired. Ask for a new one.' };
  }
  return { ok: true, data };
}

// The check-in QR a patient shows at the clinic. It carries only the token: the receptionist's
// scan sends tokenCode to the backend, which validates it and marks it as used.
export function buildCheckinPayload(input: {
  patientId: string;
  tokenCode: string;
  expiresAt: number;
}): string {
  const payload: QrPayload = {
    v: 1,
    type: 'checkin',
    patientId: input.patientId,
    tokenCode: input.tokenCode,
    exp: input.expiresAt,
  };
  return JSON.stringify(payload);
}