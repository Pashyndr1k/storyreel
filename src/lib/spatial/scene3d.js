// The 3D side of the spatial layout tool (three.js): a checkerboard floor in
// one-metre squares, block figures, labelled set boxes, and two views of the
// same scene — an editor view with the shot camera drawn as a gizmo, and the
// view through the shot camera itself. No animation: views are redrawn when
// the layout or a view changes.
import * as THREE from 'three';
import { cameraPosition, verticalFov, POSE_TOP } from './layout.js';

const GIZMO_LAYER = 1; // drawn in the editor view only
const rad = (d) => (d * Math.PI) / 180;

function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k >= 1) c.lerp(new THREE.Color('#ffffff'), k - 1);
  else c.multiplyScalar(k);
  return c;
}
// BoxGeometry face order: +x, -x, +y, -y, +z (front), -z (back)
function shadedMaterials(hex) {
  const side = new THREE.MeshBasicMaterial({ color: shade(hex, 0.72) });
  return [side, side, new THREE.MeshBasicMaterial({ color: shade(hex, 1.25) }), new THREE.MeshBasicMaterial({ color: shade(hex, 0.3) }), new THREE.MeshBasicMaterial({ color: shade(hex, 1) }), new THREE.MeshBasicMaterial({ color: shade(hex, 0.45) })];
}
function box(w, h, d, mats) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
}

function canvasTexture(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Head: a face on the front, an ear on each side, a mark on the back.
function headMaterials(hex) {
  const css = (k) => `#${shade(hex, k).getHexString()}`;
  const face = canvasTexture(64, (g, s) => {
    g.fillStyle = css(1);
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff';
    g.fillRect(12, 20, 14, 12);
    g.fillRect(38, 20, 14, 12);
    g.fillStyle = '#111';
    g.fillRect(18, 23, 7, 8);
    g.fillRect(44, 23, 7, 8);
    g.fillStyle = css(0.6);
    g.fillRect(29, 30, 6, 12); // nose
    g.fillStyle = '#111';
    g.fillRect(20, 48, 24, 5); // mouth
  });
  const ear = (flip) =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = css(0.72);
      g.fillRect(0, 0, s, s);
      g.fillStyle = css(0.45);
      g.fillRect(flip ? 16 : 30, 22, 18, 22);
      g.fillStyle = css(0.9);
      g.fillRect(flip ? 21 : 35, 27, 8, 12);
    });
  const back = canvasTexture(64, (g, s) => {
    g.fillStyle = css(0.45);
    g.fillRect(0, 0, s, s);
    // back-of-head mark: a light cross
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(16, 16);
    g.lineTo(48, 48);
    g.moveTo(48, 16);
    g.lineTo(16, 48);
    g.stroke();
  });
  const m = (map) => new THREE.MeshBasicMaterial({ map });
  return [m(ear(false)), m(ear(true)), new THREE.MeshBasicMaterial({ color: shade(hex, 1.25) }), new THREE.MeshBasicMaterial({ color: shade(hex, 0.3) }), m(face), m(back)];
}

