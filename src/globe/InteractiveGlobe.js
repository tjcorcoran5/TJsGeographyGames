import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { createCurvedCountryMesh, createPolygonLine } from "./geo.js";

export class InteractiveGlobe {
  constructor(container, { onCountrySelected } = {}) {
    this.container = container;
    this.onCountrySelected = onCountrySelected;
    this.radius = 5;
    this.maxLat = 1.4;
    this.minFOV = 0.5;
    this.maxFOV = 40;
    this.inertia = { lon: 0, lat: 0 };
    this.isDragging = false;
    this.dragMoved = false;
    this.dragStartVec = new THREE.Vector3();
    this.dragCurrentVec = new THREE.Vector3();
    this.selectedCountry = null;
    this.animationId = null;

    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.append(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(this.maxFOV, 1, this.radius * 0.02, this.radius * 100);
    this.camera.position.z = this.radius * 3.5;

    this.globe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(this.radius, 10),
      new THREE.MeshStandardMaterial({ color: 0xfefefe, roughness: 1, metalness: 0 })
    );
    this.scene.add(this.globe);

    this.scene.add(new THREE.HemisphereLight("white", 0x3f4648, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(5, 3, 5);
    this.scene.add(sun);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 1;
    this.controls.minDistance = this.radius * 1.2;
    this.controls.maxDistance = this.radius * 3.5;
    this.controls.target.set(0, 0, 0);

    this.interactionSphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 64, 64),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.scene.add(this.interactionSphere);

    this.countryRaycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.resizeObserver = new ResizeObserver(() => this.resize());

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onClick = this.handleClick.bind(this);
  }

  async loadGeoJson(geoJson) {
    const countries = this.drawGeoJson(geoJson);
    this.globe.add(countries);
  }

  async loadBakedMesh(bakedMesh) {
    const countries = this.drawBakedMesh(bakedMesh);
    this.globe.add(countries);
  }

  start() {
    this.resizeObserver.observe(this.container);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener("click", this.onClick);
    this.resize();
    this.animate();
  }

  dispose() {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.removeEventListener("click", this.onClick);
    this.controls.dispose();
    this.scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  drawGeoJson(geoJson) {
    const group = new THREE.Group();
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x17211c, transparent: true, opacity: 0.45 });

    geoJson.features.forEach((feature) => {
      if (!feature.geometry) return;

      const countryGroup = new THREE.Group();
      countryGroup.userData.feature = feature;
      countryGroup.userData.isInteractive = feature.properties.isInteractive !== false;
      countryGroup.userData.baseColor = colorFromString(feature.properties.iso_a3 || feature.properties.name);
      countryGroup.userData.pickSize = getFeatureBoundsArea(feature);

      const fillMaterial = new THREE.MeshStandardMaterial({
        color: countryGroup.userData.isInteractive ? countryGroup.userData.baseColor : 0xb9c2bd,
        roughness: 1,
        metalness: 0
      });

      const processPolygon = (rings) => {
        const polygonRings = Array.isArray(rings[0]?.[0]) ? rings : [rings];
        const mesh = createCurvedCountryMesh(polygonRings, this.radius, fillMaterial);
        if (mesh) {
          mesh.userData.countryGroup = countryGroup;
          countryGroup.add(mesh);
        }

        polygonRings.forEach((ring) => {
          const outline = createPolygonLine(ring, this.radius, outlineMaterial);
          if (outline) {
            outline.userData.countryGroup = countryGroup;
            countryGroup.add(outline);
          }
        });
      };

      if (feature.geometry.type === "Polygon") {
        processPolygon(feature.geometry.coordinates);
      }

      if (feature.geometry.type === "MultiPolygon") {
        feature.geometry.coordinates.forEach(processPolygon);
      }

      if (countryGroup.children.length) group.add(countryGroup);
    });

    return group;
  }

