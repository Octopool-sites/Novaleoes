import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export type CarScene = { update(progress: number): void; dispose(): void }

// Own one renderer per host, including when React mounts an effect twice in development.
const mountedScenes = new WeakMap<HTMLElement, CarScene>()
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

type MovingPart = {
  object: Object3D
  position: Vector3
  rotation: Quaternion
  shift: Vector3
  turn: Quaternion
  start: number
}

function releaseObject(root: Object3D) {
  const geometries = new Set<Mesh['geometry']>()
  const materials = new Set<Material>()
  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
  })
  geometries.forEach(geometry => geometry.dispose())
  materials.forEach(material => material.dispose())
}

/**
 * An illustrative concept car, not an indication of product fitment.
 * Geometry and adaptation credits: /assets/car/ATTRIBUTION.txt.
 * Rendering happens only for scroll updates, layout changes and the first frame.
 */
export async function mountCarScene(
  host: HTMLElement,
  onReady: () => void,
  onError: () => void,
): Promise<CarScene> {
  mountedScenes.get(host)?.dispose()
  let disposed = false
  let failed = false
  let ready = false
  let progress = 0
  let frame = 0
  let renderer: WebGLRenderer | undefined
  let environment: WebGLRenderTarget | undefined
  let resizeObserver: ResizeObserver | undefined
  const controller = new AbortController()
  const scene = new Scene()
  const rig = new Group()
  scene.add(rig)
  const camera = new OrthographicCamera(-4, 4, 3, -3, 0.1, 80)
  const movingParts: MovingPart[] = []
  const box = new Box3()
  const projectedBox = new Box3()
  const corner = new Vector3()
  const cameraRight = new Vector3()
  const cameraUp = new Vector3()
  const cameraCenter = new Vector3()
  const identity = new Quaternion()
  const interpolatedRotation = new Quaternion()

  const fail = () => {
    if (disposed || failed) return
    failed = true
    handle.dispose()
    onError()
  }

  const contextLost = (event: Event) => {
    event.preventDefault()
    fail()
  }

  function render() {
    frame = 0
    if (disposed || !renderer || !ready) return
    if (!host.isConnected) { handle.dispose(); return }
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    if (width < 2 || height < 2) return
    const aspect = width / height
    const explode = smooth(progress / 0.45)
    const orbit = smooth((progress - 0.45) / 0.55)
    for (const part of movingParts) {
      const amount = smooth((progress - part.start) / (0.45 - part.start))
      part.object.position.copy(part.position).addScaledVector(part.shift, amount)
      interpolatedRotation.copy(identity).slerp(part.turn, amount)
      part.object.quaternion.copy(part.rotation).multiply(interpolatedRotation)
    }
    rig.updateMatrixWorld(true)
    // Front (+Z) stays on the left of the composition throughout the scroll.
    camera.position.set(6.8 + orbit * 1.35, 5.0 + orbit * 0.45, 7.6 - orbit * 1.1)
    camera.lookAt(0, 0.65 + explode * 0.30, 0.2)
    camera.updateMatrixWorld(true)

    // Fit the actual exploded bounds; a narrow phone must never crop detached wheels.
    box.setFromObject(rig)
    projectedBox.makeEmpty()
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      corner.set(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z)
      projectedBox.expandByPoint(corner.applyMatrix4(camera.matrixWorldInverse))
    }
    projectedBox.getCenter(cameraCenter)
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0)
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1)
    camera.position.addScaledVector(cameraRight, cameraCenter.x).addScaledVector(cameraUp, cameraCenter.y)
    const span = Math.max(projectedBox.max.y - projectedBox.min.y, (projectedBox.max.x - projectedBox.min.x) / aspect)
    const halfHeight = span * (width < 600 ? 0.555 : 0.56)
    camera.left = -halfHeight * aspect
    camera.right = halfHeight * aspect
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    try { renderer.render(scene, camera) } catch { fail() }
  }

  const schedule = () => {
    if (!disposed && !frame) frame = window.requestAnimationFrame(render)
  }

  function resize() {
    if (disposed || !renderer) return
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 600 ? 1.25 : 1.5))
    renderer.setSize(width, height, false)
    schedule()
  }

  const handle: CarScene = {
    update(next) {
      if (disposed || !Number.isFinite(next)) return
      progress = Math.max(0, Math.min(1, next))
      schedule()
    },
    dispose() {
      if (disposed) return
      disposed = true
      controller.abort()
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      if (mountedScenes.get(host) === handle) mountedScenes.delete(host)
      releaseObject(scene)
      environment?.dispose()
      if (renderer) {
        renderer.domElement.removeEventListener('webglcontextlost', contextLost)
        renderer.domElement.remove()
        renderer.renderLists.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
      }
      scene.clear()
    },
  }
  mountedScenes.set(host, handle)

  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.setClearColor(0xf6f4ed, 0)
    renderer.domElement.setAttribute('aria-hidden', 'true')
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;'
    renderer.domElement.addEventListener('webglcontextlost', contextLost)
    host.appendChild(renderer.domElement)

    const response = await fetch('/assets/car/nova-leoes-concept.glb', { signal: controller.signal, cache: 'force-cache' })
    if (!response.ok) throw new Error('Car asset unavailable')
    const data = await response.arrayBuffer()
    if (disposed) return handle
    const gltf = await new GLTFLoader().parseAsync(data, '')
    if (disposed) { releaseObject(gltf.scene); return handle }

    const materials = {
      paint: new MeshPhysicalMaterial({ color: '#3c4344', metalness: 0.78, roughness: 0.27, clearcoat: 1, clearcoatRoughness: 0.12, side: DoubleSide }),
      trim: new MeshStandardMaterial({ color: '#222826', metalness: 0.62, roughness: 0.34, side: DoubleSide }),
      chrome: new MeshStandardMaterial({ color: '#bbc0bb', metalness: 0.91, roughness: 0.23, side: DoubleSide }),
      rubber: new MeshStandardMaterial({ color: '#171b1a', metalness: 0.03, roughness: 0.86, side: DoubleSide }),
      interior: new MeshStandardMaterial({ color: '#514c43', metalness: 0.06, roughness: 0.7, side: DoubleSide }),
      interiorDark: new MeshStandardMaterial({ color: '#252a28', metalness: 0.12, roughness: 0.6, side: DoubleSide }),
      mechanical: new MeshStandardMaterial({ color: '#616966', metalness: 0.8, roughness: 0.4, side: DoubleSide }),
      glass: new MeshPhysicalMaterial({ color: '#a8b4b0', metalness: 0.14, roughness: 0.12, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide }),
      light: new MeshStandardMaterial({ color: '#faf3d9', emissive: '#e9d8a4', emissiveIntensity: 0.35, metalness: 0.15, roughness: 0.24 }),
      rearLight: new MeshStandardMaterial({ color: '#a33b2a', emissive: '#6c1f12', emissiveIntensity: 0.2, metalness: 0.1, roughness: 0.25 }),
      brake: new MeshStandardMaterial({ color: '#b99951', metalness: 0.7, roughness: 0.36 }),
    }
    const oldMaterials = new Set<Material>()
    const pickMaterial = (name: string): Material => {
      if (/Tireside|Tiretread|Floormat/i.test(name)) return materials.rubber
      if (/Glass/i.test(name)) return materials.glass
      if (/Headlight|Signallight/i.test(name)) return materials.light
      if (/Brakelight/i.test(name)) return materials.rearLight
      if (/Rim1|Disc|Mirror/i.test(name)) return materials.chrome
      if (/Brake/i.test(name)) return materials.brake
      if (/Paint 1|Panel Sides/i.test(name)) return materials.paint
      if (/Interior 3|Interior 1/i.test(name)) return materials.interior
      if (/Interior|Dashboard/i.test(name)) return materials.interiorDark
      if (/Mechanical|Hardware/i.test(name)) return materials.mechanical
      return materials.trim
    }
    gltf.scene.traverse(object => {
      if (!(object instanceof Mesh)) return
      const original = Array.isArray(object.material) ? object.material : [object.material]
      original.forEach(material => oldMaterials.add(material))
      object.material = Array.isArray(object.material) ? original.map(material => pickMaterial(material.name)) : pickMaterial(original[0].name)
      object.castShadow = false
      object.receiveShadow = false
    })
    oldMaterials.forEach(material => material.dispose())
    rig.add(gltf.scene)

    // The asset's parent converts Z-up to Y-up, so shifts below are authored in local Z-up coordinates.
    const move = (name: string, shift: [number, number, number], turnAxis: Vector3 | null = null, angle = 0, start = 0) => {
      const object = gltf.scene.getObjectByName(name)
      if (!object) return
      movingParts.push({object, position: object.position.clone(), rotation: object.quaternion.clone(), shift: new Vector3(...shift), turn: turnAxis ? new Quaternion().setFromAxisAngle(turnAxis, angle) : new Quaternion(), start})
    }
    move('BodyHood', [0, -0.27, 0.8], new Vector3(1, 0, 0), 0.16, 0.015)
    move('BodyRoofPanel', [0, 0.02, 1.17], null, 0, 0.055)
    move('BodyWindshield', [0, -0.12, 0.52], null, 0, 0.04)
    move('BodyWindshieldGasket', [0, -0.12, 0.52], null, 0, 0.04)
    move('BodyWindshieldWipers', [0, -0.12, 0.52], null, 0, 0.04)
    move('BodyWindshieldWipersBase', [0, -0.12, 0.52], null, 0, 0.04)
    move('BodyDoorLColor1', [0.76, -0.02, 0.20], new Vector3(0, 0, 1), -0.13, 0.025)
    move('BodyDoorRColor1', [-0.76, -0.02, 0.20], new Vector3(0, 0, 1), 0.13, 0.025)
    move('BodyRearPanelsColor1', [0, 0.22, 0.52], new Vector3(1, 0, 0), -0.08, 0.065)
    move('BodyPanelsColor2', [0, 0, 0.13], null, 0, 0.065)
    move('WheelFrontL', [0.94, -0.13, 0.10], null, 0, 0.075)
    move('WheelFrontR', [-0.94, -0.13, 0.10], null, 0, 0.075)
    move('WheelRearL', [0.89, 0.13, 0.10], null, 0, 0.10)
    move('WheelRearR', [-0.89, 0.13, 0.10], null, 0, 0.10)
    move('Engine', [0, -0.08, 0.14], null, 0, 0.13)

    const room = new RoomEnvironment()
    const pmrem = new PMREMGenerator(renderer)
    try { environment = pmrem.fromScene(room, 0.045, 0.1, 100, { size: 128 }) }
    finally { room.dispose(); pmrem.dispose() }
    scene.environment = environment.texture
    scene.environmentIntensity = 1.35
    const key = new DirectionalLight(0xfff4de, 2.8)
    key.position.set(-3, 7, 5)
    const rim = new DirectionalLight(0xe8f0ef, 2.1)
    rim.position.set(5, 4, -4)
    scene.add(key, rim, new HemisphereLight(0xfffbf2, 0x88897b, 1.7))

    const shadow = new Mesh(new PlaneGeometry(5.8, 6.0), new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; void main(){vec2 p=vUv*2.0-1.0;float d=length(p);float a=exp(-dot(p,p)*4.2)*(1.0-smoothstep(0.45,1.0,d))*0.18;gl_FragColor=vec4(0.22,0.22,0.17,a);}',
    }))
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(0, -0.19, 0.15)
    scene.add(shadow)
    ready = true
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    window.addEventListener('resize', resize, { passive: true })
    resize()
    if (frame) { window.cancelAnimationFrame(frame); frame = 0 }
    render()
    if (!disposed) onReady()
    return handle
  } catch {
    fail()
    return handle
  }
}
