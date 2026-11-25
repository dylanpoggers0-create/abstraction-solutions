/* 3D models for the Order page: the Email Cyberdeck and HydroCart, built in code with three.js
   (vendored in vendor/three, no CDN). Loaded only when the models scroll into view (projects.page.js).
   mount(el, kind) puts a model in el and returns a small controller. */
import * as THREE from './vendor/three/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const eio = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const V = (a, b, c) => new THREE.Vector3(a, b, c);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FONT = '"Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif';

function mesh(geo, mat, px, py, pz, parent, shadow = true) {
    const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz);
    m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
function tube(points, r, mat, parent, seg = 48) {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, 8), mat);
    m.castShadow = true; parent.add(m); return m;
}

/* ---------- shared stage: renderer, lights, orbit camera, render-on-demand loop ---------- */
function stage(el, opts) {
    const canvas = document.createElement('canvas');
    canvas.className = 'viewer-canvas';
    el.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = opts.exposure || 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = opts.env || 0.8;
    const camera = new THREE.PerspectiveCamera(opts.fov || 30, 1, 1, 5000);

    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.copy(opts.keyPos); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, opts.shadowBox);
    key.shadow.radius = 5; key.shadow.bias = -0.0005;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd6ff, 0.5); fill.position.set(300, 160, 200); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x7ee96f, 1.5); rim.position.set(80, 140, -380); scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0x7ee96f, 1.0); rim2.position.set(-380, 90, -120); scene.add(rim2);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ opacity: 0.5 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = opts.groundY || 0; ground.receiveShadow = true; scene.add(ground);

    // orbit state
    const home = { theta: opts.theta, phi: opts.phi, r: opts.radius };
    const cam = { ...home };
    const goal = { ...home };
    let spin = !REDUCED, touched = false, dirty = true, visible = false, running = false, last = 0;
    const target = opts.target;

    function place() {
        const sp = Math.sin(cam.phi);
        camera.position.set(target.x + cam.r * sp * Math.sin(cam.theta), target.y + cam.r * Math.cos(cam.phi), target.z + cam.r * sp * Math.cos(cam.theta));
        camera.lookAt(target);
    }
    function resize() {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // keep the whole model in frame on narrow screens
        camera.fov = (opts.fov || 30) * Math.max(1, (opts.aspectFit || 0.8) / camera.aspect);
        camera.updateProjectionMatrix();
        dirty = true;
    }
    new ResizeObserver(resize).observe(el);

    // pointer: drag to turn, pinch to zoom; touch-action: pan-y keeps vertical swipes scrolling the page
    const pts = new Map();
    let pinch0 = 0, r0 = 0, moved = 0;
    canvas.addEventListener('pointerdown', e => {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        moved = 0; stopSpin();
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); r0 = goal.r; }
    });
    canvas.addEventListener('pointermove', e => {
        const p = pts.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (pts.size === 1) {
            moved += Math.abs(dx) + Math.abs(dy);
            goal.theta -= dx * 0.009;
            if (e.pointerType === 'mouse') goal.phi = clamp(goal.phi - dy * 0.007, opts.phiMin || 0.25, opts.phiMax || 1.5);
        } else if (pts.size === 2) {
            const [a, b] = [...pts.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch0 > 0) goal.r = clamp(r0 * pinch0 / d, opts.rMin, opts.rMax);
        }
        wake();
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    canvas.addEventListener('pointerup', e => { const wasTap = moved < 6 && pts.size === 1; up(e); if (wasTap && api.onTap) api.onTap(e); });
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('dblclick', () => reset());
    el.addEventListener('keydown', e => {
        const k = e.key;
        if (k === 'ArrowLeft') goal.theta += 0.2; else if (k === 'ArrowRight') goal.theta -= 0.2;
        else if (k === 'ArrowUp') goal.phi = clamp(goal.phi - 0.12, opts.phiMin || 0.25, opts.phiMax || 1.5);
        else if (k === 'ArrowDown') goal.phi = clamp(goal.phi + 0.12, opts.phiMin || 0.25, opts.phiMax || 1.5);
        else if (k === '+' || k === '=') zoom(0.85); else if (k === '-' || k === '_') zoom(1 / 0.85);
        else if (k === '0' || k === 'Home') reset();
        else return;
        e.preventDefault(); stopSpin(); wake();
    });

    function stopSpin() { if (spin) { spin = false; touched = true; } }
    function zoom(f) { goal.r = clamp(goal.r * f, opts.rMin, opts.rMax); stopSpin(); wake(); }
    function reset() { Object.assign(goal, home); wake(); }
    function wake() { dirty = true; if (visible && !running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
    function loop(now) {
        if (!visible) { running = false; return; }
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (spin) goal.theta += dt * 0.25;
        const k = 1 - Math.pow(0.0008, dt);       // smooth follow
        let moving = false;
        for (const f of ['theta', 'phi', 'r']) { const d = goal[f] - cam[f]; if (Math.abs(d) > 1e-4) moving = true; cam[f] += d * k; }
        const busy = api.tick ? api.tick(now / 1000, dt) : false;
        if (moving || busy || dirty || spin) { place(); renderer.render(scene, camera); dirty = false; }
        requestAnimationFrame(loop);
    }
    const api = {
        scene, camera, renderer, canvas, wake, zoom, reset, place,
        tick: null, onTap: null,
        setVisible(v) { visible = v; if (v) wake(); },
        renderNow() { place(); renderer.render(scene, camera); },
        raycast(e, objects) {
            const r = canvas.getBoundingClientRect();
            const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
            const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
            return ray.intersectObjects(objects, true)[0] || null;
        },
    };
    resize(); place();
    return api;
}

/* the LCD's 5x7 dot-matrix font */
const ROWS = {
 A:'.###. #...# #...# ##### #...# #...# #...#', B:'####. #...# #...# ####. #...# #...# ####.', C:'.###. #...# #.... #.... #.... #...# .###.',
 D:'###.. #..#. #...# #...# #...# #..#. ###..', E:'##### #.... #.... ####. #.... #.... #####', F:'##### #.... #.... ####. #.... #.... #....',
 G:'.###. #...# #.... #.### #...# #...# .####', H:'#...# #...# #...# ##### #...# #...# #...#', I:'.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
 J:'..### ...#. ...#. ...#. ...#. #..#. .##..', K:'#...# #..#. #.#.. ##... #.#.. #..#. #...#', L:'#.... #.... #.... #.... #.... #.... #####',
 M:'#...# ##.## #.#.# #.#.# #...# #...# #...#', N:'#...# #...# ##..# #.#.# #..## #...# #...#', O:'.###. #...# #...# #...# #...# #...# .###.',
 P:'####. #...# #...# ####. #.... #.... #....', Q:'.###. #...# #...# #...# #.#.# #..#. .##.#', R:'####. #...# #...# ####. #.#.. #..#. #...#',
 S:'.#### #.... #.... .###. ....# ....# ####.', T:'##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', U:'#...# #...# #...# #...# #...# #...# .###.',
 V:'#...# #...# #...# #...# #...# .#.#. ..#..', W:'#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', X:'#...# #...# .#.#. ..#.. .#.#. #...# #...#',
 Y:'#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', Z:'##### ....# ...#. ..#.. .#... #.... #####',
 '0':'.###. #...# #..## #.#.# ##..# #...# .###.', '1':'..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.', '2':'.###. #...# ....# ...#. ..#.. .#... #####',
 '3':'##### ...#. ..#.. ...#. ....# #...# .###.', '4':'...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5':'##### #.... ####. ....# ....# #...# .###.',
 '6':'..##. .#... #.... ####. #...# #...# .###.', '7':'##### ....# ...#. ..#.. .#... .#... .#...', '8':'.###. #...# #...# .###. #...# #...# .###.',
 '9':'.###. #...# #...# .#### ....# ...#. .##..', '?':'.###. #...# ....# ...#. ..#.. ..... ..#..', ':':'..... .##.. .##.. ..... .##.. .##.. .....',
 '.':'..... ..... ..... ..... ..... .##.. .##..', '/':'..... ....# ...#. ..#.. .#... #.... .....', '-':'..... ..... ..... ##### ..... ..... .....',
 u:'..... ..... #...# #...# #...# #..## .##.#', e:'..... ..... .###. #...# ##### #.... .###.', ' ':'..... ..... ..... ..... ..... ..... .....'
};

/* ================= Email Cyberdeck ================= */
const F = {};
for (const k in ROWS) F[k] = ROWS[k].split(' ').join('');

function cyberdeck(el) {
    const W3 = 220, H3 = 58, D3 = 130, TOP = H3;
    const S = stage(el, {
        target: V(0, 34, 0), theta: -0.62, phi: 1.02, radius: 520, rMin: 260, rMax: 900, fov: 30, aspectFit: 1.0,
        keyPos: V(-260, 420, 260), shadowBox: { left: -260, right: 260, top: 260, bottom: -260, near: 50, far: 1200 }, groundY: -3.1,
    });
    const root = new THREE.Group(); S.scene.add(root);

    const charcoal = new THREE.MeshPhysicalMaterial({ color: 0x2a2d31, roughness: 0.74, metalness: 0.12, clearcoat: 0.08, clearcoatRoughness: 0.6 });
    const shellMat = charcoal.clone(); shellMat.transparent = true;
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.55, metalness: 0.2 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.28, metalness: 0.95 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x111213, roughness: 0.95 });
    const capMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1d1f, roughness: 0.5, clearcoat: 0.4 });
    const piPcb = new THREE.MeshStandardMaterial({ color: 0x1d6b3a, roughness: 0.55, metalness: 0.1 });
    const megaPcb = new THREE.MeshStandardMaterial({ color: 0x1b5ea6, roughness: 0.55, metalness: 0.1 });
    const lcdPcb = new THREE.MeshStandardMaterial({ color: 0x1f7a3c, roughness: 0.6 });
    const chip = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.4, metalness: 0.3 });
    const LCD = { x: -52, z: -6 }, LED_G = { x: 2, z: -16 }, LED_R = { x: 2, z: 4 }, KNOB = { x: 26, z: -6 };
    const BTN_Y = { x: 60, z: -6 }, BTN_N = { x: 90, z: -6 };

    // the case shell (lifts away for "look inside") and the bottom plate
    const shell = new THREE.Group(); root.add(shell);
    mesh(new RoundedBoxGeometry(W3, H3 - 3, D3, 5, 5), shellMat, 0, (H3 - 3) / 2 + 3, 0, shell);
    for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) mesh(box(1.2, 24, 3.4), black, sx * (W3 / 2 + 0.05), 27, -42 + i * 12, shell);
    const rear = -D3 / 2 - 0.05;
    mesh(box(12.5, 11.5, 1.2), black, -46, 24, rear, shell); mesh(box(10, 9, 1.4), steel, -46, 24, rear - 0.2, shell);
    mesh(new RoundedBoxGeometry(10, 4.4, 1.4, 2, 1.6), black, 48, 22, rear, shell);
    const plate = new THREE.Group(); root.add(plate);
    mesh(new RoundedBoxGeometry(W3 - 1, 3, D3 - 1, 3, 1.4), charcoal, 0, 1.5, 0, plate);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.CylinderGeometry(6.5, 7, 3, 24), rubber, sx * (W3 / 2 - 18), -1.5, sz * (D3 / 2 - 16), plate);

    // printed panel graphics
    const deco = document.createElement('canvas'); deco.width = 2200; deco.height = 1300;
    {
        const c = deco.getContext('2d'), mx = v => (v + W3 / 2) * 10, mz = v => (v + D3 / 2) * 10;
        c.fillStyle = 'rgba(214,222,214,0.85)'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `700 72px ${FONT}`; c.fillText('YES', mx(BTN_Y.x), mz(BTN_Y.z + 15)); c.fillText('NO', mx(BTN_N.x), mz(BTN_N.z + 15));
        c.font = `600 40px ${FONT}`; c.fillText('CONTRAST', mx(KNOB.x), mz(KNOB.z + 15));
        c.fillStyle = 'rgba(126,233,111,0.9)'; c.beginPath(); c.arc(mx(BTN_Y.x), mz(BTN_Y.z - 14), 9, 0, 7); c.fill();
        c.fillStyle = 'rgba(214,222,214,0.55)'; c.font = `600 38px ${FONT}`; c.textAlign = 'left'; c.fillText('EMAIL DECK', mx(-100), mz(D3 / 2 - 12));
        c.textAlign = 'right'; c.fillText('ABSTRACTION SOLUTIONS', mx(100), mz(D3 / 2 - 12));
    }
    const decoTex = new THREE.CanvasTexture(deco); decoTex.colorSpace = THREE.SRGBColorSpace; decoTex.anisotropy = 8;
    const decoMesh = mesh(new THREE.PlaneGeometry(W3, D3), new THREE.MeshStandardMaterial({ map: decoTex, transparent: true, roughness: 0.8 }), 0, TOP + 0.05, 0, shell, false);
    decoMesh.rotation.x = -Math.PI / 2;

    // top parts: LCD, LEDs, knob, buttons
    const top = new THREE.Group(); root.add(top);
    mesh(box(84, 0.4, 40), black, LCD.x, TOP + 0.02, LCD.z, shell);
    mesh(box(80, 3, 36), black, LCD.x, TOP + 0.6, LCD.z, top);
    mesh(box(80, 1.6, 36), lcdPcb, LCD.x, TOP - 2.4, LCD.z, top);
    const lcdCanvas = document.createElement('canvas'); lcdCanvas.width = 1290; lcdCanvas.height = 328;
    const lcdTex = new THREE.CanvasTexture(lcdCanvas); lcdTex.colorSpace = THREE.SRGBColorSpace; lcdTex.anisotropy = 8;
    const screen = mesh(new THREE.PlaneGeometry(64.5, 16.4), new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false }), LCD.x, TOP + 2.15, LCD.z, top, false);
    screen.rotation.x = -Math.PI / 2;
    function led(p, color) {
        mesh(new THREE.CylinderGeometry(4.2, 4.4, 1.2, 28), steel, p.x, TOP + 0.6, p.z, top);
        const mat = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.15, clearcoat: 1 });
        mesh(new THREE.SphereGeometry(2.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat, p.x, TOP + 1.1, p.z, top);
        const light = new THREE.PointLight(color, 0, 60, 2); light.position.set(p.x, TOP + 6, p.z); top.add(light);
        return { mat, light };
    }
    const ledG = led(LED_G, 0x3cff58), ledR = led(LED_R, 0xff3326);
    mesh(new THREE.CylinderGeometry(9, 9, 0.8, 32), steel, KNOB.x, TOP + 0.4, KNOB.z, top);
    mesh(new THREE.CylinderGeometry(7, 7.6, 10, 40), new THREE.MeshPhysicalMaterial({ color: 0x18191b, roughness: 0.45, metalness: 0.4, clearcoat: 0.5 }), KNOB.x, TOP + 5.6, KNOB.z, top);
    function button(p) {
        mesh(new RoundedBoxGeometry(20, 1.6, 20, 2, 1.2), steel, p.x, TOP + 0.6, p.z, top);
        return mesh(new RoundedBoxGeometry(15, 7, 15, 3, 2.6), capMat, p.x, TOP + 4.2, p.z, top);
    }
    const capY = button(BTN_Y), capN = button(BTN_N);

    // inside: Raspberry Pi + Arduino Mega, USB between them, jumper wires to the panel
    const inside = new THREE.Group(); root.add(inside);
    function board(w, d, mat, px, pz) { const g = new THREE.Group(); g.position.set(px, 10, pz); inside.add(g); mesh(box(w, 1.6, d), mat, 0, 0, 0, g); return g; }
    const pi = board(85, 56, piPcb, 52, -10);
    mesh(box(14, 1.6, 14), steel, -8, 1.6, 2, pi);
    mesh(box(17, 13.5, 21), steel, 34, 7.6, -14, pi); mesh(box(17, 15.5, 13), steel, 34, 8.6, 6, pi); mesh(box(17, 15.5, 13), steel, 34, 8.6, 20, pi);
    mesh(box(51, 8.5, 5), black, -6, 5, -24, pi);
    const mega = board(101.5, 53.4, megaPcb, -52, -10);
    mesh(box(16, 11, 12), steel, -44, 6.3, -12, mega); mesh(box(14, 1.6, 14), chip, 4, 1.6, 6, mega);
    mesh(box(70, 8.5, 2.6), black, 4, 5, -24.5, mega); mesh(box(70, 8.5, 2.6), black, 4, 5, 24.5, mega);
    tube([V(-104, 16, -22), V(-118, 26, -52), V(10, 36, -58), V(86, 26, -24)], 2.1, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }), inside, 60);
    const WIRE = [0xff4d4d, 0xffb02e, 0xfff04d, 0x4dd2ff, 0x9d6bff, 0xff6bd5, 0x7ee96f, 0xffffff, 0x7ee96f, 0xff4d4d];
    const pins = [[LCD.x - 30, LCD.z + 14], [LCD.x - 26, LCD.z + 14], [LCD.x - 18, LCD.z + 14], [LCD.x - 14, LCD.z + 14], [LCD.x - 10, LCD.z + 14], [LCD.x - 6, LCD.z + 14],
                  [BTN_Y.x, BTN_Y.z + 8], [BTN_N.x, BTN_N.z + 8], [LED_G.x, LED_G.z], [LED_R.x, LED_R.z]];
    const wires = WIRE.map(c => { const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, transparent: true })); root.add(m); return m; });
    let wireLift = -1;
    function updateWires(lift, e) {
        wires.forEach((m, i) => { m.visible = e > 0.02; m.material.opacity = clamp(e * 2); });
        if (Math.abs(lift - wireLift) < 0.3 || e <= 0.02) return;
        wireLift = lift;
        wires.forEach((m, i) => {
            const a = V(pins[i][0], TOP - 4 + lift, pins[i][1]), b = V(-52 + 4 + (i - 5) * 6.5, 18, -10 + (i < 6 ? 24.5 : -24.5));
            const mid = a.clone().lerp(b, 0.5); mid.y += 8 + i * 1.5; mid.x += (i - 5) * 2;
            m.geometry.dispose(); m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 24, 0.9, 6);
        });
    }

    // the 16x2 LCD
    let lcdKey = '';
    function drawLcd(l1, l2) {
        const k = l1 + '|' + l2; if (k === lcdKey) return; lcdKey = k;
        const c = lcdCanvas.getContext('2d'), Wc = lcdCanvas.width, Hc = lcdCanvas.height;
        const g = c.createRadialGradient(Wc / 2, Hc / 2, 20, Wc / 2, Hc / 2, Wc * 0.62);
        g.addColorStop(0, '#a9f07f'); g.addColorStop(1, '#78c95a'); c.fillStyle = g; c.fillRect(0, 0, Wc, Hc);
        const cw = 76, ch = 128, gap = 4, dot = cw / 5.6, ox = (Wc - (16 * cw + 15 * gap)) / 2, oy = (Hc - (2 * ch + 14)) / 2;
        [l1, l2].forEach((line, r) => {
            const s = (line + ' '.repeat(16)).slice(0, 16);
            for (let i = 0; i < 16; i++) {
                const glyph = F[s[i]] || F[s[i].toUpperCase()] || F[' '];
                for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 5; xx++) {
                    const lit = yy < 7 && glyph[yy * 5 + xx] === '#';
                    c.fillStyle = lit ? '#13300f' : 'rgba(40,90,30,0.13)';
                    c.fillRect(ox + i * (cw + gap) + xx * (cw / 5) + 1.5, oy + r * (ch + 14) + yy * (ch / 8) + 1.5, dot - 2, ch / 8 - 3);
                }
            }
        });
        lcdTex.needsUpdate = true;
    }
    drawLcd('NEW MEETING?', 'Tue 2:00 PM');
    const lcdGlow = new THREE.PointLight(0x9cf07e, 260, 70, 2); lcdGlow.position.set(LCD.x, TOP + 12, LCD.z); top.add(lcdGlow);

    // state: idle (green blinks while a meeting waits), accepted, declined; explode for "look inside"
    let explode = 0, explodeGoal = 0, mode = 'idle', modeAt = 0, pressY = -9, pressN = -9, clock = 0;
    const press = (t, at) => { const k = (t - at) / 0.3; return k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k); };
    S.tick = (now, dt) => {
        clock += dt;
        const t = clock;
        explode += clamp((explodeGoal - explode) * (1 - Math.pow(0.002, dt)), -1, 1);
        if (Math.abs(explodeGoal - explode) < 0.001) explode = explodeGoal;
        const e = eio(explode);
        shell.position.y = e * 120; shellMat.opacity = lerp(1, 0.13, e); shellMat.depthWrite = e < 0.5;
        top.position.y = e * 62; plate.position.y = -e * 34; inside.position.y = e * 4;
        updateWires(e * 62, e);
        capY.position.y = TOP + 4.2 - 2.2 * press(t, pressY);
        capN.position.y = TOP + 4.2 - 2.2 * press(t, pressN);
        if (mode !== 'idle' && t - modeAt > 3.2) { mode = 'idle'; api.onState && api.onState(mode); }
        let g = 0, r = 0;
        if (mode === 'idle') { g = REDUCED ? 1 : clamp(Math.cos(2 * Math.PI * t) * 2.2 + 0.5); drawLcd('NEW MEETING?', 'Tue 2:00 PM'); }
        else if (mode === 'yes') { g = 1; drawLcd('ACCEPTED', 'ADDED TO CAL'); }
        else { r = 1; drawLcd('DECLINED', 'ASKED NEW TIME'); }
        ledG.mat.emissiveIntensity = g * 6; ledG.light.intensity = g * 900;
        ledR.mat.emissiveIntensity = r * 6; ledR.light.intensity = r * 900;
        return true;   // the LED blinks, so keep drawing while visible
    };
    function answer(yes) {
        if (yes) pressY = clock; else pressN = clock;
        mode = yes ? 'yes' : 'no'; modeAt = clock; S.wake();
        api.onState && api.onState(mode);
    }
    S.onTap = e => {
        const hit = S.raycast(e, [capY, capN]);
        if (hit) answer(hit.object === capY);
    };
    const api = {
        kind: 'cyberdeck',
        setExplode(on) { if ((explodeGoal === 1) !== on) S.zoom(on ? 1.25 : 0.8); explodeGoal = on ? 1 : 0; S.wake(); },
        answer, reset: S.reset, zoom: S.zoom, setVisible: S.setVisible, onState: null,
        snapshot() { S.tick(0, 0); S.renderNow(); return S.canvas.toDataURL('image/jpeg', 0.88); },
    };
    return api;
}