function label(text, color = '#ffffff') {
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  const font = 'bold 44px sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 28;
  cv.width = w;
  cv.height = 64;
  const g2 = cv.getContext('2d');
  g2.fillStyle = 'rgba(0,0,0,0.72)';
  g2.fillRect(0, 0, w, 64);
  g2.font = font;
  g2.fillStyle = color;
  g2.textBaseline = 'middle';
  g2.fillText(text, 14, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set((w / 64) * 0.26, 0.26, 1);
  sp.renderOrder = 10;
  return sp;
}

// A block figure. Origin at the feet; front is +z.
function figure(cast, state) {
  const hex = cast.color.hex;
  const mats = shadedMaterials(hex);
  const body = new THREE.Group();
  const put = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    body.add(mesh);
    return mesh;
  };
  const head = new THREE.Group();
  head.add(box(0.34, 0.34, 0.34, headMaterials(hex)));
  // the arrow in front of the face: where the head points
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), new THREE.MeshBasicMaterial({ color: '#ffe14d' }));
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0, 0.42);
  head.add(arrow);
  const shaft = box(0.03, 0.03, 0.16, new THREE.MeshBasicMaterial({ color: '#ffe14d' }));
  shaft.position.set(0, 0, 0.26);
  head.add(shaft);
  head.rotation.y = rad(state.head);

  const sitting = state.pose === 'sitting';
  if (sitting) {
    const seat = 0.42;
    put(box(0.2, 0.2, 0.5, mats), -0.13, seat, 0.2);
    put(box(0.2, 0.2, 0.5, mats), 0.13, seat, 0.2);
    put(box(0.2, 0.42, 0.2, mats), -0.13, 0.21, 0.4);
    put(box(0.2, 0.42, 0.2, mats), 0.13, 0.21, 0.4);
    put(box(0.5, 0.62, 0.26, mats), 0, seat + 0.31, 0);
    put(box(0.15, 0.55, 0.15, mats), -0.33, seat + 0.33, 0.04);
    put(box(0.15, 0.55, 0.15, mats), 0.33, seat + 0.33, 0.04);
    head.position.set(0, seat + 0.62 + 0.19, 0);
  } else {
    put(box(0.2, 0.78, 0.2, mats), -0.13, 0.39, 0);
    put(box(0.2, 0.78, 0.2, mats), 0.13, 0.39, 0);
    put(box(0.5, 0.62, 0.26, mats), 0, 1.09, 0);
    const armL = put(box(0.15, 0.6, 0.15, mats), -0.33, 1.1, 0);
    const armR = put(box(0.15, 0.6, 0.15, mats), 0.33, 1.1, 0);
    if (state.pose === 'jumping') {
      armL.rotation.z = -0.9;
      armR.rotation.z = 0.9;
      armL.position.set(-0.5, 1.35, 0);
      armR.position.set(0.5, 1.35, 0);
    }
    head.position.set(0, 1.61, 0);
  }
  body.add(head);
  if (state.pose === 'lying') {
    // on the back, face up, centred on the position
    body.rotation.x = -Math.PI / 2;
    body.position.set(0, 0.13, 0.9);
  } else if (state.pose === 'jumping') {
    body.position.y = POSE_TOP.jumping - POSE_TOP.standing;
  }
  const root = new THREE.Group();
  root.add(body);
  root.position.set(state.x, 0, state.z);
  root.rotation.y = rad(state.rot);
  const tag = label(cast.name, `#${shade(hex, 1.5).getHexString()}`);
  tag.position.set(0, (POSE_TOP[state.pose] || 1.8) + 0.28, 0);
  root.add(tag);
  // an invisible box to click on
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, Math.max(0.5, POSE_TOP[state.pose] || 1.8), state.pose === 'lying' ? 1.9 : 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = Math.max(0.25, (POSE_TOP[state.pose] || 1.8) / 2);
  hit.userData = { type: 'char', id: cast.id };
  root.add(hit);
  return root;
}

