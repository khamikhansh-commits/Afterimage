/* ───────────── образцы снимков: нарисованы кодом в браузере, это не фотографии ───────────── */
const samplePhotos = new Map();
function samplePhoto(key) {
  if (samplePhotos.has(key)) return samplePhotos.get(key);
  const port = key === 'cup' || key === 'shore', c = makeCanvas(port ? 900 : 1200, port ? 1125 : 900), x = c.getContext('2d'), W = c.width, H = c.height, r = rng(hashStr('sample-' + key));
  const grad = (y0, y1, stops) => { const g = x.createLinearGradient(0, y0, 0, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };
  const blob = (cx, cy, rad, col, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); };
  const soften = (amount) => { const s = drawScaled(c, Math.max(W, H) / amount); x.save(); x.imageSmoothingQuality = 'high'; x.globalAlpha = 0.92; x.drawImage(s, 0, 0, W, H); x.restore(); };

  if (key === 'trees') {
    x.fillStyle = grad(0, H, ['#F1DFB4', '#E2B463', '#B9772F', '#6B4420']); x.fillRect(0, 0, W, H);
    const cols = ['#E8A92E', '#D9822B', '#C2571F', '#F0C857', '#A84A1E', '#F3D98A'];
    for (let i = 0; i < 150; i++) blob(r() * W, r() * H * 0.72, 40 + r() * 130, cols[Math.floor(r() * cols.length)], 0.3 + r() * 0.45);
    x.fillStyle = '#C9A064'; x.beginPath(); x.moveTo(W * 0.44, H * 0.56); x.lineTo(W * 0.56, H * 0.56); x.lineTo(W * 0.86, H); x.lineTo(W * 0.14, H); x.fill();
    blob(W * 0.5, H * 0.5, W * 0.3, '#FFF1C4', 0.75);
    soften(9);
    for (let i = 0; i < 9; i++) { // trunks: nearer ones wider and darker
      const side = i % 2 ? 1 : -1, d = r(), tx = W / 2 + side * W * (0.09 + d * 0.42), tw = 10 + d * 46;
      x.fillStyle = mix('#5A3A20', '#22140A', d); x.beginPath(); x.moveTo(tx - tw / 2, H * (0.6 + d * 0.4)); x.lineTo(tx - tw * 0.3, 0); x.lineTo(tx + tw * 0.3, 0); x.lineTo(tx + tw / 2, H * (0.6 + d * 0.4)); x.fill();
      x.strokeStyle = rgba('#22140A', 0.8); x.lineWidth = 2 + d * 5; x.beginPath(); x.moveTo(tx, H * 0.22 * r()); x.lineTo(tx + side * (60 + r() * 120), H * 0.02); x.stroke();
    }
    for (let i = 0; i < 520; i++) { const py = H * 0.5 + r() * H * 0.5, s = 2 + (py / H) * 7 * r(); x.fillStyle = rgba(cols[Math.floor(r() * cols.length)], 0.55 + r() * 0.4); x.beginPath(); x.ellipse(r() * W, py, s * 1.4, s * 0.7, r() * 3, 0, 6.3); x.fill(); }
    for (let i = 0; i < 90; i++) { x.fillStyle = rgba(cols[Math.floor(r() * 4)], 0.7); x.beginPath(); x.ellipse(r() * W, r() * H * 0.5, 4 + r() * 6, 2 + r() * 3, r() * 3, 0, 6.3); x.fill(); }
    x.globalCompositeOperation = 'screen'; for (let i = 0; i < 5; i++) { x.fillStyle = rgba('#FFE7A3', 0.1); x.beginPath(); x.moveTo(W * (0.3 + i * 0.1), 0); x.lineTo(W * (0.36 + i * 0.1), 0); x.lineTo(W * (0.1 + i * 0.13), H); x.lineTo(W * (0.02 + i * 0.13), H); x.fill(); } x.globalCompositeOperation = 'source-over';
  } else if (key === 'cup') {
    x.fillStyle = '#6E4428'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) { x.fillStyle = rgba(i % 2 ? '#7C4E2E' : '#5E3920', 0.9); x.fillRect(0, i * H / 9, W, H / 9 - 3); for (let k = 0; k < 14; k++) { x.strokeStyle = rgba('#3F2513', 0.25); x.lineWidth = 1 + r() * 2; x.beginPath(); const gy = i * H / 9 + r() * H / 9; x.moveTo(0, gy); x.bezierCurveTo(W * 0.3, gy + r() * 14 - 7, W * 0.7, gy + r() * 14 - 7, W, gy); x.stroke(); } }
    blob(W * 0.25, H * 0.2, W * 0.7, '#FFD9A0', 0.35);
    x.fillStyle = '#9C2F2A'; x.save(); x.translate(W * 0.9, H * 0.86); x.rotate(-0.5); x.fillRect(-W * 0.4, -H * 0.12, W * 0.8, H * 0.3); for (let i = 0; i < 26; i++) { x.fillStyle = rgba(i % 2 ? '#B94740' : '#7E2420', 0.9); x.fillRect(-W * 0.4 + i * W * 0.031, -H * 0.12, W * 0.016, H * 0.3); } x.restore();
    const cx = W * 0.46, cy = H * 0.47;
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(cx + 26, cy + 34, W * 0.36, W * 0.36, 0, 0, 6.3); x.fill();
    x.fillStyle = '#EFE6D6'; x.beginPath(); x.arc(cx, cy, W * 0.35, 0, 6.3); x.fill();
    x.fillStyle = '#DCD0BB'; x.beginPath(); x.arc(cx, cy, W * 0.27, 0, 6.3); x.fill();
    x.fillStyle = '#FBF6EC'; x.beginPath(); x.arc(cx, cy, W * 0.235, 0, 6.3); x.fill();
    x.fillStyle = '#4B2A19'; x.beginPath(); x.arc(cx, cy, W * 0.205, 0, 6.3); x.fill();
    x.strokeStyle = rgba('#C99B6E', 0.85); x.lineWidth = 12; x.lineCap = 'round'; x.beginPath(); for (let a = 0; a < 15; a += 0.1) { const rr = a * W * 0.012; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.stroke();
    blob(cx - W * 0.07, cy - W * 0.08, W * 0.09, '#FFFFFF', 0.4);
    x.fillStyle = '#EFE6D6'; x.beginPath(); x.ellipse(cx + W * 0.3, cy - W * 0.02, W * 0.085, W * 0.05, -0.2, 0, 6.3); x.fill(); x.fillStyle = '#6E4428'; x.beginPath(); x.ellipse(cx + W * 0.3, cy - W * 0.02, W * 0.05, W * 0.024, -0.2, 0, 6.3); x.fill();
    for (let i = 0; i < 5; i++) { x.save(); x.translate(W * (0.08 + r() * 0.2), H * (0.74 + r() * 0.2)); x.rotate(r() * 6); x.fillStyle = ['#D9822B', '#E8A92E', '#B4521F'][i % 3]; x.beginPath(); x.moveTo(0, -46); x.quadraticCurveTo(36, -8, 0, 46); x.quadraticCurveTo(-36, -8, 0, -46); x.fill(); x.restore(); }
  } else if (key === 'city') {
    x.fillStyle = grad(0, H, ['#070B16', '#101B33', '#1C2C4E', '#0B1020']); x.fillRect(0, 0, W, H);
    const lights = ['#FFC267', '#7FD4FF', '#FF5A6E', '#FFFFFF', '#59E0C8'];
    for (let i = 0; i < 16; i++) {
      const bw = 50 + r() * 120, bx = r() * W - 30, bh = H * (0.22 + r() * 0.42), by = H * 0.68 - bh;
      x.fillStyle = mix('#0A1124', '#18274A', r()); x.fillRect(bx, by, bw, bh);
      for (let wy = by + 10; wy < by + bh - 8; wy += 15) for (let wx = bx + 7; wx < bx + bw - 8; wx += 12) if (r() < 0.34) { x.fillStyle = rgba(lights[r() < 0.7 ? 0 : 1], 0.5 + r() * 0.5); x.fillRect(wx, wy, 6, 8); }
    }
    x.fillStyle = '#060912'; x.fillRect(0, H * 0.68, W, H * 0.32);
    for (let i = 0; i < 70; i++) { const lx = r() * W, col = lights[Math.floor(r() * lights.length)]; x.fillStyle = grad(H * 0.68, H, [rgba(col, 0.5), rgba(col, 0)]); x.fillRect(lx, H * 0.68, 3 + r() * 9, H * (0.1 + r() * 0.22)); }
    for (let i = 0; i < 22; i++) { x.fillStyle = rgba('#FF4455', 0.9); x.fillRect(W * 0.1 + i * W * 0.036, H * 0.7 + i * 1.5, 12, 3); x.fillStyle = rgba('#FFF6DD', 0.85); x.fillRect(W * 0.95 - i * W * 0.03, H * 0.74 + i * 2, 10, 3); }
    soften(34);
    x.globalCompositeOperation = 'screen'; for (let i = 0; i < 26; i++) { const col = lights[Math.floor(r() * lights.length)], bx = r() * W, by = H * (0.3 + r() * 0.7), rad = 24 + r() * 64; x.fillStyle = rgba(col, 0.2 + r() * 0.2); x.beginPath(); x.arc(bx, by, rad, 0, 6.3); x.fill(); x.strokeStyle = rgba(col, 0.35); x.lineWidth = 2; x.stroke(); }
    x.fillStyle = rgba('#FF3D7F', 0.9); x.fillRect(W * 0.62, H * 0.3, 70, 10); x.fillRect(W * 0.62, H * 0.3, 10, 54); blob(W * 0.65, H * 0.33, 150, '#FF3D7F', 0.5);
    x.globalCompositeOperation = 'source-over';
  } else if (key === 'screen') {
    x.fillStyle = '#080A10'; x.fillRect(0, 0, W, H);
    blob(W * 0.42, H * 0.42, W * 0.7, '#3C7BD9', 0.55);
    x.fillStyle = '#0A0D14'; x.fillRect(0, H * 0.76, W, H * 0.24);
    x.fillStyle = '#05070B'; x.fillRect(W * 0.16, H * 0.13, W * 0.54, H * 0.56);
    x.fillStyle = '#0E1B33'; x.fillRect(W * 0.175, H * 0.15, W * 0.51, H * 0.5);
    const cc = ['#7FD4FF', '#B5F2C2', '#FFC267', '#E8ECF5', '#FF7B8E'];
    for (let ln = 0; ln < 21; ln++) { let lx = W * 0.19 + (ln % 5 === 0 ? 0 : 18 + Math.floor(r() * 3) * 22); for (let k = 0; k < 2 + r() * 5 && lx < W * 0.66; k++) { const lw = 18 + r() * 80; x.fillStyle = rgba(cc[Math.floor(r() * cc.length)], 0.8); x.fillRect(lx, H * 0.17 + ln * H * 0.0225, Math.min(lw, W * 0.67 - lx), 6); lx += lw + 10; } }
    x.fillStyle = '#05070B'; x.fillRect(W * 0.4, H * 0.69, W * 0.06, H * 0.07); x.fillRect(W * 0.33, H * 0.755, W * 0.2, H * 0.014);
    x.fillStyle = '#141A26'; x.beginPath(); if (x.roundRect) x.roundRect(W * 0.76, H * 0.62, W * 0.09, H * 0.15, 8); else x.rect(W * 0.76, H * 0.62, W * 0.09, H * 0.15); x.fill(); x.strokeStyle = '#141A26'; x.lineWidth = 9; x.beginPath(); x.arc(W * 0.855, H * 0.69, 26, -1.2, 1.2); x.stroke();
    x.fillStyle = grad(H * 0.76, H, [rgba('#3C7BD9', 0.35), rgba('#3C7BD9', 0)]); x.fillRect(W * 0.1, H * 0.76, W * 0.66, H * 0.2);
    for (let i = 0; i < 40; i++) { x.fillStyle = rgba(['#FFC267', '#7FD4FF', '#FF5A6E'][i % 3], 0.5 + r() * 0.4); x.beginPath(); x.arc(W * (0.8 + r() * 0.2), H * (0.05 + r() * 0.45), 2 + r() * 7, 0, 6.3); x.fill(); }
    soften(60);
  } else if (key === 'sea') {
    x.fillStyle = grad(0, H * 0.56, ['#A9CBDD', '#D5DCD8', '#F4D2AE', '#F7B98A']); x.fillRect(0, 0, W, H * 0.56);
    const sx = W * 0.62, sy = H * 0.52;
    blob(sx, sy, W * 0.42, '#FFE3B8', 0.85); x.fillStyle = '#FFF4DD'; x.beginPath(); x.arc(sx, sy, 46, 0, 6.3); x.fill();
    for (let i = 0; i < 7; i++) blob(r() * W, H * (0.1 + r() * 0.3), 120 + r() * 160, '#FFFFFF', 0.16);
    x.fillStyle = grad(H * 0.56, H, ['#7FAAB8', '#4C8296', '#2C5B6E', '#1E4555']); x.fillRect(0, H * 0.56, W, H * 0.44);
    for (let i = 0; i < 260; i++) { const py = H * 0.565 + Math.pow(r(), 1.6) * H * 0.43, d = (py - H * 0.56) / (H * 0.44), near = Math.abs((r() - 0.5)) * W * (0.08 + d * 0.5), px = r() < 0.55 ? sx + (r() < 0.5 ? -near : near) : r() * W; x.fillStyle = rgba(r() < 0.6 ? '#FFE8C7' : '#DCEEF2', 0.25 + r() * 0.5); x.fillRect(px, py, 16 + d * 90 * r(), 1.5 + d * 3); }
    x.fillStyle = '#3B4C55'; x.fillRect(0, H * 0.548, W * 0.24, H * 0.014); for (let i = 0; i < 9; i++) x.fillRect(W * 0.02 + i * W * 0.026, H * 0.548, 5, H * 0.05);
    x.fillStyle = '#22353F'; x.beginPath(); x.moveTo(W * 0.83, H * 0.553); x.lineTo(W * 0.89, H * 0.553); x.lineTo(W * 0.875, H * 0.566); x.lineTo(W * 0.84, H * 0.566); x.fill(); x.fillRect(W * 0.858, H * 0.52, 2, H * 0.035);
    x.strokeStyle = rgba('#2B3B44', 0.7); x.lineWidth = 2; for (let i = 0; i < 4; i++) { const bx = W * (0.2 + r() * 0.3), by = H * (0.15 + r() * 0.2); x.beginPath(); x.moveTo(bx - 10, by - 4); x.quadraticCurveTo(bx - 4, by - 9, bx, by); x.quadraticCurveTo(bx + 4, by - 9, bx + 10, by - 4); x.stroke(); }
    soften(110);
  } else { // shore
    x.fillStyle = grad(0, H, ['#B9D3D8', '#D8D9C4', '#E9D5AE', '#DCC197']); x.fillRect(0, 0, W, H);
    x.fillStyle = grad(0, H * 0.4, ['#5E94A6', '#9CC3CC']); x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W, H * 0.22); for (let px = W; px >= 0; px -= 20) x.lineTo(px, H * 0.3 + Math.sin(px * 0.011) * 40 + Math.sin(px * 0.031) * 14); x.fill();
    x.strokeStyle = rgba('#FFFFFF', 0.9); x.lineWidth = 16; x.lineCap = 'round'; x.beginPath(); for (let px = -10; px <= W + 10; px += 20) { const py = H * 0.3 + Math.sin(px * 0.011) * 40 + Math.sin(px * 0.031) * 14; px < 0 ? x.moveTo(px, py) : x.lineTo(px, py); } x.stroke();
    x.strokeStyle = rgba('#FFFFFF', 0.45); x.lineWidth = 6; x.beginPath(); for (let px = -10; px <= W + 10; px += 20) { const py = H * 0.25 + Math.sin(px * 0.013 + 1) * 30; px < 0 ? x.moveTo(px, py) : x.lineTo(px, py); } x.stroke();
    x.fillStyle = rgba('#B99E73', 0.4); x.beginPath(); x.moveTo(0, H * 0.33); for (let px = 0; px <= W; px += 20) x.lineTo(px, H * 0.32 + Math.sin(px * 0.011) * 40 + 30); x.lineTo(W, H * 0.47); x.lineTo(0, H * 0.5); x.fill();
    for (let i = 0; i < 2600; i++) { x.fillStyle = rgba(r() < 0.5 ? '#FFFFFF' : '#8E7650', 0.12 + r() * 0.2); x.fillRect(r() * W, H * 0.34 + r() * H * 0.66, 1.5, 1.5); }
    for (let i = 0; i < 8; i++) { const fy = H * (0.95 - i * 0.068), fx = W * (0.34 + i * 0.03) + (i % 2 ? 50 : -50); x.save(); x.translate(fx, fy); x.rotate(0.22); x.fillStyle = rgba('#8C7149', 0.5); x.beginPath(); x.ellipse(0, 0, 22, 44, 0, 0, 6.3); x.fill(); for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(-18 + k * 9, -52 - Math.sin(k * 0.8) * 5, 5 - k * 0.5, 0, 6.3); x.fill(); } x.restore(); }
    for (let i = 0; i < 14; i++) { x.fillStyle = ['#F4EDE0', '#C9A98A', '#8C8F8E'][i % 3]; x.beginPath(); x.ellipse(r() * W, H * (0.5 + r() * 0.48), 5 + r() * 9, 4 + r() * 6, r() * 3, 0, 6.3); x.fill(); }
    soften(120);
  }
  // a little sensor noise so it reads as a photograph
  const im = x.getImageData(0, 0, W, H), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 20; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(im, 0, 0);
  samplePhotos.set(key, c);
  return c;
}

