import { Canvas } from '@react-three/fiber'

// Deploy placeholder: the Chapter 1 morning palette on a bare horizon.
// Replaced by the Gate 1 grey box. Palette per docs/art-direction.md.
const SKY = '#CFE3E0'
const GROUND = '#EFE3C8'
const FOG = '#DCE8E4'

export function App() {
  return (
    <>
      <Canvas camera={{ position: [0, 3, 8], fov: 50 }}>
        <color attach="background" args={[SKY]} />
        <fog attach="fog" args={[FOG, 20, 90]} />
        <ambientLight intensity={0.9} color={SKY} />
        <directionalLight position={[-4, 6, 3]} intensity={1.1} color="#F2DFAE" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[300, 300]} />
          <meshLambertMaterial color={GROUND} />
        </mesh>
      </Canvas>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
          fontFamily: 'system-ui, sans-serif',
          color: '#4E6E58',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontWeight: 600, letterSpacing: '0.02em' }}>The Long Way Home</h1>
      </div>
    </>
  )
}