/* ================= HydroCart =================
   A rolling rack with a fixed central PVC tower: three stacked planters (six plants), a tote reservoir
   with a pump underneath, grow lights on both sides, and the Raspberry Pi + Arduino Mega up top. cm units. */
function hydrocart(el) {
    const S = stage(el, {
        target: V(0, 88, 0), theta: -0.6, phi: 1.3, radius: 370, rMin: 200, rMax: 760, fov: 30, aspectFit: 0.62,
        keyPos: V(-200, 380, 240), shadowBox: { left: -260, right: 260, top: 280, bottom: -160, near: 50, far: 1200 },
        phiMin: 0.35, phiMax: 1.52, exposure: 1.0,
    });
    const root = new THREE.Group(); S.scene.add(root);
    const white = new THREE.MeshPhysicalMaterial({ color: 0xeef1ee, roughness: 0.35, metalness: 0.05, clearcoat: 0.35 });
    const pvc = new THREE.MeshPhysicalMaterial({ color: 0xf6f7f4, roughness: 0.45, clearcoat: 0.2 });
    const potMat = new THREE.MeshPhysicalMaterial({ color: 0xf3f4f1, roughness: 0.5, side: THREE.DoubleSide });
    const black = new THREE.MeshStandardMaterial({ color: 0x141515, roughness: 0.6, metalness: 0.2 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.3, metalness: 0.9 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.9 });
    const toteMat = new THREE.MeshPhysicalMaterial({ color: 0x9fd2f2, roughness: 0.15, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x2c8fe0, roughness: 0.1, transparent: true, opacity: 0.5, depthWrite: false });
    const clear = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const leafA = new THREE.MeshStandardMaterial({ color: 0x58b947, roughness: 0.6 });
    const leafB = new THREE.MeshStandardMaterial({ color: 0x7ed35e, roughness: 0.6 });
    const piPcb = new THREE.MeshStandardMaterial({ color: 0x1d6b3a, roughness: 0.55 });
    const megaPcb = new THREE.MeshStandardMaterial({ color: 0x1b5ea6, roughness: 0.55 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff7a2f, roughness: 0.5 });

    const X = 24, Z = 19, TOPY = 166;
    // casters
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        mesh(new THREE.CylinderGeometry(3.8, 3.8, 2.6, 24).rotateZ(Math.PI / 2), rubber, sx * X, 3.8, sz * Z, root);
        mesh(box(4.2, 5, 2), steel, sx * X, 6.5, sz * Z, root);
        mesh(new THREE.CylinderGeometry(2.6, 2.6, 1, 20), steel, sx * X, 9.4, sz * Z, root);
    }
    // frame: four posts, top and bottom rectangles, and the many side runners
    const post = r => new THREE.CylinderGeometry(r, r, TOPY - 10, 16);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(post(1.25), white, sx * X, 10 + (TOPY - 10) / 2, sz * Z, root);
    for (const y of [10.5, TOPY]) {
        for (const sz of [-1, 1]) mesh(new THREE.CylinderGeometry(1.2, 1.2, X * 2, 14).rotateZ(Math.PI / 2), white, 0, y, sz * Z, root);
        for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(1.2, 1.2, Z * 2, 14).rotateX(Math.PI / 2), white, sx * X, y, 0, root);
    }
    for (let y = 26; y <= 156; y += 10) for (const sx of [-1, 1])
        mesh(new THREE.CylinderGeometry(0.6, 0.6, Z * 2, 10).rotateX(Math.PI / 2), white, sx * (X - 1.4), y, 0, root);

    // shelves
    const shelf = y => mesh(box(X * 2 - 2, 1.2, Z * 2 - 2), white, 0, y, 0, root);
    shelf(11.5); shelf(50); shelf(150);

    // reservoir: tote, water, pump, and the sensor probes
    mesh(new RoundedBoxGeometry(42, 30, 32, 3, 2), toteMat, 0, 12.1 + 15, 0, root, false);
    const water = mesh(box(40.5, 21, 30.5), waterMat, 0, 12.6 + 10.5, 0, root, false);
    mesh(box(7, 6.5, 6), black, -10, 16, -4, root);                      // pump
    mesh(new THREE.CylinderGeometry(1.1, 1.1, 22, 12), steel, 13, 22, -9, root);     // heater
    mesh(box(8.5, 8.5, 1.6), black, 7, 27, 16.4, root);                  // the box on the front of the tote
    // centre PVC column, from the tote up through the tower
    mesh(new THREE.CylinderGeometry(1.7, 1.7, 98, 20), pvc, 0, 13 + 49, 0, root);
    tube([V(-10, 19, -4), V(-6, 22, -2), V(-1, 20, 0), V(0, 14, 0)], 0.6, new THREE.MeshStandardMaterial({ color: 0xdfe9ec, roughness: 0.2, transparent: true, opacity: 0.8 }), root, 20);

    // the tower: three stacked planters, two pockets each (six plants), offset by 90 degrees
    const plants = [];
    for (let i = 0; i < 3; i++) {
        const y0 = 51 + i * 20;
        mesh(new THREE.CylinderGeometry(10, 7.2, 20, 36, 1, true), potMat, 0, y0 + 10, 0, root);
        mesh(new THREE.TorusGeometry(10, 0.8, 10, 40).rotateX(Math.PI / 2), potMat, 0, y0 + 20, 0, root);
        mesh(new THREE.CircleGeometry(7.2, 30).rotateX(Math.PI / 2), potMat, 0, y0 + 0.2, 0, root);
        for (let j = 0; j < 2; j++) {
            const a = i * Math.PI / 2 + j * Math.PI + 0.6;
            const g = new THREE.Group(); g.position.set(Math.sin(a) * 9.4, y0 + 11, Math.cos(a) * 9.4); g.rotation.y = a; root.add(g);
            const pocket = mesh(new THREE.CylinderGeometry(3.6, 2.8, 8, 22, 1, true), potMat, 0, 0, 1.5, g);
            pocket.rotation.x = 0.75;
            // a lettuce head: leaves fanning up and out of the pocket
            const plant = new THREE.Group(); plant.position.set(0, 3, 4.2); g.add(plant); plants.push(plant);
            for (let k = 0; k < 9; k++) {
                const b = k / 9 * Math.PI * 2, lean = 0.55 + (k % 3) * 0.18;
                const leaf = mesh(new THREE.SphereGeometry(1, 14, 10), k % 2 ? leafA : leafB, 0, 0, 0, plant);
                leaf.scale.set(3.4, 0.6, 7.2 - (k % 3) * 1.1);
                leaf.rotation.set(-lean, b, 0, 'YXZ');
                leaf.position.set(Math.sin(b) * 4, 2.5 + (k % 3) * 1.4, Math.cos(b) * 4);
            }
        }
    }
    mesh(new THREE.SphereGeometry(5.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), potMat, 0, 111, 0, root);   // top cap

    // grow lights on both sides
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf3efff, emissiveIntensity: 2.2, roughness: 0.4 });
    const lamps = [];
    for (const sx of [-1, 1]) {
        mesh(box(1.6, 96, 4.4), black, sx * (X - 3.2), 100, 0, root);
        const bar = mesh(box(0.4, 92, 3.2), lightMat, sx * (X - 4.1), 100, 0, root, false);
        const pl = new THREE.PointLight(0xf4eeff, 0, 90, 1.6); pl.position.set(sx * (X - 7), 92, 0); root.add(pl);
        lamps.push({ bar, pl });
    }

    // top: electronics box (Raspberry Pi 4 + Arduino Mega) and the backup tank
    mesh(new RoundedBoxGeometry(22, 10, 26, 2, 1.5), clear, -11, 151 + 5, 0, root, false);
    mesh(box(8.5, 0.3, 5.6), piPcb, -14, 152.5, -6, root); mesh(box(1.7, 1.4, 2.1), steel, -10.4, 153.3, -6, root);
    mesh(box(10.2, 0.3, 5.3), megaPcb, -12, 152.5, 5, root); mesh(box(1.6, 1.1, 1.2), steel, -16.5, 153.2, 5, root);
    for (const [px, pz] of [[-20, -11], [-3, -11], [-20, 11], [-3, 11]]) mesh(box(2.2, 2.2, 2.2), orange, px, 152.2, pz, root);
    mesh(new RoundedBoxGeometry(18, 12, 26, 2, 1.5), toteMat, 12, 151 + 6, 0, root, false);
    mesh(box(16.5, 8, 24.5), waterMat, 12, 151.6 + 4, 0, root, false);
    // sensor cables: pH, TDS and temperature probes run down the back post into the tote
    [[0x111111, -2], [0x2b62c9, 0], [0xd23b3b, 2]].forEach(([c, o]) => tube(
        [V(-12 + o, 152, -12), V(-18 + o, 150, -17.5), V(-21 + o * 0.3, 120, -17.6), V(-21 + o * 0.3, 52, -17.6), V(-14 + o, 40, -12), V(-12 + o * 2, 30, -10)],
        0.35, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), root, 70));
    for (const o of [-2, 0, 2]) mesh(new THREE.CylinderGeometry(0.7, 0.7, 9, 10), steel, -12 + o * 2, 26, -10, root);

    // water: droplets trickle down the outside of the tower and back into the tote
    const dropMat = new THREE.MeshStandardMaterial({ color: 0x7cc8ff, emissive: 0x2a7fd0, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.9 });
    const drops = [];
    for (let i = 0; i < 26; i++) {
        const d = mesh(new THREE.SphereGeometry(0.55, 8, 6), dropMat, 0, 0, 0, root, false);
        drops.push({ d, a: i * 2.39996, ph: (i * 0.137) % 1 });
    }
    const radiusAt = y => { const k = ((y - 51) % 20 + 20) % 20 / 20; return lerp(7.4, 10.2, k); };

    let lights = 1, lightsGoal = 1, flow = true, clock = 0;
    S.tick = (now, dt) => {
        clock += dt;
        lights += (lightsGoal - lights) * (1 - Math.pow(0.004, dt));
        lightMat.emissiveIntensity = 2.2 * lights; lamps.forEach(L => { L.pl.intensity = 1600 * lights; });
        const moving = flow && !REDUCED;
        drops.forEach(o => {
            o.d.visible = flow;
            if (!flow) return;
            const p = (o.ph + (REDUCED ? 0 : clock * 0.18)) % 1;
            if (p < 0.8) {   // down the tower, 112 -> 51
                const y = lerp(112, 51, p / 0.8), r = radiusAt(y) + 0.6;
                o.d.position.set(Math.sin(o.a) * r, y, Math.cos(o.a) * r);
            } else {         // through the shelf, back into the water
                const y = lerp(49, 33.6, (p - 0.8) / 0.2);
                o.d.position.set(Math.sin(o.a) * 3, y, Math.cos(o.a) * 3);
            }
        });
        water.position.y = 12.6 + 10.5 + (moving ? Math.sin(clock * 1.3) * 0.15 : 0);
        return moving || Math.abs(lightsGoal - lights) > 0.002;
    };
    return {
        kind: 'hydrocart',
        setLights(on) { lightsGoal = on ? 1 : 0; S.wake(); },
        setFlow(on) { flow = on; S.wake(); },
        reset: S.reset, zoom: S.zoom, setVisible: S.setVisible,
        snapshot() { S.tick(0, 0); S.renderNow(); return S.canvas.toDataURL('image/jpeg', 0.88); },
    };
}

export function mount(el, kind) {
    return kind === 'hydrocart' ? hydrocart(el) : cyberdeck(el);
}
