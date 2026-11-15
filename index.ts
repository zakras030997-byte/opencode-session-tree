// Серверная часть local.session-tree (v0.8: + порядок проектов файлом .session-tree-order.json).
// Проекты живут в каталоге OpenCode (~/.../opencode/projects) и создаются плагином автоматически.
import path from "node:path"
import os from "node:os"
import fs from "node:fs/promises"
import { Plugin } from "@opencode/plugin"
import { TreeRpc } from "./rpc"

const THREAD_MARKER = ".session-tree-thread.json"
const THREADS_DIR = "threads"
// Порядок проектов, заданный вручную (drag в сайдбаре). Файл лежит в корне проектов,
// скрыт точкой и не мешает листингу (плагин отбирает только каталоги).
const ORDER_FILE = ".session-tree-order.json"

type SessionLike = {
  id?: string
  sessionID?: string
  title?: string
  directory?: unknown
}

const sid = (s: SessionLike | undefined) => (s ? ((s.id ?? s.sessionID) as string | undefined) : undefined)

export default Plugin.define({
  id: "opencode-session-tree",
  async setup(ctx) {
    const options = (ctx.options ?? {}) as { projectsRoot?: string }
    const projectsRoot = path.resolve(
      options.projectsRoot ?? path.join(os.homedir(), ".local/share/opencode/projects"),
    )
    const validName = (name: string) => {
      const trimmed = name.trim()
      if (!trimmed || trimmed.length > 60) return null
      if (trimmed === "." || trimmed === ".." || trimmed.startsWith(".")) return null
      if (/[/\\:\0]/.test(trimmed)) return null
      return trimmed
    }

    const insideProjectsRoot = (p: string) => {
      const resolved = path.resolve(p)
      return resolved.startsWith(projectsRoot + path.sep) ? resolved : null
    }

    // --- Порядок проектов --------------------------------------------------

    const orderPath = path.join(projectsRoot, ORDER_FILE)

    const readOrder = async (): Promise<string[]> => {
      try {
        const raw = JSON.parse(await fs.readFile(orderPath, "utf8")) as { projects?: unknown }
        if (!Array.isArray(raw?.projects)) return []
        return raw.projects.filter((n): n is string => typeof n === "string" && n.length > 0)
      } catch {
        return []
      }
    }

    const writeOrder = async (names: string[]) => {
      const body = JSON.stringify({ schema: 1, projects: names }, null, 2) + "\n"
      const tmp = `${orderPath}.tmp`
      await fs.mkdir(projectsRoot, { recursive: true })
      await fs.writeFile(tmp, body)
      await fs.rename(tmp, orderPath)
    }

    // Имена из списка — в его порядке; всё, чего в списке нет, — следом по алфавиту.
    const applyOrder = (names: string[], order: string[]) => {
      const present = new Set(names)
      const used = new Set<string>()
      const kept: string[] = []
      for (const name of order) {
        if (present.has(name) && !used.has(name)) {
          kept.push(name)
          used.add(name)
        }
      }
      return [...kept, ...names.filter((n) => !used.has(n))]
    }

    const projectNames = async (): Promise<string[]> => {
      const dirents = await fs.readdir(projectsRoot, { withFileTypes: true })
      return dirents
        .filter((e) => e.isDirectory() && !e.isSymbolicLink())
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b))
    }

    const dropFromOrder = async (name: string) => {
      const order = await readOrder()
      if (!order.includes(name)) return
      await writeOrder(order.filter((n) => n !== name)).catch(() => {})
    }

    const dirOf = (s: SessionLike, fallback: string) =>
      typeof s.directory === "string"
        ? s.directory
        : ((s.directory as { directory?: string } | undefined)?.directory ??
          (s.directory as { path?: string } | undefined)?.path ??
          fallback)

    // Все сессии проекта: по маркерам тредов + листинг каталога (включая сабагентов через remove-рекурсию).
    const projectSessions = async (root: string): Promise<{ sessionID: string; directory: string }[]> => {
      const found = new Map<string, string>()
      try {
        const entries = await fs.readdir(path.join(root, THREADS_DIR), { withFileTypes: true })
        for (const e of entries) {
          if (!e.isDirectory()) continue
          try {
            const marker = JSON.parse(await fs.readFile(path.join(root, THREADS_DIR, e.name, THREAD_MARKER), "utf8"))
            if (typeof marker?.sessionID === "string") {
              found.set(marker.sessionID, path.join(root, THREADS_DIR, e.name))
            }
          } catch {
            /* папка без маркера */
          }
        }
      } catch {
        /* threads/ нет */
      }
      try {
        const page = (await ctx.session.list({ directory: root, limit: 200 })) as unknown as {
          data?: SessionLike[]
        }
        for (const s of page.data ?? []) {
          const id = sid(s)
          if (id && !found.has(id)) found.set(id, dirOf(s, root))
        }
      } catch {
        /* листинг недоступен */
      }
      return [...found.entries()].map(([sessionID, directory]) => ({ sessionID, directory }))
    }

    const buildTree = async () => {
      const projects: unknown[] = []
      let entries: string[] = []
      try {
        entries = applyOrder(await projectNames(), await readOrder())
      } catch {
        await fs.mkdir(projectsRoot, { recursive: true }).catch(() => {})
      }
      for (const name of entries) {
        const projectPath = path.join(projectsRoot, name)
        const threadsDir = path.join(projectPath, THREADS_DIR)
        const threads: unknown[] = []
        let threadEntries: string[] = []
        try {
          const dirents = await fs.readdir(threadsDir, { withFileTypes: true })
          threadEntries = dirents.filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name)
        } catch {
          /* threads/ ещё нет */
        }
        for (const slug of threadEntries) {
          const folder = path.join(threadsDir, slug)
          let sessionID: string | null = null
          try {
            const marker = JSON.parse(await fs.readFile(path.join(folder, THREAD_MARKER), "utf8"))
            if (typeof marker?.sessionID === "string") sessionID = marker.sessionID
          } catch {
            /* без маркера */
          }
          let title = slug
          if (sessionID) {
            try {
              const s = (await ctx.session.get({ sessionID })) as SessionLike
              title = s.title ?? slug
            } catch {
              title = `${slug} (сессия удалена)`
            }
          }
          threads.push({ folder, slug, sessionID, title })
        }
        projects.push({
          name,
          path: projectPath,
          threads,
        })
      }

      // Треды «без проекта» — сессии текущего location вне каталога проектов.
      const loose: unknown[] = []
      try {
        const page = (await ctx.session.list({ directory: ctx.location.directory, limit: 50 })) as unknown as {
          data?: SessionLike[]
        }
        for (const s of page.data ?? []) {
          const id = sid(s)
          if (!id) continue
          const dir = dirOf(s, ctx.location.directory)
          if (dir.startsWith(projectsRoot + path.sep) || dir === projectsRoot) continue
          loose.push({ sessionID: id, title: s.title ?? id, directory: dir })
        }
      } catch {
        /* листинг недоступен */
      }
      return { projectsRoot, projects, loose }
    }

    const registration = await ctx.rpc.register(TreeRpc, {
      listTree: async () => buildTree() as never,

      createProject: async (raw, context) => {
        const input = raw as { name: string }
        const name = validName(input.name)
        if (!name) return context.error("invalid_name", "Имя проекта: 1–60 символов, без / и скрытых имён", { name: input.name })
        const projectPath = path.join(projectsRoot, name)
        try {
          await fs.access(projectPath)
          return context.error("exists", "Проект с таким именем уже есть", { path: projectPath })
        } catch {
          /* свободно */
        }
        await fs.mkdir(projectPath, { recursive: true })
        await fs.mkdir(path.join(projectPath, THREADS_DIR), { recursive: true })
        return buildTree() as never
      },

      renameProject: async (raw, context) => {
        const input = raw as { path: string; name: string }
        const oldPath = insideProjectsRoot(input.path)
        if (!oldPath) return context.error("invalid_path", "Проект вне каталога проектов OpenCode", { path: input.path })
        const name = validName(input.name)
        if (!name) return context.error("invalid_name", "Некорректное имя", { name: input.name })
        const newPath = path.join(projectsRoot, name)
        if (newPath === oldPath) return buildTree() as never
        try {
          await fs.access(newPath)
          return context.error("exists", "Папка с таким именем уже есть", { path: newPath })
        } catch {
          /* свободно */
        }
        const sessions = await projectSessions(oldPath)
        await fs.rename(oldPath, newPath)
        // Перепривязка сессий на новые пути (спека 0.4: авто-привязка).
        for (const s of sessions) {
          const sub = path.relative(oldPath, s.directory)
          const newDir = sub ? path.join(newPath, sub) : newPath
          try {
            await ctx.session.move({ sessionID: s.sessionID, directory: newDir } as never)
          } catch {
            /* сессия могла быть удалена */
          }
        }
        // Порядок живёт по именам папок — переносим запись, чтобы место не потерялось.
        const order = await readOrder()
        const slot = order.indexOf(path.basename(oldPath))
        if (slot >= 0) {
          order[slot] = name
          await writeOrder(order).catch(() => {})
        }
        return buildTree() as never
      },

      deleteProject: async (raw, context) => {
        const input = raw as { path: string }
        const root = insideProjectsRoot(input.path)
        if (!root) return context.error("invalid_path", "Проект вне каталога проектов OpenCode", { path: input.path })
        const st = await fs.lstat(root).catch(() => null)
        if (!st || st.isSymbolicLink() || !st.isDirectory()) {
          return context.error("not_found", "Папка проекта не найдена", { path: root })
        }
        // Полная зачистка: все сессии проекта (remove рекурсивно удаляет сабагентов), затем папка.
        const sessions = await projectSessions(root)
        let removedSessions = 0
        for (const s of sessions) {
          try {
            await ctx.session.remove({ sessionID: s.sessionID } as never)
            removedSessions++
          } catch {
            /* уже удалена */
          }
        }
        await fs.rm(root, { recursive: true, force: true })
        await dropFromOrder(path.basename(root))
        return { removedSessions, removedFolder: true }
      },

      // Перестановка проектов мышью: `path` встаёт на место `target`
      // (при перетаскивании вниз — сразу за целью, вверх — перед ней).
      reorderProject: async (raw, context) => {
        const input = raw as { path: string; target: string }
        const from = insideProjectsRoot(input.path)
        const to = insideProjectsRoot(input.target)
        if (!from || !to) return context.error("invalid_path", "Проект вне каталога проектов OpenCode", { path: input.path })
        const fromName = path.basename(from)
        const targetName = path.basename(to)
        if (fromName === targetName) return buildTree() as never
        let names: string[] = []
        try {
          names = applyOrder(await projectNames(), await readOrder())
        } catch {
          return context.error("not_found", "Каталог проектов недоступен", { path: projectsRoot })
        }
        const fromIdx = names.indexOf(fromName)
        const toIdx = names.indexOf(targetName)
        if (fromIdx < 0 || toIdx < 0) {
          return context.error("not_found", "Проект не найден", { path: input.path })
        }
        const list = names.filter((n) => n !== fromName)
        const targetIdx = list.indexOf(targetName)
        list.splice(fromIdx < toIdx ? targetIdx + 1 : targetIdx, 0, fromName)
        await writeOrder(list)
        return buildTree() as never
      },

      createThread: async (raw, context) => {
        const input = raw as { projectPath: string; slug?: string; title?: string }
        const root = insideProjectsRoot(input.projectPath)
        if (!root) return context.error("invalid_path", "Проект вне каталога проектов OpenCode", { path: input.projectPath })

        // Имя треда задаёт пользователь; слаг выводится из него (кириллица допустима).
        const title = (input.title ?? input.slug ?? "").trim().slice(0, 80)
        const slugBase = (title || `thread-${Date.now()}`).toLowerCase()
        const slug =
          slugBase
            .replace(/[\s_]+/g, "-")
            .replace(/[^\p{L}\p{N}-]/gu, "")
            .replace(/-{2,}/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || `thread-${Date.now()}`
        const threadsDir = path.join(root, THREADS_DIR)
        try {
          const dirents = await fs.readdir(threadsDir, { withFileTypes: true })
          for (const e of dirents) {
            if (!e.isDirectory()) continue
            const hasMarker = await fs
              .access(path.join(threadsDir, e.name, THREAD_MARKER))
              .then(() => true, () => false)
            if (!hasMarker) {
              return context.error("occupied", `Каталог ${THREADS_DIR}/ содержит чужие папки`, { path: threadsDir })
            }
          }
        } catch (e) {
          if ((e as { code?: string })?.code !== "ENOENT") throw e
        }

        let dir = path.join(threadsDir, slug)
        let n = 2
        while (true) {
          try {
            await fs.access(dir)
            dir = path.join(threadsDir, `${slug}-${n++}`)
          } catch {
            break
          }
        }
        await fs.mkdir(dir, { recursive: true })
        const session = (await ctx.session.create({
          title: title || path.basename(dir),
          location: { directory: dir },
        } as never)) as SessionLike
        const id = sid(session)
        if (!id) throw new Error("session.create не вернул sessionID")
        await fs.writeFile(
          path.join(dir, THREAD_MARKER),
          JSON.stringify({ schema: 1, sessionID: id, createdAt: new Date().toISOString() }, null, 2),
        )
        return { sessionID: id, title: path.basename(dir), folder: dir }
      },

      deleteThread: async (raw, context) => {
        const input = raw as { projectPath: string; folder: string; sessionID: string }
        const threadsDir = path.resolve(input.projectPath, THREADS_DIR)
        const dir = path.resolve(input.folder)
        if (dir !== threadsDir && !dir.startsWith(threadsDir + path.sep)) {
          return context.error("invalid_path", "Папка треда вне каталога threads/", { path: input.folder })
        }
        const st = await fs.lstat(dir).catch(() => null)
        if (!st || st.isSymbolicLink() || !st.isDirectory()) {
          return context.error("invalid_path", "Папка треда не найдена", { path: input.folder })
        }
        let marker: { sessionID?: string } | null = null
        try {
          marker = JSON.parse(await fs.readFile(path.join(dir, THREAD_MARKER), "utf8"))
        } catch {
          /* нет маркера */
        }
        if (!marker || marker.sessionID !== input.sessionID) {
          return context.error("marker_missing", "Нет маркера владения — удаляется только сессия", { folder: dir })
        }
        await ctx.session.remove({ sessionID: input.sessionID } as never)
        await fs.rm(dir, { recursive: true, force: true })
        return { removedFolder: true }
      },

      renameThread: async (raw, context) => {
        const input = raw as { sessionID: string; title: string }
        const title = input.title.trim().slice(0, 80)
        if (!title) return context.error("invalid_name", "Пустое имя", { name: input.title })
        await ctx.session.update({ sessionID: input.sessionID, title } as never)
        return {}
      },

      deleteSession: async (raw) => {
        const input = raw as { sessionID: string }
        await ctx.session.remove({ sessionID: input.sessionID } as never)
        return {}
      },

      // Перенос треда в другой проект: папка (если была) переезжает, сессия перепривязывается.
      moveThread: async (raw, context) => {
        const input = raw as { sessionID: string; folder?: string; targetProject: string }
        const target = insideProjectsRoot(input.targetProject)
        if (!target) return context.error("invalid_path", "Проект вне каталога проектов OpenCode", { path: input.targetProject })

        let slug = `thread-${Date.now()}`
        let hasFolder = false
        let srcDir: string | null = null
        if (input.slug) {
          // Осмысленное имя папки (спека: слаг из названия, кириллица допустима).
          slug = input.slug
            .toLowerCase()
            .replace(/[\s_]+/g, "-")
            .replace(/[^\p{L}\p{N}-]/gu, "")
            .replace(/-{2,}/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || slug
        }
        if (input.folder) {
          const src = path.resolve(input.folder)
          if (!insideProjectsRoot(src)) {
            return context.error("invalid_path", "Исходная папка вне каталога проектов OpenCode", { path: src })
          }
          const st = await fs.lstat(src).catch(() => null)
          if (!st || st.isSymbolicLink() || !st.isDirectory()) {
            return context.error("invalid_path", "Папка треда не найдена", { path: src })
          }
          const marker = await (async () => {
            try {
              return JSON.parse(await fs.readFile(path.join(src, THREAD_MARKER), "utf8"))
            } catch {
              return null
            }
          })()
          if (!marker || marker.sessionID !== input.sessionID) {
            return context.error("marker_missing", "Нет маркера владения — перенос отменён", { folder: src })
          }
          slug = path.basename(src)
          hasFolder = true
          srcDir = src
        }

        // Уникальная подпапка в целевом проекте.
        let dir = path.join(target, THREADS_DIR, slug)
        let n = 2
        while (true) {
          try {
            await fs.access(dir)
            dir = path.join(target, THREADS_DIR, `${slug}-${n++}`)
          } catch {
            break
          }
        }

        if (hasFolder && srcDir) {
          await fs.mkdir(path.dirname(dir), { recursive: true })
          await fs.rename(srcDir, dir)
        } else {
          // Тред «без проекта»: папки не было — создаём подпапку, история переезжает, файлы остаются.
          await fs.mkdir(dir, { recursive: true })
        }
        await fs.writeFile(
          path.join(dir, THREAD_MARKER),
          JSON.stringify({ schema: 1, sessionID: input.sessionID, movedAt: new Date().toISOString() }, null, 2),
        )
        try {
          await ctx.session.move({ sessionID: input.sessionID, directory: dir } as never)
        } catch (e) {
          // откат папки, чтобы не осталась осиротевшая
          if (!hasFolder) await fs.rm(dir, { recursive: true, force: true })
          throw e
        }
        return { folder: dir }
      },

      createLoose: async () => {
        const title = `thread-${new Date().toISOString().slice(0, 16).replace("T", "-")}`
        const session = (await ctx.session.create({ title } as never)) as SessionLike
        const id = sid(session)
        if (!id) throw new Error("session.create не вернул sessionID")
        return { sessionID: id, title }
      },
    })

    return () => void registration.dispose()
  },
})
