import solidPlugin from "@opentui/solid/bun-plugin"
import { $ } from "bun"
import pkg from "./package.json"

const { name, version } = pkg
const binName = Object.keys(pkg.bin)[0]

interface Target {
  os: string
  cpu: string
}
const targets: Target[] = [
  { os: "linux", cpu: "x64" },
  { os: "linux", cpu: "arm64" },
  { os: "darwin", cpu: "x64" },
  { os: "darwin", cpu: "arm64" },
  { os: "windows", cpu: "x64" },
  { os: "windows", cpu: "arm64" },
]

await $`bun install --os="*" --cpu="*" @opentui/core`
await $`bun install --os="*" --cpu="*" @opentui/solid`

const optionalDependencies: Record<string, string> = {}
for (const { os, cpu } of targets) {
  const target = `${os}-${cpu}`
  const ext = os === "windows" ? ".exe" : ""

  const result = await Bun.build({
    conditions: ["browser"],
    entrypoints: ["./src/index.ts"],
    sourcemap: "external",
    minify: true,
    plugins: [solidPlugin],
    compile: {
      target: `bun-${target}` as any,
      outfile: `./dist/${target}/bin/${binName}${ext}`,
      autoloadBunfig: false,
      autoloadDotenv: false,
    },
  })
  if (!result.success) {
    console.error(`Build failed for target ${target}:`, result)
    process.exit(1)
  }

  const pkgName = `${name}-${target}`
  await Bun.file(`dist/${target}/package.json`).write(
    JSON.stringify(
      {
        name: pkgName,
        version,
        os: [os === "windows" ? "win32" : os],
        cpu: [cpu],
        bin: {
          [binName]: `bin/${binName}${ext}`,
        },
      },
      null,
      2,
    ),
  )
  optionalDependencies[pkgName] = version

  console.log(`✓ ${pkgName} built successfully`)
}

await $`mkdir -p dist/${binName}/bin`
await $`cp bin/${binName} dist/${binName}/bin/${binName}`

const nativePkg = {
  ...pkg,
  inlinedDependencies: pkg.dependencies,
  optionalDependencies,
  dependencies: undefined,
  scripts: undefined,
}
delete nativePkg.dependencies
delete nativePkg.scripts

await Bun.file(`dist/${binName}/package.json`).write(JSON.stringify(nativePkg, null, 2))

async function publishPackage(target?: string) {
  const pkgName = target ? `${name}-${target}` : name
  console.log(`Publishing ${pkgName}@${version}...`)
  try {
    await $`npm publish --access public`.cwd(`dist/${target ?? binName}`)
    console.log(`  ✓ ${pkgName}@${version}`)
  } catch (error: any) {
    const errorMessage = error.stderr || String(error)
    if (errorMessage.includes("403") || errorMessage.includes("cannot publish over")) {
      console.log(`  ✓ ${pkgName}@${version} (already published)`)
    } else {
      throw error
    }
  }
}

for (const { os, cpu } of targets) {
  await publishPackage(`${os}-${cpu}`)
}

await publishPackage()

console.log(`\nPublish complete!`)
