// TUI-часть opencode-session-tree (v0.8.1).
// Дерево проектов/тредов в sidebar.content: клики мышью (левый — открыть/развернуть,
// правый — меню), «+», перетаскивание проектов, тумблер сайдбара, moveThread, индикаторы running/unread.
// Заголовки тредов обрезаются под ширину панели — переносы «с красной строки» невозможны.
import { Plugin } from "@opencode/plugin/tui"
import { createSignal, For, Show } from "solid-js"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { TreeRpc } from "./rpc"

type ThreadDto = { folder: string; slug: string; sessionID: string | null; title: string }
type ProjectDto = { name: string; path: string; threads: ThreadDto[] }
type LooseDto = { sessionID: string; title: string; directory: string }
type Tree = { projectsRoot: string; projects: ProjectDto[]; loose: LooseDto[] }

const EMPTY: Tree = { projectsRoot: "", projects: [], loose: [] }
const isRightClick = (e: unknown) => (e as { button?: number } | undefined)?.button === 2
const trunc = (s: string, n = 30) => (s.length > n ? s.slice(0, n - 1) + "…" : s)
const ORANGE = "#ff8c00"
const GREEN = "#a6e3a1"

export default Plugin.define({
  id: "opencode-session-tree",
  async setup(context) {
    const [getTree, setTree] = createSignal<Tree>(EMPTY)
    const [getExpanded, setExpanded] = createSignal<Set<string>>(new Set())
    const [getUnread, setUnread] = createSignal<Record<string, boolean>>({})
    const [getLive, setLive] = createSignal<Record<string, boolean>>({})
    const currentSIDRef = { value: "" }
    let rerenderFn: (() => void) | null = null
    const rpc = () => context.client.rpc(TreeRpc)

    const refresh = async () => {
      try {
        const t = (await rpc().listTree({})) as Tree
        setTree(t)
        // Живые треды: session.status по каждой известной сессии.
        const live: Record<string, boolean> = { ...getLive() }
        for (const p of t.projects) {
          for (const th of p.threads) {
            if (!th.sessionID) continue
            try {
              const s = context.data.session.status(th.sessionID) as unknown
              const txt = typeof s === "string" ? s : JSON.stringify(s ?? "")
              live[th.sessionID] = /run|busy|active|work|pending|stream/i.test(txt)
            } catch {
              /* нет данных статуса */
            }
          }
        }
        setLive(live)
        rerenderFn?.()
      } catch {
        /* сервер недоступен */
      }
    }
    await refresh()

    let last = 0
    const stopListen = context.data.listen((event: unknown) => {
      const details = (event as { details?: Record<string, unknown> })?.details ?? {}
      const type =
        (details.type as string) ?? ((event as { type?: string })?.type ?? "")
      const sid =
        ((details as { info?: { id?: string } }).info?.id ??
         (details as { sessionID?: string }).sessionID ??
         ((event as { sessionID?: string })?.sessionID ?? "")) as string
      if (typeof type !== "string") return
      // Непрочитанный ответ: тред завершил работу, но открыт другой тред.
      if (/execution\.succeeded|session\.idle|turn\.completed|message\.updated/.test(type)
          && sid && sid !== currentSIDRef.value) {
        setUnread((m) => ({ ...m, [sid]: true }))
        rerenderFn?.()
      }
      if (type.includes("session") && Date.now() - last > 1000) {
        last = Date.now()
        void refresh()
      }
    })

    const openSession = (sessionID: string) => {
      setUnread((m) => ({ ...m, [sessionID]: false }))
      void context.ui.router.navigate({ type: "session", sessionID })
    }
    const toastOk = (message: string) =>
      context.ui.toast.show({ title: "session-tree", message, variant: "success" })
    const toastError = (e: unknown) =>
      context.ui.toast.show({
        title: "session-tree",
        message: e instanceof Error ? e.message : String(e),
        variant: "error",
      })

    const toggleExpanded = (name: string) => {
      const next = new Set(getExpanded())
      if (next.has(name)) next.delete(name)
      else next.add(name)
      setExpanded(next)
      rerenderFn?.()
    }

    // --- Диалоги выбора ---------------------------------------------------

    const pickProject = async () => {
      const projects = getTree().projects
      if (projects.length === 0) {
        context.ui.toast.show({ title: "session-tree", message: "Нет проектов", variant: "info" })
        return null
      }
      return context.ui.dialog.select({
        title: "Проекты",
        options: projects.map((p) => ({ title: p.name, value: p.path, description: p.path })),
      })
    }

    const pickThread = async () => {
      const t = getTree()
      const options = [
        ...t.projects.flatMap((p) =>
          p.threads
            .filter((th) => th.sessionID)
            .map((th) => ({
              title: th.title,
              value: `${p.path}\n${th.folder}\n${th.sessionID}`,
              category: p.name,
              description: th.folder,
            })),
        ),
        ...t.loose.map((s) => ({
          title: s.title,
          value: `\n\n${s.sessionID}`,
          category: "Без проекта",
        })),
      ]
      if (options.length === 0) {
        context.ui.toast.show({ title: "session-tree", message: "Нет тредов", variant: "info" })
        return null
      }
      return context.ui.dialog.select({ title: "Треды", options })
    }

    const parsePick = (v: string) => {
      const [projectPath, folder, sessionID] = v.split("\n")
      return { projectPath, folder, sessionID }
    }

    // --- Действия ---------------------------------------------------------

    const newProject = async () => {
      const name = await context.ui.dialog.prompt({ title: "Новый проект", placeholder: "имя-проекта" })
      if (!name?.trim()) return
      try {
        await rpc().createProject({ name: name.trim() })
        await refresh()
        toastOk(`Проект создан: ${name.trim()}`)
      } catch (e) {
        toastError(e)
      }
    }

    const newThreadIn = async (projectPath: string) => {
      const name = await context.ui.dialog.prompt({ title: "Название треда", placeholder: "например: auth-refactor" })
      if (!name?.trim()) return
      try {
        const res = await rpc().createThread({ projectPath, title: name.trim() })
        await refresh()
        openSession(res.sessionID)
        toastOk(`Создан тред: ${res.folder}`)
      } catch (e) {
        toastError(e)
      }
    }

    const newThread = async () => {
      const t = getTree()
      const options = [
        ...t.projects.map((p) => ({ title: p.name, value: p.path, category: "Проекты" })),
        { title: "Без проекта (текущая папка)", value: "\u0000loose", category: "Прочее" },
      ]
      const picked = await context.ui.dialog.select({ title: "Новый тред — где?", options })
      if (!picked) return
      if (picked === "\u0000loose") {
        try {
          const res = await rpc().createLoose({})
          openSession(res.sessionID)
        } catch (e) {
          toastError(e)
        }
        return
      }
      await newThreadIn(picked)
    }

    const openThreadCmd = async () => {
      const picked = await pickThread()
      if (picked) openSession(parsePick(picked).sessionID)
    }

    const renameThreadDirect = async (sessionID: string) => {
      const title = await context.ui.dialog.prompt({ title: "Переименовать тред", placeholder: "Новое имя" })
      if (!title?.trim()) return
      try {
        await rpc().renameThread({ sessionID, title: title.trim() })
        await refresh()
        toastOk("Тред переименован")
      } catch (e) {
        toastError(e)
      }
    }

    const deleteThreadDirect = async (target: { projectPath?: string; folder?: string; sessionID: string }) => {
      const isProjectThread = !!target.projectPath && !!target.folder
      const confirmed = await context.ui.dialog.confirm({
        title: "Удалить тред?",
        message: isProjectThread
          ? `Сессия и папка будут удалены безвозвратно:\n${target.folder}`
          : `Сессия будет удалена безвозвратно:\n${target.sessionID}`,
        label: { confirm: "Удалить", cancel: "Отмена" },
      })
      if (!confirmed) return
      try {
        if (isProjectThread) {
          const res = await rpc().deleteThread({
            projectPath: target.projectPath!,
            folder: target.folder!,
            sessionID: target.sessionID,
          })
          await refresh()
          toastOk(res.removedFolder ? "Тред и папка удалены" : "Удалена только сессия")
        } else {
          await rpc().deleteSession({ sessionID: target.sessionID })
          await refresh()
          toastOk("Сессия удалена")
        }
      } catch (e) {
        toastError(e)
      }
    }

    const renameProjectDirect = async (projectPath: string) => {
      const project = getTree().projects.find((p) => p.path === projectPath)
      const name = await context.ui.dialog.prompt({
        title: "Переименовать проект",
        placeholder: project?.name ?? "новое-имя",
      })
      if (!name?.trim()) return
      try {
        await rpc().renameProject({ path: projectPath, name: name.trim() })
        await refresh()
        toastOk("Проект переименован")
      } catch (e) {
        toastError(e)
      }
    }

    const deleteProjectDirect = async (projectPath: string) => {
      const project = getTree().projects.find((p) => p.path === projectPath)
      const total = project?.threads.length ?? 0
      const confirmed = await context.ui.dialog.confirm({
        title: "Удалить проект?",
        message: `Будут безвозвратно удалены:\n${projectPath}\n${total} тред(ов), их сессии, история и файлы.`,
        label: { confirm: "Удалить всё", cancel: "Отмена" },
      })
      if (!confirmed) return
      try {
        const res = await rpc().deleteProject({ path: projectPath })
        await refresh()
        toastOk(`Проект удалён: сессий ${res.removedSessions}, папка ${res.removedFolder ? "удалена" : "осталась"}`)
      } catch (e) {
        toastError(e)
      }
    }

    const refreshCmd = async () => {
      await refresh()
      context.ui.toast.show({ title: "session-tree", message: "Дерево обновлено", variant: "info" })
    }

    const copyIdCmd = async (id: string) => {
      await context.ui.dialog.alert({ title: "Session ID", message: id })
    }

    const toggleSidebar = async () => {
      const cliConfig = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "opencode", "cli.json")
      let cfg: Record<string, unknown> = {}
      try {
        cfg = JSON.parse(await fs.readFile(cliConfig, "utf8"))
      } catch {
        /* файла нет — создадим */
      }
      const current = (cfg.session as { sidebar?: string } | undefined)?.sidebar ?? "auto"
      const next = current === "hide" ? "auto" : "hide"
      cfg.$schema = (cfg.$schema as string | undefined) ?? "https://opencode.ai/v2/cli.json"
      cfg.session = { ...((cfg.session as object) ?? {}), sidebar: next }
      await fs.mkdir(path.dirname(cliConfig), { recursive: true })
      await fs.writeFile(cliConfig, JSON.stringify(cfg, null, 2) + "\n")
      context.ui.toast.show({
        title: "session-tree",
        message: next === "hide" ? "Сайдбар скрыт" : "Сайдбар включён",
        variant: "info",
      })
    }

    const moveThreadDirect = async (target: { projectPath?: string; folder?: string; sessionID: string }) => {
      const projects = getTree().projects.filter((p) => p.path !== target.projectPath)
      if (projects.length === 0) {
        context.ui.toast.show({ title: "session-tree", message: "Нет других проектов", variant: "info" })
        return
      }
      const targetProject = await context.ui.dialog.select({
        title: "Переместить в проект…",
        options: projects.map((p) => ({ title: p.name, value: p.path, description: p.path })),
      })
      if (!targetProject) return
      try {
        const res = await rpc().moveThread({
          sessionID: target.sessionID,
          folder: target.folder,
          targetProject,
        })
        await refresh()
        toastOk(`Перемещён: ${res.folder}`)
      } catch (e) {
        toastError(e)
      }
    }

    // --- Обёртки для палитры ----------------------------------------------

    const renameThreadCmd = async () => {
      const picked = await pickThread()
      if (picked) await renameThreadDirect(parsePick(picked).sessionID)
    }
    const deleteThreadCmd = async () => {
      const picked = await pickThread()
      if (picked) {
        const { projectPath, folder, sessionID } = parsePick(picked)
        await deleteThreadDirect({ projectPath, folder, sessionID })
      }
    }
    const renameProjectCmd = async () => {
      const target = await pickProject()
      if (target) await renameProjectDirect(target)
    }
    const deleteProjectCmd = async () => {
      const target = await pickProject()
      if (target) await deleteProjectDirect(target)
    }

    // --- Меню по правому клику --------------------------------------------

    const projectMenu = async (project: ProjectDto) => {
      const action = await context.ui.dialog.select({
        title: project.name,
        options: [
          { title: "Новый тред", value: "new", description: "threads/<имя>/ + сессия" },
          { title: "Переименовать проект", value: "rename" },
          { title: "Удалить проект (полная зачистка)", value: "delete" },
        ],
      })
      if (action === "new") await newThreadIn(project.path)
      else if (action === "rename") await renameProjectDirect(project.path)
      else if (action === "delete") await deleteProjectDirect(project.path)
    }

    const threadMenu = async (projectPath: string, th: ThreadDto) => {
      if (!th.sessionID) return
      const action = await context.ui.dialog.select({
        title: th.title,
        options: [
          { title: "Открыть", value: "open" },
          { title: "Переименовать", value: "rename" },
          { title: "Переместить в другой проект…", value: "move" },
          { title: "Копировать ID", value: "copy" },
          { title: "Удалить", value: "delete" },
        ],
      })
      if (action === "open") openSession(th.sessionID)
      else if (action === "rename") await renameThreadDirect(th.sessionID)
      else if (action === "move") await moveThreadDirect({ projectPath, folder: th.folder, sessionID: th.sessionID })
      else if (action === "copy") await copyIdCmd(th.sessionID)
      else if (action === "delete") await deleteThreadDirect({ projectPath, folder: th.folder, sessionID: th.sessionID })
    }

    const looseMenu = async (s: LooseDto) => {
      const action = await context.ui.dialog.select({
        title: s.title,
        options: [
          { title: "Открыть", value: "open" },
          { title: "Переименовать", value: "rename" },
          { title: "Переместить в проект (создаст подпапку)…", value: "move" },
          { title: "Копировать ID", value: "copy" },
          { title: "Удалить", value: "delete" },
        ],
      })
      if (action === "open") openSession(s.sessionID)
      else if (action === "rename") await renameThreadDirect(s.sessionID)
      else if (action === "move") await moveThreadDirect({ sessionID: s.sessionID })
      else if (action === "copy") await copyIdCmd(s.sessionID)
      else if (action === "delete") await deleteThreadDirect({ sessionID: s.sessionID })
    }

    // --- Клавиатурный паритет ----------------------------------------------

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        { id: "session-tree.open", title: "Дерево: открыть тред", slash: { name: "tree" }, palette: true, run: openThreadCmd },
        { id: "session-tree.new", title: "Дерево: новый тред", slash: { name: "tree-new" }, palette: true, run: newThread },
        { id: "session-tree.new-project", title: "Дерево: новый проект", slash: { name: "tree-project-new" }, palette: true, run: newProject },
        { id: "session-tree.rename", title: "Дерево: переименовать тред", palette: true, run: renameThreadCmd },
        { id: "session-tree.delete", title: "Дерево: удалить тред", palette: true, run: deleteThreadCmd },
        { id: "session-tree.rename-project", title: "Дерево: переименовать проект", palette: true, run: renameProjectCmd },
        { id: "session-tree.delete-project", title: "Дерево: удалить проект", palette: true, run: deleteProjectCmd },
        { id: "session-tree.sidebar", title: "Дерево: показать/скрыть сайдбар", slash: { name: "tree-sidebar" }, palette: true, run: toggleSidebar },
        { id: "session-tree.refresh", title: "Дерево: обновить", palette: true, run: refreshCmd },
      ],
      bindings: [],
    }))

    // --- Рендер -------------------------------------------------------------

    const muted = (context.theme as { text?: { muted?: string } }).text?.muted ?? context.theme.text.base
    const HEADER = "ПРОЕКТЫ"

    // --- Перестановка проектов мышью ---------------------------------------
    // Нативный drag/drop OpenTUI: «drag» приходит на строку проекта, «drop» — на строку,
    // над которой отпустили. Подсветку меняем на месте, без перерисовки слота:
    // перерисовка уничтожила бы перетаскиваемый элемент и drag бы прервался.

    let dragName: string | null = null
    let dragEl: { content?: unknown; fg?: unknown } | null = null
    let hoverName: string | null = null
    let pressName: string | null = null
    let pressY = -1

    const projectLabel = (p: ProjectDto) =>
      `${getExpanded().has(p.name) ? "▾" : "▸"} ${trunc(p.name, 26)} · ${p.threads.length} `

    const paint = (el: unknown, content?: string, fg?: string) => {
      const row = el as { content?: unknown; fg?: unknown } | null | undefined
      if (!row) return
      try {
        if (content !== undefined) row.content = content
        if (fg !== undefined) row.fg = fg
      } catch {
        /* элемент уже пересоздан деревом */
      }
    }

    const resetInteraction = () => {
      dragName = null
      dragEl = null
      hoverName = null
      pressName = null
      pressY = -1
    }

    const startPress = (e: unknown, name: string) => {
      resetInteraction()
      pressName = name
      pressY = typeof (e as { y?: number })?.y === "number" ? ((e as { y: number }).y as number) : -1
    }

    const armDrag = (e: unknown, project: ProjectDto) => {
      if (dragName || pressName !== project.name || pressY < 0) return
      const y = (e as { y?: number })?.y
      // Порог в одну строку: иначе обычный клик превращался бы в перетаскивание.
      if (typeof y !== "number" || Math.abs(y - pressY) < 1) return
      dragName = project.name
      dragEl = (e as { target?: { content?: unknown; fg?: unknown } }).target ?? null
      paint(dragEl, `⋮ ${trunc(project.name, 24)} · ${project.threads.length} `, muted)
    }

    const releaseDrag = () => {
      pressName = null
      pressY = -1
      const project = dragName ? getTree().projects.find((p) => p.name === dragName) : undefined
      if (project) paint(dragEl, projectLabel(project), ORANGE)
      dragEl = null
      // Страховка: drop приходит сразу после drag-end, но если его не будет —
      // доводим перестановку по строке, над которой отпустили. Микротаск
      // гарантирует, что drop успевает обработаться первым.
      queueMicrotask(() => {
        const over = hoverName
        hoverName = null
        if (!dragName || !over) return
        const target = getTree().projects.find((p) => p.name === over)
        if (target) void dropOn(target)
      })
    }
    const dropOn = async (project: ProjectDto) => {
      const name = dragName
      dragName = null
      dragEl = null
      hoverName = null
      pressName = null
      pressY = -1
      if (!name || name === project.name) return
      const from = getTree().projects.find((p) => p.name === name)
      if (!from) return
      try {
        await rpc().reorderProject({ path: from.path, target: project.path })
        await refresh()
        toastOk(`«${name}» — на месте «${project.name}»`)
      } catch (e) {
        toastError(e)
        await refresh()
      }
    }

    const cancelDrop = () => resetInteraction()

    const rowFor = (th: ThreadDto, loose: LooseDto | undefined) => {
      const sid = th.sessionID ?? loose?.sessionID ?? null
      const title = th.title ?? loose?.title ?? ""
      const live = sid ? !!getLive()[sid] : false
      const unread = sid ? !!getUnread()[sid] : false
      const marker = live ? "●" : unread ? "◉" : "·"
      const fg = live ? GREEN : unread ? ORANGE : th.sessionID ? context.theme.text.base : muted
      return { marker, fg, title: trunc(title, 30) }
    }

    const renderTree = (t: Tree) => (
      <box flexDirection="column" marginTop={1}>
        <box
          flexDirection="row"
          width="100%"
          justifyContent="center"
          onMouseDown={resetInteraction}
          onMouseUp={() => {
            if (dragName) return
            void newProject()
          }}
        >
          <text fg="yellow">{`─ ${HEADER} ─`}</text>
        </box>
        <Show when={t.projects.length > 0} fallback={<text fg={muted}>  Нет проектов — «+» или /tree-project-new</text>}>
          <For each={t.projects}>
            {(project) => (
              <box flexDirection="column">
                <box flexDirection="row">
                  <text
                    fg={ORANGE}
                    onMouseDown={(e: unknown) => startPress(e, project.name)}
                    onMouseUp={(e: unknown) => {
                      if (isRightClick(e)) {
                        resetInteraction()
                        void projectMenu(project)
                        return
                      }
                      if (dragName) return
                      toggleExpanded(project.name)
                    }}
                    onMouseDrag={(e: unknown) => armDrag(e, project)}
                    onMouseDragEnd={releaseDrag}
                    onMouseDrop={() => void dropOn(project)}
                    onMouseOver={(e: unknown) => {
                      if (!dragName || dragName === project.name) return
                      hoverName = project.name
                      paint((e as { target?: unknown }).target, undefined, "yellow")
                    }}
                    onMouseOut={(e: unknown) => {
                      if (!dragName) return
                      if (hoverName === project.name) hoverName = null
                      if (dragName === project.name) return
                      paint((e as { target?: unknown }).target, undefined, ORANGE)
                    }}
                  >
                    {projectLabel(project)}
                  </text>
                  <box
                    onMouseDown={resetInteraction}
                    onMouseUp={() => {
                      if (dragName) return
                      void newThreadIn(project.path)
                    }}
                    onMouseDrop={() => void dropOn(project)}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text fg="yellow">+</text>
                  </box>
                </box>
                <Show when={getExpanded().has(project.name)}>
                  <For each={project.threads}>
                    {(th) => {
                      const r = rowFor(th, undefined)
                      return (
                        <text
                          fg={r.fg}
                          onMouseDown={(e: unknown) => {
                            resetInteraction()
                            if (isRightClick(e) || !th.sessionID) return
                            openSession(th.sessionID)
                          }}
                          onMouseUp={(e: unknown) => {
                            if (!isRightClick(e)) return
                            resetInteraction()
                            void threadMenu(project.path, th)
                          }}
                          onMouseDrop={() => void dropOn(project)}
                        >
                          {`    ${r.marker} ${r.title}`}
                        </text>
                      )
                    }}
                  </For>
                </Show>
              </box>
            )}
          </For>
        </Show>
        <Show when={t.loose.length > 0}>
          <box flexDirection="column" marginTop={1}>
            <text fg={muted}>{`БЕЗ ПРОЕКТА ${t.loose.length}`}</text>
            <For each={t.loose}>
              {(s) => {
                const r = rowFor({ folder: "", slug: "", sessionID: s.sessionID, title: s.title }, s)
                return (
                  <text
                    fg={r.fg}
                    onMouseDown={(e: unknown) => {
                      resetInteraction()
                      if (isRightClick(e)) return
                      openSession(s.sessionID)
                    }}
                    onMouseUp={(e: unknown) => {
                      if (!isRightClick(e)) return
                      resetInteraction()
                      void looseMenu(s)
                    }}
                    onMouseDrop={cancelDrop}
                  >
                    {`  ${r.marker} ${r.title}`}
                  </text>
                )
              }}
            </For>
          </box>
        </Show>
      </box>
    )

    let slotReg: (() => void) | null = null
    rerenderFn = () => {
      slotReg?.()
      const snapshot = getTree()
      slotReg = context.ui.slot({
        append: "sidebar.content",
        render: (props: { sessionID?: string } | undefined) => {
          currentSIDRef.value = props?.sessionID ?? currentSIDRef.value
          return renderTree(snapshot)
        },
      })
    }

    rerenderFn()

    return () => {
      stopListen()
      slotReg?.()
    }
  },
})
