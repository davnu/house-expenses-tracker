import { spawn, type ChildProcess } from 'child_process'

let emulatorProcess: ChildProcess | null = null

async function waitForEmulator(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      // Some emulators return 200, others return 501 — any response means it's running
      if (res.status > 0) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Emulator on port ${port} did not start within ${timeoutMs}ms`)
}

export async function setup() {
  // Check if emulator is already running (e.g. started manually)
  try {
    const res = await fetch('http://127.0.0.1:5400/')
    if (res.ok) {
      console.log('Firebase emulators already running, reusing them')
      return
    }
  } catch {
    // Not running, we'll start them
  }

  console.log('Starting Firebase emulators...')

  emulatorProcess = spawn(
    'firebase',
    ['emulators:start', '--only', 'firestore,auth,storage', '--project', 'demo-test'],
    {
      stdio: 'pipe',
      detached: false,
    }
  )

  // Log emulator output for debugging failures
  emulatorProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    if (msg.includes('Error') || msg.includes('error')) {
      console.error('[emulator]', msg.trim())
    }
  })

  // Wait for hub first, then for Firestore and Storage to be ready
  await waitForEmulator(5400)
  console.log('Emulator hub ready, waiting for Firestore + Storage...')
  await Promise.all([waitForEmulator(5180), waitForEmulator(5299)])
  console.log('Firebase emulators ready')
}

export async function teardown() {
  if (emulatorProcess) {
    console.log('Stopping Firebase emulators...')
    emulatorProcess.kill('SIGTERM')

    // Wait for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        emulatorProcess?.kill('SIGKILL')
        resolve()
      }, 5000)

      emulatorProcess?.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    emulatorProcess = null
  }
}
