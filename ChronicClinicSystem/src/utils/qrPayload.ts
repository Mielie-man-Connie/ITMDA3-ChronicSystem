export type QrType = 'patient-record' | 'icd10-update';

export type PatientQrPayload = {
  v: 1;
  type: 'patient-record' | 'icd10-update';
  patientId: string;
  localId: string;
  icd10Codes: string[];
  lastUpdatedAt: string;
  lastUpdatedByDoctorId: string;
};

export type QrPayload = PatientQrPayload;

export type ParseResult =
  | { ok: true; data: QrPayload }
  | { ok: false; message: string };

export function buildPatientRecordPayload(input: PatientQrPayload): string {
  return JSON.stringify(input);
}

export function buildIcd10UpdatePayload(input: Omit<PatientQrPayload, 'v' | 'type'>): string {
  return JSON.stringify({ v: 1, type: 'icd10-update', ...input } satisfies PatientQrPayload);
}

export function parseQrPayload(raw: string, expectedType?: QrType): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'This is not a clinic QR code. Try again.' };
  }

  if (typeof value !== 'object' || value === null) {
    return { ok: false, message: 'This QR code is not from this app.' };
  }

  const data = value as Record<string, unknown>;
  if (data.v !== 1 || (data.type !== 'patient-record' && data.type !== 'icd10-update')) {
    return { ok: false, message: 'This QR code is not from this app.' };
  }
  if (expectedType && data.type !== expectedType) {
    return { ok: false, message: `Wrong kind of code. Expected a ${expectedType} code.` };
  }
  if (
    typeof data.patientId !== 'string' ||
    !data.patientId.trim() ||
    typeof data.localId !== 'string' ||
    !data.localId.trim()
  ) {
    return { ok: false, message: 'The QR code is missing the patient ID.' };
  }
  if (
    !Array.isArray(data.icd10Codes) ||
    data.icd10Codes.length > 10 ||
    !data.icd10Codes.every((code) => typeof code === 'string' && code.trim())
  ) {
    return { ok: false, message: 'The QR code contains an invalid ICD-10 code list.' };
  }
  if (
    typeof data.lastUpdatedAt !== 'string' ||
    (data.lastUpdatedAt !== '' && Number.isNaN(Date.parse(data.lastUpdatedAt)))
  ) {
    return { ok: false, message: 'The QR code has an invalid ICD-10 update time.' };
  }
  if (
    typeof data.lastUpdatedByDoctorId !== 'string' ||
    ((data.lastUpdatedAt === '') !== (data.lastUpdatedByDoctorId === ''))
  ) {
    return { ok: false, message: 'The QR code is missing the updating doctor ID.' };
  }

  return { ok: true, data: data as PatientQrPayload };
}
