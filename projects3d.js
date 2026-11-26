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
        const dt = clamp((now - last) / 1000, 0, 0.05); last = Math.max(last, now);   // a frame's timestamp can predate wake()
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

/* ================= Family Plant Monitor =================
   Five houseplants on a shelf, each with a capacitive moisture probe and a DHT sensor wired to an Arduino Mega.
   When a pot runs dry, the Mega clicks a relay, a 12V pump in the bucket under the shelf pushes water up a
   vinyl tube into a 1/2-inch PVC line, and a capped elbow over every pot drips into the soil. cm units.
   plantRig() builds the scene (shared with the promo video); frame(t, windows) animates the pump runs. */
const PLANT_X = [-48, -24, 0, 24, 48];
const PLANT_TEMP = [72, 71, 72, 73, 72], PLANT_HUM = [46, 48, 45, 47, 44];
export function plantRig(opts = {}) {
    const root = new THREE.Group();
    const SH = 50, LINE_Y = 92, LINE_Z = -13, DRIP_Z = -5.5, PR = 1.07, FR = 1.45;
    const SOIL_Y = SH + 13.4, CAP_Y = 86.2;
    const wood = new THREE.MeshStandardMaterial({ color: 0xb88a5c, roughness: 0.72 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x8f6843, roughness: 0.75 });
    const pvc = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f2, roughness: 0.42, clearcoat: 0.25 });
    const black = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.6, metalness: 0.15 });
    const pcbBlack = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.45, metalness: 0.2 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xbfc4c8, roughness: 0.3, metalness: 0.9 });
    const megaPcb = new THREE.MeshStandardMaterial({ color: 0x1b5ea6, roughness: 0.55 });
    const relayBlue = new THREE.MeshStandardMaterial({ color: 0x2466d6, roughness: 0.4 });
    const termGreen = new THREE.MeshStandardMaterial({ color: 0x2f9e4c, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 });
    const clear = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
    const bucketMat = new THREE.MeshPhysicalMaterial({ color: 0xeef3f6, roughness: 0.35, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
    const lidMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f5f7, roughness: 0.4, transparent: true, opacity: 0.75 });
    const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x2c8fe0, roughness: 0.1, transparent: true, opacity: 0.5, depthWrite: false });
    const vinylMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f4f8, roughness: 0.15, transparent: true, opacity: 0.32, depthWrite: false });
    const flowMat = new THREE.MeshStandardMaterial({ color: 0x55b4ff, emissive: 0x1f7fd8, emissiveIntensity: 0.5, roughness: 0.2 });
    const cable = new THREE.MeshStandardMaterial({ color: 0x1c1d1e, roughness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.5 });
    const stem = new THREE.MeshStandardMaterial({ color: 0x4f7f3a, roughness: 0.7 });
    const leafMats = [0x3f8f3a, 0x5fae4a, 0x2f5a2c, 0x4d7a3a, 0x5f9a52, 0x2f7a3a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide }));
    const LEAF = new THREE.SphereGeometry(1, 14, 10);
    const cyl = (r, len, axis) => {
        const g = new THREE.CylinderGeometry(r, r, len, 20);
        if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
        return g;
    };

    // the shelf: top board, four legs, stretchers
    mesh(box(150, 3, 38), wood, 13, SH - 1.5, 0, root);
    for (const lx of [-59, 85]) for (const lz of [-16.5, 16.5]) mesh(box(4, SH - 3, 4), woodDark, lx, (SH - 3) / 2, lz, root);
    mesh(box(144, 4, 2), woodDark, 13, 12, -16.5, root);
    for (const lx of [-59, 85]) mesh(box(2, 4, 29), woodDark, lx, 12, 0, root);

    // pots, soil and five different houseplants
    const potColors = [0xf1efe9, 0xc0683f, 0x9cb59a, 0x3a3d40, 0xe8dfcf];
    const soils = [];
    function leaf(parent, mat, px, py, pz, sx, sy, sz, rx, ry, rz = 0) {
        const m = mesh(LEAF, mat, px, py, pz, parent); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz, 'YXZ'); return m;
    }
    function stalk(parent, a, b, r = 0.22) { tube([a, a.clone().lerp(b, 0.5).add(V(0, 1.2, 0)), b], r, stem, parent, 10); }
    const plants = [
        g => {   // pothos: a few leaves up top, vines trailing over the rim
            for (let k = 0; k < 6; k++) { const a = k * 1.05; leaf(g, leafMats[k % 2], Math.sin(a) * 2.5, 4 + (k % 3) * 1.6, Math.cos(a) * 2.5, 2.3, 0.3, 2.0, -0.7, a); }
            for (let v = 0; v < 4; v++) {
                const a = v * 1.57 + 0.4, pts = [];
                for (let s = 0; s <= 6; s++) { const k = s / 6, r = 2 + k * 9.5; pts.push(V(Math.sin(a) * r, 2.5 + Math.sin(Math.PI * k * 0.7) * 3 - k * k * 9, Math.cos(a) * r)); }
                tube(pts, 0.18, stem, g, 20);
                pts.slice(1).forEach((p, s) => leaf(g, leafMats[(s + v) % 2], p.x, p.y + 0.4, p.z, 1.9 - s * 0.12, 0.28, 1.6 - s * 0.1, -0.3, a + (s % 2 ? 0.7 : -0.7)));
            }
        },
        g => {   // snake plant: tall upright blades
            for (let k = 0; k < 8; k++) { const a = k * 0.8, r = 1 + (k % 3); leaf(g, leafMats[2 + (k % 2)], Math.sin(a) * r, 9 + (k % 3) * 1.5, Math.cos(a) * r, 1.4, 10 + (k % 3) * 1.6, 0.32, (k % 2 ? 0.1 : -0.08), a); }
        },
        g => {   // peace lily: arching leaves and two white flowers
            for (let k = 0; k < 11; k++) {
                const a = k * 0.57, r = 3.6 + (k % 2) * 1.6;
                stalk(g, V(0, 0, 0), V(Math.sin(a) * r * 0.6, 6 + (k % 3), Math.cos(a) * r * 0.6));
                leaf(g, leafMats[k % 2 ? 0 : 5], Math.sin(a) * r, 8 + (k % 3) * 1.2, Math.cos(a) * r, 1.9, 0.28, 5.2, -0.75, a);
            }
            const flowerMat = new THREE.MeshStandardMaterial({ color: 0xfbfbf6, roughness: 0.5, side: THREE.DoubleSide });
            for (const [fx, fz, fy] of [[1.5, -1, 17], [-2, 1.5, 15]]) {
                stalk(g, V(0, 0, 0), V(fx, fy - 2, fz), 0.18);
                leaf(g, flowerMat, fx, fy, fz, 1.2, 2.6, 0.45, -0.2, 0.4);
                leaf(g, new THREE.MeshStandardMaterial({ color: 0xe9e2a8 }), fx, fy - 0.2, fz + 0.4, 0.3, 1.4, 0.3, 0, 0);
            }
        },
        g => {   // monstera: big round leaves on long stems
            for (let k = 0; k < 6; k++) {
                const a = k * 1.05 + 0.3, r = 5 + (k % 2) * 1.5, h = 10 + (k % 3) * 3;
                stalk(g, V(0, 0, 0), V(Math.sin(a) * r, h, Math.cos(a) * r), 0.26);
                leaf(g, leafMats[k % 2 ? 0 : 2], Math.sin(a) * r, h + 0.3, Math.cos(a) * r, 4.4, 0.3, 3.8, -0.45, a);
            }
        },
        g => {   // jade: a short trunk and clusters of thick leaves
            const trunk = new THREE.MeshStandardMaterial({ color: 0x6d5a3e, roughness: 0.8 });
            mesh(new THREE.CylinderGeometry(0.7, 1, 6, 10), trunk, 0, 3, 0, g);
            for (const [bx, bz] of [[3, 1], [-2.5, 2], [0.5, -3]]) {
                tube([V(0, 4, 0), V(bx * 0.6, 6, bz * 0.6), V(bx, 7.5, bz)], 0.45, trunk, g, 8);
                for (let k = 0; k < 7; k++) { const a = k * 0.9; leaf(g, leafMats[4], bx + Math.sin(a) * 1.6, 8 + (k % 3) * 0.7, bz + Math.cos(a) * 1.6, 1.0, 0.55, 1.5, -0.6, a); }
            }
        },
    ];
    PLANT_X.forEach((px, i) => {
        const g = new THREE.Group(); g.position.set(px, SH, 0); root.add(g);
        const potMat = new THREE.MeshPhysicalMaterial({ color: potColors[i], roughness: 0.55, clearcoat: 0.15, side: THREE.DoubleSide });
        mesh(new THREE.CylinderGeometry(8.2, 7.4, 1, 36), potMat, 0, 0.5, 0, g);
        mesh(new THREE.CylinderGeometry(8.6, 6.6, 14, 40, 1, true), potMat, 0, 8, 0, g);
        mesh(new THREE.TorusGeometry(8.6, 0.6, 10, 40).rotateX(Math.PI / 2), potMat, 0, 15, 0, g);
        mesh(new THREE.CircleGeometry(6.6, 30).rotateX(-Math.PI / 2), potMat, 0, 1.05, 0, g);
        const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.95 });
        mesh(new THREE.CylinderGeometry(8.1, 8.1, 0.8, 36), soilMat, 0, 13, 0, g);
        soils.push(soilMat);
        const p = new THREE.Group(); p.position.set(0, 13.4, 0); g.add(p); plants[i](p);
    });

    // sensors: a capacitive moisture probe in each pot (opposite the drip), a DHT on a stake beside it
    const harnessZ = -15.5;
    PLANT_X.forEach(px => {
        const x0 = px + 3.5, z0 = 4.8;
        mesh(box(2.3, 9.8, 0.16), pcbBlack, x0, SOIL_Y + 3 - 4.9, z0, root);
        mesh(box(2.32, 0.14, 0.18), white, x0, SOIL_Y + 0.1, z0, root);                 // buried to the white line
        mesh(box(1.2, 0.3, 0.12), black, x0, SOIL_Y + 1.8, z0 + 0.12, root);
        mesh(box(2.5, 1.2, 0.36), black, x0, SOIL_Y + 2.5, z0, root);                   // heat-shrink seal
        mesh(box(1.0, 0.6, 0.5), white, x0, SOIL_Y + 3.3, z0, root);                    // JST plug
        tube([V(x0, SOIL_Y + 3.6, z0), V(x0, SOIL_Y + 6.5, z0 - 3), V(x0 - 1, SOIL_Y + 5, -9.6), V(x0 - 1, SH + 0.7, harnessZ)], 0.22, cable, root, 24);
        const dx = px + 12, dz = 10;
        mesh(box(0.5, 4.2, 0.5), black, dx, SH + 2.1, dz, root);
        mesh(box(1.55, 2.5, 0.78), white, dx, SH + 5.4, dz, root);
        for (let r = 0; r < 4; r++) mesh(box(1.1, 0.16, 0.06), new THREE.MeshStandardMaterial({ color: 0x9aa09c }), dx, SH + 6.2 - r * 0.45, dz + 0.4, root, false);
        tube([V(dx, SH + 4.1, dz - 0.3), V(dx, SH + 0.6, dz - 4), V(dx, SH + 0.6, harnessZ)], 0.18, cable, root, 12);
    });
    tube([V(-56, SH + 0.8, harnessZ), V(10, SH + 0.8, harnessZ), V(60, SH + 0.8, harnessZ), V(66, SH + 1.4, -9)], 0.7, cable, root, 40);

    // electronics: Arduino Mega, relay module and the 12V supply, high on the shelf and far from the bucket
    const EX = 74;
    mesh(box(18, 0.5, 22), black, EX, SH + 0.25, 1, root);
    mesh(new RoundedBoxGeometry(18, 6, 22, 2, 1.2), clear, EX, SH + 3.4, 1, root, false);
    const mega = new THREE.Group(); mega.position.set(EX - 4, SH + 1.4, 1); root.add(mega);
    mesh(box(5.3, 0.16, 10.2), megaPcb, 0, 0, 0, mega);
    mesh(box(1.6, 1.1, 1.2), steel, -1.2, 0.6, -4.7, mega); mesh(box(0.9, 1.1, 0.9), black, 1.6, 0.6, -4.6, mega);
    mesh(box(0.7, 0.16, 0.7), black, 0.3, 0.16, 0.6, mega);
    for (const sx of [-1, 1]) mesh(box(0.25, 0.85, 7.4), black, sx * 2.45, 0.5, 0.8, mega);
    const relay = new THREE.Group(); relay.position.set(EX + 4.6, SH + 1.4, 2); root.add(relay);
    mesh(box(2.6, 0.16, 5), relayBlue.clone(), 0, 0, 0, relay).material.color.set(0x1d4f9e);
    const relayCube = mesh(box(1.55, 1.5, 1.9), relayBlue, 0, 0.83, -0.4, relay);
    mesh(box(1.6, 1.0, 1.1), termGreen, 0, 0.58, 1.9, relay);
    const relayLedMat = new THREE.MeshStandardMaterial({ color: 0xff3a2e, emissive: 0xff2a1e, emissiveIntensity: 0, roughness: 0.3 });
    mesh(new THREE.SphereGeometry(0.2, 10, 8), relayLedMat, -0.8, 0.2, -2.1, relay);
    const relayLight = new THREE.PointLight(0xff3a2e, 0, 14, 2); relayLight.position.set(EX + 3.8, SH + 3, -0.2); root.add(relayLight);
    ['#ff4d4d', '#1c1d1e', '#ffb02e'].forEach((c, i) => tube([V(EX - 2, SH + 2, -1 + i * 0.6), V(EX + 1, SH + 3.4, -1 + i * 0.6), V(EX + 3.6, SH + 1.8, -0.4 + i * 0.4)], 0.14, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), root, 12));
    const psu = mesh(new RoundedBoxGeometry(5, 3.4, 8, 2, 0.6), black, EX, SH + 1.7, -14.5, root);
    mesh(box(1.4, 1.0, 1.6), termGreen, EX + 1.5, SH + 0.8, -9.8, root);
    tube([V(EX, SH + 1.4, -18.5), V(EX, SH - 2, -21), V(EX + 2, 2, -23)], 0.3, cable, root, 16);

    // the pump circuit: relay to the pump in the bucket (red and black), along the back and down the leg
    const pumpRun = o => [V(EX + 5, SH + 1.6, 4.6), V(EX + 5, SH + 0.8, -10), V(60, SH + 0.6, -18 - o), V(-50, SH + 0.6, -18 - o), V(-57.5, SH - 6, -18.5 - o),
        V(-55, 32, -14), V(-44, 40, -5 - o), V(-40 + o, 38.4, -2)];
    tube(pumpRun(0), 0.28, red, root, 70); tube(pumpRun(0.7), 0.28, cable, root, 70);

    // the tank: a 5-gallon bucket on the floor under the shelf, with the pump at the bottom
    const BX = -36, BZ = 1;
    mesh(new THREE.CylinderGeometry(15.5, 13.8, 36, 48, 1, true), bucketMat, BX, 18, BZ, root, false);
    mesh(new THREE.TorusGeometry(15.6, 0.5, 8, 48).rotateX(Math.PI / 2), lidMat, BX, 36, BZ, root);
    mesh(new THREE.CircleGeometry(13.8, 40).rotateX(-Math.PI / 2), bucketMat, BX, 0.2, BZ, root, false);
    mesh(new THREE.CylinderGeometry(16.3, 16.3, 1.4, 48), lidMat, BX, 37.1, BZ, root);
    const water = mesh(new THREE.CylinderGeometry(15.0, 13.9, 26, 44), waterMat, BX, 13.4, BZ, root, false);
    mesh(new THREE.TorusGeometry(15.9, 0.22, 6, 40, Math.PI), steel, BX, 30, BZ, root).rotation.set(0.25, 0, 0);
    const pump = new THREE.Group(); pump.position.set(BX, 0.4, BZ); root.add(pump);
    mesh(new RoundedBoxGeometry(7, 5.5, 6, 2, 0.8), black, 0, 2.75, 0, pump);
    for (let r = 0; r < 4; r++) mesh(box(5, 0.35, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a3c3e }), 0, 1.2 + r * 0.9, 3.02, pump, false);
    mesh(new THREE.CylinderGeometry(0.9, 0.9, 3, 14), black, 0, 7, 0, pump);
    const vinylPts = [V(BX, 8.4, BZ), V(BX, 28, BZ), V(BX - 1, 40, BZ - 4), V(-40, 44, -20.5), V(-48, 56, -21.5), V(-57, 78, -20), V(-63, 89, -15.5), V(-67.5, LINE_Y, LINE_Z)];
    const vCurve = new THREE.CatmullRomCurve3(vinylPts);
    const vinyl = new THREE.Mesh(new THREE.TubeGeometry(vCurve, 120, 1.05, 12), vinylMat); root.add(vinyl);
    const flow = new THREE.Mesh(new THREE.TubeGeometry(vCurve, 120, 0.72, 10), flowMat); root.add(flow);
    const flowCount = flow.geometry.index.count; flow.geometry.setDrawRange(0, 0);

    // the PVC line: barb adapter, main run along the back, tees for pots 1-4, an end elbow for pot 5,
    // and a drip elbow + drilled cap over every pot
    mesh(cyl(PR, 110, 'x'), pvc, -7, LINE_Y, LINE_Z, root);
    mesh(cyl(FR, 3, 'x'), pvc, -63.5, LINE_Y, LINE_Z, root);
    mesh(cyl(0.85, 2.6, 'x'), black, -66.2, LINE_Y, LINE_Z, root);
    const sphere = new THREE.SphereGeometry(FR, 18, 12);
    PLANT_X.forEach((px, i) => {
        if (i < 4) {
            mesh(cyl(FR, 4.6, 'x'), pvc, px, LINE_Y, LINE_Z, root);
            mesh(cyl(FR, 2.6, 'z'), pvc, px, LINE_Y, LINE_Z + 1.3 + 1, root);
        } else {   // the end elbow turns the main line toward pot 5
            mesh(sphere, pvc, px, LINE_Y, LINE_Z, root);
            mesh(cyl(FR, 2.4, 'x'), pvc, px - 1.2, LINE_Y, LINE_Z, root);
            mesh(cyl(FR, 2.4, 'z'), pvc, px, LINE_Y, LINE_Z + 1.2, root);
        }
        mesh(cyl(PR, 4, 'z'), pvc, px, LINE_Y, (LINE_Z + 2.4 + DRIP_Z - 2.4) / 2 + 0.2, root);
        mesh(sphere, pvc, px, LINE_Y, DRIP_Z, root);
        mesh(cyl(FR, 2.4, 'z'), pvc, px, LINE_Y, DRIP_Z - 1.2, root);
        mesh(cyl(FR, 2.4), pvc, px, LINE_Y - 1.2, DRIP_Z, root);
        mesh(cyl(PR, 2), pvc, px, LINE_Y - 3, DRIP_Z, root);
        mesh(new THREE.CylinderGeometry(1.55, 1.55, 2.2, 20), pvc, px, CAP_Y + 1.4, DRIP_Z, root);
        mesh(new THREE.SphereGeometry(1.55, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), pvc, px, CAP_Y + 0.3, DRIP_Z, root);
        mesh(new THREE.CircleGeometry(0.22, 12).rotateX(Math.PI / 2), black, px, CAP_Y - 1.26, DRIP_Z, root, false);
    });
    for (const sx of [-56, -12, 36]) {   // wooden posts hold the line up
        mesh(box(1.8, LINE_Y - SH - 1.2, 1.8), woodDark, sx, SH + (LINE_Y - SH - 1.2) / 2, LINE_Z, root);
        mesh(new THREE.TorusGeometry(1.3, 0.25, 6, 16, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2), steel, sx, LINE_Y, LINE_Z, root);
    }

    // drips and splashes
    const dropMat = new THREE.MeshStandardMaterial({ color: 0x8fd0ff, emissive: 0x2a7fd0, emissiveIntensity: 0.7, roughness: 0.1, transparent: true, opacity: 0.95 });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.7, depthWrite: false });
    const drops = PLANT_X.map(px => {
        const d = [];
        for (let k = 0; k < 3; k++) { const m = mesh(new THREE.SphereGeometry(0.55, 10, 8), dropMat, px, 0, DRIP_Z, root, false); m.scale.set(1, 1.5, 1); m.visible = false; d.push(m); }
        const ring = mesh(new THREE.TorusGeometry(1, 0.09, 6, 24).rotateX(Math.PI / 2), ringMat.clone(), px, SOIL_Y + 0.15, DRIP_Z, root, false); ring.visible = false;
        return { d, ring };
    });

    // floating readings above each plant (the status page, in 3D)
    const badges = [], badgeGroup = new THREE.Group(); root.add(badgeGroup);
    if (opts.badges) PLANT_X.forEach((px, i) => {
        const cv = document.createElement('canvas'); cv.width = 380; cv.height = 176;
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        sp.scale.set(21.6, 10, 1); sp.position.set(px, 110, 0); badgeGroup.add(sp);
        badges.push({ cv, tex, key: '' });
    });
    function drawBadge(i, pct) {
        const b = badges[i]; if (!b) return;
        const need = pct < 35, key = pct + '';
        if (b.key === key) return; b.key = key;
        const c = b.cv.getContext('2d'), w = b.cv.width, h = b.cv.height;
        c.clearRect(0, 0, w, h);
        c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 26); c.fillStyle = 'rgba(8,12,8,0.9)'; c.fill();
        c.lineWidth = 4; c.strokeStyle = need ? 'rgba(255,176,46,0.9)' : 'rgba(126,233,111,0.6)'; c.stroke();
        c.textBaseline = 'middle';
        c.fillStyle = '#c8d2c9'; c.font = `600 30px ${FONT}`; c.textAlign = 'left'; c.fillText('Plant ' + (i + 1), 28, 44);
        c.fillStyle = need ? '#ffb02e' : '#7ee96f'; c.font = `800 52px ${FONT}`; c.textAlign = 'right'; c.fillText(pct + '%', w - 28, 46);
        c.fillStyle = '#9aa69c'; c.font = `500 25px ${FONT}`; c.textAlign = 'left'; c.fillText(`${PLANT_TEMP[i]}°F · ${PLANT_HUM[i]}% humidity`, 28, 92);
        const label = need ? 'Needs Water' : 'Healthy';
        c.font = `800 26px ${FONT}`; const lw = c.measureText(label).width + 40;
        c.beginPath(); c.roundRect(28, 116, lw, 40, 20); c.fillStyle = need ? '#ffb02e' : '#7ee96f'; c.fill();
        c.fillStyle = '#071007'; c.fillText(label, 48, 137);
        b.tex.needsUpdate = true;
    }

    const DRY = new THREE.Color(0x8a6a4c), WET = new THREE.Color(0x2c2017);
    function setMoisture(m) {
        m.forEach((v, i) => {
            soils[i].color.copy(DRY).lerp(WET, clamp((v - 0.22) / 0.45));
            drawBadge(i, Math.round(v * 100));
        });
    }
    // pump runs as [start, stop] windows (seconds on the same clock as t)
    const FILL = 0.7, DRAIN = 1.3, PERIOD = opts.dripPeriod || 0.36, FALL = 0.5;
    function frame(t, windows) {
        let fill = 0, on = false;
        for (const [a, b] of windows) {
            if (t >= a && t < b) on = true;
            const f = t < a ? 0 : t < a + FILL ? (t - a) / FILL : t < b ? 1 : 1 - (t - b) / DRAIN;
            fill = Math.max(fill, clamp(f));
        }
        flow.geometry.setDrawRange(0, Math.floor(flowCount * fill / 3) * 3);
        flow.visible = fill > 0.002;
        relayLedMat.emissiveIntensity = on ? 5 : 0; relayLight.intensity = on ? 40 : 0;
        relayCube.position.y = 0.83 + (on ? 0.03 : 0);
        pump.position.x = BX + (on && !REDUCED ? Math.sin(t * 90) * 0.06 : 0);
        water.position.y = 13.4 + (on && !REDUCED ? Math.sin(t * 23) * 0.06 : 0);
        let dripping = false;
        drops.forEach((P, c) => {
            let used = 0, splash = -1;
            const off = c * 0.071;
            for (let n = Math.floor((t - FALL - 0.3 - off) / PERIOD); n <= Math.floor((t - off) / PERIOD); n++) {
                const ts = n * PERIOD + off, age = t - ts;
                if (age < 0) continue;
                if (!windows.some(([a, b]) => ts >= a + FILL + 0.1 && ts <= b + 0.15)) continue;
                dripping = true;
                if (age < FALL && used < P.d.length) {
                    const m = P.d[used++], k = age / FALL;
                    m.visible = true; m.position.y = lerp(CAP_Y - 1.4, SOIL_Y + 0.4, k * k);
                } else if (age >= FALL && age < FALL + 0.3) splash = Math.max(splash, (age - FALL) / 0.3);
            }
            for (let k = used; k < P.d.length; k++) P.d[k].visible = false;
            P.ring.visible = splash >= 0;
            if (splash >= 0) { const s = lerp(0.4, 2.6, splash); P.ring.scale.set(s, 1, s); P.ring.material.opacity = 0.75 * (1 - splash); }
        });
        return on || fill > 0 || dripping;
    }
    setMoisture([0.6, 0.6, 0.6, 0.6, 0.6]);
    return {
        root, setMoisture, frame, badgeGroup, SH, SOIL_Y, LINE_Y, CAP_Y, DRIP_Z,
        parts: { mega, relay, relayCube, psu, pump, vinyl, water, bucketX: BX, bucketZ: BZ, EX, soils },
    };
}

