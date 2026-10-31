/**
 * FASOBRIEF - Générateur SVG QR Code ISO/IEC 18004 (100 % Local, Zéro Service Tiers)
 * & Lecteur Caméra QR (Web MediaDevices + BarcodeDetector)
 */

(function () {
  // Tables ISO/IEC 18004 — Niveau ECC L (01) pour Versions 1 à 10 :
  // [totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCwGroup1, numBlocksGroup2, dataCwGroup2]
  const VERSION_SPECS_L = [
    null,
    [26, 7, 1, 19, 0, 0],
    [44, 10, 1, 34, 0, 0],
    [70, 15, 1, 55, 0, 0],
    [100, 20, 1, 80, 0, 0],
    [134, 26, 1, 108, 0, 0],
    [172, 18, 2, 68, 0, 0],
    [196, 20, 2, 78, 0, 0],
    [242, 24, 2, 97, 0, 0],
    [292, 30, 2, 116, 0, 0],
    [346, 18, 2, 68, 2, 69]
  ];

  const ALIGNMENT_CENTERS = [
    null,
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50]
  ];

  // Corps fini GF(256) polynôme primitif x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGf() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const root = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], root);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(dataBytes, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const rem = new Uint8Array(ecLen);
    for (let i = 0; i < dataBytes.length; i++) {
      const factor = dataBytes[i] ^ rem[0];
      for (let j = 0; j < ecLen - 1; j++) {
        rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor);
      }
      rem[ecLen - 1] = gfMul(gen[ecLen], factor);
    }
    return rem;
  }

  function chooseVersion(byteLen) {
    for (let v = 1; v <= 10; v++) {
      const spec = VERSION_SPECS_L[v];
      const totalDataCw = spec[2] * spec[3] + spec[4] * spec[5];
      const countBits = v <= 9 ? 8 : 16;
      const maxBytes = Math.floor((totalDataCw * 8 - 4 - countBits) / 8);
      if (byteLen <= maxBytes) return v;
    }
    throw new Error('Contenu QR trop long');
  }

  function buildCodewords(utf8Bytes, version) {
    const spec = VERSION_SPECS_L[version];
    const [, ecPerBlock, g1Blocks, g1DataCw, g2Blocks, g2DataCw] = spec;
    const totalDataCw = g1Blocks * g1DataCw + g2Blocks * g2DataCw;
    const bits = [];

    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >>> i) & 1);
      }
    }

    // Mode Byte = 0100
    pushBits(0b0100, 4);
    pushBits(utf8Bytes.length, version <= 9 ? 8 : 16);
    for (let i = 0; i < utf8Bytes.length; i++) {
      pushBits(utf8Bytes[i], 8);
    }

    const capacityBits = totalDataCw * 8;
    const terminator = Math.min(4, capacityBits - bits.length);
    for (let i = 0; i < terminator; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const dataCodewords = new Uint8Array(totalDataCw);
    let byteIdx = 0;
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
      dataCodewords[byteIdx++] = b;
    }
    const padBytes = [0xec, 0x11];
    let p = 0;
    while (byteIdx < totalDataCw) {
      dataCodewords[byteIdx++] = padBytes[p % 2];
      p++;
    }

    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (let b = 0; b < g1Blocks; b++) {
      const blk = dataCodewords.slice(offset, offset + g1DataCw);
      offset += g1DataCw;
      dataBlocks.push(blk);
      ecBlocks.push(rsEncode(blk, ecPerBlock));
    }
    for (let b = 0; b < g2Blocks; b++) {
      const blk = dataCodewords.slice(offset, offset + g2DataCw);
      offset += g2DataCw;
      dataBlocks.push(blk);
      ecBlocks.push(rsEncode(blk, ecPerBlock));
    }

    const finalCw = [];
    const maxDataLen = Math.max(g1DataCw, g2DataCw);
    for (let i = 0; i < maxDataLen; i++) {
      for (const blk of dataBlocks) {
        if (i < blk.length) finalCw.push(blk[i]);
      }
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (const blk of ecBlocks) {
        finalCw.push(blk[i]);
      }
    }
    return finalCw;
  }

  function createBaseMatrix(version) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    function setFuncModule(r, c, dark) {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      modules[r][c] = dark ? 1 : 0;
      isFunc[r][c] = 1;
    }

    function placeFinder(topR, leftC) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = topR + dr;
          const c = leftC + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setFuncModule(r, c, inOuter && (onBorder || inCenter));
        }
      }
    }

    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // Motifs de synchronisation (Timing)
    for (let i = 8; i < size - 8; i++) {
      if (!isFunc[6][i]) setFuncModule(6, i, i % 2 === 0);
      if (!isFunc[i][6]) setFuncModule(i, 6, i % 2 === 0);
    }

    // Motifs d'alignement
    const centers = ALIGNMENT_CENTERS[version];
    for (let i = 0; i < centers.length; i++) {
      for (let j = 0; j < centers.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === centers.length - 1) || (i === centers.length - 1 && j === 0)) {
          continue;
        }
        const cr = centers[i];
        const cc = centers[j];
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dist = Math.max(Math.abs(dr), Math.abs(dc));
            setFuncModule(cr + dr, cc + dc, dist !== 1);
          }
        }
      }
    }

    // Module sombre fixe + réservation des zones de format
    setFuncModule(size - 8, 8, true);
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        if (!isFunc[8][i]) setFuncModule(8, i, false);
        if (!isFunc[i][8]) setFuncModule(i, 8, false);
      }
    }
    for (let i = 0; i < 8; i++) {
      if (!isFunc[8][size - 1 - i]) setFuncModule(8, size - 1 - i, false);
      if (i < 7 && !isFunc[size - 1 - i][8]) setFuncModule(size - 1 - i, 8, false);
    }

    // Information de version (v >= 7)
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const verBits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((verBits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFuncModule(a, b, bit);
        setFuncModule(b, a, bit);
      }
    }

    return { size, modules, isFunc };
  }

  function placeDataBits(modules, isFunc, size, codewords) {
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let upward = true;

    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        const r = upward ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunc[r][c]) {
            let dark = false;
            if (bitIdx < totalBits) {
              dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
              bitIdx++;
            }
            modules[r][c] = dark ? 1 : 0;
          }
        }
      }
      upward = !upward;
    }
  }

  function applyMaskAndFormat(baseModules, isFunc, size, mask) {
    const m = baseModules.map((row) => Uint8Array.from(row));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (isFunc[r][c]) continue;
        let inv = false;
        if (mask === 0) inv = (r + c) % 2 === 0;
        else if (mask === 1) inv = r % 2 === 0;
        else if (mask === 2) inv = c % 3 === 0;
        else if (mask === 3) inv = (r + c) % 3 === 0;
        else if (mask === 4) inv = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
        else if (mask === 5) inv = ((r * c) % 2) + ((r * c) % 3) === 0;
        else if (mask === 6) inv = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
        else inv = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
        if (inv) m[r][c] ^= 1;
      }
    }

    // ECC Level L = 01
    const data = (0b01 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    const getBit = (i) => ((bits >>> i) & 1);
    for (let i = 0; i <= 5; i++) m[8][i] = getBit(i);
    m[8][7] = getBit(6);
    m[8][8] = getBit(7);
    m[7][8] = getBit(8);
    for (let i = 9; i < 15; i++) m[14 - i][8] = getBit(i);

    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = getBit(i);
    for (let i = 8; i < 15; i++) m[size - 15 + i][8] = getBit(i);
    m[size - 8][8] = 1;

    return m;
  }

  function penaltyScore(m, size) {
    let score = 0;
    for (let r = 0; r < size; r++) {
      let runLen = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) {
          runLen++;
          if (runLen === 5) score += 3;
          else if (runLen > 5) score += 1;
        } else runLen = 1;
      }
    }
    for (let c = 0; c < size; c++) {
      let runLen = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) {
          runLen++;
          if (runLen === 5) score += 3;
          else if (runLen > 5) score += 1;
        } else runLen = 1;
      }
    }
    return score;
  }

  function renderQrSvg(text, pixelSize = 220) {
    const utf8 = new TextEncoder().encode(String(text || ''));
    const version = chooseVersion(utf8.length);
    const codewords = buildCodewords(utf8, version);
    const { size, modules, isFunc } = createBaseMatrix(version);
    placeDataBits(modules, isFunc, size, codewords);

    let bestMatrix = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = applyMaskAndFormat(modules, isFunc, size, mask);
      const sc = penaltyScore(candidate, size);
      if (sc < bestScore) {
        bestScore = sc;
        bestMatrix = candidate;
      }
    }

    const margin = 2;
    const viewSize = size + margin * 2;
    let pathParts = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (bestMatrix[r][c]) {
          pathParts += `M${c + margin},${r + margin}h1v1h-1z`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges" role="img" aria-label="QR code d'enrôlement à usage unique"><rect width="100%" height="100%" fill="#FFFFFF"/><path d="${pathParts}" fill="#172030"/></svg>`;
  }

  /**
   * Démarre la lecture caméra d'un QR code dans un conteneur DOM
   */
  function startQrCameraScanner(containerEl, onDecoded, onError) {
    let stopped = false;
    let stream = null;
    let rafId = null;

    async function stop() {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) {
        for (const t of stream.getTracks()) {
          try { t.stop(); } catch (_) {}
        }
        stream = null;
      }
    }

    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Caméra non disponible sur ce navigateur.');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        if (stopped) {
          await stop();
          return;
        }
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.playsInline = true;
        video.muted = true;
        video.defaultMuted = true;
        video.autoplay = true;
        video.className = 'qr-video-preview';
        video.srcObject = stream;
        containerEl.innerHTML = '';
        containerEl.style.position = 'relative';
        containerEl.appendChild(video);

        // Réticule visuel et rayon laser
        const overlay = document.createElement('div');
        overlay.className = 'qr-scanner-overlay';
        overlay.innerHTML = '<div class="qr-target-box"><div class="qr-laser-line"></div></div>';
        containerEl.appendChild(overlay);

        try {
          await video.play();
        } catch (_) {}

        if (typeof window.BarcodeDetector === 'function') {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const scanLoop = async () => {
            if (stopped) return;
            try {
              if (video.readyState >= 2) {
                const codes = await detector.detect(video);
                if (codes && codes.length > 0 && codes[0].rawValue) {
                  const val = codes[0].rawValue;
                  await stop();
                  onDecoded(val);
                  return;
                }
              }
            } catch (_) {}
            rafId = requestAnimationFrame(scanLoop);
          };
          rafId = requestAnimationFrame(scanLoop);
        } else {
          // Si BarcodeDetector n'est pas activé dans ce navigateur, on laisse la vidéo active
          // et on informe discrètement l'utilisateur de pointer son appareil photo natif ou d'utiliser le bouton photo
          console.info('[QR] BarcodeDetector natif non supporté par ce navigateur mobile, prévisualisation vidéo active.');
        }
      } catch (err) {
        if (!stopped && onError) {
          onError('Accès caméra refusé ou indisponible. Vous pouvez scanner avec l\'appareil photo natif ou coller le lien d\'enrôlement.');
        }
      }
    })();

    return { stop };
  }

  window.FasoQr = {
    renderQrSvg,
    startQrCameraScanner
  };
})();

