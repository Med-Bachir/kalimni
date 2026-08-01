// Request-body validation with zod (Phase 3.2). Routes keep their own
// domain checks (ownership, state machines, clinical rules); this layer only
// guarantees SHAPE before any of that runs — so a route never has to reason
// about `text` being an object or `mood` being "3".
//
// Error contract is unchanged for clients: 400 with a snake_case `error`
// code. The first failing field becomes the code (`text_invalid`), so the
// existing client error handling keeps working.
const { ZodError } = require('zod');

const codeFor = (issue) => {
  const field = issue.path[0];
  if (!field) return 'body_invalid';
  // camelCase -> snake_case, matching the codes the routes already return.
  return `${String(field).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}_invalid`;
};

/** validate(schema) -> middleware; replaces req.body with the parsed value. */
const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body ?? {});
    return next();
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: codeFor(err.issues[0]) });
    }
    throw err;
  }
};

module.exports = { validate };
