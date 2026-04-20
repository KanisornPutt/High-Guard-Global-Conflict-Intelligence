import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { findFeature, getCountryLatLon } from "../data/countryCoords";
import { SEV_COLORS, TEX_SETS } from "../config/constants";

function ll2v(lat, lon, r = 1) {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// Canvas (equirectangular) helpers
function getUnwrappedRingPoints(ring, W, H) {
  if (!ring?.length) return [];

  const points = [];
  let offsetX = 0;
  let prevX = null;

  ring.forEach(([lon, lat]) => {
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;

    let xUnwrapped = x + offsetX;
    if (prevX != null) {
      const dx = xUnwrapped - prevX;
      if (dx > W / 2) {
        offsetX -= W;
        xUnwrapped = x + offsetX;
      } else if (dx < -W / 2) {
        offsetX += W;
        xUnwrapped = x + offsetX;
      }
    }

    points.push([xUnwrapped, y]);
    prevX = xUnwrapped;
  });

  return points;
}

function drawRing(ctx, ring, W, H, render) {
  const points = getUnwrappedRingPoints(ring, W, H);
  if (!points.length) return;

  // Draw unwrapped path and wrapped copies so polygons crossing the antimeridian
  // (e.g. Russia) do not create long seam-spanning artifacts.
  for (let k = -1; k <= 1; k += 1) {
    const shift = k * W;
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const sx = x + shift;
      i === 0 ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y);
    });
    ctx.closePath();
    render();
  }
}
function getRings(geo) {
  if (!geo) return [];
  if (geo.type === "Polygon")      return geo.coordinates;
  if (geo.type === "MultiPolygon") return geo.coordinates.flat();
  return [];
}
function buildBorderCanvas(features, W = 4096, H = 2048) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "rgba(100,160,255,0.4)";
  ctx.lineWidth = 1.2;
  features.forEach(({ geometry }) =>
    getRings(geometry).forEach(ring => {
      drawRing(ctx, ring, W, H, () => ctx.stroke());
    })
  );
  return c;
}
function buildHighlightCanvas(feature, W = 4096, H = 2048) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!feature?.geometry) return c;
  ctx.fillStyle   = "rgba(55,138,221,0.22)";
  ctx.strokeStyle = "rgba(130,210,255,1)";
  ctx.lineWidth   = 4;
  getRings(feature.geometry).forEach(ring => {
    drawRing(ctx, ring, W, H, () => {
      ctx.fill();
      ctx.stroke();
    });
  });
  return c;
}
function makeMarkerCanvas(severity) {
  const sz = 128, m = sz / 2;
  const c = document.createElement("canvas");
  c.width = sz; c.height = sz;
  const ctx = c.getContext("2d");
  const col = SEV_COLORS[severity] || SEV_COLORS.medium;
  const grd = ctx.createRadialGradient(m, m, 2, m, m, m);
  grd.addColorStop(0, col + "60"); grd.addColorStop(1, col + "00");
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(m, m, m, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(m, m, 26, 0, Math.PI * 2);
  ctx.strokeStyle = col + "80"; ctx.lineWidth = 8; ctx.stroke();
  ctx.beginPath(); ctx.arc(m, m, 12, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill();
  ctx.beginPath(); ctx.arc(m, m, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fill();
  return c;
}
function makeLabelCanvas(name) {
  const W = 320, H = 96;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  const padX = 18;
  const radius = 14;
  ctx.font = "600 30px 'DM Sans', sans-serif";
  const text = String(name || "").toUpperCase();
  const tw = Math.min(ctx.measureText(text).width, W - padX * 2 - 8);
  const bw = tw + padX * 2;
  const bh = 54;
  const bx = (W - bw) / 2;
  const by = (H - bh) / 2;

  ctx.beginPath();
  ctx.moveTo(bx + radius, by);
  ctx.lineTo(bx + bw - radius, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
  ctx.lineTo(bx + bw, by + bh - radius);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
  ctx.lineTo(bx + radius, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
  ctx.lineTo(bx, by + radius);
  ctx.quadraticCurveTo(bx, by, bx + radius, by);
  ctx.closePath();
  ctx.fillStyle = "rgba(7, 15, 31, 0.65)";
  ctx.fill();
  ctx.strokeStyle = "rgba(130, 210, 255, 0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = "600 30px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(230, 238, 252, 0.96)";
  ctx.fillText(text, W / 2, H / 2 + 1);

  return c;
}

// Local clock component
function LocalClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = n => String(n).padStart(2, "0");
  const dateStr = time.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  return (
    <div className="utc-clock">
      <span className="utc-time">
        {dateStr} {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
      </span>
      <span className="utc-label">LOCAL</span>
    </div>
  );
}

export default function Globe({ countries, selectedCountry, onCountryClick }) {
  const mountRef  = useRef(null);
  const api       = useRef({ rebuildMarkers: null, applyHighlight: null, selectedName: null, zoom: null });
  const [overlapPick, setOverlapPick] = useState(null);
  const [unmappedCountries, setUnmappedCountries] = useState([]);
  const [unmappedSelection, setUnmappedSelection] = useState("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.z = 2.6;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xd8eeff, 1.1);
    sun.position.set(5, 3, 5); scene.add(sun);

    const sv = [];
    for (let i = 0; i < 3000; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(42 + Math.random() * 28);
      sv.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sv, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.5 })));

    const sGeo    = new THREE.SphereGeometry(1, 72, 72);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x0a1830, shininess: 25, specular: 0x1a3060 });
    const globe   = new THREE.Mesh(sGeo, baseMat);
    scene.add(globe);

    const atmMat = new THREE.ShaderMaterial({
      vertexShader:   `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec3 vN; void main(){ float i=pow(1.-dot(vN,vec3(0,0,1)),3.0); gl_FragColor=vec4(0.1,0.45,1.,i*0.5); }`,
      transparent: true, side: THREE.FrontSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.045, 72, 72), atmMat));

    const borderMat  = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: 0.01, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const borderMesh = new THREE.Mesh(sGeo, borderMat);
    borderMesh.scale.setScalar(1.002); borderMesh.visible = false; scene.add(borderMesh);

    const hlMat  = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: 0.01, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const hlMesh = new THREE.Mesh(sGeo, hlMat);
    hlMesh.scale.setScalar(1.004); hlMesh.visible = false; scene.add(hlMesh);

    const markers  = new THREE.Group();
    const markerSprites = [];
    const hitSprites = [];
    scene.add(markers);
    const rotGroup = [globe, borderMesh, hlMesh, markers];

    // Texture loader
    const tl = new THREE.TextureLoader();
    tl.crossOrigin = "anonymous";

    function loadTexture() {
      const urls = TEX_SETS.night;
      function tryIdx(i) {
        if (i >= urls.length) return;
        tl.load(urls[i], (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          if (globe.material !== baseMat) globe.material.dispose();
          globe.material = new THREE.MeshPhongMaterial({ map: tex, shininess: 18, specular: new THREE.Color(0x1a3060) });
          globe.material.needsUpdate = true;
        }, undefined, () => tryIdx(i + 1));
      }
      tryIdx(0);
    }
    loadTexture();

    // Borders
    let allFeatures = [], currentHover = null;
    async function loadBorders() {
      try {
        const res  = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        const topo = await res.json();
        const { feature } = await import("topojson-client");
        allFeatures = feature(topo, topo.objects.countries).features;
      } catch {
        try {
          const r2 = await fetch("https://cdn.jsdelivr.net/npm/world-geojson@1.0.0/countries.geojson");
          allFeatures = (await r2.json()).features;
        } catch { return; }
      }
      const bc = buildBorderCanvas(allFeatures);
      if (borderMat.map) borderMat.map.dispose();
      borderMat.map = new THREE.CanvasTexture(bc);
      borderMat.needsUpdate = true;
      borderMesh.visible = true;

      // Rebuild once we have features so coord lookup can cover all countries.
      api.current.rebuildMarkers?.(countries);
    }
    loadBorders();

    function applyHighlight(name) {
      if (name === currentHover) return;
      currentHover = name;
      if (!name || !allFeatures.length) { hlMesh.visible = false; hlMat.map = null; hlMat.needsUpdate = true; return; }
      const feat = findFeature(allFeatures, name);
      if (!feat) { hlMesh.visible = false; hlMat.map = null; hlMat.needsUpdate = true; return; }
      const hc = buildHighlightCanvas(feat);
      if (hlMat.map) hlMat.map.dispose();
      hlMat.map = new THREE.CanvasTexture(hc);
      hlMat.needsUpdate = true;
      hlMesh.visible = true;
    }
    api.current.applyHighlight = applyHighlight;

    function rebuildMarkers(list) {
      markers.clear();
      markerSprites.length = 0;
      hitSprites.length = 0;
      const unresolvedCountries = [];

      list.forEach(c => {
        const hasLatLon = Number.isFinite(c.lat) && Number.isFinite(c.lon);
        const hasDefinedCoords = c.hasDefinedCoords !== false;
        const resolved = (hasLatLon && hasDefinedCoords)
          ? [c.lat, c.lon]
          : getCountryLatLon(c.name, allFeatures);

        if (!resolved) {
          unresolvedCountries.push(c);
          return;
        }

        const [lat, lon] = resolved;

        const markerTex = new THREE.CanvasTexture(makeMarkerCanvas(c.severity));
        const markerMat = new THREE.SpriteMaterial({ map: markerTex, transparent: true, depthWrite: false, sizeAttenuation: true });
        const markerSp  = new THREE.Sprite(markerMat);
        const markerScale = c.severity === "critical" ? 0.076 : c.severity === "high" ? 0.066 : 0.057;
        const markerPos = ll2v(lat, lon, 1.015);
        markerSp.scale.setScalar(markerScale);
        markerSp.position.copy(markerPos);
        markerSp.userData = { country: c, baseScale: markerScale };
        markerSprites.push(markerSp);
        markers.add(markerSp);

        // Larger invisible target to make hover/click easier than visible marker size.
        const hitMat = new THREE.SpriteMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
          sizeAttenuation: true,
        });
        const hitSp = new THREE.Sprite(hitMat);
        hitSp.scale.setScalar(markerScale * 2.4);
        hitSp.position.copy(markerPos);
        hitSp.userData = { country: c };
        hitSprites.push(hitSp);
        markers.add(hitSp);

        const labelTex = new THREE.CanvasTexture(makeLabelCanvas(c.name));
        const labelMat = new THREE.SpriteMaterial({
          map: labelTex,
          transparent: true,
          depthWrite: false,
          depthTest: true,
          sizeAttenuation: true,
        });
        const labelSp = new THREE.Sprite(labelMat);
        const labelPos = ll2v(lat, lon, 1.09);
        const labelW = 0.17;
        const labelH = 0.052;
        labelSp.scale.set(labelW, labelH, 1);
        labelSp.position.copy(labelPos);
        markers.add(labelSp);
      });

      setUnmappedCountries(
        unresolvedCountries
          .slice()
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      );
    }
    api.current.rebuildMarkers = rebuildMarkers;
    rebuildMarkers(countries);

    let isDragging = false, hasDragged = false;
    let lastUserMoveAt = null;
    let stillSinceAt = null;
    let prevX = 0, prevY = 0, velY = 0.0008;
    let targetZoom = 2.6, currentZoom = 2.6;
    const rc = new THREE.Raycaster();
    const mv = new THREE.Vector2();

    function normMouse(cx, cy) {
      const r = mount.getBoundingClientRect();
      return [((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1];
    }
    function hitCountries(nx, ny) {
      mv.set(nx, ny); rc.setFromCamera(mv, camera);
      const hits = rc.intersectObjects(hitSprites);
      if (!hits.length) return [];

      const uniq = new Map();
      hits.forEach(({ object, distance }) => {
        const country = object?.userData?.country;
        if (!country?.name) return;
        const prev = uniq.get(country.name);
        if (!prev || distance < prev.distance) uniq.set(country.name, { country, distance });
      });

      return Array.from(uniq.values())
        .sort((a, b) => a.distance - b.distance)
        .map(v => v.country);
    }
    function openOverlapPick(clientX, clientY, candidates) {
      if (!candidates?.length) {
        setOverlapPick(null);
        return;
      }
      const r = mount.getBoundingClientRect();
      const menuW = 220;
      const x = Math.max(12, Math.min((clientX - r.left) + 10, r.width - menuW - 12));
      const y = Math.max(12, Math.min((clientY - r.top) + 10, r.height - 180));
      setOverlapPick({ x, y, candidates });
    }
    function adjustZoom(d) { targetZoom = Math.max(1.25, Math.min(5.0, targetZoom + d)); }
    api.current.zoom = adjustZoom;

    function onDown(e)  { isDragging = true; hasDragged = false; velY = 0; prevX = e.clientX; prevY = e.clientY; setOverlapPick(null); lastUserMoveAt = performance.now(); stillSinceAt = null; }
    function onMove(e) {
      if (isDragging) {
        const dx = e.clientX - prevX, dy = e.clientY - prevY;
        if (Math.abs(dx) + Math.abs(dy) > 2) hasDragged = true;
        rotGroup.forEach(o => { o.rotation.y += dx * 0.005; o.rotation.x = Math.max(-1.3, Math.min(1.3, o.rotation.x + dy * 0.005)); });
        lastUserMoveAt = performance.now();
        stillSinceAt = null;
        velY = dx * 0.003; prevX = e.clientX; prevY = e.clientY;
      } else {
        const [nx, ny] = normMouse(e.clientX, e.clientY);
        const hit = hitCountries(nx, ny)[0] ?? null;
        mount.style.cursor = hit ? "pointer" : "grab";
        applyHighlight(hit?.name ?? null);
      }
    }
    function onUp(e) {
      isDragging = false;
      if (!hasDragged) {
        const [nx, ny] = normMouse(e.clientX, e.clientY);
        const hits = hitCountries(nx, ny);
        if (hits.length === 1) {
          setOverlapPick(null);
          onCountryClick(hits[0]);
        } else if (hits.length > 1) {
          openOverlapPick(e.clientX, e.clientY, hits);
        } else {
          setOverlapPick(null);
        }
      }
    }
    function onLeave() { isDragging = false; applyHighlight(null); mount.style.cursor = "grab"; }
    function onWheel(e) { e.preventDefault(); adjustZoom(e.deltaY * 0.004); }

    let lastPinch = null, lastTX = 0, lastTY = 0, tDragged = false;
    function onTS(e) {
      if (e.touches.length === 2) lastPinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      else { isDragging = true; tDragged = false; velY = 0; lastTX = e.touches[0].clientX; lastTY = e.touches[0].clientY; lastUserMoveAt = performance.now(); stillSinceAt = null; }
    }
    function onTM(e) {
      e.preventDefault();
      if (e.touches.length === 2 && lastPinch != null) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        adjustZoom(-(d - lastPinch) * 0.012); lastPinch = d;
      } else if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastTX, dy = e.touches[0].clientY - lastTY;
        if (Math.abs(dx) + Math.abs(dy) > 2) tDragged = true;
        rotGroup.forEach(o => { o.rotation.y += dx * 0.005; o.rotation.x = Math.max(-1.3, Math.min(1.3, o.rotation.x + dy * 0.005)); });
        lastUserMoveAt = performance.now();
        stillSinceAt = null;
        velY = dx * 0.003; lastTX = e.touches[0].clientX; lastTY = e.touches[0].clientY;
      }
    }
    function onTE(e) {
      isDragging = false; lastPinch = null;
      if (!tDragged && e.changedTouches.length === 1) {
        const t = e.changedTouches[0]; const [nx, ny] = normMouse(t.clientX, t.clientY);
        const hits = hitCountries(nx, ny);
        if (hits.length === 1) {
          setOverlapPick(null);
          onCountryClick(hits[0]);
        } else if (hits.length > 1) {
          openOverlapPick(t.clientX, t.clientY, hits);
        } else {
          setOverlapPick(null);
        }
      }
    }

    mount.addEventListener("mousedown",  onDown);
    mount.addEventListener("mousemove",  onMove);
    mount.addEventListener("mouseup",    onUp);
    mount.addEventListener("mouseleave", onLeave);
    mount.addEventListener("wheel",      onWheel, { passive: false });
    mount.addEventListener("touchstart", onTS, { passive: false });
    mount.addEventListener("touchmove",  onTM, { passive: false });
    mount.addEventListener("touchend",   onTE);

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    let raf;
    const clock = new THREE.Clock();
    function animate() {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (!isDragging) {
        if (lastUserMoveAt == null) {
          velY *= 0.97;
          if (Math.abs(velY) < 0.0006) {
            velY = 0.0008;
          }
          rotGroup.forEach(o => { o.rotation.y += velY; });
        } else if (Math.abs(velY) >= 0.0006) {
          velY *= 0.97;
          stillSinceAt = null;
          rotGroup.forEach(o => { o.rotation.y += velY; });
        } else {
          velY = 0;
          if (stillSinceAt == null) stillSinceAt = performance.now();
          // Stay still for 5 seconds after momentum has actually stopped,
          // then resume idle auto-rotation.
          if ((performance.now() - stillSinceAt) >= 5000) {
            lastUserMoveAt = null;
            stillSinceAt = null;
            velY = 0.0008;
            rotGroup.forEach(o => { o.rotation.y += velY; });
          }
        }
      }
      currentZoom += (targetZoom - currentZoom) * 0.09;
      camera.position.z = currentZoom;
      markerSprites.forEach((s, i) => {
        const c = s.userData.country;
        const base = s.userData.baseScale;
        const sel  = api.current.selectedName === c.name;
        s.scale.setScalar(base * (sel ? 1.55 : 1 + 0.15 * Math.sin(t * 2.3 + i * 1.7)));
      });
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      mount.removeEventListener("mousedown",  onDown);
      mount.removeEventListener("mousemove",  onMove);
      mount.removeEventListener("mouseup",    onUp);
      mount.removeEventListener("mouseleave", onLeave);
      mount.removeEventListener("wheel",      onWheel);
      mount.removeEventListener("touchstart", onTS);
      mount.removeEventListener("touchmove",  onTM);
      mount.removeEventListener("touchend",   onTE);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { api.current.rebuildMarkers?.(countries); }, [countries]);
  useEffect(() => {
    api.current.selectedName = selectedCountry?.name ?? null;
    setOverlapPick(null);
    if (selectedCountry) api.current.applyHighlight?.(selectedCountry.name);
    else api.current.applyHighlight?.(null);
  }, [selectedCountry]);
  useEffect(() => {
    if (!unmappedSelection) return;
    const stillExists = unmappedCountries.some((c) => c.name === unmappedSelection);
    if (!stillExists) setUnmappedSelection("");
  }, [unmappedCountries, unmappedSelection]);

  return (
    <div className="globe-wrap">
      <div ref={mountRef} style={{ width: "100%", height: "100%", cursor: "grab" }} />

      {/* Top-left: clock */}
      <div className="globe-top-left">
        <LocalClock />

        {unmappedCountries.length > 0 && (
          <div className="unmapped-country-control">
            <label className="unmapped-country-label" htmlFor="unmapped-country-select">
              Unmapped countries ({unmappedCountries.length})
            </label>
            <select
              id="unmapped-country-select"
              className="unmapped-country-select"
              value={unmappedSelection}
              onChange={(e) => {
                const nextName = e.target.value;
                setUnmappedSelection(nextName);

                if (!nextName) return;

                const picked = unmappedCountries.find((c) => c.name === nextName);
                if (picked) onCountryClick(picked);
                setUnmappedSelection("");
              }}
            >
              <option value="">Select a country…</option>
              {unmappedCountries.map((country) => (
                <option key={country.name} value={country.name}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => api.current.zoom?.(-0.5)} aria-label="Zoom in">+</button>
        <div className="zoom-track"><div className="zoom-track-inner" /></div>
        <button className="zoom-btn" onClick={() => api.current.zoom?.(0.5)}  aria-label="Zoom out">−</button>
      </div>

      <div className="globe-legend">
        {[["critical","#E8393A"],["high","#EF9F27"],["medium","#378ADD"]].map(([s,col]) => (
          <div key={s} className="legend-item">
            <span className="legend-dot" style={{ background: col }} /><span>{s}</span>
          </div>
        ))}
      </div>

      <div className="globe-hint">Drag · Scroll to zoom · Click marker</div>

      {overlapPick && (
        <div className="overlap-picker" style={{ left: overlapPick.x, top: overlapPick.y }}>
          <div className="overlap-picker-title">Choose a country</div>
          <div className="overlap-picker-list">
            {overlapPick.candidates.map((country) => (
              <button
                key={country.name}
                type="button"
                className="overlap-picker-item"
                onClick={() => {
                  setOverlapPick(null);
                  onCountryClick(country);
                }}
              >
                {country.name}
              </button>
            ))}
          </div>
          <button type="button" className="overlap-picker-close" onClick={() => setOverlapPick(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