  drawBakedMesh(bakedMesh) {
    const group = new THREE.Group();
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: bakedMesh.style?.outlineColor ?? 0x17211c,
      transparent: true,
      opacity: bakedMesh.style?.outlineOpacity ?? 0.45
    });

    bakedMesh.countries.forEach((country) => {
      const countryGroup = new THREE.Group();
      countryGroup.userData.feature = { properties: country.properties };
      countryGroup.userData.isInteractive = country.properties.isInteractive !== false;
      countryGroup.userData.baseColor = country.color;
      countryGroup.userData.pickSize = country.pickSize;

      const fillMaterial = new THREE.MeshStandardMaterial({
        color: countryGroup.userData.isInteractive ? country.color : 0xb9c2bd,
        roughness: 1,
        metalness: 0
      });

      country.meshes.forEach((meshData) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(meshData.positions, 3));
        geometry.setIndex(meshData.indices);
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, fillMaterial);
        mesh.userData.countryGroup = countryGroup;
        countryGroup.add(mesh);
      });

      country.outlines.forEach((positions) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const line = new THREE.Line(geometry, outlineMaterial);
        line.userData.countryGroup = countryGroup;
        countryGroup.add(line);
      });

      if (countryGroup.children.length) group.add(countryGroup);
    });

    return group;
  }

  handlePointerDown(event) {
    this.isDragging = true;
    this.dragMoved = false;
    const vector = this.getPointerSphereVector(event);
    if (vector) this.dragStartVec.copy(vector);
  }

  handlePointerMove(event) {
    if (!this.isDragging) return;

    const vector = this.getPointerSphereVector(event);
    if (!vector) return;

    this.dragCurrentVec.copy(vector);
    const delta = this.getDeltaLatLon(this.dragStartVec, this.dragCurrentVec);
    if (Math.abs(delta.lon) + Math.abs(delta.lat) > 0.0003) this.dragMoved = true;

    this.applyLatLonDelta(delta);
    this.inertia.lon = delta.lon;
    this.inertia.lat = delta.lat;
    this.dragStartVec.copy(this.dragCurrentVec);
  }

  handlePointerUp() {
    this.isDragging = false;
  }

  handleClick(event) {
    if (this.dragMoved) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.countryRaycaster.setFromCamera(this.mouse, this.camera);

    const hits = this.countryRaycaster
      .intersectObjects(this.globe.children, true)
      .filter((hit) => hit.object.isMesh && hit.object.userData?.countryGroup?.userData.isInteractive);

    if (!hits.length) return;

    const surfaceHits = hits
      .map((hit) => ({ hit, delta: Math.abs(hit.point.length() - this.radius) }))
      .filter(({ delta }) => delta < 0.08)
      .sort((a, b) => {
        const sizeA = a.hit.object.userData.countryGroup.userData.pickSize;
        const sizeB = b.hit.object.userData.countryGroup.userData.pickSize;
        return sizeA - sizeB || a.delta - b.delta;
      });

    const bestHit = surfaceHits[0]?.hit || hits[0];

    this.selectCountry(bestHit.object.userData.countryGroup);
  }

  selectCountry(countryGroup) {
    if (this.selectedCountry) {
      this.selectedCountry.traverse((object) => {
        if (object.isMesh) object.material.color.set(this.selectedCountry.userData.baseColor);
      });
    }

    this.selectedCountry = countryGroup;
    countryGroup.traverse((object) => {
      if (object.isMesh) object.material.color.set(0xe9563f);
    });

    this.onCountrySelected?.(countryGroup.userData.feature);
  }

  getPointerSphereVector(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.near = 0.1;
    raycaster.far = this.radius * 10;
    raycaster.setFromCamera(pointer, this.camera);

    const hit = raycaster.intersectObject(this.interactionSphere);
    return hit.length ? hit[0].point.clone().normalize() : null;
  }

  getDeltaLatLon(v0, v1) {
    const p0Lon = new THREE.Vector3(v0.x, 0, v0.z).normalize();
    const p1Lon = new THREE.Vector3(v1.x, 0, v1.z).normalize();
    const p0Lat = new THREE.Vector3(0, v0.y, v0.z).normalize();
    const p1Lat = new THREE.Vector3(0, v1.y, v1.z).normalize();

    return {
      lon: p0Lon.lengthSq() > 0 && p1Lon.lengthSq() > 0 ? signedAngle(p0Lon, p1Lon, new THREE.Vector3(0, 1, 0)) : 0,
      lat: p0Lat.lengthSq() > 0 && p1Lat.lengthSq() > 0 ? signedAngle(p0Lat, p1Lat, new THREE.Vector3(1, 0, 0)) : 0
    };
  }

  applyLatLonDelta(delta) {
    this.globe.rotation.y += delta.lon;
    this.globe.rotation.x += delta.lat;
    this.globe.rotation.x = THREE.MathUtils.clamp(this.globe.rotation.x, -this.maxLat, this.maxLat);
  }

  resize() {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  updateCameraFOV() {
    const distance = this.camera.position.length();
    const t = THREE.MathUtils.clamp(
      (distance - this.controls.minDistance) / (this.controls.maxDistance - this.controls.minDistance),
      0,
      1
    );

    this.camera.fov = THREE.MathUtils.lerp(this.minFOV, this.maxFOV, t);
    this.camera.updateProjectionMatrix();
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.updateCameraFOV();

    if (!this.isDragging) {
      const speedSq = this.inertia.lon * this.inertia.lon + this.inertia.lat * this.inertia.lat;
      if (speedSq > 0.000001) {
        this.applyLatLonDelta(this.inertia);
        this.inertia.lon *= 0.9;
        this.inertia.lat *= 0.9;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

function signedAngle(a, b, normal) {
  const angle = a.angleTo(b);
  const cross = new THREE.Vector3().crossVectors(a, b);
  return cross.dot(normal) < 0 ? -angle : angle;
}

function colorFromString(value = "") {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }

  const palette = [0x76a9c7, 0xa1c181, 0xf0b36a, 0x9bb7d4, 0xd6a4a4, 0x8fb9a8, 0xd8c76f];
  return palette[Math.abs(hash) % palette.length];
}

function getFeatureBoundsArea(feature) {
  const bounds = { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity };
  visitCoordinates(feature.geometry.coordinates, ([lon, lat]) => {
    bounds.minLon = Math.min(bounds.minLon, lon);
    bounds.maxLon = Math.max(bounds.maxLon, lon);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  });

  if (!Number.isFinite(bounds.minLon)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0.000001, (bounds.maxLon - bounds.minLon) * (bounds.maxLat - bounds.minLat));
}

function visitCoordinates(coordinates, visitor) {
  if (typeof coordinates?.[0] === "number") {
    visitor(coordinates);
    return;
  }

  coordinates?.forEach((child) => visitCoordinates(child, visitor));
}
