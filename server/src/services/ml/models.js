// Small, dependency-free implementations of ridge regression and logistic regression.

export function standardizer(rows) {
  const d = rows[0].length;
  const mean = Array(d).fill(0);
  const std = Array(d).fill(1);
  rows.forEach((r) => r.forEach((v, j) => (mean[j] += v / rows.length)));
  const varr = Array(d).fill(0);
  rows.forEach((r) => r.forEach((v, j) => (varr[j] += (v - mean[j]) ** 2 / rows.length)));
  varr.forEach((v, j) => (std[j] = Math.sqrt(v) || 1));
  return { mean, std, apply: (r) => r.map((v, j) => (v - mean[j]) / std[j]) };
}

// Solve A x = b by Gaussian elimination with partial pivoting.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
    x[i] = Math.abs(M[i][i]) < 1e-12 ? 0 : s / M[i][i];
  }
  return x;
}

export function fitRidge(X, y, lambda = 1) {
  const sc = standardizer(X);
  const Z = X.map((r) => [1, ...sc.apply(r)]);
  const d = Z[0].length;
  const A = Array.from({ length: d }, () => Array(d).fill(0));
  const b = Array(d).fill(0);
  Z.forEach((r, i) => {
    for (let j = 0; j < d; j++) {
      b[j] += r[j] * y[i];
      for (let k = 0; k < d; k++) A[j][k] += r[j] * r[k];
    }
  });
  for (let j = 1; j < d; j++) A[j][j] += lambda; // intercept is not penalised
  const w = solve(A, b);
  return { w, sc, predict: (row) => w[0] + sc.apply(row).reduce((s, v, j) => s + v * w[j + 1], 0) };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

export function fitLogistic(X, y, { lambda = 0.01, lr = 0.2, iters = 2500 } = {}) {
  const sc = standardizer(X);
  const Z = X.map((r) => sc.apply(r));
  const d = Z[0].length;
  let b0 = 0;
  const w = Array(d).fill(0);
  const n = Z.length;
  for (let it = 0; it < iters; it++) {
    let g0 = 0;
    const g = Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      let z = b0;
      for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
      const err = sigmoid(z) - y[i];
      g0 += err / n;
      for (let j = 0; j < d; j++) g[j] += (err * Z[i][j]) / n;
    }
    b0 -= lr * g0;
    for (let j = 0; j < d; j++) w[j] -= lr * (g[j] + lambda * w[j]);
  }
  return {
    b0,
    w,
    sc,
    predict: (row) => {
      const z = sc.apply(row);
      return sigmoid(b0 + z.reduce((s, v, j) => s + v * w[j], 0));
    },
  };
}

export function auc(scores, labels) {
  const pos = [], neg = [];
  scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  pos.forEach((p) => neg.forEach((n) => (wins += p > n ? 1 : p === n ? 0.5 : 0)));
  return wins / (pos.length * neg.length);
}

export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
export const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const quantile = (a, q) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};
