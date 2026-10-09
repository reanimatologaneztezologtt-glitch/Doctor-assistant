// Roles and permissions (spec section 4). Shared by server and browser demo.

export const ROLES = ['doctor', 'resident', 'student'];

export const VERIFICATION = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  notRequired: 'not_required',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration(input, specialties) {
  const errors = [];
  const req = (field) => {
    if (!input[field] || !String(input[field]).trim()) errors.push({ field, code: 'required' });
  };
  ['fullName', 'email', 'password', 'role', 'institution', 'licenseNumber'].forEach(req);
  if (input.email && !EMAIL_RE.test(input.email)) errors.push({ field: 'email', code: 'invalidEmail' });
  if (input.password && String(input.password).length < 8) errors.push({ field: 'password', code: 'passwordShort' });
  if (input.role && !ROLES.includes(input.role)) errors.push({ field: 'role', code: 'invalidRole' });
  if (input.role === 'student') {
    if (!specialties.studyDirections.some((d) => d.id === input.studyDirection)) {
      errors.push({ field: 'studyDirection', code: 'required' });
    }
  } else if (input.role && !specialties.specialties.some((s) => s.id === input.specialty)) {
    errors.push({ field: 'specialty', code: 'required' });
  }
  if (input.confirmAccurate !== true) errors.push({ field: 'confirmAccurate', code: 'mustConfirm' });
  return errors;
}

export function isAdmin(user) {
  return Boolean(user && user.isAdmin);
}

// Approval of medical content (rules, draft conclusions):
// - an admin may approve, reject or change any decision in any specialty
//   (owner's decision, overrides the original spec 4.2 restriction);
// - otherwise only a verified doctor, and only within their own specialty.
// The result says in which capacity the user acts, so it can be shown and logged.
export function canApprove(user, specialty) {
  if (!user) return { ok: false, reason: 'notSignedIn' };
  if (isAdmin(user)) return { ok: true, as: 'admin' };
  return doctorCheck(user, specialty);
}

// Answering questions stays with verified doctors of the specialty.
export function canAnswerQuestion(user, question) {
  if (!user) return { ok: false, reason: 'notSignedIn' };
  return doctorCheck(user, question.specialty);
}

function doctorCheck(user, specialty) {
  if (user.role !== 'doctor') return { ok: false, reason: 'notDoctor' };
  if (user.verification !== VERIFICATION.approved) return { ok: false, reason: 'notVerified' };
  if (user.specialty !== specialty) return { ok: false, reason: 'otherSpecialty' };
  return { ok: true, as: 'doctor' };
}
