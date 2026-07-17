// Shapes internal records into API responses. Never leak passwordHash.

function publicUser(user) {
  if (!user) return null;
  const base = {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    language: user.language || 'ar',
    settings: user.settings || { notifications: true },
    createdAt: user.createdAt,
  };
  if (user.role === 'patient') {
    base.assignedSpecialistId = user.assignedSpecialistId || null;
    base.intakeCompletedAt = user.intakeCompletedAt || null;
    base.intakeSkipped = !!user.intakeSkipped;
  }
  if (user.role === 'specialist') {
    base.title = user.title || null;
    base.status = user.status; // pending | approved | rejected
    base.specialties = user.specialties || [];
    base.bio = user.bio || null;
    base.license = user.license || null;
  }
  return base;
}

// Minimal card used when embedding another user inside a payload.
function userCard(user, onlineUserIds) {
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    title: user.title || null,
    online: onlineUserIds ? onlineUserIds.has(user.id) : false,
  };
}

module.exports = { publicUser, userCard };
