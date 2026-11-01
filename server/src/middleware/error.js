export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ message: first?.message || 'Invalid data.' });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id.' });
  if (err.code === 11000) return res.status(409).json({ message: 'That email is already in use.' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
