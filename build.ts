// Сборка TUI-части: Solid-JSX компилируется заранее (@opentui/solid/bun-plugin),
// чтобы установленный плагин не зависел от JSX-трансформации загрузчика OpenCode.
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const solid = createSolidTransformPlugin()
const result = await Bun.build({
  entrypoints: ["./tui.tsx"],
  outdir: "./dist",
  target: "bun",
  plugins: [solid],
  // Bare-импорты остаются внешними — резолвятся модулями хоста OpenCode.
  external: ["solid-js", "solid-js/web", "@opentui/solid", "@opentui/core", "@opencode/plugin", "@opencode/client"],
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
console.log("built:", result.outputs.map((o) => o.path))
