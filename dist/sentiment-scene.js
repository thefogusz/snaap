import * as THREE from '/vendor/three/three.module.min.js';

// Each spoke is a category flow; the center is an unspecified counterpart, not another market.
export function createFlowScene(host, onFailure) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x15191e, 0);
  host.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 100, 100, 0, .1, 100);
  camera.position.z = 50;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let group = new THREE.Group(), particles = [], active = false, inViewport = true, paused = reduced.matches, frame = 0, clock = 0, previous = 0;
  scene.add(group);
  function disposeGroup() {
    group.traverse(object => { object.geometry?.dispose(); if (object.material) object.material.dispose(); });
    scene.remove(group);
  }
  function draw() { renderer.render(scene, camera); }
  function tick(time) {
    frame = 0;
    clock += previous ? Math.min(time - previous, 50) / 1000 : 0;
    previous = time;
    for (const lane of particles) {
      const array = lane.points.geometry.attributes.position.array;
      for (let i = 0; i < lane.count; i++) {
        let t = (i / lane.count + clock * .10) % 1;
        if (lane.negative) t = 1 - t;
        const p = lane.curve.getPoint(t);
        array[i * 3] = p.x; array[i * 3 + 1] = p.y + Math.sin(i * 2.4) * lane.width; array[i * 3 + 2] = 2;
      }
      lane.points.geometry.attributes.position.needsUpdate = true;
    }
    draw();
    if (active && inViewport && !paused) frame = requestAnimationFrame(tick);
  }
  function animate() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    if (active && inViewport && !paused) frame = requestAnimationFrame(tick); else draw();
  }
  const resize = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    if (width && height) { renderer.setSize(width, height, false); draw(); }
  });
  resize.observe(host);
  const intersection = new IntersectionObserver(([entry]) => { inViewport = entry.isIntersecting; animate(); });
  intersection.observe(host);
  function motionChange() { paused = reduced.matches; animate(); }
  reduced.addEventListener('change', motionChange);
  function lost(event) { event.preventDefault(); active = false; cancelAnimationFrame(frame); onFailure(); }
  renderer.domElement.addEventListener('webglcontextlost', lost);
  return {
    update(markets, selected) {
      cancelAnimationFrame(frame); frame = 0;
      disposeGroup(); group = new THREE.Group(); scene.add(group); particles = [];
      const max = Math.max(1, ...markets.map(m => Math.abs(m.value ?? 0)));
      const styles = getComputedStyle(host.closest('#view-sentiment'));
      const positive = styles.getPropertyValue('--sf-in').trim();
      const negative = styles.getPropertyValue('--sf-out').trim();
      const neutral = styles.getPropertyValue('--sf-border').trim();
      // Quiet reference rings give depth without pretending this is a geographic map.
      for (const radius of [24, 38]) {
        const points = Array.from({length:121}, (_,i) => new THREE.Vector3(49 + Math.cos(i/120*Math.PI*2)*radius,52 + Math.sin(i/120*Math.PI*2)*radius*.82,-2));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:neutral,transparent:true,opacity:.35})));
      }
      markets.forEach(market => {
        const value = market.value;
        const color = value === null ? neutral : value < 0 ? negative : positive;
        const dim = selected && selected !== market.id ? .40 : 1;
        const width = .12 + Math.sqrt(Math.abs(value ?? 0) / max) * 1.8;
        const end = new THREE.Vector3(market.position[0],100-market.position[1],0);
        const start = new THREE.Vector3(49,52,0);
        const delta = end.clone().sub(start);
        const perpendicular = new THREE.Vector3(-delta.y,delta.x,0).normalize();
        const control1 = start.clone().addScaledVector(delta,.38).addScaledVector(perpendicular,7);
        const control2 = start.clone().addScaledVector(delta,.65).addScaledVector(perpendicular,6);
        const curve = new THREE.CubicBezierCurve3(start,control1,control2,end);
        for (let strand = -4; strand <= 4; strand++) {
          const points = curve.getPoints(60).map((p,i) => p.addScaledVector(perpendicular,strand/4*width*Math.sin(i/60*Math.PI)));
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color,transparent:true,opacity:(.12+.15*(1-Math.abs(strand)/5))*dim})));
        }
        if (value !== null && value !== 0) {
          const count = 8 + Math.round(Math.sqrt(Math.abs(value)/max)*24);
          const points = new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3)),new THREE.PointsMaterial({color,size:1.6,sizeAttenuation:false,transparent:true,opacity:.85*dim}));
          group.add(points); particles.push({curve,points,count,negative:value<0,width:width*.35});
        }
      });
      tick(0); animate();
    },
    setActive(value) { active = value; animate(); },
    setPaused(value) { paused = value; animate(); },
    dispose() { active = false; cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect(); reduced.removeEventListener('change', motionChange); renderer.domElement.removeEventListener('webglcontextlost', lost); disposeGroup(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