export function createSpatialView({ editorCanvas, cameraCanvas }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2c30');

  // floor: 1 m checker squares
  const checker = canvasTexture(2, (g) => {
    g.fillStyle = '#c9ccd2';
    g.fillRect(0, 0, 2, 2);
    g.fillStyle = '#6f747d';
    g.fillRect(0, 0, 1, 1);
    g.fillRect(1, 1, 1, 1);
  });
  checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
  checker.repeat.set(30, 30);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: checker }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const content = new THREE.Group();
  const gizmos = new THREE.Group();
  scene.add(content, gizmos);

  const editorCam = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  editorCam.layers.enable(GIZMO_LAYER);
  const shotCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 200);
  const orbit = { yaw: 35, pitch: 32, dist: 11, cx: 0, cy: 0.8, cz: 0 };

  const mkRenderer = (canvas) => {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    return r;
  };
  const editorR = mkRenderer(editorCanvas);
  const cameraR = mkRenderer(cameraCanvas);
  const raycaster = new THREE.Raycaster();
  let pickables = [];

  const placeEditorCam = () => {
    const y = rad(orbit.yaw);
    const p = rad(orbit.pitch);
    editorCam.position.set(orbit.cx + orbit.dist * Math.sin(y) * Math.cos(p), orbit.cy + orbit.dist * Math.sin(p), orbit.cz + orbit.dist * Math.cos(y) * Math.cos(p));
    editorCam.lookAt(orbit.cx, orbit.cy, orbit.cz);
  };

  const clear = (group) => {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse?.((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => {
          m.map?.dispose?.();
          m.dispose?.();
        });
      });
    }
  };
  const toGizmo = (obj) => obj.traverse((o) => o.layers.set(GIZMO_LAYER));

  function render() {
    placeEditorCam();
    editorR.render(scene, editorCam);
    cameraR.render(scene, shotCam);
  }

  function resize(aspect) {
    // editor: fills its CSS box
    const ew = editorCanvas.clientWidth || 300;
    const eh = editorCanvas.clientHeight || 200;
    editorR.setSize(ew, eh, false);
    editorCam.aspect = ew / eh;
    editorCam.updateProjectionMatrix();
    // camera view: the largest frame of the project's aspect ratio that fits
    // its box, so the picture is never stretched
    const boxEl = cameraCanvas.parentElement;
    const bw = boxEl?.clientWidth || 300;
    const bh = boxEl?.clientHeight || 200;
    let cw = bw;
    let ch = Math.round(bw / aspect);
    if (ch > bh) {
      ch = bh;
      cw = Math.round(bh * aspect);
    }
    cameraCanvas.style.width = cw + 'px';
    cameraCanvas.style.height = ch + 'px';
    cameraR.setSize(cw, ch, false);
    shotCam.aspect = aspect;
    shotCam.updateProjectionMatrix();
    render();
  }

  // layout: from layoutFor(); selection: { type, id } | null
  function setLayout(layout, selection, aspect) {
    clear(content);
    clear(gizmos);
    pickables = [];
    for (const c of layout.cast) {
      const fig = figure(c, layout.chars[c.id]);
      content.add(fig);
      fig.traverse((o) => o.userData?.type && pickables.push(o));
      if (selection?.type === 'char' && selection.id === c.id) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.66, 32), new THREE.MeshBasicMaterial({ color: '#ffe14d', side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(layout.chars[c.id].x, 0.02, layout.chars[c.id].z);
        gizmos.add(ring);
      }
    }
    for (const pr of layout.props) {
      const sel = selection?.type === 'prop' && selection.id === pr.id;
      const mesh = box(pr.w, pr.h, pr.d, shadedMaterials(sel ? '#d8c27a' : '#9aa0aa'));
      mesh.position.set(pr.x, pr.h / 2, pr.z);
      mesh.rotation.y = rad(pr.rot);
      mesh.userData = { type: 'prop', id: pr.id };
      content.add(mesh);
      pickables.push(mesh);
      if (pr.label) {
        const tag = label(pr.label, '#e8e8e8');
        tag.position.set(pr.x, pr.h + 0.22, pr.z);
        content.add(tag);
      }
    }

    // the shot camera
    const cam = layout.camera;
    const pos = cameraPosition(cam);
    shotCam.fov = verticalFov(cam.lens, aspect);
    shotCam.aspect = aspect;
    shotCam.position.set(pos.x, pos.y, pos.z);
    shotCam.lookAt(cam.tx, cam.ty, cam.tz);
    shotCam.updateProjectionMatrix();
    shotCam.updateMatrixWorld(true);

    // gizmo: camera body, its frustum to the target distance, the target
    const camSel = selection?.type === 'camera';
    const bodyMat = new THREE.MeshBasicMaterial({ color: camSel ? '#ffe14d' : '#101114' });
    const camBody = new THREE.Group();
    camBody.add(box(0.28, 0.2, 0.36, bodyMat));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 12), bodyMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.26;
    camBody.add(lens);
    camBody.position.copy(shotCam.position);
    camBody.quaternion.copy(shotCam.quaternion);
    gizmos.add(camBody);
    const half = Math.tan(rad(shotCam.fov) / 2) * cam.dist;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => new THREE.Vector3(sx * half * aspect, sy * half, -cam.dist).applyMatrix4(shotCam.matrixWorld));
    const pts = [];
    corners.forEach((c, i) => {
      pts.push(shotCam.position.clone(), c, c, corners[(i + 1) % 4]);
    });
    gizmos.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: camSel ? '#ffe14d' : '#ffffff' })));
    const target = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff4a2e' }));
    target.position.set(cam.tx, cam.ty, cam.tz);
    target.userData = { type: 'target' };
    gizmos.add(target);
    gizmos.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(cam.tx, 0, cam.tz), new THREE.Vector3(cam.tx, cam.ty, cam.tz)]), new THREE.LineBasicMaterial({ color: '#ff4a2e' })));
    toGizmo(gizmos);
    pickables.push(target);
    raycaster.layers.enable(GIZMO_LAYER);
    render();
  }

  const ndc = (clientX, clientY) => {
    const r = editorCanvas.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  };
  // What is under the pointer in the editor view: { type, id } or null.
  function pick(clientX, clientY) {
    raycaster.setFromCamera(ndc(clientX, clientY), editorCam);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData : null;
  }
  // The floor point under the pointer: { x, z } or null.
  function floorPoint(clientX, clientY) {
    raycaster.setFromCamera(ndc(clientX, clientY), editorCam);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out) ? { x: out.x, z: out.z } : null;
  }
  function orbitBy(dx, dy) {
    orbit.yaw -= dx * 0.4;
    orbit.pitch = Math.max(5, Math.min(89, orbit.pitch + dy * 0.3));
    render();
  }
  function zoomBy(delta) {
    orbit.dist = Math.max(2, Math.min(60, orbit.dist * (delta > 0 ? 1.1 : 0.9)));
    render();
  }
  function panBy(dx, dy) {
    const y = rad(orbit.yaw);
    const k = orbit.dist * 0.0016;
    orbit.cx -= (dx * Math.cos(y) + dy * Math.sin(y)) * k;
    orbit.cz -= (-dx * Math.sin(y) + dy * Math.cos(y)) * k;
    render();
  }
  // The camera view as a small JPEG (for the shot's saved view).
  function snapshot(maxWidth = 480) {
    cameraR.render(scene, shotCam);
    const src = cameraCanvas;
    const scale = Math.min(1, maxWidth / (src.width || maxWidth));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(src.width * scale));
    cv.height = Math.max(1, Math.round(src.height * scale));
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.8);
  }
  function dispose() {
    clear(content);
    clear(gizmos);
    floor.geometry.dispose();
    floor.material.map.dispose();
    floor.material.dispose();
    editorR.dispose();
    cameraR.dispose();
  }

  return { setLayout, resize, render, pick, floorPoint, orbitBy, zoomBy, panBy, snapshot, dispose };
}