function plantMonitor(el) {
    const S = stage(el, {
        target: V(8, 64, 0), theta: -0.42, phi: 1.22, radius: 330, rMin: 120, rMax: 760, fov: 30, aspectFit: 0.95,
        keyPos: V(-180, 380, 260), shadowBox: { left: -220, right: 220, top: 220, bottom: -160, near: 50, far: 1200 },
        phiMin: 0.35, phiMax: 1.5, exposure: 1.0,
    });
    const rig = plantRig({ badges: true }); S.scene.add(rig.root);
    let base = [0.62, 0.55, 0.58, 0.66, 0.49], m = base.slice(), cycleAt = -1, clock = 0, phase = '', windows = [];
    rig.setMoisture(m);
    const say = p => { if (p !== phase) { phase = p; api.onState && api.onState(p); } };
    S.tick = (now, dt) => {
        clock += dt;
        let busy = false;
        if (cycleAt >= 0) {
            const c = clock - cycleAt;
            busy = true;
            const dry = eio(clamp((c - 0.3) / 2.5)), wet = eio(clamp((c - 4.2) / 3.4));
            m = base.map((v, i) => i === 2 ? lerp(lerp(v, 0.31, dry), 0.63, wet) : Math.min(0.75, v + 0.05 * wet));
            rig.setMoisture(m);
            say(c < 2.25 ? 'drying' : c < 3 ? 'needs' : c < 6.8 ? 'pump' : 'soak');
            if (c > 9.5) { base = m.slice(); cycleAt = -1; windows = []; say('idle'); }
        }
        return rig.frame(clock, windows) || busy;
    };
    const api = {
        kind: 'plant', onState: null,
        runCycle() {
            if (cycleAt >= 0) return;
            cycleAt = clock; windows = [[clock + 3.0, clock + 6.6]]; S.wake();
        },
        setBadges(on) { rig.badgeGroup.visible = on; S.wake(); },
        reset: S.reset, zoom: S.zoom, setVisible: S.setVisible,
        snapshot() { rig.badgeGroup.visible = true; S.renderNow(); return S.canvas.toDataURL('image/jpeg', 0.88); },
    };
    return api;
}

export function mount(el, kind) {
    return kind === 'hydrocart' ? hydrocart(el) : kind === 'plant' ? plantMonitor(el) : cyberdeck(el);
}
